import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { user } from "@/src/lib/db";

/**
 * `timestamp` columns hold UTC wall-clock values (Drizzle writes
 * `toISOString()`); a bound instant must be compared the same way, so it is
 * passed as an ISO string rather than a driver-serialized local Date.
 */
const utcTimestamp = (instant: Date) => sql`${instant.toISOString()}::timestamp`;

/**
 * `banned IS TRUE AND (ban_expires IS NULL OR ban_expires > asOf)`,
 * null-safe: the SQL twin of `effectiveAccessStatus` in the policy.
 */
export function effectivelyBanned(asOf: Date): SQL {
  return sql`(${user.banned} IS TRUE AND (${user.banExpires} IS NULL OR ${user.banExpires} > ${utcTimestamp(asOf)}))`;
}

/**
 * True when `role` is one of the stored, trimmed role tokens, with a null
 * role meaning `user`: the SQL twin of `roleNames()`.
 */
export function hasRoleToken(role: string): SQL {
  return sql`${role} = ANY (SELECT btrim(token) FROM unnest(string_to_array(coalesce(${user.role}, 'user'), ',')) AS token)`;
}
