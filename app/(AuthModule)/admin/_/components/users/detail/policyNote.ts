import type { UserActionDenial } from "@/app/(AuthModule)/admin/_/types";

/** Catalog keys of the short read-only explanations for controls the actor holds the permission for but policy blocks. */
const POLICY_NOTE_KEYS: Partial<Record<UserActionDenial, "rootProtected" | "rootSelfLimit" | "self" | "staffTarget">> = {
  "root-protected": "rootProtected",
  "root-self-limit": "rootSelfLimit",
  self: "self",
  "staff-target": "staffTarget",
};

export function policyNote(
  t: (key: "rootProtected" | "rootSelfLimit" | "self" | "staffTarget") => string,
  reason: UserActionDenial | undefined,
): string | null {
  const key = reason ? POLICY_NOTE_KEYS[reason] : undefined;
  return key ? t(key) : null;
}
