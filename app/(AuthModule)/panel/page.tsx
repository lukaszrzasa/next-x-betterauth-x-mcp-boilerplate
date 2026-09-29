import { page } from "@/src/lib/app/access";
import { AppBreadcrumbs } from "@/src/components/shell/AppBreadcrumbs";
import { appRoutes } from "@/src/lib/app/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export default page(authRoutes.panel, () => (
  <AppBreadcrumbs items={[appRoutes.home, authRoutes.panel]} />
));
