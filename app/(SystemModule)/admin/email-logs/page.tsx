import { page } from "@/app/_/access";
import { AppBreadcrumbs } from "@/app/_/shell/AppBreadcrumbs";
import { adminRoutes } from "@/app/(AdminModule)/_/routes";
import { systemRoutes } from "@/app/(SystemModule)/_/routes";

export default page(systemRoutes.emailLogs, () => (
  <AppBreadcrumbs
    items={[
      { label: "Admin", href: adminRoutes.dashboard.href },
      { label: "System" },
      systemRoutes.emailLogs,
    ]}
  />
));
