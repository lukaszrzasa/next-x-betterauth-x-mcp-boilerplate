import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { ActionError } from "@/src/lib/auth/errors";
import { assertSecurityStateCurrent, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { verifyCurrentPassword } from "@/app/(AuthModule)/_/db/settings/password/verifyCurrentPassword";
import type { BeginEmailChangeSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { EmailRequestOutcome } from "@/app/(AuthModule)/_/types/settings";
import { deliverLink } from "./delivery";
import { consumeEmailInitiation } from "./initiation";
import { loadOwner } from "./owner";
import { pendingOutcome } from "./projection";
import { createRequest } from "./requests";
import { issueToken } from "./tokens";

/**
 * A change of a verified address. The current mailbox must agree first; the
 * new address is chosen afterwards, while signed in, and proven by its own
 * mailbox. One fixed 24-hour deadline covers the whole request.
 */
export async function beginEmailChange(ctx: AuthedCtx, input: BeginEmailChangeSchema): Promise<EmailRequestOutcome> {
  await verifyCurrentPassword(ctx, input.currentPassword);
  const { token, hash } = issueToken();

  const row = await withUserAccountLock(ctx, ctx.user.id, async (reads) => {
    const owner = await loadOwner(reads, ctx.user.id);
    if (!owner.emailVerified) {
      throw new ActionError("EMAIL_VERIFICATION_REQUIRED", {
        message: "Your current address is not verified; use Correct email instead.",
      });
    }
    await assertSecurityStateCurrent(reads, ctx.user.id, securityVersionOf(ctx.user));
    await consumeEmailInitiation(ctx);
    return createRequest(ctx, {
      kind: "change",
      state: "awaiting_current",
      originalEmail: owner.email,
      newEmail: null,
      currentTokenHash: hash,
      newTokenHash: null,
    });
  });

  const delivery = await deliverLink(ctx, { to: row.originalEmail, purpose: "current", token, expiresAt: row.expiresAt });
  return pendingOutcome(row, delivery);
}
