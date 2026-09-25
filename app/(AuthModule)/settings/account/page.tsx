import { page } from "@/app/_/access";
import { AppBreadcrumbs } from "@/app/_/shell/AppBreadcrumbs";
import { appRoutes } from "@/app/_/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

/** Reachable by URL only; settings navigation is deferred. */
export default page(authRoutes.settingsAccount, () => (
  <AppBreadcrumbs
    items={[appRoutes.home, authRoutes.settings, authRoutes.settingsAccount]}
  />
));
