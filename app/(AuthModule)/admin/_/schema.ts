import { z } from "zod";
import { ROLE_NAMES } from "@/src/lib/auth/permissions";

/**
 * Input contracts of user administration. Mutation schemas are strict: an
 * unexpected key is rejected rather than forwarded to the provider, which is
 * what keeps a name update from smuggling a role, a ban flag or a verified
 * flag. Form schemas carry only what the user types; the controller adds the
 * target ID when it calls the action.
 */

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
/** The same set, minus tab, line feed and carriage return. */
const CONTROL_CHARACTERS_EXCEPT_BREAKS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Provider IDs are opaque text: no UUID assumption, but nothing path-like either. */
export const userIdSchema = z
  .string()
  .trim()
  .min(1, "A user ID is required.")
  .max(128)
  .refine((value) => !CONTROL_CHARACTERS.test(value), "Invalid user ID.")
  .refine((value) => !/[/\\]/.test(value), "Invalid user ID.");

export const userNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(100, "Use at most 100 characters.")
  .refine((value) => !CONTROL_CHARACTERS.test(value), "Names cannot contain control characters.");

/** Trimmed and lowercased before the format check, so padded input is accepted normalized. */
export const userEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Use at most 254 characters.")
  .pipe(z.email("Enter a valid email address."));

export const BAN_DURATIONS = ["24h", "7d", "30d", "permanent"] as const;

export const banDurationSchema = z.enum(BAN_DURATIONS, {
  error: "Choose how long the ban lasts.",
});

export const banReasonSchema = z
  .string()
  .trim()
  .min(3, "Give a reason of at least 3 characters.")
  .max(1000, "Use at most 1,000 characters.")
  .refine(
    (value) => !CONTROL_CHARACTERS_EXCEPT_BREAKS.test(value),
    "The reason cannot contain control characters.",
  );

// ---------------------------------------------------------------------------
// List query
// ---------------------------------------------------------------------------

/** `all` plus every declared role: a role added to the auth config is filterable at once. */
export const USER_ROLE_FILTERS = ["all", ...ROLE_NAMES] as const;
export const USER_VERIFIED_FILTERS = ["all", "yes", "no"] as const;
export const USER_STATUS_FILTERS = ["all", "active", "banned"] as const;
export const USER_SORTS = ["createdAt", "name", "email"] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export const USER_PAGE_SIZES = [10, 25, 50, 100] as const;
export const USERS_SEARCH_MAX_LENGTH = 200;
export const USERS_MAX_PAGE = 1_000_000;

/**
 * The read operation's input. Strict: URL normalization happens before this
 * in `queryState.ts`; a direct caller passing an invalid value is refused.
 */
export const usersQuerySchema = z.strictObject({
  q: z.string().trim().max(USERS_SEARCH_MAX_LENGTH),
  role: z.enum(USER_ROLE_FILTERS),
  verified: z.enum(USER_VERIFIED_FILTERS),
  status: z.enum(USER_STATUS_FILTERS),
  sort: z.enum(USER_SORTS),
  direction: z.enum(SORT_DIRECTIONS),
  page: z.int().min(1).max(USERS_MAX_PAGE),
  pageSize: z.literal(USER_PAGE_SIZES),
});

// ---------------------------------------------------------------------------
// Operation inputs (strict)
// ---------------------------------------------------------------------------

export const userTargetSchema = z.strictObject({ userId: userIdSchema });

export const updateUserNameSchema = z.strictObject({
  userId: userIdSchema,
  name: userNameSchema,
});

export const updateUserEmailSchema = z.strictObject({
  userId: userIdSchema,
  email: userEmailSchema,
});

export const banUserSchema = z.strictObject({
  userId: userIdSchema,
  duration: banDurationSchema,
  reason: banReasonSchema,
});

// ---------------------------------------------------------------------------
// Form inputs (what the user types; the controller supplies the target)
// ---------------------------------------------------------------------------

export const userNameFormSchema = z.object({ name: userNameSchema });

export const userEmailFormSchema = z.object({ email: userEmailSchema });

/** No preselected duration: the field starts empty and the schema rejects it. */
export const userBanFormSchema = z.object({
  duration: banDurationSchema,
  reason: banReasonSchema.prefault(""),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UsersQuerySchema = z.infer<typeof usersQuerySchema>;
export type UserTargetSchema = z.infer<typeof userTargetSchema>;
export type UpdateUserNameSchema = z.infer<typeof updateUserNameSchema>;
export type UpdateUserEmailSchema = z.infer<typeof updateUserEmailSchema>;
export type BanUserSchema = z.infer<typeof banUserSchema>;
export type UserNameFormSchema = z.infer<typeof userNameFormSchema>;
export type UserEmailFormSchema = z.infer<typeof userEmailFormSchema>;
export type UserBanFormSchema = z.infer<typeof userBanFormSchema>;
export type BanDuration = z.infer<typeof banDurationSchema>;
export type UserRoleFilter = z.infer<typeof usersQuerySchema>["role"];
export type UserVerifiedFilter = (typeof USER_VERIFIED_FILTERS)[number];
export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number];
export type UserSort = (typeof USER_SORTS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
export type UserPageSize = (typeof USER_PAGE_SIZES)[number];
