import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { listOwnSessions } from "@/app/(AuthModule)/_/db/settings/sessions/listOwnSessions";
import { revokeAllOwnSessions } from "@/app/(AuthModule)/_/db/settings/sessions/revokeAllOwnSessions";
import { revokeOtherOwnSessions } from "@/app/(AuthModule)/_/db/settings/sessions/revokeOtherOwnSessions";
import { revokeOwnSession } from "@/app/(AuthModule)/_/db/settings/sessions/revokeOwnSession";
import { listSessionsSchema, sessionTargetSchema } from "@/app/(AuthModule)/_/schemas/settings";

/**
 * The actor's own sessions. Valid for unverified accounts too; confirmation
 * in the UI, no step-up. `revokeOne` validates that the ID belongs to the
 * actor before anything is looked up by token.
 */

const describe = (ctx: { user: { id: string } }, event: { outcome: string }) => `${ctx.user.id}: ${event.outcome}`;

export const listSessionsOperation = defineAction({
  name: "settings.sessions.list",
  schema: listSessionsSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => listOwnSessions(ctx, input),
});

export const revokeSessionOperation = defineAction({
  name: "settings.sessions.revokeOne",
  schema: sessionTargetSchema,
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => revokeOwnSession(ctx, input),
  auditLog: describe,
});

export const revokeOtherSessionsOperation = defineAction({
  name: "settings.sessions.revokeOthers",
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx) => revokeOtherOwnSessions(ctx),
  auditLog: describe,
});

export const revokeAllSessionsOperation = defineAction({
  name: "settings.sessions.revokeAll",
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx) => revokeAllOwnSessions(ctx),
  auditLog: describe,
});
