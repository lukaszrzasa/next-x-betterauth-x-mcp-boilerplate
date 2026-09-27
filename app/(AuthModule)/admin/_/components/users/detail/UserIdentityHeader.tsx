import Link from "next/link";
import { ArrowLeftIcon, CrownIcon } from "lucide-react";
import { UserAvatar } from "@/src/components/identity/UserAvatar";
import { Badge } from "@/src/components/ui/badge";
import { buttonVariants } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import type { UserDetail } from "@/app/(AuthModule)/admin/_/types";
import { AccessBadge, RoleBadges, VerificationBadge } from "@/app/(AuthModule)/admin/_/components/users/UserBadges";

function ownershipNote(user: UserDetail): string {
  if (user.isRoot && user.isSelf) {
    return "This is the root account, and it is yours. Here you can change its name, send yourself a verification or password-reset email, and sign out of all devices. Its email address cannot be changed here and it can never be banned.";
  }
  if (user.isRoot) return "This is the installation's root account. Only the root account itself can change it.";
  return "This is your own account. Administrative changes to it are not available here.";
}

/**
 * Who this page is about: the way back, the avatar, the name as the page's
 * heading, the address and the badges that matter at a glance. Root and
 * self restrictions are explained here once, not on every disabled control.
 */
export function UserIdentityHeader({
  user,
  listUrl,
}: {
  user: UserDetail;
  /** The validated list URL, or null when the viewer may not open the list. */
  listUrl: string | null;
}) {
  return (
    <header className="ui:flex ui:flex-col ui:gap-4">
      {listUrl && (
        <Link
          href={listUrl}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ui:-ml-2 ui:w-fit ui:text-muted-foreground")}
        >
          <ArrowLeftIcon aria-hidden="true" />
          Back to users
        </Link>
      )}
      <div className="ui:flex ui:flex-col ui:gap-4 ui:sm:flex-row ui:sm:items-start">
        <UserAvatar name={user.name} email={user.email} image={user.image} className="ui:size-14 ui:text-base" />
        <div className="ui:flex ui:min-w-0 ui:flex-1 ui:flex-col ui:gap-2">
          <div className="ui:min-w-0">
            <h1 className="ui:text-2xl ui:font-semibold ui:tracking-tight ui:break-words">{user.name}</h1>
            <p className="ui:text-sm ui:text-muted-foreground ui:break-all">{user.email}</p>
          </div>
          <div className="ui:flex ui:flex-wrap ui:items-center ui:gap-2">
            <RoleBadges roles={user.roles} />
            <VerificationBadge verified={user.emailVerified} />
            <AccessBadge status={user.accessStatus} banExpires={user.banExpires} />
            {user.isRoot && (
              <Badge variant="outline" className="ui:gap-1">
                <CrownIcon aria-hidden="true" />
                Root account
              </Badge>
            )}
          </div>
        </div>
      </div>
      {(user.isRoot || user.isSelf) && (
        <p className="ui:rounded-lg ui:border ui:bg-muted/50 ui:px-4 ui:py-3 ui:text-sm ui:text-muted-foreground">
          {ownershipNote(user)}
        </p>
      )}
    </header>
  );
}
