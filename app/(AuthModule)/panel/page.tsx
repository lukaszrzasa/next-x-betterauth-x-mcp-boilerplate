import { page } from "@/app/_/access";
import { AppBreadcrumbs } from "@/app/_/shell/AppBreadcrumbs";
import { appRoutes } from "@/app/_/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export default page(authRoutes.panel, () => (
  <AppBreadcrumbs items={[appRoutes.home, authRoutes.panel]} />
));
