import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { ActionError } from "@/src/lib/auth/errors";
import type { LockedReads } from "@/app/(AuthModule)/_/db/userAccountLock";
import type { FailedEffect, UserMutationOutcome } from "@/app/(AuthModule)/admin/_/types";
import { translateProviderError } from "./providerErrors";
import { loadTarget, type Target } from "./targets";

/**
 * Building truthful outcomes: no-ops, completed writes, and partial results
 * that record which follow-up effect failed and whether the row committed.
 */

export const unchanged = (userId: string): UserMutationOutcome => ({ status: "unchanged", userId });

export function conclude(
  userId: string,
  committed: boolean,
  failedEffects: FailedEffect[],
  extra: { selfSignedOut?: boolean } = {},
): UserMutationOutcome {
  if (failedEffects.length === 0) return { status: "completed", userId, ...extra };
  return { status: "partial", userId, committed, effectsMayHaveApplied: true, failedEffects };
}

/** Runs one effect, recording rather than propagating its failure. */
export async function attemptEffect(
  ctx: AuthedCtx,
  effect: FailedEffect["effect"],
  run: () => Promise<unknown>,
  failed: FailedEffect[],
): Promise<boolean> {
  try {
    await run();
    return true;
  } catch (error) {
    if (ActionError.is(error) && error.reason === "RATE_LIMITED") {
      const retryAfterSeconds = (error.data as { retryAfterSeconds?: unknown } | undefined)
        ?.retryAfterSeconds;
      failed.push({
        effect,
        code: "RATE_LIMITED",
        ...(typeof retryAfterSeconds === "number" ? { retryAfterSeconds } : {}),
      });
      return false;
    }
    ctx.log.error(`effect ${effect} failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
    failed.push({ effect, code: "UNAVAILABLE" });
    return false;
  }
}

/**
 * The provider may throw after its write committed. Under the lock, the
 * authoritative row decides: if the intended change is there, the write
 * counts as committed; otherwise the failure is reported as it is.
 */
export async function confirmCommitted(
  reads: LockedReads,
  userId: string,
  matches: (current: Target) => boolean,
  error: unknown,
): Promise<void> {
  let current: Target;
  try {
    current = await loadTarget(reads, userId);
  } catch (readError) {
    throw new ActionError("INTERNAL", {
      message: "The change could not be confirmed. Refresh the page before trying again.",
      cause: readError instanceof Error ? new Error(readError.message, { cause: error }) : error,
    });
  }
  if (!matches(current)) translateProviderError(error);
}
