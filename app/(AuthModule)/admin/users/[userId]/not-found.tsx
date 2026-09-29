"use client";

import Link from "next/link";
import { UserXIcon } from "lucide-react";
import { buttonVariants } from "@/src/components/ui/button";
import { useViewer } from "@/src/components/shell/ViewerProvider";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

/** The ID is unknown or malformed. Never an empty editable form. */
export default function UserNotFound() {
  const { can } = useViewer();

  return (
    <div className="ui:flex ui:flex-col ui:items-center ui:gap-3 ui:rounded-xl ui:border ui:bg-card ui:px-6 ui:py-12 ui:text-center">
      <UserXIcon aria-hidden="true" className="ui:size-6 ui:text-muted-foreground" />
      <div className="ui:flex ui:flex-col ui:gap-1">
        <h1 className="ui:text-base ui:font-semibold">User not found</h1>
        <p className="ui:max-w-prose ui:text-sm ui:text-muted-foreground">
          There is no account with this ID. It may have been removed, or the link is incomplete.
        </p>
      </div>
      {can(authRoutes.adminUsers.access) && (
        <Link href={authRoutes.adminUsers.href} className={buttonVariants({ variant: "outline" })}>
          Back to users
        </Link>
      )}
    </div>
  );
}
