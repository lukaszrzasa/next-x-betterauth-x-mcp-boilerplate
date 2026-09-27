import {
  appName,
  EmailButton,
  EmailFallbackLink,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./_components";

export type EmailChangePurpose = "current" | "new";

export type EmailChangeConfirmationProps = {
  url: string;
  purpose: EmailChangePurpose;
  /** "25 Sep 2026, 14:32 UTC": the fixed deadline of the whole request. */
  expiresAtLabel: string;
  name?: string;
};

/**
 * The two link-only confirmations of a sign-in email change: the current
 * mailbox confirms that the change may proceed, the new mailbox confirms
 * that it is the intended destination and completes it. No code is ever
 * mailed; the button is the proof.
 */
export default function EmailChangeConfirmation({
  url,
  purpose,
  expiresAtLabel,
  name,
}: EmailChangeConfirmationProps) {
  const greeting = name ? `Hi ${name}, ` : "";

  if (purpose === "current") {
    return (
      <EmailLayout preview={`Confirm the sign-in email change for your ${appName} account`}>
        <EmailHeading>Confirm your sign-in email change</EmailHeading>
        <EmailText>
          {greeting}a change of the sign-in email address of your {appName} account was requested from
          your account settings. Confirm from this mailbox to continue; you will then choose the new
          address in your account settings.
        </EmailText>
        <EmailText>This link works until {expiresAtLabel}. Nothing changes until the new address is confirmed as well.</EmailText>
        <EmailButton href={url}>Confirm email address</EmailButton>
        <EmailFallbackLink
          href={url}
          note="If you did not request this, cancel the request in your account settings and change your password."
        />
      </EmailLayout>
    );
  }

  return (
    <EmailLayout preview={`Confirm this address as the sign-in email for your ${appName} account`}>
      <EmailHeading>Confirm your new sign-in email</EmailHeading>
      <EmailText>
        {greeting}this address was chosen as the new sign-in email for your {appName} account. Confirming
        completes the change and signs out every existing session; sign in afterwards with this address.
      </EmailText>
      <EmailText>This link works until {expiresAtLabel}.</EmailText>
      <EmailButton href={url}>Confirm email address</EmailButton>
      <EmailFallbackLink href={url} note="If you did not expect this email, you can ignore it; nothing changes without confirmation." />
    </EmailLayout>
  );
}
