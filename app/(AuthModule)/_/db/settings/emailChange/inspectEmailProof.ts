import "server-only";

import type { PublicCtx } from "@/src/lib/auth/builders/context";
import { db } from "@/src/lib/db";
import { maskEmail } from "@/src/lib/email/maskEmail";
import type { EmailProofSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { EmailProofInspection } from "@/app/(AuthModule)/_/types/settings";
import { findByTokenHash, provesCurrentStage } from "./proofs";
import { isActive, isExpired } from "./requests";
import { hashToken } from "./tokens";

/** What the confirmation page may show before the explicit submit; reads only, changes nothing. */
export async function inspectEmailProof(_ctx: PublicCtx, input: EmailProofSchema): Promise<EmailProofInspection> {
  const match = await findByTokenHash(db, hashToken(input.token));
  if (!match || !isActive(match.row)) return { status: "inactive" };
  if (isExpired(match.row, new Date())) return { status: "expired" };
  if (!provesCurrentStage(match)) return { status: "inactive" };

  const email = match.purpose === "current" ? match.row.originalEmail : (match.row.newEmail ?? "");
  return {
    status: "confirmable",
    purpose: match.purpose,
    maskedEmail: maskEmail(email),
    expiresAt: match.row.expiresAt.toISOString(),
  };
}
