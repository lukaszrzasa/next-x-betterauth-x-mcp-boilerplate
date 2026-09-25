import type { BanDuration, UsersQuerySchema, UserPageSize } from "./schema";

/**
 * What crosses the server/client boundary for user administration. Every
 * shape is an explicit projection: an auth row is never returned or spread,
 * so password hashes, tokens, factor secrets and the internal reset cutoff
 * cannot leak by accident. Dates travel as ISO 8601 UTC strings.
 */

export type UsersQuery = UsersQuerySchema;

/** Effective access at the time of the read, expiration already applied. */
export type AccessStatus = "active" | "temporarily-banned" | "permanently-banned";

export type UserListItem = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  /** Parsed role tokens; `[]` never happens because a null role means `user`. */
  roles: string[];
  emailVerified: boolean;
  accessStatus: AccessStatus;
  banExpires: string | null;
  createdAt: string;
};

export type UsersPage = {
  items: UserListItem[];
  total: number;
  /** 1-based and clamped to the actual final page. */
  page: number;
  pageSize: UserPageSize;
  /** The canonical state the page was read with (page already clamped). */
  query: UsersQuery;
};

export const USER_ACTIONS = [
  "updateName",
  "updateEmail",
  "sendVerification",
  "sendPasswordReset",
  "revokeSessions",
  "ban",
  "unban",
] as const;

export type UserAction = (typeof USER_ACTIONS)[number];

/**
 * Why an otherwise-declared action is unavailable for this actor and target.
 * `permission` hides the control; the root/self/staff reasons show a short
 * explanation instead; the two state reasons mean the control is absent.
 */
export type UserActionDenial =
  | "permission"
  | "root-protected"
  | "root-self-limit"
  | "self"
  | "staff-target"
  | "already-verified"
  | "not-banned";

export type UserActionCapability = { allowed: boolean; reason?: UserActionDenial };

export type UserDetail = UserListItem & {
  updatedAt: string;
  banReason: string | null;
  twoFactorRequired: boolean;
  twoFactorEnabled: boolean;
  isRoot: boolean;
  isSelf: boolean;
  /** Presentation only. Every write re-evaluates permissions and target rules. */
  capabilities: Record<UserAction, UserActionCapability>;
};

/** Elapsed seconds from execution time; `permanent` has no expiry. */
export const BAN_DURATION_SECONDS: Record<BanDuration, number | null> = {
  "24h": 86_400,
  "7d": 604_800,
  "30d": 2_592_000,
  permanent: null,
};

export const BAN_DURATION_LABELS: Record<BanDuration, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  permanent: "Permanent",
};

/** What a ban of each duration means for the account, shown before it is applied. */
export const BAN_DURATION_CONSEQUENCES: Record<BanDuration, string> = {
  "24h": "The account cannot sign in for 24 hours from now.",
  "7d": "The account cannot sign in for 7 days from now.",
  "30d": "The account cannot sign in for 30 days from now.",
  permanent:
    "The account keeps its data but cannot sign in until an administrator removes the ban.",
};

export type UserEffect = "session-refresh" | "session-revocation" | "verification-email";

export type FailedEffect = {
  effect: UserEffect;
  code: "UNAVAILABLE" | "RATE_LIMITED";
  retryAfterSeconds?: number;
};

/**
 * The payload of every user mutation. `partial` is truthful about what did
 * and did not happen: a committed row write whose follow-up effects failed,
 * or a standalone revocation that may have removed some sessions
 * (`committed: false`). Nothing here implies a rollback.
 */
export type UserMutationOutcome =
  | { status: "unchanged"; userId: string }
  | { status: "completed"; userId: string; selfSignedOut?: boolean }
  | {
      status: "partial";
      userId: string;
      committed: boolean;
      effectsMayHaveApplied: true;
      failedEffects: FailedEffect[];
    };

/** `ActionError.data` for `INVALID_INPUT`/`CONFLICT` refusals a form can attribute to a field. */
export type UserFieldError = {
  field: "email" | "name" | "reason" | "duration";
  code: string;
};

/** `ActionError.data` for `RATE_LIMITED` refusals of the email actions. */
export type RateLimitedData = { retryAfterSeconds: number };

/** Query parameter carrying the validated list URL back from a detail page. */
export const RETURN_TO_PARAM = "returnTo";
