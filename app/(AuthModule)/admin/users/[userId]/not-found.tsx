"use client";

import Link from "next/link";
import { UserXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/src/components/ui/button";
import { useViewer } from "@/src/components/shell/ViewerProvider";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

/** The ID is unknown or malformed. Never an empty editable form. */
export default function UserNotFound() {
  const t = useTranslations("authAdmin.detail");
  const { can } = useViewer();

  return (
    <div className="ui:flex ui:flex-col ui:items-center ui:gap-3 ui:rounded-xl ui:border ui:bg-card ui:px-6 ui:py-12 ui:text-center">
      <UserXIcon aria-hidden="true" className="ui:size-6 ui:text-muted-foreground" />
      <div className="ui:flex ui:flex-col ui:gap-1">
        <h1 className="ui:text-base ui:font-semibold">{t("notFound.title")}</h1>
        <p className="ui:max-w-prose ui:text-sm ui:text-muted-foreground">{t("notFound.description")}</p>
      </div>
      {can(authRoutes.adminUsers.access) && (
        <Link href={authRoutes.adminUsers.href} className={buttonVariants({ variant: "outline" })}>
          {t("backToUsers")}
        </Link>
      )}
    </div>
  );
}
