import {
  appName,
  EmailCode,
  EmailHeading,
  EmailLayout,
  EmailNote,
  EmailText,
} from "./_components";

export type TwoFactorOtpProps = {
  code: string;
  expiresInMinutes: number;
  name?: string;
};

export default function TwoFactorOtp({
  code,
  expiresInMinutes,
  name,
}: TwoFactorOtpProps) {
  return (
    <EmailLayout preview={`Your ${appName} verification code is ${code}`}>
      <EmailHeading>Your verification code</EmailHeading>
      <EmailText>
        {name ? `Hi ${name}, ` : ""}enter this code to finish signing in to{" "}
        {appName}. It expires in {expiresInMinutes}{" "}
        {expiresInMinutes === 1 ? "minute" : "minutes"}.
      </EmailText>
      <EmailCode>{code}</EmailCode>
      <EmailNote>
        If you did not try to sign in, someone may know your password - change it
        and this code will stop working.
      </EmailNote>
    </EmailLayout>
  );
}
