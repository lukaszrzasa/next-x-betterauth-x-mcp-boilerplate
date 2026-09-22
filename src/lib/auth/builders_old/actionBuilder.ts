/**
 * The one way into server-side work.
 *
 * `defineAction` runs every check a request needs - session, input,
 * impersonation, email verification, permissions, step-up - and only then calls
 * the handler with a `Ctx`. A db-service takes that `Ctx` and can treat the
 * request as already validated, because there is no other way to obtain one.
 *
 * ```ts
 * export const deleteComment = defineAction({
 *   name: "comment.delete",
 *   schema: z.object({ id: z.uuid() }),
 *   permissions: "user.delete",
 *   twoFactorPool: "sensitive",
 *   auditLog: (ctx, event) =>
 *     event.outcome === "success"
 *       ? `${ctx.user.email} deleted comment ${event.input.id}`
 *       : `${ctx.user.email} was refused (${event.reason})`,
 *   handler: (ctx, input) => removeComment(ctx, input.id),
 * });
 * ```
 *
 * RULE: a handler performs at most one state-changing db-service call. There is
 * no transaction on `Ctx`, so two writes from one handler cannot roll back
 * together - if an operation needs two, it belongs in a single db-service
 * method that opens its own transaction internally.
 */

import "server-only";

import { randomUUID } from "node:crypto";
import * as z from "zod";

import { auth } from "../index";
import { can, type Connector, type Permission } from "../permissions";
import { twoFactorPools, type TwoFactorPoolName } from "../2fa";
import { ActionError, type DenialReason } from "../errors";
import { availableMethods, hasGrant, verifyStepUp, type StepUpProof } from "../stepUp";
import { createLogger, Ctx, type AuthedCtx, type PublicCtx, type User } from "./ctx";

/* ---------------------------------------------------------------------------
 * Public surface
 * ------------------------------------------------------------------------- */

/**
 * Per-call context supplied by whichever surface invoked the action. Kept
 * separate from the validated input so authentication never leaks into an
 * action's Zod schema.
 */
export type ActionMeta = {
  headers: Headers;
  /**
   * A second-factor proof gathered by the client after a `TWO_FACTOR_REQUIRED`
   * refusal. Verified inline and, on success, consumed by this same call - so
   * a consume-once grant cannot be spent by a concurrent request between the
   * step-up and the retry.
   */
  stepUp?: StepUpProof;
};

export type AuditEvent<TInput, TOutput> =
  | { outcome: "success"; input: TInput; output: TOutput }
  | { outcome: "denied"; input: TInput | null; reason: DenialReason }
  | { outcome: "failed"; input: TInput };

type BaseConfig<TCtx, TInput, TOutput> = {
  /**
   * Stable identifier for this action. Required: it is the join key between a
   * client-side failure and the server log line, and a required field is one
   * more thing that has to be filled in deliberately.
   */
  name: string;
  /** Omit for actions that take no input; the handler then receives `undefined`. */
  schema?: z.ZodType<TInput>;
  /** Extra human-readable detail on top of the record the builder always emits. */
  auditLog?: (ctx: TCtx, event: AuditEvent<TInput, TOutput>) => string;
  handler: (ctx: TCtx, input: TInput) => TOutput | Promise<TOutput>;
};

type AuthedConfig<TInput, TOutput> = BaseConfig<AuthedCtx, TInput, TOutput> & {
  auth?: "session";
  /** `null` (or omitted) means "authenticated, but no permission check". */
  permissions?: Permission | readonly Permission[] | null;
  /** How multiple permissions combine. Defaults to `"AND"`. */
  permissionsConnector?: Connector;
  /** Name a pool from `2fa.ts` to demand a fresh second factor. */
  twoFactorPool?: TwoFactorPoolName | null;
  /**
   * Defaults to `false`. A `twoFactorPool` implies it regardless: a code sent
   * to an unverified address is not a second factor.
   */
  requireVerifiedEmail?: boolean;
};

type PublicConfig<TInput, TOutput> = BaseConfig<PublicCtx, TInput, TOutput> & {
  auth: "public";
};

export type Action<TInput, TOutput> = (
  input: TInput,
  meta: ActionMeta,
) => Promise<TOutput>;

/* ---------------------------------------------------------------------------
 * defineAction
 * ------------------------------------------------------------------------- */

export function defineAction<TInput = undefined, TOutput = unknown>(
  config: PublicConfig<TInput, TOutput>,
): Action<TInput, TOutput>;
export function defineAction<TInput = undefined, TOutput = unknown>(
  config: AuthedConfig<TInput, TOutput>,
): Action<TInput, TOutput>;

/**
 * Wraps a handler in every check the request needs, so that by the time a
 * db-service is called there is nothing left to validate.
 *
 * The returned function throws `ActionError`. Surfaces decide how that reaches
 * a client - see `adapters.ts`.
 */
export function defineAction<TInput, TOutput>(
  config: AuthedConfig<TInput, TOutput> | PublicConfig<TInput, TOutput>,
): Action<TInput, TOutput> {
  return async (rawInput: TInput, meta: ActionMeta): Promise<TOutput> => {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const log = createLogger({ requestId, action: config.name });

    const record = (
      outcome: "success" | "denied" | "failed",
      fields: Record<string, unknown> = {},
    ) => {
      log[outcome === "success" ? "info" : "warn"]("action", {
        outcome,
        durationMs: Date.now() - startedAt,
        ...fields,
      });
    };

    let input: TInput | null = null;
    let ctx: Ctx<User | null> | null = null;

    try {
      /* 1. Session. Resolved before anything is parsed so an anonymous caller
       *    is turned away without touching their payload. */
      const resolved = await auth.api.getSession({ headers: meta.headers });

      if (config.auth !== "public" && !resolved) {
        // Deliberately unrecorded: anonymous traffic is noise, not audit.
        throw new ActionError("UNAUTHENTICATED");
      }

      /* 2. Input. Parsed before the permission and step-up gates so a user is
       *    never asked to complete a 2FA challenge only to discover, after
       *    retrying, that their input was invalid all along. */
      input = parseInput(config.schema, rawInput);

      const baseCtx = {
        twoFactorPool: null as TwoFactorPoolName | null,
        requestId,
        ip: clientIp(meta.headers),
        userAgent: meta.headers.get("user-agent"),
        log,
      };

      if (config.auth === "public") {
        ctx = Ctx.create<null>({ ...baseCtx, user: null, session: null });
        const output = await config.handler(ctx as PublicCtx, input as TInput);
        record("success");
        await writeAudit(config, ctx, { outcome: "success", input, output });
        return output;
      }

      const { user, session } = resolved!;
      const pool = config.twoFactorPool ?? null;

      /* Built before the gates rather than after, so that a refusal from any of
       * them still reaches `auditLog` with a real `Ctx`. `twoFactorPool` stays
       * null until a pool is actually satisfied - it records what this request
       * proved, not what it was asked to prove. */
      ctx = Ctx.create<User>({ ...baseCtx, user, session });

      /* 3. Impersonation. An admin acting as someone else cannot produce that
       *    person's second factor, and accepting the admin's own would make
       *    impersonation a way around every gate it is supposed to respect. */
      if (pool && session.impersonatedBy) {
        throw new ActionError("IMPERSONATION_FORBIDDEN", {
          message: "Two-factor protected actions cannot be run while impersonating.",
        });
      }

      /* 4. Email verification. */
      if ((config.requireVerifiedEmail || pool) && !user.emailVerified) {
        throw new ActionError("EMAIL_VERIFICATION_REQUIRED");
      }

      /* 5. Permissions. */
      const permissions = normalisePermissions(config.permissions);

      if (permissions.length > 0) {
        const connector = config.permissionsConnector ?? "AND";

        if (!can(user.role, permissions, connector)) {
          throw new ActionError("FORBIDDEN", {
            message: `Missing permission (${connector}): ${permissions.join(", ")}`,
          });
        }
      }

      /* 6. Step-up. */
      if (pool) {
        await ensureStepUp({ user, sessionId: session.id, headers: meta.headers, meta, pool });
      }

      if (pool) ctx = Ctx.create<User>({ ...baseCtx, user, session, twoFactorPool: pool });

      const output = await config.handler(ctx as AuthedCtx, input as TInput);

      record("success", { userId: user.id, sessionId: session.id });
      await writeAudit(config, ctx, { outcome: "success", input, output });

      return output;
    } catch (error) {
      if (ActionError.is(error)) {
        if (error.reason === "UNAUTHENTICATED") throw error;

        record("denied", {
          reason: error.reason,
          status: error.status,
          userId: ctx?.user?.id,
        });
        await writeAudit(config, ctx, {
          outcome: "denied",
          input,
          reason: error.reason as DenialReason,
        });

        throw error;
      }

      // Unexpected: log in full, tell the client nothing.
      record("failed", { error: error instanceof Error ? error.stack : String(error) });
      if (input !== null) await writeAudit(config, ctx, { outcome: "failed", input });

      throw new ActionError("INTERNAL", { cause: error });
    }
  };
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function parseInput<TInput>(
  schema: z.ZodType<TInput> | undefined,
  rawInput: TInput,
): TInput {
  if (!schema) return undefined as TInput;

  const result = schema.safeParse(rawInput);

  if (!result.success) {
    throw new ActionError("INVALID_INPUT", {
      message: "Input failed validation.",
      data: result.error.issues.map(({ path, message, code }) => ({
        path: path.join("."),
        message,
        code,
      })),
    });
  }

  return result.data;
}

function normalisePermissions(
  permissions: Permission | readonly Permission[] | null | undefined,
): readonly Permission[] {
  if (!permissions) return [];
  return typeof permissions === "string" ? [permissions] : permissions;
}

/**
 * Trusted only as far as the deployment's proxy - recorded for audit, never
 * used to make an authorisation decision.
 */
function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || headers.get("x-real-ip");
}

async function ensureStepUp({
  user,
  sessionId,
  headers,
  meta,
  pool,
}: {
  user: User;
  sessionId: string;
  headers: Headers;
  meta: ActionMeta;
  pool: TwoFactorPoolName;
}) {
  const scope = { userId: user.id, sessionId };

  // An inline proof is always spent, even when a grant already exists: the
  // client only sends one in response to a refusal, and silently ignoring it
  // would leave a valid code unconsumed.
  if (meta.stepUp) {
    await verifyStepUp({
      user,
      scope,
      headers,
      proof: meta.stepUp,
      pool,
      // The proof authorises this call; a consume-once pool must not be left
      // with a reusable grant behind it.
      persistGrant: !twoFactorPools[pool].consumeOnce,
    });
    return;
  }

  if (await hasGrant(scope, pool)) return;

  const methods = availableMethods(user);

  if (methods.length === 0) {
    throw new ActionError("TWO_FACTOR_ENROLLMENT_REQUIRED", {
      message: "Set up two-factor authentication to perform this action.",
    });
  }

  throw ActionError.twoFactorRequired({ pool, methods });
}

/**
 * The structured record above is emitted unconditionally; this is the optional
 * sentence on top. It never runs without a real `Ctx`, and a throw from it is
 * swallowed - an audit description must not be able to fail an action that has
 * already succeeded.
 */
async function writeAudit<TInput, TOutput>(
  config: AuthedConfig<TInput, TOutput> | PublicConfig<TInput, TOutput>,
  ctx: Ctx<User | null> | null,
  event: AuditEvent<TInput, TOutput>,
) {
  if (!config.auditLog || !ctx) return;

  try {
    // Both config shapes narrow to the same call; the ctx variance is checked
    // at the definition site, where `auth` decides which one applies.
    const message = await (
      config.auditLog as (c: unknown, e: AuditEvent<TInput, TOutput>) => string
    )(ctx, event);

    ctx.log.info("audit", { outcome: event.outcome, message });
  } catch (error) {
    ctx.log.error("audit hook threw", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export { twoFactorPools };
