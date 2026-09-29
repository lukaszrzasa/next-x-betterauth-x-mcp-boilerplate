import { page } from "@/src/lib/app/access";
import { appRoutes } from "@/src/lib/app/routes";

/** The homepage has no content yet; the shell provides the chrome. */
export default page(appRoutes.home, () => null);
