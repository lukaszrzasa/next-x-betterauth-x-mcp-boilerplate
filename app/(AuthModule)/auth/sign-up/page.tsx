import { requireGuest } from "@/app/(AuthModule)/_/guards";
import { AuthHeading } from "@/app/(AuthModule)/_/components/layout/AuthHeading";
import { AuthFooter } from "@/app/(AuthModule)/_/components/layout/AuthFooter";
import { SignUpForm } from "@/app/(AuthModule)/_/components/signUp/SignUpForm";
import { authRoutes } from "@/src/lib/auth/routes";

export default async function SignUpPage() {
  await requireGuest();

  return (
    <>
      <AuthHeading title="Create your account">
        Enter your details to create your account.
      </AuthHeading>
      <SignUpForm />
      <AuthFooter href={authRoutes.signIn} label="Sign in">
        Already have an account?
      </AuthFooter>
    </>
  );
}
