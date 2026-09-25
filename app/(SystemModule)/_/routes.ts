import { defineRoutes } from "@/src/lib/access/routes";

/** Routes of the system module (`app/(SystemModule)`): operational logs, admin only. */
export const systemRoutes = defineRoutes({
  auditLogs: {
    href: "/admin/audit-logs",
    label: "Audit logs",
    icon: "auditLogs",
    access: { roles: ["admin"] },
  },
  emailLogs: {
    href: "/admin/email-logs",
    label: "Email logs",
    icon: "emailLogs",
    access: { roles: ["admin"] },
  },
});
