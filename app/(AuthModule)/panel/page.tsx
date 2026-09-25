import { requireEnrolledSession } from "@/app/(AuthModule)/_/guards";
import { SignOutButton } from "@/app/(AuthModule)/_/components/session/SignOutButton";

export default async function PanelPage() {
  const { user } = await requireEnrolledSession();

  return (
    <main>
      <h1>Account</h1>
      <dl>
        <dt>Name</dt>
        <dd>{user.name}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Account ID</dt>
        <dd>{user.id}</dd>
        <dt>Role</dt>
        <dd>{user.role}</dd>
        <dt>Email confirmed</dt>
        <dd>{user.emailVerified ? "Yes" : "No"}</dd>
      </dl>
      <SignOutButton />
    </main>
  );
}
