import { page, redirectRefused } from "@/app/_/access";
import { ProfileSection } from "@/app/(AuthModule)/_/components/settings/profile/ProfileSection";
import { requireEnrolledSession } from "@/app/(AuthModule)/_/guards";
import { getProfileQuery } from "@/app/(AuthModule)/_/queries";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { ActionError } from "@/src/lib/auth/errors";

/**
 * Display name only. The route rule admits any session; the explicit
 * enrollment guard sends a required-but-unenrolled account to enrollment
 * before the read, which checks again itself.
 */
export default page(authRoutes.settingsProfile, async (_props, session) => {
  await requireEnrolledSession();
  let profile;
  try {
    profile = await getProfileQuery(undefined);
  } catch (error) {
    if (ActionError.is(error) && error.reason !== "INTERNAL") redirectRefused(session);
    throw error;
  }

  return (
    <div className="ui:flex ui:w-full ui:flex-col ui:gap-6">
      <ProfileSection profile={profile} />
    </div>
  );
});
