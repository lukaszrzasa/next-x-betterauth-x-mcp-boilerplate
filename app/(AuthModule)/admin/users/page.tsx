import { page } from "@/app/_/access";
import { AppBreadcrumbs } from "@/app/_/shell/AppBreadcrumbs";
import { adminRoutes } from "@/app/(AdminModule)/_/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export default page(authRoutes.adminUsers, () => (
  <AppBreadcrumbs
    items={[{ label: "Admin", href: adminRoutes.dashboard.href }, authRoutes.adminUsers]}
  />
));
