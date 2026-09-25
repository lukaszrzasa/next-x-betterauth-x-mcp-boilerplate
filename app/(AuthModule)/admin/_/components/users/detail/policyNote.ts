import type { UserActionDenial } from "@/app/(AuthModule)/admin/_/types";

/** Short read-only explanations for controls the actor holds the permission for but policy blocks. */
export function policyNote(reason: UserActionDenial | undefined): string | null {
  switch (reason) {
    case "root-protected":
      return "Only the root account can change this.";
    case "root-self-limit":
      return "Not available for the root account.";
    case "self":
      return "Not available for your own account.";
    case "staff-target":
      return "Requires the manage-staff permission.";
    default:
      return null;
  }
}
