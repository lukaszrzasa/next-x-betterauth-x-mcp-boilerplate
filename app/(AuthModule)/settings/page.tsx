import { redirect } from "next/navigation";
import { page } from "@/app/_/access";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

/** The settings index has no page of its own; Profile is the first section. */
export default page(authRoutes.settings, () => redirect(authRoutes.settingsProfile.href));
