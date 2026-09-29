# Auth Action Builders: Architecture Deep Dive

## 1. Core Vocabulary

One concept, three words in the wild. Here is the strict breakdown:

* **Operation:** A server-only definition containing the schema, policy, and handler. It is created via `defineAction`.
* **Action:** A transport adapter wrapped around an operation. Adapters expose the operation to specific contexts (e.g., Server Actions, Route Handlers, MCP tools).
* **Persistence:** A function in a scope's `db/` that reads or writes. It takes the builder's context as its first argument, never constructs one, and returns facts (a row, null, changed or not). The workflow around it (order, refusals, effects, outcome) is the operation's handler.

## 2. The Zero-Trust Execution Pipeline

`defineAction` serves as the entry point for all server-side work. Before a handler is ever invoked, it must pass a strict 5-step pipeline:

1. **Session Resolution:** Resolves and requires a session, skipping only if explicitly marked as `auth: "public"`.
2. **Input Validation:** Parses input via Zod (including async refinements). Crucially, input is validated *before* step-up verification. This ensures that invalid requests neither prompt for a second factor nor consume a verification proof.
3. **Authorization Check:** Rejects unknown entry points and enforces MCP opt-in policies. It then sequentially checks impersonation rules, verified email status, role admission, and granular permissions. Accounts outside admitted roles are rejected with `NOT_FOUND` to prevent revealing internal endpoints.
4. **Step-Up Verification (MFA):** Satisfies the declared step-up policy (e.g., requiring 2FA).
5. **Execution:** Runs step-up and the handler inside the operation's context (`currentOperationContext()` for provider callbacks such as Better Auth's email hooks) and writes the outcome to the application log. The builder persists nothing: a staff action's entry in the staff log is written by its operation once the action is confirmed (`app/(LogsModule)`).

### What a context proves

A handler runs only after every gate above passed, so it can rely on them: the session, the parsed input, the declared roles and permissions, the effective step-up. It still owns what no declaration can know: rules about the *target* of the call (ownership, root, self), lifecycle state, and a fresh read of security state where a decision depends on it.

The context's brand proves where it came from, not what it may do. `Ctx.is` does not prove a permission, a completed step-up or freshness. A public operation gets a `PublicCtx` with no user: for an emailed link or a reset token, validating the token is what establishes authority for its account, and no authenticated context is ever made up for it.

## 3. Polymorphic Adapters

Operations are isolated from Next.js specifics. Adapters map these operations to the web layer while injecting strict, server-controlled `entryPoint` metadata that clients cannot spoof:

* `toServerQuery`: The trusted SSR read path. It executes with `entryPoint: "server-render"` and propagates Next.js control flow like `notFound()`.
* `toServerAction`: Designed for `"use server"` files. It sets `entryPoint: "server-action"` and safely standardizes success/error return shapes.
* `toRouteHandler`: Wraps operations into standard HTTP endpoints. It strictly maps HTTP statuses, sanitizes payloads, and sets `entryPoint: "route-handler"`.

## 4. Enterprise-Grade Security Features

This architecture defends against common vulnerabilities by default:

* **Strict Origin Checking:** Mutation requests (and non-browser clients) must send an `Origin` matching the request URL exactly, blocking CSRF attempts with a `FORBIDDEN` response before the action runs.
* **Anti-Replay TOTP:** Accepted TOTP proofs are atomically marked as used across sessions for 90 seconds. Reusing a code immediately returns `STEP_UP_INVALID_CODE`.
* **Granular Step-Up (MFA):** Operations can demand no verification (`"none"`), a reusable session grant (`"five_minutes"`), or a completely fresh proof (`"every_time"`).
* **AI Tooling (MCP) Controls:** Operations explicitly require `mcpAllowed: true` to be registered for AI consumption, preventing accidental exposure of sensitive admin mutations to LLM agents.

## 5. Testing & Reliability

The pipeline is fully backed by regression tests (`bun test tests/auth`) that exercise permission logic and step-up helpers using mocked boundaries, ensuring security rules are verified without requiring live services.