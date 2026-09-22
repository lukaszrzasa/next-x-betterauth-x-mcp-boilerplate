import { ActionError } from "../errors";
import { can } from "../permissions";
import type { AuthedConfig } from "./actionTypes";
import type { AuthedCtx } from "./context";

type AuthorizationConfig = Pick<
  AuthedConfig<unknown, unknown>,
  | "permissions"
  | "permissionsConnector"
  | "twoFactorPool"
  | "requireVerifiedEmail"
>;

export function checkAuthorization(
  config: AuthorizationConfig,
  ctx: AuthedCtx,
): void {
  const { user, session } = ctx;

  // Impersonation grants an admin a session, not the user's second factor.
  if (config.twoFactorPool && session.impersonatedBy) {
    throw new ActionError("IMPERSONATION_FORBIDDEN", {
      message:
        "Two-factor protected actions cannot be run while impersonating.",
    });
  }

  if (
    (config.requireVerifiedEmail || config.twoFactorPool) &&
    !user.emailVerified
  ) {
    throw new ActionError("EMAIL_VERIFICATION_REQUIRED");
  }

  const permissions = config.permissions ?? [];
  const connector = config.permissionsConnector ?? "AND";
  if (permissions.length > 0 && !can(user.role, permissions, connector)) {
    throw new ActionError("FORBIDDEN", {
      message: `Missing permission (${connector}): ${
        typeof permissions === "string" ? permissions : permissions.join(", ")
      }`,
    });
  }
}
