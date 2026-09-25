import { type RequiredStepUp } from "../stepUpPolicy";
import { ActionError } from "../errors";
import { availableMethods, hasGrant, verifyStepUp } from "../stepUp";
import type { ActionMeta } from "./actionTypes";
import type { AuthedCtx } from "./context";

export async function ensureStepUp(
  ctx: AuthedCtx,
  meta: ActionMeta,
  policy: RequiredStepUp,
): Promise<void> {
  const scope = { userId: ctx.user.id, sessionId: ctx.session.id };

  // Always verify supplied proofs, even when a cached grant exists.
  if (meta.stepUp !== undefined) {
    await verifyStepUp({
      user: ctx.user,
      scope,
      headers: meta.headers,
      proof: meta.stepUp,
      // Every-time proof authorizes this invocation only.
      persistGrant: policy === "five_minutes",
    });
    return;
  }

  if (policy === "five_minutes" && await hasGrant(scope)) return;

  const methods = availableMethods(ctx.user);
  if (methods.length === 0) {
    throw new ActionError("TWO_FACTOR_ENROLLMENT_REQUIRED", {
      message: "Set up two-factor authentication to perform this action.",
    });
  }

  throw ActionError.twoFactorRequired({ policy, methods });
}
