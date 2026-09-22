# Auth action builders

`defineAction` is the entry point for server-side work. Its pipeline is:

1. Resolve and require a session (skipped for `auth: "public"`).
2. Parse the input with Zod, including async refinements and transforms.
3. Check impersonation, verified email and permissions, in that order.
4. Satisfy the requested two-factor pool.
5. Call the handler and record its outcome.

Input is validated before step-up so invalid requests neither prompt for a
second factor nor consume a one-time grant.

```ts
import { z } from "zod";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";

export const previewUserUpdate = defineAction({
  name: "user.preview-update",
  schema: z.object({ name: z.string().trim().min(1) }),
  permissions: "user.update",
  twoFactorPool: "sensitive",
  handler: (ctx, input) => ({ userId: ctx.user.id, name: input.name }),
  auditLog: (ctx, event) => `${ctx.user.id}: ${event.outcome}`,
});
```

Omitting `auth` requires a session. Public handlers always receive `user: null`
and `session: null`, even when the caller is signed in. Omitting the schema means
no input: caller-supplied values are discarded and the handler receives
`undefined`. Callers use the schema's raw input type; handlers and audit hooks
receive its parsed output type.

Keep related writes inside one db-service transaction. Services can import
`AuthedCtx` or `PublicCtx` as types from `builders/context`; feature code must not
construct contexts. A handler's context has passed every configured gate. A
**denial audit hook has not**: it must not use its context to perform the refused
operation. Its `twoFactorPool` remains null until verification succeeds.

## Adapters

`toServerAction(action)` returns `{ ok: true, data }` or
`{ ok: false, reason, status, message, data? }`. Call it from an exported async
function in a `"use server"` file. Headers are read from the current request;
clients can supply only optional step-up metadata.

```ts
"use server";

import { toServerAction } from "@/src/lib/auth/builders/adapters";
import { previewUserUpdate } from "./actions";

const run = toServerAction(previewUserUpdate);

export async function preview(input: Parameters<typeof run>[0]) {
  return run(input);
}
```

`toRouteHandler(action)` returns `{ data }` or `{ error: { reason, message, data? } }`
with the matching HTTP status. Non-GET/HEAD requests accept JSON. Object bodies
reserve the top-level `stepUp` field for `{ method: "totp" | "email", code }`;
it is stripped before schema validation. Other JSON values pass through as-is.
GET/HEAD and empty bodies supply `undefined`; query parameters are not mapped.
For a read action with an all-optional object schema, use `.default({})` if
an absent input should resolve to an empty object. Query-driven read endpoints
must explicitly map parameters and validate them through the action's schema;
do not put step-up codes in URLs, where logs and browser history retain them.
Malformed JSON is rejected with `INVALID_INPUT` before the action is called.

Mutation requests must send an `Origin` matching the request URL exactly;
missing, opaque and cross-origin values receive `FORBIDDEN` before the action
runs. Non-browser clients must supply this header too. Reverse proxies must
preserve the public request URL. GET/HEAD handlers must remain read-only.

Accepted TOTP proofs are atomically marked as used across sessions and pools
for 90 seconds (Better Auth's three-step acceptance window). Reusing a code
returns `STEP_UP_INVALID_CODE`; reusable grants remain usable without resending
the proof. A failed handler still spends its proof, so retries need a fresh code
for one-time actions.

The builder sanitizes unexpected errors as `INTERNAL`, while allowing Next.js
redirect/not-found control flow to propagate. Audit hooks may be async; their
failure is logged without changing the action result. No audit hook runs before
a context exists, and anonymous session refusals are deliberately unrecorded.

## Files and checks

- `actionBuilder.ts`: pipeline and outcome handling.
- `actionInput.ts`, `actionAuthorization.ts`, `actionStepUp.ts`: individual gates.
- `actionAudit.ts`, `actionTypes.ts`: audit hook and public contracts.
- `context/`: branded context, inferred auth types and structured logger.
- `adapters/`: transport-specific request/response conversion.

`builders_old` is retained as the refactor reference; new code uses `builders`.

Run `bun run typecheck`, `bun run lint` and `bun test tests/auth`. The regression
suite exercises the real pipeline, permission logic and step-up helpers with
mocked auth, Redis and email boundaries; it does not require live services.
