import "server-only";

import type { PublicCtx } from "@/src/lib/auth/builders/context";
import { db } from "@/src/lib/db";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import type { EmailProofSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { EmailProofOutcome } from "@/app/(AuthModule)/_/types/settings";
import { finalizeNewProof } from "./finalizeNewProof";
import { chargeProofAttempt, findByTokenHash } from "./proofs";
import { recordCurrentProof } from "./recordCurrentProof";
import { isActive } from "./requests";
import { hashToken } from "./tokens";

/**
 * The explicit submit of the public page. The token alone identifies the
 * request and the purpose; whoever is signed in on that browser is
 * irrelevant. A current-mailbox proof records itself; a new-mailbox proof
 * commits the change atomically.
 */
export async function confirmEmailProof(ctx: PublicCtx, input: EmailProofSchema): Promise<EmailProofOutcome> {
  const hash = hashToken(input.token);
  const located = await findByTokenHash(db, hash);
  await chargeProofAttempt(ctx, located?.row.id ?? null);
  if (!located || !isActive(located.row)) return { status: "inactive" };

  return withUserAccountLock(ctx, located.row.userId, () =>
    located.purpose === "current"
      ? recordCurrentProof(located.row.id, hash)
      : finalizeNewProof(ctx, located.row.id, hash),
  );
}
