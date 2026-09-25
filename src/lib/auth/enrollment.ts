import { hasRole, STAFF_ROLES, type UserRole } from "./permissions";

/** Application policy only; Better Auth owns enrollment and verification. */
export function needsTwoFactorEnrollment(user: {
  role?: UserRole;
  twoFactorRequired?: boolean;
  twoFactorEnabled?: boolean | null;
}) {
  return (
    (hasRole(user.role, STAFF_ROLES) ||
      user.twoFactorRequired === true) &&
    !user.twoFactorEnabled
  );
}
