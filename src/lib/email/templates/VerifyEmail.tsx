import {
  appName,
  EmailButton,
  EmailFallbackLink,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./_components";

export type VerifyEmailProps = {
  url: string;
  name?: string;
};

export default function VerifyEmail({ url, name }: VerifyEmailProps) {
  return (
    <EmailLayout preview={`Verify your email address for ${appName}`}>
      <EmailHeading>Verify your email address</EmailHeading>
      <EmailText>
        {name ? `Hi ${name}, ` : ""}confirm this address to finish setting up your{" "}
        {appName} account.
      </EmailText>
      <EmailButton href={url}>Verify email address</EmailButton>
      <EmailFallbackLink
        href={url}
        note="If you did not create an account, you can ignore this email."
      />
    </EmailLayout>
  );
}
