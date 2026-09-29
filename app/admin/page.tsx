import { page } from "@/src/lib/app/access";
import { AppBreadcrumbs } from "@/src/components/shell/AppBreadcrumbs";
import { appRoutes } from "@/src/lib/app/routes";

/**
 * The dashboard. It belongs to no module, so it is the one page that lives
 * directly under `app/`; every other admin page is its module's.
 */
export default page(appRoutes.dashboard, () => (
  <AppBreadcrumbs items={[{ label: "Admin" }]} />
));
