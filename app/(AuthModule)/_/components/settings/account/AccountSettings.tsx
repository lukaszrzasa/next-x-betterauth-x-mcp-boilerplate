"use client";

import { useRefreshOnFocus } from "@/src/lib/hooks/useRefreshOnFocus";
import type { AccountSettings as AccountSettingsData, SessionPage } from "@/app/(AuthModule)/_/types/settings";
import { AuthenticatorSection } from "./sections/AuthenticatorSection";
import { EmailSection } from "./sections/EmailSection";
import { PasswordSection } from "./sections/PasswordSection";
import { RecoveryCodesSection } from "./sections/RecoveryCodesSection";
import { SessionsSection } from "./sections/SessionsSection";

/**
 * The Account page's body: five sections stacked in reading order, each
 * owning its flow and feedback. Nothing is aggregated above them; the page
 * re-reads its data on window focus so a link confirmed on another device
 * shows up without polling.
 */
export function AccountSettings({ account, sessions }: { account: AccountSettingsData; sessions: SessionPage }) {
  useRefreshOnFocus();

  return (
    <div className="ui:flex ui:w-full ui:flex-col ui:gap-6">
      <EmailSection account={account} />
      <PasswordSection account={account} />
      <AuthenticatorSection account={account} />
      <RecoveryCodesSection account={account} />
      <SessionsSection sessions={sessions} />
    </div>
  );
}
