import { defineRoutes } from "@/src/lib/access/routes";

/**
 * Routes of the logs module (`app/(LogsModule)`): the staff log and the
 * email-log list, admin only. A selected email record opens as a dialog over
 * its list (`?log=<id>`); there is no standalone detail route.
 *
 * The sidebar lists these under its "System" category. Navigation categories
 * are staff-facing information architecture composed in `src/lib/app/navigation.ts`;
 * they do not follow module names.
 */
export const logsRoutes = defineRoutes({
  staffLogs: {
    href: "/admin/staff-logs",
    label: "nav.staffLog",
    icon: "staffLogs",
    access: { roles: ["admin"] },
  },
  emailLogs: {
    href: "/admin/email-logs",
    label: "nav.emailLogs",
    icon: "emailLogs",
    access: { roles: ["admin"] },
  },
});
