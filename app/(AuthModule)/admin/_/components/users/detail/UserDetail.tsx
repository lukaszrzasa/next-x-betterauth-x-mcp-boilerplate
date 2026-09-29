"use client";

import type { UserDetail as UserDetailData } from "@/app/(AuthModule)/admin/_/types";
import { UserStaffLogSection } from "./sections/UserStaffLogSection";
import { UserAccessSection } from "./sections/UserAccessSection";
import { UserMetadataSection } from "./sections/UserMetadataSection";
import { UserProfileSection } from "./sections/UserProfileSection";
import { UserSecuritySection } from "./sections/UserSecuritySection";
import { UserIdentityHeader } from "./UserIdentityHeader";

/**
 * The detail page's body: identity header, then the four sections, each
 * owning its own actions and feedback. On wide screens Profile and Security
 * take the wider column and Access and Account details the narrower one;
 * the DOM order stays Profile, Security, Access, Account details. The staff
 * log of the account follows, for viewers who may read it.
 */
export function UserDetail({
  user,
  listUrl,
  readAt,
}: {
  user: UserDetailData;
  listUrl: string | null;
  /** When the page was read; a refresh after an action moves it on. */
  readAt: string;
}) {
  return (
    <div className="ui:flex ui:w-full ui:max-w-[80rem] ui:flex-col ui:gap-6">
      <UserIdentityHeader user={user} listUrl={listUrl} />
      <div className="ui:grid ui:grid-cols-1 ui:gap-6 ui:lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="ui:flex ui:min-w-0 ui:flex-col ui:gap-6 ui:lg:col-start-1">
          <UserProfileSection user={user} />
          <UserSecuritySection user={user} />
        </div>
        <div className="ui:flex ui:min-w-0 ui:flex-col ui:gap-6 ui:lg:col-start-2 ui:lg:row-start-1">
          <UserAccessSection user={user} />
          <UserMetadataSection user={user} />
        </div>
      </div>
      <UserStaffLogSection userId={user.id} revision={readAt} />
    </div>
  );
}
