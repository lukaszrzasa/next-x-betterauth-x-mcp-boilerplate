import "server-only";

import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";

import { auth } from "../index";
import { ActionError } from "../errors";
import { Ctx, createLogger, type User } from "./context";
import { parseInput } from "./actionInput";
import { checkAuthorization } from "./actionAuthorization";
import { ensureStepUp } from "./actionStepUp";
import { writeAudit, type AuditDescription } from "./actionAudit";
import type { Action, ActionMeta, AuthedConfig, PublicConfig } from "./actionTypes";

export type {
  Action,
  ActionMeta,
  AuthedConfig,
  PublicConfig,
} from "./actionTypes";
export type { AuditEvent } from "./actionAudit";

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
 * Each handler should delegate related writes to one transactional db-service.
 * Expected refusals throw ActionError; adapters choose the client response.
 */
export function defineAction<TInput, TOutput, TRawInput>(
  config:
    | AuthedConfig<TInput, TOutput, TRawInput>
    | PublicConfig<TInput, TOutput, TRawInput>,
): Action<TRawInput, TOutput> {
  // Snapshot policy at definition time; fail loudly on obsolete or invalid config.
  if ("sensitive" in config || "twoFactorPool" in config) {
    throw new Error("Use mcpAllowed and stepUp instead of sensitive or twoFactorPool.");
  }
  const mcpAllowed = config.mcpAllowed === undefined ? false : config.mcpAllowed;
  const stepUp = config.stepUp === undefined ? "none" : config.stepUp;
  if (typeof mcpAllowed !== "boolean" || !["none", "five_minutes", "every_time"].includes(stepUp)) {
    throw new Error("Invalid operation policy.");
  }
  if (stepUp !== "none" && (mcpAllowed || config.auth === "public")) {
    throw new Error("Step-up requires an authenticated operation with MCP disabled.");
  }
  config = { ...config };
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
      // Public actions do not depend on the session store.
      const authSession =
        config.auth === "public"
          ? null
          : await auth.api.getSession({
              headers: meta.headers,
              query: { disableCookieCache: true },
            });
      if (config.auth !== "public" && !authSession) {
        throw new ActionError("UNAUTHENTICATED");
      }

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

      if (config.auth === "public") {
        const publicCtx = Ctx.create<null>({
          ...baseCtx,
          user: null,
          session: null,
        });
        ctx = publicCtx;
        // Narrow the hook together with its config, without casting contexts.
        const publicAudit = config.auditLog;
        if (publicAudit)
          describeAudit = (event) => publicAudit(publicCtx, event);
        checkEntryPoint(meta, mcpAllowed);
        output = await config.handler(publicCtx, input);
      } else {
        // Config and authSession are separate values; TypeScript needs this guard
        // even though the session was required before parsing input above.
        if (!authSession) throw new ActionError("UNAUTHENTICATED");
        const { user, session } = authSession;
        let authedCtx = Ctx.create<User>({ ...baseCtx, user, session });
        ctx = authedCtx;
        const authedAudit = config.auditLog;
        if (authedAudit)
          describeAudit = (event) => authedAudit(authedCtx, event);

        // Keep a context for denial auditing; it claims no step-up yet.
        checkEntryPoint(meta, mcpAllowed);
        checkAuthorization({ ...config, stepUp }, authedCtx);
        if (stepUp !== "none") {
          await ensureStepUp(authedCtx, meta, stepUp);
          authedCtx = Ctx.create<User>({
            ...baseCtx,
            user,
            session,
            stepUp,
          });
          ctx = authedCtx;
        }
        output = await config.handler(authedCtx, input);
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

      logOutcome("failed", {
        error: error instanceof Error ? error.stack : String(error),
      });
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
