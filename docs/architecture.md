# Architecture

This document defines the application’s constraints, implementation defaults, and permitted exceptions.

## Scope constraints

- Next.js application with SSR, Server Actions, and selected MCP tools. Application REST endpoints are out of scope; adding them requires an explicit scope decision and docs update. Auth and MCP protocol handlers are distinct from an application REST surface.
- Global users and roles; no tenants or organization membership scaffolding.
- Better Auth with one auth authority and shared role/permission definitions. Admin bypasses role-permission checks; other roles are checked. Authentication, verification and business invariants still apply to admin.
- Password sign-in with email OTP or authenticator TOTP. All staff entering the administration panel require login verification; sensitive operations require step-up verification. Magic links are out of scope.
- MCP cannot perform sensitive operations, even for admin. Initial MCP use is finding accounts and reading role/status with an explicit safe response shape.
- MCP user lookup is available to authenticated admins and staff whose roles grant user lookup. A connection uses the connected user's authority; it is not an implicit admin identity.
- Admin shell, R2 upload/storage integration with a working example, Resend integration, and WebSocket editing presence. Presence covers all staff on form pages, without dirty state, typing indicators, or inferred edit locks. A complete media library is out of scope.

## Shared behavior

The shared operation owns validated input, permission policy, required verification, business rules, and coordinated effects. Server Actions and selected MCP tools adapt transport input and outcomes to this operation. SSR reads use the same permission policy without calling a Server Action.

Trusted entry adapters resolve caller identity and entry-point information. Clients cannot supply an authoritative role, verification grant, or a flag claiming to be a different transport. A branded TypeScript context prevents some accidental misuse but is not runtime authorization.

Staff verification is enforced on protected reads and operations, including direct Server Action and MCP calls, not only by a panel layout redirect. Use current authoritative roles, account status and session/token validity for protected calls. Long-lived MCP/presence connections must lose revoked privileges; define and test invalidation/revalidation rather than trusting the role captured when a connection opened. This does not require one particular cache implementation.

Sensitive-operation checks apply in the shared operation path as well as MCP registration. Omitting a tool alone is insufficient: a generic tool must not expose the operation indirectly. Admin permission bypass never turns into a bypass of this restriction.

Shared action definitions live in `operations/`. Each definition uses `defineAction` to declare its input schema, permissions, verification requirements, and handler. The definition is the guarded operation; do not add a separate business-operation wrapper around it just to satisfy a layer diagram. Database queries and writes live in the owning scope's `db/` services.

Every application db-service entry function requires the appropriate branded context as its first argument: `service(ctx, input)`. This applies to reads and writes even when the query does not use any context fields. Context must not be optional, defaulted, replaced with a plain user ID, fabricated, or supplied through a type assertion. Builders resolve identity and run the configured validation, permission, and verification checks before handing context to the handler, which passes it to the db-service. Feature code must not construct contexts; restrict access to the context factory to trusted infrastructure. This is an intentional safeguard against accidental direct database-service calls, not proof that any arbitrary context has passed every possible permission check.

A small definition can use `handler: (ctx, input) => service(ctx, input)`. Several cohesive steps can also stay in the handler. Extract additional helpers only for meaningful reuse or complexity. Pure calculations and private query helpers within a guarded service do not need artificial context parameters; they must not become exported context-free database entry points.

### Definitions and entry points

- `operations/`: server-only `defineAction` definitions, shared by the entry points that need them. Keep schema, permissions, verification, and handler together. Use `import "server-only"`, not a file-level `"use server"` directive.
- `actions.ts`: one file per scope by default, containing Next.js Server Action exports through `toServerAction`. It contains transport wiring, not duplicated validation or business logic.
- `mcp.ts`: explicit registration of selected tools using the shared definitions. It does not import browser-facing exports from `actions.ts` and does not expose every definition automatically.
- `db/`: services requiring builder-supplied `ctx` as their first argument.

Prefer inferred adapter input/output types instead of repeating them at the export. The desired Server Action export is `export const updateDisplayNameAction = toServerAction(updateDisplayName)`. Verify this factory-produced export with the installed Next.js compiler before adopting it. If the compiler requires an explicit async export, keep that wrapper minimal and retain inferred types. This is an implementation compatibility check, not a reason to add another business layer.

The MCP adapter must resolve its authenticated caller through the shared guarded pipeline; it must not invoke a definition's handler directly or manufacture context. SSR reads retain their trusted read entry path and shared permission policy without invoking a browser Server Action.

## Module layout and scope

Each module has one module-wide implementation directory, `app/(ModuleName)/_`, and one admin-only implementation directory, `app/(ModuleName)/admin/_`. All module implementation belongs to one of these scopes; route directories hold framework entry files. Do not scatter `_components`, `_actions`, or additional `_` directories throughout individual routes.

- Module-wide `_` is available to both ordinary application code and admin code.
- `admin/_` is available only to code inside an `admin/` scope. Non-admin code cannot import it, including through re-exports or type-only imports.
- Admin code can use module-wide code; module-wide code cannot depend on admin code.
- The admin directory identifies dashboard ownership, not the literal `admin` role. Limited staff can use authorized dashboard behavior.

Organize each scope by responsibility so large modules remain navigable:

```text
app/
  (UsersModule)/
    _/
      types.ts                   # shared type declarations
      schemas.ts
      actions.ts                 # Next.js Server Action exports
      db/
        users-service.ts
      operations/                # shared defineAction definitions
      components/
      hooks/
      utils/
      mcp.ts                     # only the selected agent workflow
    admin/
      users/page.tsx
      _/
        types.ts
        actions.ts                 # Next.js Server Action exports
        db/
          users-admin-service.ts
        operations/
        components/
        hooks/
        utils/
src/
  lib/
    auth/                        # one global Better Auth configuration
    actions/                     # reusable action runtime/builders
    db/                          # database client and schema
    redis/
    storage/                     # R2
    email/                       # Resend and email templates
    realtime/                    # WebSocket transport
    date/                        # canonical date helpers
  components/                    # globally reusable UI
```

The two scope locations and dependency direction are constraints. Create their subdirectories and files when used; the tree describes their homes, not a requirement to create empty scaffolding. Split large `db/` or `operations/` directories into named capability subdirectories within the same scope. Keep one `actions.ts` per scope by default; split exports by capability only when navigation becomes difficult. Do not flatten everything into `_`, and do not introduce extra underscore scopes as a size-management technique.

Global infrastructure and utilities live in `src/lib`, including auth. They are not module-owned merely because modules consume them. Global UI lives in `src/components`; module-specific UI stays in its owning `_` scope.

Code used by both dashboard and MCP belongs in the module-wide scope with explicit access checks. Keep dashboard-only forms and helpers in `admin/_`; do not re-export them through module-wide files to make MCP reach them. For example, a guarded account-lookup operation is module-wide, while the dashboard table using it is admin-only. Shared location does not imply anonymous access.

Next.js excludes underscore-prefixed directories from routing, but the scope rules above still govern imports. Directory placement does not replace runtime authorization or server/client separation. See [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure).

## Responsibility and sharing defaults

A business capability owns product rules and a lifecycle; global use does not turn it into a utility. Shared infrastructure integrates technical facilities without deciding a capability's product rules. Utilities perform narrow transformations or calculations. Generic UI belongs in shared UI; capability-specific UI stays with its capability.

For example, R2 storage is infrastructure, encoding an image is a technical helper, and a media library with usage rules is a business capability. WebSocket transport is infrastructure; deciding which administrators can see each other's presence is application policy.

Search for an existing implementation before adding a helper. Keep a new helper local unless it is deliberately shared infrastructure or has an actual shared meaning and consumer. Promote a useful existing implementation rather than copying it. Do not combine superficially similar functions whose business meanings differ.

Date formatting should have discoverable shared functions with explicit semantics. A calendar date must not silently acquire a timezone conversion merely to use the same helper as an instant. Locale and timezone are part of the formatting contract, not incidental caller details.

Give established shared helpers a canonical import location in `src/lib`; local wrappers must not reproduce their logic independently. Global facilities use ordinary imports and do not require module scaffolding.

## Imports and scope

Modules can import functions, components, schemas, and types directly from other modules. Dedicated export files and automated cross-module boundary checks are not required. Use `import type` for type-only dependencies.

The admin scope rule still applies: admin code can use module-wide code, while non-admin code cannot import `admin/_`, including through types or re-exports. Server-only code must also stay out of browser bundles. These restrictions concern scope and runtime, not module encapsulation.

Keep global infrastructure and generic utilities independent of capability-specific behavior. Put business coordination with its owning capability rather than moving it into a global helper merely to share it.

## Sensitive-operation policy

The auth catch-all rejects the Better Auth `/admin/*` namespace at the HTTP
boundary, including administrative reads and impersonation endpoints. The
plugin remains available server-side; expose only explicitly required operations
through guarded `defineAction` definitions with permissions, required verification,
audit descriptions, and named safe response shapes. Do not forward its admin
endpoints directly from another transport. No application admin operations are
currently exposed.

Operations are classified as follows:

| Operation | Sensitive? |
| --- | --- |
| Grant/revoke roles or permissions | Yes |
| Delete an account, ban/unban an account | Yes |
| Start impersonation | Yes; this classification does not add impersonation to scope |
| Change credentials, sign-in email, or 2FA/recovery settings | Yes |
| Revoke another user's sessions | Yes |
| Read permitted account identity, role, and status | No; authorization and response filtering still apply |
| Edit ordinary display name/avatar/preferences | No |
| Ordinary sign-out or leave impersonation | No; ending elevated access must remain easy |

For sensitive operations, require an explicit successful email OTP or TOTP step-up within the previous five minutes in the same authenticated session. Reuse does not extend the expiry. Login verification alone does not create this step-up grant. A role/security change or session revocation invalidates affected grants; never broaden access because the grant store is unavailable. Better Auth's own required password or enrollment checks still apply independently.

Five-minute reuse is a convenience/security tradeoff: it reduces repeated prompts but permits multiple sensitive actions in that window. Use one verification window rather than multiple overlapping freshness levels. Revisit only for a concrete requirement. Sensitive classification is declared once on the operation and enforced across entry points; a mixed operation that can change roles remains sensitive even when one call changes only a harmless field. Prefer separate operations for those separate intents.

MCP cannot use a browser step-up grant to invoke a sensitive operation. The restriction is independent of grant freshness and admin authority.

### Enrollment and recovery exceptions

Initial enrollment cannot require a factor that does not exist yet. A newly authenticated staff member without the required verification may access only the enrollment/verification flow and sign-out until completion, not panel data, operations, MCP lookup, or presence. Enrollment must prove the selected method using the supported Better Auth flow; changing or disabling an existing factor remains sensitive.

Forgotten-password and lost-factor recovery cannot require an already authenticated session and the unavailable factor. These are separate, narrowly scoped recovery flows with expiring single-use proofs and the supported provider checks, never a generic step-up bypass or MCP tool. Recovery must not silently grant panel access before required verification is complete. Initial enrollment, ordinary verification, and recovery do not expose unrestricted administrative operations.

These exceptions preserve access-control requirements while avoiding circular prerequisites. Detailed recovery UX must preserve these requirements.

## MCP access and completion defaults

User lookup uses the same permission policy as the application's user lookup. Establish the actual connected identity through authenticated delegation; evaluate current role, account status, and staff verification requirements on calls. Revoked, banned, or demoted users must not retain access merely because their MCP connection is still open. An OAuth scope or cached role is not by itself proof of current application authority.

Return a named response shape for account identity, role and status, never an auth database row. Default fields are account ID, display name, email when needed for administrative lookup, role, and enabled/banned status. Password hashes, tokens, session identifiers, factor secrets and recovery codes are excluded. Bound pagination; user lookup is not a bulk account-export tool.

The protocol implementation must use supported library facilities, and prove cookie/token/verification behavior in integration tests. The MCP adapter must resolve authenticated caller identity explicitly; an HTTP session wrapper alone does not establish that identity. Human account verification for a connection does not authorize sensitive MCP operations.

Register tools explicitly. Never derive the tool registry from all public module exports or all actions. A module's integration note names its intended agent workflow and selected operations; if it has no MCP workflow, it needs no MCP file.

## Infrastructure and effects

Use PostgreSQL with Drizzle for persistent data and Redis for shared transient state. Redis is required where it holds sessions, rate limits, or verification grants; an outage there must fail the affected protected operation safely, not silently skip its checks.

Presence is advisory and can degrade independently: show that presence is unavailable, expire stale entries after disconnect/heartbeat loss, and permit normal authorized form use. Presence subscription requires staff authorization; avoid leaking raw URL query strings or unrelated page details. Presence is not a locking or save-conflict system.

R2 failures fail uploads without reporting success. Resend failures do not claim that a code or email was sent. Unrelated reads need not fail when those services are unavailable. Development substitutes must be explicit and must not become production success fallbacks.

Database changes that must succeed together use a transaction. For effects outside that transaction, state whether loss is acceptable. Required eventual delivery needs durable retry; best-effort presence does not justify adding a general event bus. R2 and database updates require explicit ordering and cleanup on partial failure, not a claim of cross-service atomicity.

Ordinary non-staff users may opt into 2FA; panel access always requires it. Assign one role per user. Role composition is out of scope; this is a product default, not a Better Auth limitation. Do not expose impersonation, a role editor, bulk operations, or additional plugins merely because a dependency provides them.

## Agent completion defaults

Before implementing a feature, identify its owner, required surfaces, authorization and sensitivity, and existing reusable code. Infer these from accepted requirements and established conventions; ask only about consequential ambiguity.

Complete the requested behavior and necessary integration. Update affected existing interfaces and tools; new tools follow agreed agent workflows. Neither a new module nor a new action implies a new MCP tool, REST endpoint, navigation section, or migration.

Verification should exercise the shared operation's behavior and relevant adapter guarantees. For sensitive behavior, verify denial via MCP and enforcement of verification despite admin permission bypass. For roles, verify consistent decisions across entry points. For utilities, test meaningful semantic cases rather than implementation structure. Verify that non-admin code cannot reach admin-only implementation and that server-only dependencies stay out of browser code.

## Authority, defaults, and exceptions

Architecture is the source for current constraints and defaults; the glossary defines product terms; module READMEs define non-obvious caller contracts; ADRs explain consequential decisions. The short agent instructions route readers to those sources. Current explicit user requirements can revise the design; update the relevant source rather than leaving contradictions.

Hard constraints include policy enforcement, no sensitive MCP operations, runtime separation, and admin-scope isolation. Current scope constraints include no tenancy and no application REST endpoints. These can change through an explicit scope decision, not an incidental implementation exception.

Defaults include filenames, shared-directory names, internal subdivisions, extraction timing, and the infrastructure choices above. An agent may make a local reversible exception with a concrete reason and appropriate verification. For example, keep an image helper local when its only consumer is one capability, or keep a small definition’s handler as a direct call to its db-service rather than extracting another helper. An exception to a default cannot weaken a hard constraint.
