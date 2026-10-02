import { needsTwoFactorEnrollment } from "@/src/lib/auth/enrollment";
import { ActionError } from "@/src/lib/auth/errors";
import { can, hasRole } from "@/src/lib/auth/permissions";
import type { AuthedConfig } from "./actionTypes";
import type { AuthedCtx } from "./context";

type AuthorizationConfig = Pick<
  AuthedConfig<unknown, unknown>,
  | "roles"
  | "permissions"
  | "permissionsConnector"
  | "stepUp"
  | "requireVerifiedEmail"
>;

export function checkAuthorization(
  config: AuthorizationConfig,
  ctx: AuthedCtx,
): void {
  const { user, session } = ctx;

  if (needsTwoFactorEnrollment(user)) {
    throw new ActionError("TWO_FACTOR_ENROLLMENT_REQUIRED");
  }

  const requiresStepUp = config.stepUp !== undefined && config.stepUp !== "none";

  // Impersonation grants an admin a session, not the user's second factor.
  if (requiresStepUp && session.impersonatedBy) {
    throw new ActionError("IMPERSONATION_FORBIDDEN", {
      message: { key: "errors.auth.impersonationForbidden" },
    });
  }

  if (
    (config.requireVerifiedEmail || requiresStepUp) &&
    !user.emailVerified
  ) {
    throw new ActionError("EMAIL_VERIFICATION_REQUIRED");
  }

  // Role admission first: to an account outside the declared roles the
  // operation does not exist, whatever permissions it may otherwise hold.
  if (config.roles && !hasRole(user.role, config.roles)) {
    throw new ActionError("NOT_FOUND", { message: { key: "errors.auth.notFound" } });
  }

  const permissions = config.permissions ?? [];
  const connector = config.permissionsConnector ?? "AND";
  if (permissions.length > 0 && !can(user.role, permissions, connector)) {
    throw new ActionError("FORBIDDEN", {
      message: { key: "errors.auth.missingPermission" },
      data: {
        permissions: typeof permissions === "string" ? [permissions] : [...permissions],
        connector,
      },
    });
  }
}
