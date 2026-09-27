import "server-only";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import type { ListSessionsSchema } from "@/app/(AuthModule)/_/schemas/settings";
import { SESSION_PAGE_SIZE, type SessionPage } from "@/app/(AuthModule)/_/types/settings";
import { byCurrentThenNewest, listOwnedSessions, toSessionItem } from "./ownedSessions";

/** One page of the actor's sessions, clamped to the last existing page after sorting. */
export async function listOwnSessions(ctx: AuthedCtx, input: ListSessionsSchema): Promise<SessionPage> {
  const sessions = (await listOwnedSessions(ctx)).sort(byCurrentThenNewest(ctx.session.id));
  const total = sessions.length;
  const lastPage = Math.max(1, Math.ceil(total / SESSION_PAGE_SIZE));
  const page = Math.min(input.page, lastPage);
  const start = (page - 1) * SESSION_PAGE_SIZE;
  return {
    items: sessions.slice(start, start + SESSION_PAGE_SIZE).map((session) => toSessionItem(session, ctx.session.id)),
    page,
    pageSize: SESSION_PAGE_SIZE,
    total,
  };
}
