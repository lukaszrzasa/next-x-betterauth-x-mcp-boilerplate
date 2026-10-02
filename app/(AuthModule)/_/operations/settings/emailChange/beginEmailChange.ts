import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { ActionError } from "@/src/lib/auth/errors";
import { assertSecurityStateCurrent, securityVersionOf } from "@/src/lib/auth/securityVersion";
import { replaceActiveRequest } from "@/app/(AuthModule)/_/db/emailRequests/requests";
import { withAccountSecurityLock } from "@/app/(AuthModule)/_/db/security/accountLock";
import { EMAIL_CHANGE_POLICY } from "@/app/(AuthModule)/_/policies/limits";
import { beginEmailChangeSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { verifyCurrentPassword } from "@/app/(AuthModule)/_/services/credentials/verifyCurrentPassword";
import { consumeEmailInitiation } from "@/app/(AuthModule)/_/services/email/budgets";
import { deliverLink } from "@/app/(AuthModule)/_/services/email/delivery";
import { issueToken } from "@/app/(AuthModule)/_/services/email/tokens";
import type { EmailRequestOutcome } from "@/app/(AuthModule)/_/types/settings";
import { requireEmailOwner } from "./ownedRequest";
import { pendingOutcome } from "./pendingRequest";

/**
 * A change of a verified address (password, and the step-up of an enrolled
 * account). The current mailbox must agree first; the new address is chosen
 * afterwards, while signed in, and proven by its own mailbox. One fixed
 * 24-hour deadline covers the whole request.
 */
export const beginEmailChangeOperation = defineAction({
  name: "settings.emailChange.begin",
  schema: beginEmailChangeSchema,
  requireVerifiedEmail: true,
  mcpAllowed: false,
  stepUp: "five_minutes",
  stepUpWhen: "two_factor_enabled",
  handler: async (ctx, input): Promise<EmailRequestOutcome> => {
    await verifyCurrentPassword(ctx, input.currentPassword);
    const { token, hash } = issueToken();

    // Security lock: a credential, ban or administrative address change
    // retires pending requests and then writes through the provider. A
    // request stored in that gap would survive the retirement.
    const request = await withAccountSecurityLock(ctx, ctx.user.id, async () => {
      const owner = await requireEmailOwner(ctx);
      if (!owner.emailVerified) {
        throw new ActionError("EMAIL_VERIFICATION_REQUIRED", {
          message: { key: "auth.errors.useCorrectEmail" },
        });
      }
      await assertSecurityStateCurrent(ctx.user.id, securityVersionOf(ctx.user));
      await consumeEmailInitiation(ctx);

      const now = new Date();
      return replaceActiveRequest(ctx, {
        kind: "change",
        state: "awaiting_current",
        originalEmail: owner.email,
        newEmail: null,
        currentTokenHash: hash,
        newTokenHash: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + EMAIL_CHANGE_POLICY.requestTtlMs),
      });
    });

    const delivery = await deliverLink(ctx, {
      to: request.originalEmail,
      purpose: "current",
      token,
      expiresAt: request.expiresAt,
    });
    return pendingOutcome(ctx, request, delivery);
  },
});
