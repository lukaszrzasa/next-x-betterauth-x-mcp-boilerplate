import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { confirmEmailProof } from "@/app/(AuthModule)/_/db/settings/emailChange/confirmEmailProof";
import { inspectEmailProof } from "@/app/(AuthModule)/_/db/settings/emailChange/inspectEmailProof";
import { emailProofSchema } from "@/app/(AuthModule)/_/schemas/settings";

/**
 * The emailed links. Public on purpose: the opaque token is the whole
 * authority, and whoever happens to be signed in on the browser is
 * irrelevant (`ctx.user` is null). Inspection reads; confirmation is the
 * explicit submit that records a proof or commits the change.
 */

export const inspectEmailProofOperation = defineAction({
  name: "settings.emailProof.inspect",
  auth: "public",
  schema: emailProofSchema,
  mcpAllowed: false,
  handler: (ctx, input) => inspectEmailProof(ctx, input),
});

export const confirmEmailProofOperation = defineAction({
  name: "settings.emailProof.confirm",
  auth: "public",
  schema: emailProofSchema,
  mcpAllowed: false,
  handler: (ctx, input) => confirmEmailProof(ctx, input),
  // TODO(audit): subject is established by the verified proof, never an actor;
  // record proof-recorded and account-committed as distinct events. Never the token.
  auditLog: (ctx, event) =>
    `${ctx.requestId}: ${event.outcome}${event.outcome === "success" ? ` (${event.output.status})` : ""}`,
});
