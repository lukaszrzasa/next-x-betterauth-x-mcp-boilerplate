import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { page, redirectRefused } from "@/src/lib/app/access";
import { AppBreadcrumbs } from "@/src/components/shell/AppBreadcrumbs";
import { appRoutes } from "@/src/lib/app/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { UserDetail } from "@/app/(AuthModule)/admin/_/components/users/detail/UserDetail";
import { getUserQuery } from "@/app/(AuthModule)/admin/_/queries";
import { resolveReturnTo } from "@/app/(AuthModule)/admin/_/queryState";
import { userIdSchema } from "@/app/(AuthModule)/admin/_/schema";
import { RETURN_TO_PARAM, type UserDetail as UserDetailData } from "@/app/(AuthModule)/admin/_/types";
import { authorize } from "@/src/lib/access/routes";
import { ActionError } from "@/src/lib/auth/errors";

/**
 * One account. The route rule (`user.get`) admits the viewer; the read then
 * checks again. Only after that does a missing or malformed ID become
 * not-found, so an unauthorized request learns nothing about which IDs
 * exist. The way back is the validated `returnTo` list URL, and only when
 * the viewer may open the list at all.
 */
export default page<PageProps<"/admin/users/[userId]">>(
  authRoutes.adminUser,
  async ({ params, searchParams }, session) => {
    const [{ userId }, query] = await Promise.all([params, searchParams]);
    const parsedId = userIdSchema.safeParse(userId);

    let user: UserDetailData | null = null;
    if (parsedId.success) {
      try {
        user = await getUserQuery({ userId: parsedId.data });
      } catch (error) {
        if (ActionError.is(error) && error.reason === "NOT_FOUND") notFound();
        // To a non-staff account the read does not exist; the guard already
      // redirected such viewers, so this is the belt to that suspenders.
      if (ActionError.is(error) && error.reason === "NOT_FOUND") notFound();
      if (ActionError.is(error) && isRefusal(error)) redirectRefused(session);
        throw error;
      }
    } else if (session && !authorize(session.user, authRoutes.adminUser.access)) {
      redirectRefused(session);
    }
    if (!user) notFound();

    const canList = session ? authorize(session.user, authRoutes.adminUsers.access) : false;
    const listUrl = canList ? resolveReturnTo(query[RETURN_TO_PARAM]) : null;
    const [t, nav] = await Promise.all([getTranslations("authAdmin"), getTranslations()]);
    // The Users crumb links back only for viewers who may open the list.
    const usersCrumb = { label: nav(authRoutes.adminUsers.label), href: listUrl ?? undefined };

    return (
      <>
        <AppBreadcrumbs
          items={[{ label: t("breadcrumbs.admin"), href: appRoutes.dashboard.href }, usersCrumb, { label: user.name }]}
        />
        <UserDetail user={user} listUrl={listUrl} />
      </>
    );
  },
);

function isRefusal(error: ActionError): boolean {
  return (
    error.reason === "UNAUTHENTICATED" ||
    error.reason === "FORBIDDEN" ||
    error.reason === "TWO_FACTOR_ENROLLMENT_REQUIRED"
  );
}
