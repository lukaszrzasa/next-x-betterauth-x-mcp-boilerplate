import { defineRoutes } from "@/src/lib/access/routes";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";

/**
 * Every page and API prefix the auth module serves (`app/(AuthModule)`).
 * Redirects, links, the proxy's allow-lists, email links, navigation and
 * breadcrumbs all read from here, so renaming a page folder means changing
 * one entry and letting the type checker find the rest. Parameterised paths
 * go through `buildRoute` in `src/lib/routes.ts`.
 *
 * Plain entries are the authentication flows (guest-only pages guard
 * themselves); full entries are the signed-in pages, written as
 * `page(authRoutes.x, …)`.
 */
export const authRoutes = defineRoutes({
  /** Prefix of every authentication view; their layout owns its own chrome. */
  views: "/auth",
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
  panel: { href: "/panel", label: "Panel", access: "session" },
  /** Index only: redirects to `settingsProfile`. */
  settings: { href: "/settings", label: "Settings", access: "session" },
  settingsProfile: { href: "/settings/profile", label: "Profile", access: "session" },
  /** Reachable by URL only for now; absent from navigation. */
  settingsAccount: { href: "/settings/account", label: "Account", access: "session" },
  /** Dashboard user management, served by this module's admin scope. */
  adminUsers: {
    href: "/admin/users",
    label: "Users",
    icon: "users",
    access: { roles: STAFF_ROLES, perm: "user.list" },
  },
});
