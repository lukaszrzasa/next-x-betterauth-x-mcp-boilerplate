import {
  appName,
  EmailButton,
  EmailFallbackLink,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./_components";

export type ResetPasswordProps = {
  url: string;
  name?: string;
};

export default function ResetPassword({ url, name }: ResetPasswordProps) {
  return (
    <EmailLayout preview={`Reset your ${appName} password`}>
      <EmailHeading>Reset your password</EmailHeading>
      <EmailText>
        {name ? `Hi ${name}, ` : ""}we received a request to reset the password for
        your {appName} account. This link expires in one hour and can only be used
        once.
      </EmailText>
      <EmailButton href={url}>Reset password</EmailButton>
      <EmailFallbackLink
        href={url}
        note="If you did not request a password reset, no action is needed — your password stays unchanged."
      />
    </EmailLayout>
  );
}
