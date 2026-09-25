import "server-only";

import { and, asc, count, desc, eq, or, sql, type InferSelectModel, type SQL } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { roleNames } from "@/src/lib/auth/permissions";
import { db, installation, user } from "@/src/lib/db";
import { lastPage } from "@/src/lib/data-table/queryState";
import { effectiveAccessStatus, evaluateUserAction } from "@/app/(AuthModule)/admin/_/policy";
import {
  USER_ACTIONS,
  type UserAction,
  type UserActionCapability,
  type UserDetail,
  type UserListItem,
  type UsersPage,
  type UsersQuery,
} from "@/app/(AuthModule)/admin/_/types";

/**
 * Read side of user administration. Every read is an explicit projection:
 * the columns listed below are the only ones that leave the database, so the
 * password-reset cutoff, tokens and secrets never reach a DTO.
 *
 * One `asOf` instant per read drives both the SQL ban predicate and the
 * projected status, so a list never disagrees with itself. Expired bans are
 * not rewritten here; they are simply active again on a fresh request.
 */

/** Local to the read transaction: a slow query fails safely instead of hanging. */
const STATEMENT_TIMEOUT_MS = 5_000;

const listColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  image: user.image,
  role: user.role,
  emailVerified: user.emailVerified,
  banned: user.banned,
  banExpires: user.banExpires,
  createdAt: user.createdAt,
};

const detailColumns = {
  ...listColumns,
  updatedAt: user.updatedAt,
  banReason: user.banReason,
  twoFactorRequired: user.twoFactorRequired,
  twoFactorEnabled: user.twoFactorEnabled,
};

type ListRow = Pick<InferSelectModel<typeof user>, keyof typeof listColumns>;
type DetailRow = Pick<InferSelectModel<typeof user>, keyof typeof detailColumns>;

/**
 * `timestamp` columns hold UTC wall-clock values (Drizzle writes
 * `toISOString()`); a bound instant must be compared the same way, so it is
 * passed as an ISO string rather than a driver-serialized local Date.
 */
const utcTimestamp = (instant: Date) => sql`${instant.toISOString()}::timestamp`;

/** `banned IS TRUE AND (ban_expires IS NULL OR ban_expires > asOf)`, null-safe. */
export function effectivelyBanned(asOf: Date): SQL {
  return sql`(${user.banned} IS TRUE AND (${user.banExpires} IS NULL OR ${user.banExpires} > ${utcTimestamp(asOf)}))`;
}

/** LIKE treats `%`, `_` and the escape character specially; the search text must not. */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function searchPredicate(q: string): SQL | undefined {
  if (q.length === 0) return undefined;
  const pattern = `%${escapeLikePattern(q)}%`;
  return or(
    sql`lower(${user.name}) LIKE lower(${pattern}) ESCAPE '\\'`,
    sql`lower(${user.email}) LIKE lower(${pattern}) ESCAPE '\\'`,
    eq(user.id, q),
  );
}

/**
 * A role filter matches one complete token of the stored comma-separated
 * list, trimmed, with a null role meaning `user` - the SQL twin of
 * `roleNames()`.
 */
function rolePredicate(role: UsersQuery["role"]): SQL | undefined {
  if (role === "all") return undefined;
  return hasRoleToken(role);
}

/** True when `role` is one of the stored, trimmed role tokens (null meaning `user`). */
export function hasRoleToken(role: string): SQL {
  return sql`${role} = ANY (SELECT btrim(token) FROM unnest(string_to_array(coalesce(${user.role}, 'user'), ',')) AS token)`;
}

function verifiedPredicate(verified: UsersQuery["verified"]): SQL | undefined {
  if (verified === "all") return undefined;
  return eq(user.emailVerified, verified === "yes");
}

function statusPredicate(status: UsersQuery["status"], asOf: Date): SQL | undefined {
  if (status === "all") return undefined;
  return status === "banned" ? effectivelyBanned(asOf) : sql`NOT ${effectivelyBanned(asOf)}`;
}

/** Closed mapping from the sort vocabulary to expressions. */
const SORT_EXPRESSIONS: Record<UsersQuery["sort"], () => SQL | typeof user.createdAt> = {
  createdAt: () => user.createdAt,
  name: () => sql`lower(${user.name})`,
  email: () => sql`lower(${user.email})`,
};

/** The chosen expression, then the ID in the same direction as a stable tie-breaker. */
function orderBy(query: UsersQuery): SQL[] {
  const direction = query.direction === "asc" ? asc : desc;
  return [direction(SORT_EXPRESSIONS[query.sort]()), direction(user.id)];
}

function toListItem(row: ListRow, asOf: Date): UserListItem {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image ?? null,
    roles: roleNames(row.role),
    emailVerified: row.emailVerified === true,
    accessStatus: effectiveAccessStatus(row, asOf),
    banExpires: row.banExpires ? row.banExpires.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listUsers(_ctx: AuthedCtx, query: UsersQuery): Promise<UsersPage> {
  const asOf = new Date();
  const where = and(
    searchPredicate(query.q),
    rolePredicate(query.role),
    verifiedPredicate(query.verified),
    statusPredicate(query.status, asOf),
  );

  // Count and page share one snapshot, so the range label matches the rows.
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = ${sql.raw(String(STATEMENT_TIMEOUT_MS))}`);

      const [{ total }] = await tx.select({ total: count() }).from(user).where(where);

      // Clamp before computing the offset: page 1 for an empty result.
      const page = Math.min(query.page, lastPage(total, query.pageSize));
      const rows = await tx
        .select(listColumns)
        .from(user)
        .where(where)
        .orderBy(...orderBy(query))
        .limit(query.pageSize)
        .offset((page - 1) * query.pageSize);

      return {
        items: rows.map((row) => toListItem(row, asOf)),
        total,
        page,
        pageSize: query.pageSize,
        query: { ...query, page },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** The installation's root user ID; its absence is a configuration failure, never a guess. */
export async function requireRootUserId(reads: Pick<typeof db, "select"> = db): Promise<string> {
  const [row] = await reads
    .select({ rootUserId: installation.rootUserId })
    .from(installation)
    .limit(1);
  if (!row) {
    throw new Error("Installation record is missing; user administration is unavailable.");
  }
  return row.rootUserId;
}

export async function getUserDetail(ctx: AuthedCtx, userId: string): Promise<UserDetail | null> {
  const asOf = new Date();
  const [row] = await db.select(detailColumns).from(user).where(eq(user.id, userId)).limit(1);
  if (!row) return null;

  const rootUserId = await requireRootUserId();
  return toDetail(row, asOf, ctx, rootUserId);
}

function toDetail(row: DetailRow, asOf: Date, ctx: AuthedCtx, rootUserId: string): UserDetail {
  const item = toListItem(row, asOf);
  const target = {
    id: row.id,
    role: row.role,
    emailVerified: item.emailVerified,
    accessStatus: item.accessStatus,
  };
  const actor = { id: ctx.user.id, role: ctx.user.role };
  const capabilities = Object.fromEntries(
    USER_ACTIONS.map((action) => [action, evaluateUserAction(actor, target, rootUserId, action)]),
  ) as Record<UserAction, UserActionCapability>;

  const banned = item.accessStatus !== "active";
  return {
    ...item,
    updatedAt: row.updatedAt.toISOString(),
    banReason: banned && row.banReason ? row.banReason : null,
    twoFactorRequired: row.twoFactorRequired === true,
    twoFactorEnabled: row.twoFactorEnabled === true,
    isRoot: row.id === rootUserId,
    isSelf: row.id === ctx.user.id,
    capabilities,
  };
}
