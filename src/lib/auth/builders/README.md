# Auth action builders

## Vocabulary

One concept, three words in the wild - here is which means what:

| Term | Meaning | Where |
| --- | --- | --- |
| **Operation** | A `defineAction` definition: name, schema, policy, handler. Transport-agnostic and server-only. | `<module>/_/operations/` |
| **Action** | A transport adapter around an operation. A *Server Action* is `toServerAction(operation)`; a route handler or MCP tool are the other adapters. | `<module>/_/actions.ts`, `mcp.ts` |
| **Service** | A data function `service(ctx, input)` that owns one transaction. It takes the builder's context and never constructs one. | `<module>/_/db/` |

`defineAction` returns an operation; the adapters turn it into actions. Only the
adapters, the runtime pipeline and the `ActionError` type carry "action" in their
names, and always in this transport sense.

Import paths follow the same split: `defineAction` from `builders/actionBuilder`,
the config and operation types from `builders/actionTypes`, adapters and their
wire types from the `builders/adapters` barrel, contexts from `builders/context`.
Nothing is re-exported from a second place.

## Pipeline

`defineAction` is the entry point for server-side work. Its pipeline is:

1. Resolve and require a session (skipped for `auth: "public"`).
2. Parse the input with Zod, including async refinements and transforms.
3. Reject operations without MCP opt-in from MCP, and reject unknown entry points, then check
   impersonation, verified email, role admission (`roles`, answered NOT_FOUND) and
   permissions, in that order.
4. Satisfy the declared step-up policy.
5. Call the handler and record its outcome.

Input is validated before step-up so invalid requests neither prompt for a
second factor nor consume a verification proof.

```ts
import { z } from "zod";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";

export const previewUserUpdate = defineAction({
  name: "user.preview-update",
  schema: z.object({ name: z.string().trim().min(1) }),
  permissions: "user.update",
  mcpAllowed: false,
  stepUp: "none",
  handler: (ctx, input) => ({ userId: ctx.user.id, name: input.name }),
  auditLog: (ctx, event) => `${ctx.user.id}: ${event.outcome}`,
});
```

Omitting `auth` requires a session. Public handlers always receive `user: null`
and `session: null`, even when the caller is signed in. Omitting the schema means
no input: caller-supplied values are discarded and the handler receives
`undefined`. Callers use the schema's raw input type; handlers and audit hooks
receive its parsed output type.

`roles` admits actors the way a route's `access.roles` does: an account outside
the list is answered with NOT_FOUND before permissions are considered, so a
staff-only operation does not reveal itself to other accounts. `permissions`
then decide what an admitted role may do; the two are independent, and an
operation may declare either, both or neither.

Declare MCP eligibility and step-up independently:

| Declaration | Behavior |
| --- | --- |
| `mcpAllowed: false` (default) | Browser/server only, regardless of step-up |
| `mcpAllowed: true` | Eligible for explicit MCP registration; step-up must be `"none"` |
| `stepUp: "none"` (default) | No additional verification |
| `stepUp: "five_minutes"` | Require proof or a reusable grant in the same session |
| `stepUp: "every_time"` | Require a fresh proof for this invocation, ignoring cached grants |

The definition rejects contradictory or obsolete policy at runtime, and types
reject MCP opt-in with step-up. Public operations cannot require step-up.
Step-up requires verified email and forbids impersonation, including for admin.
There is one five-minute grant; reuse does not extend its timestamp or TTL.
Every-time verification neither creates nor extends it. Old pool grants are
not accepted, so existing sessions must verify again after this change.

Definitions expose a frozen `mcpAllowed` property. Before registering a selected
operation, call `assertMcpEligible(definition)` from `adapters`; only explicit
opt-in passes. There is no MCP adapter yet. A future adapter must authenticate
its caller independently and set `entryPoint: "mcp"` in server-owned metadata.
It must not invoke browser-facing exports or forward caller metadata. Runtime
MCP denial remains in the shared pipeline even if registration filtering is missed.

Keep related writes inside one service transaction. Services can import
`AuthedCtx` or `PublicCtx` as types from `builders/context`; feature code must not
construct contexts. A handler's context has passed every configured gate. A
**denial audit hook has not**: it must not use its context to perform the refused
operation. Its `stepUp` remains null until verification succeeds.

## Adapters

`toServerQuery(action)` is the trusted SSR read path: a server-only function a
page calls while rendering. It reads the current request's `headers()` itself,
runs the operation with `entryPoint: "server-render"` and returns its data,
propagating `ActionError` for the page to translate (redirect, `notFound()`,
error boundary). It takes no caller metadata and no step-up proof, so it fits
reads only; it is neither a `"use server"` export nor an HTTP endpoint.

Every context carries a private copy of the acting request's headers, exposed
only through `ctx.getRequestHeaders()` (a fresh copy per call, preserved by
`withStepUp`). Services use it solely to call provider APIs that authenticate
the actor, such as `auth.api.adminUpdateUser`; never serialize a context or its
headers, put them in a DTO, or write them to logs or audit data.

`toServerAction(action)` returns `{ ok: true, data }` or
`{ ok: false, reason, status, message, data? }`. Call it from an exported async
function in a `"use server"` file. Headers are read from the current request;
clients can supply only optional step-up metadata. The adapter copies only
`stepUp` and sets `entryPoint: "server-action"` itself. The route adapter sets
`entryPoint: "route-handler"` and the SSR adapter `entryPoint: "server-render"`;
none of them trusts a client-supplied entry point.
Direct server callers must also provide an explicit entry point. All
operations reject missing or unknown values at runtime.

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

Accepted TOTP proofs are atomically marked as used across sessions and verification modes
for 90 seconds (Better Auth's three-step acceptance window). Reusing a code
returns `STEP_UP_INVALID_CODE`; reusable grants remain usable without resending
the proof. A failed handler still spends its proof, so retries need a fresh code
for every-time actions.

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

The obsolete pool-based builder was removed; Git history retains the reference.

Run `bun run typecheck`, `bun run lint` and `bun test tests/auth`. The regression
suite exercises the real pipeline, permission logic and step-up helpers with
mocked auth, Redis and email boundaries; it does not require live services.
