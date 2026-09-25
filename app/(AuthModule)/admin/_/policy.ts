import {
  can,
  hasRole,
  STAFF_ROLES,
  type Permission,
  type UserRole,
} from "@/src/lib/auth/permissions";
import type { AccessStatus, UserAction, UserActionCapability } from "./types";

/**
 * Pure target policy for user administration. Services call it with freshly
 * loaded target data to enforce the rules; the detail read calls it to
 * publish capabilities for presentation. Permissions declared on the
 * operations remain authoritative - a capability flag never authorizes a
 * write, and the last-admin invariant is a database check at ban time, not
 * something this function can know.
 */

/** Permissions each action requires, combined with AND, on top of staff eligibility. */
export const USER_ACTION_PERMISSIONS: Record<UserAction, readonly Permission[]> = {
  updateName: ["user.get", "user.update"],
  updateEmail: ["user.get", "user.update", "user.set-email"],
  sendVerification: ["user.get", "user.send-verification"],
  sendPasswordReset: ["user.get", "user.send-password-reset"],
  revokeSessions: ["user.get", "session.revoke"],
  ban: ["user.get", "user.ban"],
  unban: ["user.get", "user.ban"],
};

/** What root may still do to their own account through this surface. */
const ROOT_SELF_ACTIONS: readonly UserAction[] = [
  "updateName",
  "sendVerification",
  "sendPasswordReset",
  "revokeSessions",
];

export type PolicyActor = { id: string; role: UserRole };

export type PolicyTarget = {
  id: string;
  role: UserRole;
  emailVerified: boolean;
  accessStatus: AccessStatus;
};

export function isStaffRole(role: UserRole): boolean {
  return hasRole(role, STAFF_ROLES);
}

/**
 * Whether `actor` may perform `action` on `target`, given the installation's
 * root user ID. Reads stay permission-based elsewhere; this covers writes and
 * account actions only. Rules, in order: permission, root protection, root's
 * own limits, self-administration, staff targets, then the target's state.
 */
export function evaluateUserAction(
  actor: PolicyActor,
  target: PolicyTarget,
  rootUserId: string,
  action: UserAction,
): UserActionCapability {
  if (!isStaffRole(actor.role) || !can(actor.role, USER_ACTION_PERMISSIONS[action])) {
    return { allowed: false, reason: "permission" };
  }

  const targetIsRoot = target.id === rootUserId;
  const actorIsRoot = actor.id === rootUserId;

  if (targetIsRoot && !actorIsRoot) {
    return { allowed: false, reason: "root-protected" };
  }

  if (targetIsRoot && actorIsRoot && !ROOT_SELF_ACTIONS.includes(action)) {
    return { allowed: false, reason: "root-self-limit" };
  }

  if (!targetIsRoot && actor.id === target.id) {
    return { allowed: false, reason: "self" };
  }

  if (isStaffRole(target.role) && !can(actor.role, "user.manage-staff")) {
    return { allowed: false, reason: "staff-target" };
  }

  if (action === "sendVerification" && target.emailVerified) {
    return { allowed: false, reason: "already-verified" };
  }

  if (action === "unban" && target.accessStatus === "active") {
    return { allowed: false, reason: "not-banned" };
  }

  return { allowed: true };
}

/**
 * The effective ban state at `asOf`: banned only while the flag is set and
 * the expiry is absent or still ahead. An expiry exactly at `asOf` has
 * passed. The SQL predicate in the query service mirrors this exactly, and
 * list reads never rewrite an expired ban - it is simply active again.
 */
export function effectiveAccessStatus(
  target: { banned: boolean | null | undefined; banExpires: Date | null | undefined },
  asOf: Date,
): AccessStatus {
  if (target.banned !== true) return "active";
  if (!target.banExpires) return "permanently-banned";
  return target.banExpires.getTime() > asOf.getTime() ? "temporarily-banned" : "active";
}

export function isEffectivelyBanned(status: AccessStatus): boolean {
  return status !== "active";
}
