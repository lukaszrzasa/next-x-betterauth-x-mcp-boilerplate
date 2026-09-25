import { requireGuest } from "@/app/(AuthModule)/_/guards";
import { AuthHeading } from "@/app/(AuthModule)/_/components/layout/AuthHeading";
import { AuthFooter } from "@/app/(AuthModule)/_/components/layout/AuthFooter";
import { SignInForm } from "@/app/(AuthModule)/_/components/signIn/SignInForm";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

export default async function SignInPage() {
  await requireGuest();

  return (
    <>
      <AuthHeading title="Welcome back">
        Enter your details to sign in to your account.
      </AuthHeading>
      <SignInForm />
      <AuthFooter href={authRoutes.signUp.href} label="Create an account">
        New here?
      </AuthFooter>
    </>
  );
}
