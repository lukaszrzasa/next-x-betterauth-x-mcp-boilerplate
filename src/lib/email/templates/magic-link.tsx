import {
  appName,
  EmailButton,
  EmailFallbackLink,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./_components";

export type MagicLinkProps = {
  url: string;
  expiresInMinutes: number;
};

/**
 * Better Auth's `sendMagicLink` callback only knows the email address - the
 * user may not exist yet - so this template intentionally takes no name.
 */
export default function MagicLink({ url, expiresInMinutes }: MagicLinkProps) {
  return (
    <EmailLayout preview={`Your ${appName} sign-in link`}>
      <EmailHeading>Sign in to {appName}</EmailHeading>
      <EmailText>
        Use the link below to sign in. It expires in {expiresInMinutes}{" "}
        {expiresInMinutes === 1 ? "minute" : "minutes"} and can only be used once.
      </EmailText>
      <EmailButton href={url}>Sign in</EmailButton>
      <EmailFallbackLink
        href={url}
        note="If you did not request this link, you can ignore this email - nobody can sign in without it."
      />
    </EmailLayout>
  );
}
