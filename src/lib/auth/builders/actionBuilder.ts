import "server-only";

import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";

import { ActionError } from "@/src/lib/auth/errors";
import { describeErrorSafely } from "@/src/lib/errorMessage";
import { requestLocale } from "@/src/lib/i18n/resolveLocale";
import { resolveAuthoritativeSession } from "@/src/lib/auth/sessionAuthority";
import {
  STEP_UP_CONDITIONS,
  STEP_UP_POLICIES,
  type StepUpCondition,
  type StepUpPolicy,
} from "@/src/lib/auth/stepUpPolicy";
import { Ctx, clientIp, createLogger, runInOperationContext, type Session, type User } from "./context";
import { parseInput } from "./actionInput";
import { checkAuthorization } from "./actionAuthorization";
import { ensureStepUp } from "./actionStepUp";
import type { Action, ActionMeta, AuthedConfig, PublicConfig } from "./actionTypes";

const OUTCOME_LOG_LEVELS = { success: "info", denied: "warn", failed: "error" } as const;

export function defineAction<
  TInput = undefined,
  TOutput = unknown,
  TRawInput = TInput,
>(config: PublicConfig<TInput, TOutput, TRawInput>): Action<TRawInput, TOutput>;
export function defineAction<
  TInput = undefined,
  TOutput = unknown,
  TRawInput = TInput,
>(config: AuthedConfig<TInput, TOutput, TRawInput>): Action<TRawInput, TOutput>;

/**
 * Session → input → authorization → step-up → handler.
 * The handler is the use case: its sequence, its refusals and its outcome.
 * Reads and writes go through the owning scope's `db/`.
 * Expected refusals throw ActionError; adapters choose the client response.
 */
export function defineAction<TInput, TOutput, TRawInput>(
  config:
    | AuthedConfig<TInput, TOutput, TRawInput>
    | PublicConfig<TInput, TOutput, TRawInput>,
): Action<TRawInput, TOutput> {
  // Snapshot policy at definition time; fail loudly on invalid config.
  const mcpAllowed = config.mcpAllowed === undefined ? false : config.mcpAllowed;
  const stepUp = config.stepUp === undefined ? "none" : config.stepUp;
  const stepUpWhen = config.stepUpWhen === undefined ? "always" : config.stepUpWhen;
  if (typeof mcpAllowed !== "boolean" || !STEP_UP_POLICIES.includes(stepUp as StepUpPolicy)) {
    throw new Error("Invalid operation policy.");
  }
  if (stepUp !== "none" && (mcpAllowed || config.auth === "public")) {
    throw new Error("Step-up requires an authenticated operation with MCP disabled.");
  }
  if (!STEP_UP_CONDITIONS.includes(stepUpWhen as StepUpCondition)) {
    throw new Error("Invalid step-up condition.");
  }
  if (stepUpWhen !== "always" && (stepUp === "none" || mcpAllowed || config.auth === "public")) {
    throw new Error("A step-up condition requires an authenticated, MCP-disabled operation with step-up.");
  }
  const runAction = async (rawInput: TRawInput, meta: ActionMeta) => {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const log = createLogger({ requestId, action: config.name });
    let ctx: Ctx<User | null> | undefined;

    const logOutcome = (
      outcome: "success" | "denied" | "failed",
      fields: Record<string, unknown> = {},
    ) => {
      log[OUTCOME_LOG_LEVELS[outcome]]("action", {
        outcome,
        durationMs: Date.now() - startedAt,
        userId: ctx?.user?.id,
        sessionId: ctx?.session?.id,
        ...fields,
      });
    };

    try {
      const resolved = await resolveSession(config, meta.headers);
      const locale = requestLocale(meta.headers);

      // Reject bad input before prompting for 2FA or consuming a one-time grant.
      const input = await parseInput(config.schema, rawInput, locale);
      const baseCtx = {
        requestId,
        ip: clientIp(meta.headers),
        userAgent: meta.headers.get("user-agent"),
        locale,
        // A copy: the context must not observe later mutation of the request headers.
        requestHeaders: new Headers(meta.headers),
        log,
        stepUp: null,
      };
      let output: TOutput;

      if (resolved.kind === "public") {
        const publicCtx = Ctx.create<null>({
          ...baseCtx,
          user: null,
          session: null,
        });
        ctx = publicCtx;
        checkEntryPoint(meta, mcpAllowed);
        const handler = resolved.config.handler;
        output = await runInOperationContext(publicCtx, () => handler(publicCtx, input));
      } else {
        const { config: authedConfig, user, session } = resolved;
        let authedCtx = Ctx.create<User>({ ...baseCtx, user, session });
        ctx = authedCtx;

        checkEntryPoint(meta, mcpAllowed);
        // The effective policy is computed once from the fresh user and used
        // for both authorization and verification. Declared `two_factor_enabled`
        // asks a user without an authenticator for nothing extra; their
        // password check inside the operation is what protects them.
        const effectiveStepUp = resolveStepUpPolicy(stepUp, stepUpWhen, user);
        checkAuthorization(
          {
            roles: authedConfig.roles,
            permissions: authedConfig.permissions,
            permissionsConnector: authedConfig.permissionsConnector,
            requireVerifiedEmail: authedConfig.requireVerifiedEmail,
            stepUp: effectiveStepUp,
          },
          authedCtx,
        );

        if (effectiveStepUp !== "none") {
          const challenged = authedCtx;
          // Inside the context: an emailed code is logged as requested by this user.
          await runInOperationContext(challenged, () => ensureStepUp(challenged, meta, effectiveStepUp));
          authedCtx = authedCtx.withStepUp(effectiveStepUp);
          ctx = authedCtx;
        } else if (stepUp !== "none" && meta.stepUp !== undefined) {
          // A stale client still sending proof for a condition that no longer
          // holds: refuse the obsolete proof rather than turning it into a
          // grant. A fresh submission without it proceeds normally.
          throw new ActionError("INVALID_INPUT", {
            message: { key: "errors.auth.staleProof" },
          });
        }
        const verifiedCtx = authedCtx;
        const handler = authedConfig.handler;
        output = await runInOperationContext(verifiedCtx, () => handler(verifiedCtx, input));
      }

      logOutcome("success");
      return output;
    } catch (error) {
      unstable_rethrow(error);
      // Anonymous traffic is deliberately not part of the outcome log.
      if (ActionError.is(error) && error.reason === "UNAUTHENTICATED")
        throw error;

      if (ActionError.is(error) && error.reason !== "INTERNAL") {
        logOutcome("denied", { reason: error.reason, status: error.status });
        throw error;
      }

      logOutcome("failed", { error: describeError(error) });
      // Never expose unexpected error details, even from an explicit INTERNAL.
      throw new ActionError("INTERNAL", { cause: error });
    }
  };
  return Object.freeze(Object.assign(runAction, { mcpAllowed }));
}

type ResolvedSession<TInput, TOutput, TRawInput> =
  | { kind: "public"; config: PublicConfig<TInput, TOutput, TRawInput> }
  | {
      kind: "authed";
      config: AuthedConfig<TInput, TOutput, TRawInput>;
      user: User;
      session: Session;
    };

/**
 * Public operations never touch the session store, even for a signed-in
 * caller. Everything else resolves the authoritative session (store plus
 * the current user row, never the cookie cache) and refuses anonymous
 * callers before any input is parsed.
 */
async function resolveSession<TInput, TOutput, TRawInput>(
  config:
    | AuthedConfig<TInput, TOutput, TRawInput>
    | PublicConfig<TInput, TOutput, TRawInput>,
  headers: Headers,
): Promise<ResolvedSession<TInput, TOutput, TRawInput>> {
  if (config.auth === "public") return { kind: "public", config };

  const authSession = await resolveAuthoritativeSession(headers);
  if (!authSession) throw new ActionError("UNAUTHENTICATED");

  return { kind: "authed", config, ...authSession };
}

/** Declared policy, or `none` when the declared condition does not hold for this user. */
function resolveStepUpPolicy(
  declared: StepUpPolicy,
  condition: StepUpCondition,
  user: User,
): StepUpPolicy {
  if (declared === "none" || condition === "always") return declared;
  return user.twoFactorEnabled ? declared : "none";
}

/**
 * Stack of the error and of every `cause` beneath it. Services wrap driver
 * errors to add context; without the chain the log would show only the wrapper.
 */
function describeError(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  for (let current = error; current !== undefined && !seen.has(current); ) {
    seen.add(current);
    if (current instanceof Error) {
      // Never a query's bound parameters (hashes, digests), even in the application log.
      const safe = describeErrorSafely(current);
      parts.push(safe.stack ?? `${current.name}: ${safe.message}`);
    } else {
      parts.push(String(current));
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join("\nCaused by: ");
}

/**
 * Only trusted adapters supply provenance; unknown values always deny. The
 * allowlist is explicit rather than `ENTRY_POINTS.includes(...)` so adding a
 * transport is a deliberate edit here, not a side effect of widening the type.
 */
function checkEntryPoint(meta: ActionMeta, mcpAllowed: boolean): void {
  if (
    meta.entryPoint === "server-action" ||
    meta.entryPoint === "route-handler" ||
    meta.entryPoint === "server-render"
  )
    return;
  if (meta.entryPoint === "mcp" && mcpAllowed) return;
  throw new ActionError("FORBIDDEN", { message: { key: "errors.auth.entryPointUnavailable" } });
}
