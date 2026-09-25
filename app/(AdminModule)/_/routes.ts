import { defineRoutes } from "@/src/lib/access/routes";
import { STAFF_ROLES } from "@/src/lib/auth/permissions";

/**
 * Routes of the dashboard area itself (`app/(AdminModule)`). Module-owned
 * dashboard pages, such as user management, are declared in their module's
 * table; this one holds only what no module owns.
 */
export const adminRoutes = defineRoutes({
  dashboard: {
    href: "/admin",
    label: "Dashboard",
    icon: "dashboard",
    match: "exact",
    access: { roles: STAFF_ROLES },
  },
});
