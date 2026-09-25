import { page } from "@/app/_/access";
import { appRoutes } from "@/app/_/routes";

/** The homepage has no content yet; the shell provides the chrome. */
export default page(appRoutes.home, () => null);
