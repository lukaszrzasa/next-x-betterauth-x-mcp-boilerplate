import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { listSessionsSchema } from "@/app/(AuthModule)/_/schemas/settings";
import {
  byCurrentThenNewest,
  listOwnedSessions,
  toSessionItem,
} from "@/app/(AuthModule)/_/services/sessions/ownedSessions";
import { SESSION_PAGE_SIZE, type SessionPage } from "@/app/(AuthModule)/_/types/settings";

/**
 * One page of the actor's own sessions, the current one first, clamped to
 * the last existing page after sorting. Valid for unverified accounts too.
 */
export const listSessionsOperation = defineAction({
  name: "settings.sessions.list",
  schema: listSessionsSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<SessionPage> => {
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
  },
});
