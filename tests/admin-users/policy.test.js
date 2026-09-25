import { describe, expect, test } from "bun:test";

import {
  effectiveAccessStatus,
  evaluateUserAction,
  isStaffRole,
  USER_ACTION_PERMISSIONS,
} from "../../app/(AuthModule)/admin/_/policy";
import { USER_ACTIONS } from "../../app/(AuthModule)/admin/_/types";
import { can, roles, statement } from "../../src/lib/auth/permissions";

const ROOT = "root-id";
const admin = { id: "admin-id", role: "admin" };
const root = { id: ROOT, role: "admin" };
const moderator = { id: "mod-id", role: "moderator" };
const target = (overrides = {}) => ({
  id: "target-id",
  role: null,
  emailVerified: false,
  accessStatus: "active",
  ...overrides,
});
const decide = (actor, subject, action) => evaluateUserAction(actor, subject, ROOT, action);
const allowedActions = (actor, subject) =>
  USER_ACTIONS.filter((action) => decide(actor, subject, action).allowed);

describe("permission declarations", () => {
  test("the built-in user resource is extended, not replaced", () => {
    for (const built of ["list", "get", "update", "ban", "set-email", "delete"])
      expect(statement.user).toContain(built);
    for (const added of ["send-verification", "send-password-reset", "manage-staff"])
      expect(statement.user).toContain(added);
    expect(statement.session).toContain("revoke");
  });

  test("admin holds every declared permission, including the additions", () => {
    for (const permissions of Object.values(USER_ACTION_PERMISSIONS))
      expect(can("admin", permissions)).toBe(true);
    expect(can("admin", "user.manage-staff")).toBe(true);
  });

  test("moderator defaults: list, get, name, verification and ban; nothing else", () => {
    expect(can("moderator", ["user.list", "user.get", "user.update", "user.ban"])).toBe(true);
    expect(can("moderator", "user.send-verification")).toBe(true);
    expect(can("moderator", "user.set-email")).toBe(false);
    expect(can("moderator", "user.send-password-reset")).toBe(false);
    expect(can("moderator", "session.revoke")).toBe(false);
    expect(can("moderator", "user.manage-staff")).toBe(false);
  });

  test("ordinary users, unknown roles and unknown permissions deny; composite roles are honoured", () => {
    expect(can("user", "user.get")).toBe(false);
    expect(can("wizard", "user.get")).toBe(false);
    expect(can(null, "user.list")).toBe(false);
    expect(can("admin", "user.teleport")).toBe(false);
    expect(can("user,moderator", "user.get")).toBe(true);
    expect(isStaffRole("wizard,moderator")).toBe(true);
    expect(isStaffRole("wizard")).toBe(false);
    expect(Object.keys(roles)).toEqual(["user", "moderator", "admin"]);
  });
});

describe("target policy", () => {
  test("every action requires the actor's permissions and staff membership", () => {
    const stranger = { id: "x", role: "user" };
    for (const action of USER_ACTIONS)
      expect(decide(stranger, target(), action)).toEqual({ allowed: false, reason: "permission" });
    const grantedButNotStaff = { id: "x", role: "user" };
    expect(decide(grantedButNotStaff, target(), "updateName").reason).toBe("permission");
  });

  test("admin may do everything to an ordinary, unverified, active account except lift a ban", () => {
    expect(allowedActions(admin, target())).toEqual([
      "updateName",
      "updateEmail",
      "sendVerification",
      "sendPasswordReset",
      "revokeSessions",
      "ban",
    ]);
    expect(decide(admin, target(), "unban")).toEqual({ allowed: false, reason: "not-banned" });
  });

  test("moderator defaults on ordinary users: name, verification, ban and unban", () => {
    expect(allowedActions(moderator, target({ accessStatus: "temporarily-banned" }))).toEqual([
      "updateName",
      "sendVerification",
      "ban",
      "unban",
    ]);
    expect(decide(moderator, target(), "updateEmail").reason).toBe("permission");
    expect(decide(moderator, target(), "sendPasswordReset").reason).toBe("permission");
    expect(decide(moderator, target(), "revokeSessions").reason).toBe("permission");
  });

  test("verification resend and unban are absent when they would do nothing", () => {
    expect(decide(admin, target({ emailVerified: true }), "sendVerification")).toEqual({
      allowed: false,
      reason: "already-verified",
    });
    expect(decide(admin, target({ accessStatus: "permanently-banned" }), "unban")).toEqual({
      allowed: true,
    });
    expect(decide(admin, target({ accessStatus: "permanently-banned" }), "ban")).toEqual({
      allowed: true,
    });
  });

  test("nobody but root may act on root; reads are not decided here", () => {
    const rootTarget = target({ id: ROOT, role: "admin", emailVerified: true });
    for (const action of USER_ACTIONS)
      expect(decide(admin, rootTarget, action)).toEqual({ allowed: false, reason: "root-protected" });
    for (const action of ["updateName", "sendVerification", "ban", "unban"])
      expect(decide(moderator, rootTarget, action).reason).toBe("root-protected");
  });

  test("root's own account: name, verification when unverified, reset email, revoke; never email or bans", () => {
    const self = target({ id: ROOT, role: "admin", emailVerified: false });
    expect(allowedActions(root, self)).toEqual([
      "updateName",
      "sendVerification",
      "sendPasswordReset",
      "revokeSessions",
    ]);
    expect(decide(root, self, "updateEmail")).toEqual({ allowed: false, reason: "root-self-limit" });
    expect(decide(root, self, "ban")).toEqual({ allowed: false, reason: "root-self-limit" });
    expect(decide(root, self, "unban")).toEqual({ allowed: false, reason: "root-self-limit" });
    expect(decide(root, target({ id: ROOT, role: "admin", emailVerified: true }), "sendVerification")).toEqual({
      allowed: false,
      reason: "already-verified",
    });
    // A malformed state where root lost the admin role still gets no ban control.
    expect(decide(root, target({ id: ROOT, role: "user", accessStatus: "permanently-banned" }), "unban").reason).toBe(
      "root-self-limit",
    );
  });

  test("root does not bypass permissions or self rules for others", () => {
    expect(decide(root, target(), "updateEmail")).toEqual({ allowed: true });
    expect(decide({ id: ROOT, role: "moderator" }, target(), "updateEmail").reason).toBe("permission");
  });

  test("every non-root actor is denied administrative actions on themselves", () => {
    for (const action of USER_ACTIONS)
      expect(decide(admin, target({ id: admin.id, role: "admin" }), action)).toEqual({
        allowed: false,
        reason: "self",
      });
    expect(decide(moderator, target({ id: moderator.id, role: "moderator" }), "updateName").reason).toBe("self");
  });

  test("staff targets need manage-staff on top of the action's permission, for every action", () => {
    const staff = target({ id: "other-mod", role: "moderator" });
    for (const action of ["updateName", "sendVerification", "ban"])
      expect(decide(moderator, staff, action)).toEqual({ allowed: false, reason: "staff-target" });
    expect(decide(admin, staff, "ban")).toEqual({ allowed: true });
    expect(decide(admin, target({ id: "a2", role: "admin" }), "revokeSessions")).toEqual({ allowed: true });
    // Composite roles count as staff when any token is a staff role.
    expect(decide(moderator, target({ id: "c", role: "user,admin" }), "updateName").reason).toBe("staff-target");
    // Unknown roles confer nothing and are not staff.
    expect(decide(moderator, target({ id: "u", role: "wizard" }), "updateName")).toEqual({ allowed: true });
  });

  test("rules are applied in order: permission before root, root before self, self before staff", () => {
    expect(decide({ id: ROOT, role: "user" }, target({ id: ROOT, role: "admin" }), "updateName").reason).toBe(
      "permission",
    );
    expect(decide(moderator, target({ id: ROOT, role: "admin" }), "updateName").reason).toBe("root-protected");
    expect(decide(moderator, target({ id: moderator.id, role: "moderator" }), "updateName").reason).toBe("self");
  });
});

describe("effective ban status", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");

  test("null and false flags are active regardless of stale expiry data", () => {
    expect(effectiveAccessStatus({ banned: null, banExpires: null }, now)).toBe("active");
    expect(effectiveAccessStatus({ banned: false, banExpires: new Date("2030-01-01") }, now)).toBe("active");
    expect(effectiveAccessStatus({ banned: undefined, banExpires: undefined }, now)).toBe("active");
  });

  test("a set flag without expiry is permanent; a future expiry is temporary", () => {
    expect(effectiveAccessStatus({ banned: true, banExpires: null }, now)).toBe("permanently-banned");
    expect(
      effectiveAccessStatus({ banned: true, banExpires: new Date("2026-09-25T12:00:00.001Z") }, now),
    ).toBe("temporarily-banned");
  });

  test("an expiry at or before the read instant means active, without rewriting anything", () => {
    const stored = { banned: true, banExpires: new Date("2026-09-25T12:00:00.000Z") };
    expect(effectiveAccessStatus(stored, now)).toBe("active");
    expect(effectiveAccessStatus({ banned: true, banExpires: new Date("2026-09-25T11:59:59.999Z") }, now)).toBe(
      "active",
    );
    expect(stored.banned).toBe(true);
  });
});
