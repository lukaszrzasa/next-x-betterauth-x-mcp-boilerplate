import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { maskEmail } from "@/src/lib/email/maskEmail";
import { findRequestByTokenHash } from "@/app/(AuthModule)/_/db/emailRequests/requests";
import { isActive, isExpired, provesCurrentStage, purposeOf } from "@/app/(AuthModule)/_/policies/emailRequest";
import { emailProofSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { hashToken } from "@/app/(AuthModule)/_/services/email/tokens";
import type { EmailProofInspection } from "@/app/(AuthModule)/_/types/settings";

/**
 * What the confirmation page may show before the explicit submit. Public on
 * purpose: the opaque token is the whole authority, and whoever happens to
 * be signed in on the browser is irrelevant (`ctx.user` is null). Reads
 * only; the proof is not consumed and nothing changes.
 */
export const inspectEmailProofOperation = defineAction({
  name: "settings.emailProof.inspect",
  auth: "public",
  schema: emailProofSchema,
  mcpAllowed: false,
  handler: async (ctx, input): Promise<EmailProofInspection> => {
    const hash = hashToken(input.token);
    const request = await findRequestByTokenHash(ctx, hash);
    if (!request || !isActive(request)) return { status: "inactive" };
    if (isExpired(request, new Date())) return { status: "expired" };

    const purpose = purposeOf(request, hash);
    if (!provesCurrentStage(request, purpose)) return { status: "inactive" };

    const email = purpose === "current" ? request.originalEmail : (request.newEmail ?? "");
    return {
      status: "confirmable",
      purpose,
      maskedEmail: maskEmail(email),
      expiresAt: request.expiresAt.toISOString(),
    };
  },
});
