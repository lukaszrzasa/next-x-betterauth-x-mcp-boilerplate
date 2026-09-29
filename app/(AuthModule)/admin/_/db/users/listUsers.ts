import "server-only";

import { and, asc, count, desc, eq, or, sql, type InferSelectModel, type SQL } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { lastPage } from "@/src/lib/data-table/queryState";
import { user } from "@/src/lib/db";
import { escapeLikePattern } from "@/src/lib/db/like";
import { withReadSnapshot } from "@/src/lib/db/readSnapshot";
import type { UsersQuery } from "@/app/(AuthModule)/admin/_/types";
import { effectivelyBanned, hasRoleToken } from "./predicates";

/**
 * The list read. An explicit projection: the columns listed below are the
 * only ones that leave the database, so the password-reset cutoff, tokens
 * and secrets never reach a DTO. Expired bans are not rewritten here; they
 * are simply active again on a fresh request.
 */

export const listColumns = {
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

export type UserListRow = Pick<InferSelectModel<typeof user>, keyof typeof listColumns>;

function searchPredicate(q: string): SQL | undefined {
  if (q.length === 0) return undefined;
  const pattern = `%${escapeLikePattern(q)}%`;
  return or(
    sql`lower(${user.name}) LIKE lower(${pattern}) ESCAPE '\\'`,
    sql`lower(${user.email}) LIKE lower(${pattern}) ESCAPE '\\'`,
    eq(user.id, q),
  );
}

/** A role filter matches one complete token of the stored comma-separated list. */
function rolePredicate(role: UsersQuery["role"]): SQL | undefined {
  if (role === "all") return undefined;
  return hasRoleToken(role);
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

export type UserRowsPage = {
  rows: UserListRow[];
  total: number;
  /** 1-based and clamped to the actual final page. */
  page: number;
};

/**
 * One page of rows with the total it belongs to. `asOf` is the instant the
 * ban filter is evaluated at; the caller projects the rows with the same
 * one, so a list never disagrees with itself.
 */
export async function listUserRows(_ctx: AuthedCtx, query: UsersQuery, asOf: Date): Promise<UserRowsPage> {
  const where = and(
    searchPredicate(query.q),
    rolePredicate(query.role),
    verifiedPredicate(query.verified),
    statusPredicate(query.status, asOf),
  );

  // Count and page share one snapshot, so the range label matches the rows.
  return withReadSnapshot(async (tx) => {
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

    return { rows, total, page };
  });
}
