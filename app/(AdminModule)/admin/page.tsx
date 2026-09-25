import { page } from "@/app/_/access";
import { AppBreadcrumbs } from "@/app/_/shell/AppBreadcrumbs";
import { adminRoutes } from "@/app/(AdminModule)/_/routes";

export default page(adminRoutes.dashboard, () => (
  <AppBreadcrumbs items={[{ label: "Admin" }]} />
));
