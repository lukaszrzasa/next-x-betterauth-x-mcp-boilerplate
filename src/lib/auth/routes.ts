/**
 * Every page and API prefix the auth module serves (`app/(AuthModule)`).
 * Redirects, links, the proxy's allow-lists and email links all read from
 * here, so renaming a page folder means changing one string and letting the
 * type checker find the rest. Parameterised paths go through `buildRoute` in
 * `src/lib/routes.ts`.
 */
export const authRoutes = {
  setup: "/auth/setup",
  signIn: "/auth/sign-in",
  signUp: "/auth/sign-up",
  enroll: "/auth/enroll",
  emailConfirmation: "/auth/email-confirmation",
  forgotPassword: "/auth/forgot-password",
  resetPassword: "/auth/reset-password",
  /** Better Auth's HTTP surface; everything under it is a Better Auth endpoint. */
  api: "/api/auth",
  /** The minimal signed-in landing page. */
  panel: "/panel",
} as const;

export type AuthRoute = (typeof authRoutes)[keyof typeof authRoutes];
