import { defineRoutes } from "@/src/lib/access/routes";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";

/**
 * Routes that belong to the application as a whole rather than to one
 * module. Module-owned dashboard pages, such as user management, are
 * declared in their module's table; the dashboard itself is no module's.
 */
export const appRoutes = defineRoutes({
  home: { href: "/", label: "nav.home", access: "public" },
  dashboard: {
    href: "/admin",
    label: "nav.dashboard",
    icon: "dashboard",
    match: "exact",
    access: { roles: STAFF_ROLES },
  },
});
