import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { errorMessage } from "@/src/lib/errorMessage";
import type { SyncOutcome } from "@/app/(AuthModule)/_/types/settings";

/** Runs a revocation: `true` once it returned, `false` (logged as `failure`) when it threw. */
export async function confirmRevocation(
  ctx: AuthedCtx,
  failure: string,
  revoke: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await revoke();
    return true;
  } catch (error) {
    ctx.log.error(failure, { error: errorMessage(error) });
    return false;
  }
}

/** Nothing confirmed; the section offers the same action again. */
export const unconfirmedRevocation: SyncOutcome = {
  status: "partial",
  committed: false,
  failedEffects: ["session-revocation"],
};
