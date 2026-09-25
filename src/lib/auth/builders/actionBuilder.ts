import "server-only";

import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";

import { auth } from "@/src/lib/auth/index";
import { ActionError } from "@/src/lib/auth/errors";
import { STEP_UP_POLICIES, type StepUpPolicy } from "@/src/lib/auth/stepUpPolicy";
import { Ctx, createLogger, type Session, type User } from "./context";
import { parseInput } from "./actionInput";
import { checkAuthorization } from "./actionAuthorization";
import { ensureStepUp } from "./actionStepUp";
import { writeAudit, type AuditDescription } from "./actionAudit";
import type { Action, ActionMeta, AuthedConfig, PublicConfig } from "./actionTypes";

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
 * Each handler should delegate related writes to one transactional service.
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
  if (typeof mcpAllowed !== "boolean" || !STEP_UP_POLICIES.includes(stepUp as StepUpPolicy)) {
    throw new Error("Invalid operation policy.");
  }
  if (stepUp !== "none" && (mcpAllowed || config.auth === "public")) {
    throw new Error("Step-up requires an authenticated operation with MCP disabled.");
  }
  const runAction = async (rawInput: TRawInput, meta: ActionMeta) => {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const log = createLogger({ requestId, action: config.name });
    let ctx: Ctx<User | null> | undefined;
    // A wrapper distinguishes unparsed input from valid null/undefined input.
    let parsed: { input: TInput } | undefined;
    let describeAudit: AuditDescription<TInput, TOutput> | undefined;

    const logOutcome = (
      outcome: "success" | "denied" | "failed",
      fields: Record<string, unknown> = {},
    ) => {
      const level =
        outcome === "success"
          ? "info"
          : outcome === "denied"
            ? "warn"
            : "error";
      log[level]("action", {
        outcome,
        durationMs: Date.now() - startedAt,
        userId: ctx?.user?.id,
        sessionId: ctx?.session?.id,
        ...fields,
      });
    };

    try {
      const resolved = await resolveSession(config, meta.headers);

      // Reject bad input before prompting for 2FA or consuming a one-time grant.
      const input = await parseInput(config.schema, rawInput);
      parsed = { input };
      const baseCtx = {
        requestId,
        ip: clientIp(meta.headers),
        userAgent: meta.headers.get("user-agent"),
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
        // Narrow the hook together with its config, without casting contexts.
        const publicAudit = resolved.config.auditLog;
        if (publicAudit)
          describeAudit = (event) => publicAudit(publicCtx, event);
        checkEntryPoint(meta, mcpAllowed);
        output = await resolved.config.handler(publicCtx, input);
      } else {
        const { config: authedConfig, user, session } = resolved;
        // The audit hook sees whichever context is current when it runs: a
        // denial before step-up gets a context that claims none; success gets
        // the verified one the handler received.
        let authedCtx = Ctx.create<User>({ ...baseCtx, user, session });
        ctx = authedCtx;
        const authedAudit = authedConfig.auditLog;
        if (authedAudit)
          describeAudit = (event) => authedAudit(authedCtx, event);

        checkEntryPoint(meta, mcpAllowed);
        checkAuthorization(
          {
            permissions: authedConfig.permissions,
            permissionsConnector: authedConfig.permissionsConnector,
            requireVerifiedEmail: authedConfig.requireVerifiedEmail,
            stepUp,
          },
          authedCtx,
        );

        if (stepUp !== "none") {
          await ensureStepUp(authedCtx, meta, stepUp);
          authedCtx = authedCtx.withStepUp(stepUp);
          ctx = authedCtx;
        }
        output = await authedConfig.handler(authedCtx, input);
      }

      logOutcome("success");
      await writeAudit(describeAudit, log, {
        outcome: "success",
        input,
        output,
      });
      return output;
    } catch (error) {
      unstable_rethrow(error);
      // Anonymous traffic is deliberately not part of the audit stream.
      if (ActionError.is(error) && error.reason === "UNAUTHENTICATED")
        throw error;

      if (ActionError.is(error) && error.reason !== "INTERNAL") {
        logOutcome("denied", { reason: error.reason, status: error.status });
        await writeAudit(describeAudit, log, {
          outcome: "denied",
          input: parsed ? parsed.input : null,
          reason: error.reason,
        });
        throw error;
      }

      logOutcome("failed", { error: describeError(error) });
      if (parsed) {
        await writeAudit(describeAudit, log, {
          outcome: "failed",
          input: parsed.input,
        });
      }
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
 * caller. Everything else reads the store (the cookie cache may be stale)
 * and refuses anonymous callers before any input is parsed.
 */
async function resolveSession<TInput, TOutput, TRawInput>(
  config:
    | AuthedConfig<TInput, TOutput, TRawInput>
    | PublicConfig<TInput, TOutput, TRawInput>,
  headers: Headers,
): Promise<ResolvedSession<TInput, TOutput, TRawInput>> {
  if (config.auth === "public") return { kind: "public", config };

  const authSession = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
  if (!authSession) throw new ActionError("UNAUTHENTICATED");

  return { kind: "authed", config, ...authSession };
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
    parts.push(current instanceof Error ? (current.stack ?? current.message) : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join("\nCaused by: ");
}

/** Proxy-provided IPs are audit metadata, never authorization evidence. */
function clientIp(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")
  );
}

/** Only trusted adapters supply provenance; unknown values always deny. */
function checkEntryPoint(meta: ActionMeta, mcpAllowed: boolean): void {
  if (meta.entryPoint === "server-action" || meta.entryPoint === "route-handler") return;
  if (meta.entryPoint === "mcp" && mcpAllowed) return;
  throw new ActionError("FORBIDDEN", { message: "Operation unavailable through this entry point." });
}
