import "server-only";
import { adminRoutes } from "@/app/(AdminModule)/_/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { createPageFactory } from "@/src/lib/access/page";
import { authorize } from "@/src/lib/access/routes";

/**
 * The page factory every signed-in page is written with. The ESLint rule
 * `app/admin-page` requires `export default page(route, render)` from here
 * for every page under an `admin` segment.
 */
export const { page, guard } = createPageFactory({
  signIn: authRoutes.signIn.href,
  // The dashboard if the viewer may open it, otherwise the panel.
  denied: (session) =>
    authorize(session.user, adminRoutes.dashboard.access)
      ? adminRoutes.dashboard.href
      : authRoutes.panel.href,
});
