import { hasRole, type RoleName, type UserRole } from "./permissions";

/** Roles that must always sign in with an authenticator app. */
const ROLES_REQUIRING_TWO_FACTOR: readonly RoleName[] = ["admin", "moderator"];

/** Application policy only; Better Auth owns enrollment and verification. */
export function needsTwoFactorEnrollment(user: {
  role?: UserRole;
  twoFactorRequired?: boolean;
  twoFactorEnabled?: boolean | null;
}) {
  return (
    (hasRole(user.role, ROLES_REQUIRING_TWO_FACTOR) ||
      user.twoFactorRequired === true) &&
    !user.twoFactorEnabled
  );
}
