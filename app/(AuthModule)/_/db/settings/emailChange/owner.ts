import "server-only";

import { and, eq, ne } from "drizzle-orm";

import type { SqlReader } from "@/src/lib/auth/securityVersion";
import { user } from "@/src/lib/db";
import { accountNotFoundError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { addressUnavailableError } from "./errors";

export type EmailOwner = { id: string; email: string; emailVerified: boolean };

/** The account's sign-in address as it is now, never the session's cached copy. */
export async function loadOwner(reads: SqlReader, userId: string): Promise<EmailOwner> {
  const [row] = await reads
    .select({ id: user.id, email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) throw accountNotFoundError();
  return row;
}

/** Refuses an address another account signs in with; the refusal never says which account. */
export async function assertAddressAvailable(reads: SqlReader, email: string, ownerId: string): Promise<void> {
  const [taken] = await reads
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), ne(user.id, ownerId)))
    .limit(1);
  if (taken) throw addressUnavailableError();
}
