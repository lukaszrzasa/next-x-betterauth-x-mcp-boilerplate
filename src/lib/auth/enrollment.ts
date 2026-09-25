/** Application policy only; Better Auth owns enrollment and verification. */
export function needsTwoFactorEnrollment(user: {
  role?: string | null;
  twoFactorRequired?: boolean;
  twoFactorEnabled?: boolean | null;
}) {
  return (
    (user.role === "admin" ||
      user.role === "moderator" ||
      user.twoFactorRequired === true) &&
    !user.twoFactorEnabled
  );
}
