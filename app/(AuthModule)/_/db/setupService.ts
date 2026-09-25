import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sql } from "drizzle-orm";
import { auth } from "@/src/lib/auth";
import { db, user, installation } from "@/src/lib/db";
import type { PublicCtx } from "@/src/lib/auth/builders/context";
import { ActionError } from "@/src/lib/auth/errors";
import type { SetupRootAdminSchema } from "../schema";

export async function createRootAdminAccount(
  _ctx: PublicCtx,
  input: SetupRootAdminSchema,
) {
  try {
    return await db.transaction(async (tx) => {
      // Lock the duplicate setup
      await tx.execute(sql`select pg_advisory_xact_lock(194731, 1)`);

      const existingInstallation = await tx
        .select()
        .from(installation)
        .limit(1);
      const existingUsers = await tx
        .select({ id: user.id })
        .from(user)
        .limit(1);

      if (existingInstallation.length || existingUsers.length) {
        throw new ActionError("FORBIDDEN", {
          message: "Setup is only available for an empty installation.",
        });
      }

      // Bind the existing Better Auth configuration to our transaction. Better
      // Auth creates the user, credential account, IDs and password hash.
      const transactionAuth = betterAuth({
        ...auth.options,
        database: drizzleAdapter(tx, { provider: "pg" }),
      });

      const { user: rootAdmin } = await transactionAuth.api.createUser({
        body: {
          name: input.name,
          email: input.email,
          password: input.password,
          role: "admin",
          data: { twoFactorRequired: true },
        },
      });

      await tx
        .insert(installation)
        .values({ id: true, rootUserId: rootAdmin.id });

      return rootAdmin.id;
    });
  } catch (error) {
    if (ActionError.is(error)) {
      throw error;
    }

    // Do not expose database errors containing credential parameters.
    throw new ActionError("INTERNAL", {
      message: "Unable to create the administrator.",
    });
  }
}
