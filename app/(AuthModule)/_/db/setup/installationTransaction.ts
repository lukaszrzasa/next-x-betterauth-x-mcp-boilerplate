import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sql } from "drizzle-orm";

import { auth } from "@/src/lib/auth";
import type { PublicCtx } from "@/src/lib/auth/builders/context";
import { db, installation, user } from "@/src/lib/db";

/**
 * The first installation, as one transaction. This is the one place where
 * the provider writes *inside* an application transaction: a Better Auth
 * instance is bound to the transaction's executor, so the user, the
 * credential and the installation record commit together or not at all.
 * Every other provider call uses the global instance and commits on its
 * own connection.
 */

export type RootAdminAccount = {
  name: string;
  email: string;
  password: string;
  role: "admin";
  twoFactorRequired: boolean;
};

export type InstallationWrites = {
  /** Whether an installation record or any user already exists. */
  isInstalled(): Promise<boolean>;
  /** The provider creates the user, credential account, IDs and password hash. */
  createRootAdmin(account: RootAdminAccount): Promise<string>;
};

/** Distinct from the account security lock's namespace (194732). */
const INSTALLATION_LOCK = sql`select pg_advisory_xact_lock(194731, 1)`;

/**
 * Runs `install` holding the installation lock, which is taken before
 * anything is read: two simultaneous setups cannot both see an empty
 * installation. Throwing from `install` rolls everything back, the
 * provider's rows included.
 */
export async function withInstallationTransaction<T>(
  _ctx: PublicCtx,
  install: (writes: InstallationWrites) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(INSTALLATION_LOCK);

    return install({
      async isInstalled() {
        const installations = await tx.select().from(installation).limit(1);
        const users = await tx.select({ id: user.id }).from(user).limit(1);
        return installations.length > 0 || users.length > 0;
      },
      async createRootAdmin({ twoFactorRequired, ...account }) {
        // The existing Better Auth configuration, bound to this transaction.
        const transactionAuth = betterAuth({
          ...auth.options,
          database: drizzleAdapter(tx, { provider: "pg" }),
        });
        const { user: rootAdmin } = await transactionAuth.api.createUser({
          body: { ...account, data: { twoFactorRequired } },
        });
        await tx.insert(installation).values({ id: true, rootUserId: rootAdmin.id });
        return rootAdmin.id;
      },
    });
  });
}
