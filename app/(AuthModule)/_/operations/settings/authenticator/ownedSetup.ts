import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { securityVersionOf } from "@/src/lib/auth/securityVersion";
import { isUuid } from "@/src/lib/isUuid";
import { findFactorAccount, type FactorAccount } from "@/app/(AuthModule)/_/db/authenticator/factors";
import {
  findOwnedSetup,
  markSetupExpired,
  type SetupRequestRow,
} from "@/app/(AuthModule)/_/db/authenticator/setupRequests";
import { setupExpiredError, setupReplacedError } from "@/app/(AuthModule)/_/errors/authenticatorSetup";
import { accountNotFoundError } from "@/app/(AuthModule)/_/errors/settings";

/** The actor's factor state as the database has it now. */
export async function requireFactorAccount(ctx: AuthedCtx): Promise<FactorAccount> {
  const account = await findFactorAccount(ctx);
  if (!account) throw accountNotFoundError();
  return account;
}

/**
 * The actor's pending attempt of `kind`, or the closed refusal. Checked in
 * this order: that it exists, is pending and of the right kind; that it has
 * not expired (an overdue attempt is marked expired, and that write
 * stands); that this session and this security generation started it.
 */
export async function requireOwnedSetup(
  ctx: AuthedCtx,
  requestId: string,
  kind: SetupRequestRow["kind"],
  now: Date,
): Promise<SetupRequestRow> {
  if (!isUuid(requestId)) throw setupReplacedError();
  const setup = await findOwnedSetup(ctx, requestId);
  if (!setup || setup.state !== "pending" || setup.kind !== kind) throw setupReplacedError();

  if (now.getTime() >= setup.expiresAt.getTime()) {
    await markSetupExpired(ctx, setup.id);
    throw setupExpiredError();
  }
  if (setup.initiatingSessionId !== ctx.session.id) throw setupReplacedError();
  if (setup.authorizedSecurityVersion !== securityVersionOf(ctx.user)) throw setupReplacedError();
  return setup;
}
