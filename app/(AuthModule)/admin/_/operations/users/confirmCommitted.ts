import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { ActionError } from "@/src/lib/auth/errors";
import { translateProviderError } from "@/app/(AuthModule)/admin/_/services/providerErrors";
import { loadTarget, type Target } from "./authorizeTarget";

/**
 * The provider may throw after its write committed. The authoritative row
 * decides: if the intended change is there, the write counts as committed
 * and this returns; otherwise the provider's failure is thrown, translated.
 */
export async function confirmCommitted(
  ctx: AuthedCtx,
  userId: string,
  matches: (current: Target) => boolean,
  error: unknown,
): Promise<void> {
  let current: Target;
  try {
    current = await loadTarget(ctx, userId);
  } catch (readError) {
    throw new ActionError("INTERNAL", {
      message: "The change could not be confirmed. Refresh the page before trying again.",
      cause: readError instanceof Error ? new Error(readError.message, { cause: error }) : error,
    });
  }
  if (!matches(current)) translateProviderError(error);
}
