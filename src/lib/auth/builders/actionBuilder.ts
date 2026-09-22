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
import type { Action, AuthedConfig, PublicConfig } from "./actionTypes";

export type {
  Action,
  ActionMeta,
  AuthedConfig,
  PublicConfig,
} from "./actionTypes";
export type { AuditEvent } from "./actionAudit";
export { twoFactorPools } from "../2fa";

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
  return async (rawInput, meta) => {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const log = createLogger({ requestId, action: config.name });
    let ctx: Ctx<User | null> | undefined;
    // A wrapper distinguishes unparsed input from valid null/undefined input.
    let parsed: { input: TInput } | undefined;
    let describeAudit: AuditDescription<TInput, TOutput> | undefined;

    const record = (
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
      const resolved =
        config.auth === "public"
          ? null
          : await auth.api.getSession({ headers: meta.headers });
      if (config.auth !== "public" && !resolved) {
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
        twoFactorPool: null,
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
        output = await config.handler(publicCtx, input);
      } else {
        // Config and resolved are separate values; TypeScript needs this guard
        // even though the session was required before parsing input above.
        if (!resolved) throw new ActionError("UNAUTHENTICATED");
        const { user, session } = resolved;
        let authedCtx = Ctx.create<User>({ ...baseCtx, user, session });
        ctx = authedCtx;
        const authedAudit = config.auditLog;
        if (authedAudit)
          describeAudit = (event) => authedAudit(authedCtx, event);

        // Keep a context for denial auditing; it claims no step-up yet.
        checkAuthorization(config, authedCtx);
        const pool = config.twoFactorPool;
        if (pool) {
          await ensureStepUp(authedCtx, meta, pool);
          authedCtx = Ctx.create<User>({
            ...baseCtx,
            user,
            session,
            twoFactorPool: pool,
          });
          ctx = authedCtx;
        }
        output = await config.handler(authedCtx, input);
      }

      record("success");
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
        record("denied", { reason: error.reason, status: error.status });
        await writeAudit(describeAudit, log, {
          outcome: "denied",
          input: parsed ? parsed.input : null,
          reason: error.reason,
        });
        throw error;
      }

      record("failed", {
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
}

/** Proxy-provided IPs are audit metadata, never authorization evidence. */
function clientIp(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")
  );
}
