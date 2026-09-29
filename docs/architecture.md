# Architecture

This document defines the application’s constraints, implementation defaults, and permitted exceptions.

## Scope constraints

- Next.js application with SSR, Server Actions, and selected MCP tools. Application REST endpoints are out of scope; adding them requires an explicit scope decision and docs update. Auth and MCP protocol handlers are distinct from an application REST surface.
- Global users and roles; no tenants or organization membership scaffolding.
- Better Auth with one auth authority and shared role/permission definitions. Admin receives every declared permission through the shared role evaluator; unknown permissions deny. Authentication, verification and business invariants still apply to admin.
- Password sign-in with email OTP or authenticator TOTP. Staff must enroll the required second factor. Remembered login verification never grants operation step-up. Auth views require authenticator or recovery-code verification for enrolled accounts; setup enrolls the initial admin. Signed-in accounts manage their own display name, sign-in email, password, optional authenticator, recovery codes and sessions on the settings pages (see "Account settings"). Magic links are out of scope.
- MCP requires explicit operation opt-in and cannot invoke operations requiring step-up, even for admin. Initial MCP use is finding accounts and reading role/status with an explicit safe response shape.
- MCP user lookup is available to authenticated admins and staff whose roles grant user lookup. A connection uses the connected user's authority; it is not an implicit admin identity.
- Admin shell, R2 upload/storage integration with a working example, Resend integration, and WebSocket editing presence. Presence covers all staff on form pages, without dirty state, typing indicators, or inferred edit locks. A complete media library is out of scope.

## Shared behavior

The shared operation owns validated input, permission policy, required verification, business rules, and coordinated effects. Server Actions and selected MCP tools adapt transport input and outcomes to this operation. SSR reads use the same permission policy without calling a Server Action.

Trusted entry adapters resolve caller identity and entry-point information. Clients cannot supply an authoritative role, verification grant, or a flag claiming to be a different transport. A branded TypeScript context prevents some accidental misuse but is not runtime authorization.

The auth views and the shared operation pipeline resolve the acting account through one session authority (`src/lib/auth/sessionAuthority.ts`): the signed session-token cookie identifies the Redis-backed session (cookie cache bypassed), and the current user row from the database is merged over the provider's cached user copy. This is a deliberate change from the earlier cache-only baseline - one user read per authenticated request - because the settings flows commit direct row writes (email finalization, security version) that a cached copy would not reflect. The authority also refuses effectively banned accounts and reconciles the post-email-change revocation barrier (below) before any session of that account is honoured. `getFreshSession`, the action builder and the auth HTTP boundary all use it; the proxy's cookie-cache read is a navigation hint only. Staff promotion remains future work. Accounts requiring enrollment can access only `/auth/enroll`, sign-out, and email confirmation until Better Auth verifies TOTP. The request proxy, protected page guard, operation authorization, and auth HTTP boundary enforce this using the provider session. Long-lived MCP/presence connections must lose revoked privileges; define and test invalidation/revalidation rather than trusting the role captured when a connection opened. This does not require one particular cache implementation.

MCP eligibility checks apply in the shared operation path as well as MCP registration. Omitting a tool alone is insufficient: a generic tool must not expose the operation indirectly. Admin permission bypass never turns into a bypass of this restriction.

Shared action definitions live in `operations/`. Each definition uses `defineAction` to declare its input schema, role admission (`roles`, answered NOT_FOUND to everyone else), permissions, verification requirements, and handler. The definition is the guarded operation; do not add a separate business-operation wrapper around it just to satisfy a layer diagram. Database queries and writes live in the owning scope's `db/` services.

Every application service entry function requires the appropriate branded context as its first argument: `service(ctx, input)`. This applies to reads and writes even when the query does not use any context fields. Context must not be optional, defaulted, replaced with a plain user ID, fabricated, or supplied through a type assertion. Builders resolve identity and run the configured validation, permission, and verification checks before handing context to the handler, which passes it to the service. Feature code must not construct contexts; restrict access to the context factory to trusted infrastructure. This is an intentional safeguard against accidental direct service calls, not proof that any arbitrary context has passed every possible permission check.

A small definition can use `handler: (ctx, input) => service(ctx, input)`. Several cohesive steps can also stay in the handler. Extract additional helpers only for meaningful reuse or complexity. Pure calculations and private query helpers within a guarded service do not need artificial context parameters; they must not become exported context-free database entry points.

### Definitions and entry points

- `operations/`: server-only `defineAction` definitions, shared by the entry points that need them. Keep schema, permissions, verification, and handler together. Use `import "server-only"`, not a file-level `"use server"` directive.
- `actions.ts`: one file per scope by default, containing Next.js Server Action exports through `toServerAction`. It contains transport wiring, not duplicated validation or business logic.
- `mcp.ts`: explicit registration of selected tools using the shared definitions. It does not import browser-facing exports from `actions.ts` and does not expose every definition automatically.
- `db/`: services requiring builder-supplied `ctx` as their first argument.

Prefer inferred adapter input/output types instead of repeating them at the export. The desired Server Action export is `export const updateDisplayNameAction = toServerAction(updateDisplayName)`. Verify this factory-produced export with the installed Next.js compiler before adopting it. If the compiler requires an explicit async export, keep that wrapper minimal and retain inferred types. This is an implementation compatibility check, not a reason to add another business layer.

The MCP adapter must resolve its authenticated caller through the shared guarded pipeline; it must not invoke a definition's handler directly or manufacture context. SSR reads retain their trusted read entry path and shared permission policy without invoking a browser Server Action: `toServerQuery(definition)` runs a read definition with the trusted `server-render` entry point from a page's own request headers, takes no caller metadata or step-up proof, and propagates typed refusals for the page to translate. A scope exposes these in a `queries.ts` beside its `actions.ts`.

Contexts carry a private copy of the acting request's headers, readable only through `ctx.getRequestHeaders()`, for provider APIs that authenticate the actor (Better Auth's admin endpoints called server-side). Headers are never serialized, placed in a DTO or logged.

## Module layout and scope

Each module has one module-wide implementation directory, `app/(ModuleName)/_`, and one admin-only implementation directory, `app/(ModuleName)/admin/_`. All module implementation belongs to one of these scopes; route directories hold framework entry files. Do not scatter `_components`, `_actions`, or additional `_` directories throughout individual routes.

Configuration that belongs to a module - its routes above all, and anything whose
content is about that module even when other code reads it - lives in the module's
`_`, not in `src/lib`. Only a core capability's infrastructure (Better Auth, the
permission definitions) is global; a module's routes are never.

The application as a whole has one composition scope, `app/_`, for what belongs to
no single module and composes several: the shell (`shell/`), the navigation
(`navigation.ts`), the page factory bound to the app's redirect targets
(`access.ts`) and the app-level routes (`routes.ts`). It may import any module's
module-wide `_`; modules do not import it.

- Module-wide `_` is available to both ordinary application code and admin code.
- `admin/_` is available only to code inside an `admin/` scope. Non-admin code cannot import it, including through re-exports or type-only imports.
- Admin code can use module-wide code; module-wide code cannot depend on admin code.
- The admin directory identifies dashboard ownership, not the literal `admin` role. Limited staff can use authorized dashboard behavior.

Organize each scope by responsibility so large modules remain navigable:

```text
app/
  (UsersModule)/
    _/
      routes.ts                  # route strings and page declarations
      types.ts                   # shared type declarations
      schema.ts
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
app/_/                         # application composition: shell, navigation, access binding
src/
  lib/
    access/                      # declarative page access: defineRoutes, authorize, page factory
    auth/                        # one global Better Auth configuration
    actions/                     # reusable action runtime/builders
    forms/                       # Zod + react-hook-form helpers (useSchemaForm, schemaDefaults)
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

Search for an existing implementation before adding a helper. Place a helper by what it is, not by how many callers it has today. A helper with no domain semantics (it only knows a library or a data shape, such as Zod, react-hook-form, or dates) is global and goes in `src/lib` immediately, even with a single consumer; a helper left in a module is invisible to the next developer or agent, who rewrites it months later in another module. Keep a helper local only when it encodes the owning module's rules or vocabulary. Promote a useful existing implementation rather than copying it. Do not combine superficially similar functions whose business meanings differ.

Date formatting should have discoverable shared functions with explicit semantics. A calendar date must not silently acquire a timezone conversion merely to use the same helper as an instant. Locale and timezone are part of the formatting contract, not incidental caller details.

Give established shared helpers a canonical import location in `src/lib`; local wrappers must not reproduce their logic independently. Global facilities use ordinary imports and do not require module scaffolding.

## Imports and scope

Modules can import functions, components, schemas, and types directly from other modules. Dedicated export files and automated cross-module boundary checks are not required. Use `import type` for type-only dependencies.

The admin scope rule still applies: admin code can use module-wide code, while non-admin code cannot import `admin/_`, including through types or re-exports. Server-only code must also stay out of browser bundles. These restrictions concern scope and runtime, not module encapsulation.

Keep global infrastructure and generic utilities independent of capability-specific behavior. Put business coordination with its owning capability rather than moving it into a global helper merely to share it.

## Routes

Routes are module data: each module declares its page paths once in
`app/(ModuleName)/_/routes.ts` and everything else references that table -
`redirect(authRoutes.signIn)`, `<Link href={authRoutes.panel}>`, the proxy's
enrollment allow-list, email links, navigation and breadcrumbs. This holds for
the auth module too: its Better Auth configuration is global infrastructure in
`src/lib/auth`, but its routes live with the module, and `src/lib/auth` imports
them from there. Pages the application owns as a whole (the homepage) are in
`app/_/routes.ts`. A page path never appears as a string literal outside its
table, so renaming a page folder is one edit plus whatever the type checker flags.

The table is one `defineRoutes` call. An entry is either a plain path (a flow
page or an API prefix: public, no label) or a full declaration (`href`, `label`,
`access`, optional `icon`/`match` - see "Application shell and page access");
both come out as the same shape, so `.href` is always the path
(`redirect(authRoutes.signIn.href)`) and a full entry is what `page(...)`,
navigation and breadcrumbs take.

Parameterised paths use the global `buildRoute` helper (`src/lib/routes.ts`). Templates
use Next's segment syntax so they read like the folder that serves them, and the
required parameters are derived from the template type:

```ts
buildRoute("/users/[id]", { id });                                   // "/users/42"
buildRoute(authRoutes.emailConfirmation, undefined, { token });     // "…?token=…"
buildRoute("/docs/[...slug]", { slug: ["guide", "setup"] });        // "/docs/guide/setup"
```

`withQuery(path, query)` appends a query string on its own; both skip `null` and
`undefined` values and encode the rest.

## Application shell and page access

The root layout (`app/layout.tsx`) resolves the request once - the fresh
session and the `sidebar_state` cookie - and mounts `ViewerProvider` with a
minimal viewer (`name`, `email`, `image`, `role`, or `null` for guests) above
the persistent client shell (`app/_/shell/AppShell.tsx`). Nothing is
passed down as props: the account menu, the sidebar and any client code read
`useViewer()`, which also exposes `can(access)` bound to the current roles. The
shell decides its chrome from the pathname alone: authentication views
(`/auth/*`) keep their own layout; dashboard routes (`/admin`, `/admin/*`)
receive the collapsible sidebar, the top bar and one `main` landmark; every
other route receives the top bar only. There is one shell for all modules.

Page access is declared, not coded. A module's route table
(`app/(ModuleName)/_/routes.ts`) declares each signed-in page with `href`,
`label`, optional `icon`/`match`, and `access`, which is `"public"`, `"session"`, or
`{ roles?, perm?, connector? }` - at least one of `roles` and every `perm`
must hold, evaluated through the shared `hasRole`/`can`, so comma-separated
roles are honoured everywhere. `authorize(viewer, access)` in
`src/lib/access/routes.ts` is the only evaluator; navigation
(`app/_/navigation.ts`, groups composed from the modules' declarations) and
the page guard both call it, so a link is shown exactly when its page opens.

Pages are written as `export default page(route, render)` from the
server-only `app/_/access.ts`, which binds the generic factory in
`src/lib/access/page.tsx` to the application's redirect targets: the factory
reads the fresh session, enforces the route's `access` and only then renders. Guests go to sign-in;
refused viewers go to the dashboard if they may open it, otherwise the panel.
The ESLint rule `app/admin-page` requires this form for every page under an
`admin` segment, so an admin page without a declared rule fails lint. `guard(route)`
serves the rare non-page case. Finer checks inside a view use `can(...)`
directly, server- or client-side; routes are not involved.

The proxy handles installation and enrollment only and does not decide page
access. Pages own their breadcrumbs explicitly (`AppBreadcrumbs` accepts the
declared routes as items) and contain nothing else until their feature lands;
the homepage has no breadcrumb, the settings index redirects to Profile, and
account settings are reachable by URL only because navigation does not list
them.

Theme tokens live on `:root` and `.dark`; `next-themes` maintains the document
class and persists the choice. The local reset applies to `.app-ui`, which the
shell, the auth layout and every portaled surface carry, instead of a global
preflight.

## MCP eligibility and step-up policy

The auth catch-all rejects the Better Auth `/admin/*` namespace at the HTTP
boundary, including administrative reads and impersonation endpoints. The
plugin remains available server-side; expose only explicitly required operations
through guarded `defineAction` definitions with permissions, required verification
and named safe response shapes. Do not forward its admin
endpoints directly from another transport. User administration
(`app/(AuthModule)/admin/_`, see its README) exposes list, detail, name and email
changes, verification and reset emails, session revocation and bans this way;
none of them is MCP-eligible.

Operations declare `mcpAllowed` (default false) separately from `stepUp`
(default `"none"`). `mcpAllowed: true` permits selected tool registration; it does
not register a tool. `stepUp` accepts `"none"`, `"five_minutes"`, or `"every_time"`.
MCP opt-in combined with a step-up requirement is an invalid definition, rejected
by types and at runtime. Browser-only operations may have no step-up requirement.

| Operation | MCP allowed? | Step-up |
| --- | --- | --- |
| Grant/revoke roles or permissions | No | Five minutes |
| Delete an account (not added to scope), apply or replace a ban | No | Five minutes |
| Remove a ban | No | None; explicit confirmation in the UI |
| Start impersonation (not added to scope) | No | Five minutes |
| Change credentials, sign-in email, or existing 2FA/recovery settings | No | Five minutes |
| Revoke another user's sessions | No | None; explicit confirmation in the UI (sign-in is still possible afterwards) |
| Send a verification or password-reset email to a user | No | None; permission and a server-side throttle apply |
| Read permitted account identity, role, and status | Explicit opt-in for selected lookup tools | None; permissions and safe output still apply |
| Edit ordinary display name/avatar/preferences | No by default | None |
| Ordinary sign-out or leave impersonation | No | None; ending elevated access must remain easy |

Five-minute step-up requires explicit email OTP or TOTP verification in the same
authenticated session. Reuse never extends expiry. Login verification and trusted
devices do not create a step-up grant. `"every_time"` is available for operations
requiring a fresh proof on each invocation: ignore cached grants and do not create
or extend a reusable grant. Proof replay protection still applies. There is one
reusable window, with no importance hierarchy or consumable grant pool.

A role/security change or session revocation must invalidate affected grants;
never broaden access because the grant store is unavailable. Better Auth's own
password and enrollment checks apply independently. Declare policy once on each
operation and enforce it in the shared pipeline as well as at MCP registration.
Admin permissions bypass neither gate. Split mixed operations by intent when
harmless edits and security changes need different verification requirements.

### Enrollment and recovery exceptions

`twoFactorRequired` is a server-owned user policy field, separate from Better Auth's
`twoFactorEnabled` enrollment state. The migration marks existing admins and
moderators as required; ordinary users default to false. Future staff assignment
must maintain this requirement. Role-assignment UI remains future work. Required
enrollment uses Better Auth at `/auth/enroll`, independently of the initial setup page.
Accounts with an enrolled factor receive Better Auth login challenges.
The current sign-in forms do not request trusted-device cookies.


For future staff enrollment: initial enrollment cannot require a factor that does not exist yet. A newly authenticated staff member without the required verification may access only the enrollment/verification flow and sign-out until completion, not panel data, operations, MCP lookup, or presence. Enrollment must prove the selected method with Better Auth-compatible verification; changing or disabling an existing factor requires step-up and remains unavailable through MCP.

Forgotten-password and lost-factor recovery cannot require an already authenticated session and the unavailable factor. These are separate, narrowly scoped recovery flows with expiring single-use proofs and the supported provider checks, never a generic step-up bypass or MCP tool. Recovery must not silently grant panel access before required verification is complete. Initial enrollment, ordinary verification, and recovery do not expose unrestricted administrative operations.

These exceptions preserve access-control requirements while avoiding circular prerequisites. Detailed recovery UX must preserve these requirements.

## MCP access and completion defaults

User lookup uses the same permission policy as the application's user lookup. Establish the actual connected identity through authenticated delegation; evaluate current role, account status, and staff verification requirements on calls. Revoked, banned, or demoted users must not retain access merely because their MCP connection is still open. An OAuth scope or cached role is not by itself proof of current application authority.

Return a named response shape for account identity, role and status, never an auth database row. Default fields are account ID, display name, email when needed for administrative lookup, role, and enabled/banned status. Password hashes, tokens, session identifiers, factor secrets and recovery codes are excluded. Bound pagination; user lookup is not a bulk account-export tool.

The protocol implementation must use supported library facilities, and prove cookie/token/verification behavior in integration tests. The MCP adapter must resolve authenticated caller identity explicitly; an HTTP session wrapper alone does not establish that identity. Human account verification for a connection does not authorize operations without MCP opt-in.

Register tools explicitly. Never derive the tool registry from all public module exports or all actions. A module's integration note names its intended agent workflow and selected operations; if it has no MCP workflow, it needs no MCP file.

## User administration

The auth module's admin scope owns `/admin/users` and `/admin/users/[userId]`.
Its contracts, in brief; the scope's README holds the details:

- Permissions extend Better Auth's `user` resource with `send-verification`,
  `send-password-reset` and `manage-staff`. Every operation declares
  `roles: STAFF_ROLES` (a non-staff account is answered NOT_FOUND, as if the
  operation did not exist) plus `user.get` and its own permission (AND);
  admin holds all of them through the shared role, moderators hold list, get,
  update, ban and send-verification. Session revocation is the built-in
  `session.revoke`.
- Root is `installation.rootUserId`. Nobody else may act on root; root may only
  rename themselves, resend their own verification, request their own reset
  email and revoke their own sessions. Non-root actors cannot administer their
  own account. Staff targets need `user.manage-staff`. The last effectively
  unbanned admin cannot be banned. All of this is decided from fresh rows on
  every invocation; the detail page's capabilities are presentation only.
- Reads project explicit DTOs (never auth rows) with ISO 8601 UTC dates, using
  one repeatable-read transaction per page with a statement timeout. Effective
  ban status is computed at the read instant in SQL and never rewritten by a
  read. The list needs the `pg_trgm` extension and the `user_admin_*` indexes
  from migration 0004.
- Provider writes use the global `auth` instance under a PostgreSQL advisory
  lock (`withUserAccountLock`) that serializes short actions on one account and
  guards the last-admin count; session effects are performed and observed
  through `src/lib/auth/userSessionEffects.ts`. Outcomes are `unchanged`,
  `completed` or `partial` (with `committed` and `failedEffects`), recovered
  through dedicated retry operations. No cross-store atomicity is claimed.
- An administrative email change also writes the server-owned
  `passwordResetInvalidBefore` cutoff; `resetTokenPolicy` refuses reset links
  issued at or before it. Administrative email changes and bans first retire
  the target's pending settings requests (email change/correction, staged
  authenticator setup) and move its security version on, under the lock they
  already hold; a failure there blocks the mutation.
- Every action here that changes an account or its sessions writes one staff
  log entry once it is confirmed (see "Logs"); the two email actions do not.
  The detail page shows the account's entries to admins.
- Scope exception: these user detail forms ship without editing presence,
  stale-edit detection or optimistic concurrency. Name and email are separate
  saves; the last committed write wins. Presence for form pages remains future
  work and is not implied by this feature.
- Not included: user creation, hard or soft deletion, a role editor, avatar
  editing, impersonation, factor resets, session listings, bulk operations and
  exports. Future entities model deletion as an explicit soft delete with query
  exclusions rather than the physical delete of dependency examples.

## Account settings

`/settings/profile` (display name) and `/settings/account` (sign-in email,
password, authenticator, recovery codes, sessions), served by the auth
module's module-wide scope; `/settings` redirects to Profile. The settings
layout renders the title and a `<nav aria-label="Settings">` of real links
outside each page's own loading and error boundaries. Pages are
`page(authRoutes.settingsX, …)` and additionally call `requireEnrolledSession`
before their `toServerQuery` reads; every operation checks enrollment again.
Nothing here imports `admin/_`.

- Code layout: each service function is its own module under
  `app/(AuthModule)/_/db/settings/<area>/` (`profile`, `password`,
  `emailChange`, `twoFactor`, `sessions`), named after the function it
  exports; an area's internals (row transitions, projections, errors) sit
  beside them. `shared/` holds what several areas use: `policy.ts` (every
  limit, TTL and window), `throttleKeys.ts` (the Redis counter names), the
  typed refusals and the session-effect helpers. Section feedback on both the
  settings and admin pages is the shared `ActionFeedback` component with the
  `useFeedback` state hook.
- Every settings operation is authenticated, `mcpAllowed: false`, takes no
  user ID (the subject is `ctx.user.id`) and needs no administrative
  permission. Root manages its own account here under the same rules; the
  administrative root restrictions are unchanged. Impersonated sessions are
  refused by the step-up-protected operations. Session revocation accepts a
  session ID and resolves it among the actor's own sessions only.
- `stepUpWhen: "two_factor_enabled"` is the one declarative step-up condition:
  the declared `five_minutes` policy applies while the fresh user has an
  enabled authenticator, otherwise the effective policy is `none` (an explicit
  `requireVerifiedEmail` still applies) and a stale client proof is refused
  rather than turned into a grant. Password change, verified email-change
  initiation, replacement, disabling and recovery-code regeneration use it.
  Admin declarations are unchanged.
- Verification matrix: reads, name and session actions need nothing; the
  sensitive operations need a verified address, the current password (checked
  through the provider's verifier with a five-failures-per-fifteen-minutes
  budget, reserved before the comparison) and, when enrolled, the step-up.
  The unverified-address **correction** is the deliberate exception:
  `stepUp: "none"`, password plus a fresh TOTP code verified through the
  existing verifier without persisting a grant, mailing the corrected address
  only.
- Step-up grants are versioned: the Redis payload is
  `{ verifiedAt, securityVersion }` and a grant counts only for the account's
  current `user.securityVersion`. Credential, factor, recovery-code and
  sign-in email changes increment that version (inside their own transaction
  for app-owned writes, immediately before a provider-owned write); services
  re-check it after waiting for the account lock. This invalidates operation
  grants without signing devices out; remembered-device invalidation and
  extra sign-outs after a factor change are deliberately not implemented.
- Sign-in email changes are **link-only**: no emailed code. A *change* (verified
  address) is current-mailbox link, authenticated destination selection, new-
  mailbox link; a *correction* (unverified address) is the corrected mailbox's
  link alone. Requests live in `email_change_request` (PostgreSQL is the
  authority; Redis throttles) with one fixed 24-hour deadline, SHA-256 token
  digests with per-stage generations, explicit cancellation, replacement by a
  new request and single-use links. The public page
  `/auth/email-change/confirm` inspects on GET and confirms only on the
  explicit submit of a public Server Action; the token is the whole authority
  and the browser's session is irrelevant. Password change, reset, an
  administrative email change, a ban and ordinary verification of a corrected
  address retire pending requests.
- **Finalization is a narrowly scoped direct SQL exception**: under the account
  lock, one write transaction locks the user row and then the request row,
  validates only the locked values, and writes exactly `email`,
  `emailVerified`, `passwordResetInvalidBefore`, `updatedAt`,
  `securityVersion` (+1) and `sessionRevocationPending` on the user plus the
  request's terminal state. PostgreSQL's unique email is the final arbiter.
  Session revocation runs after the commit; the durable `sessionRevocationPending`
  flags (user and request) record unfinished revocation, and the session
  authority revokes and clears them (version-conditionally) before honouring any
  session of the account. The response says so honestly when revocation could
  not be confirmed.
- Authenticator: optional enrollment uses the provider's own enable/verify pair,
  staged by an app-owned `authenticator_setup_request` (ten minutes, bound to
  the initiating session and security version) so the factor stays inactive
  until proven. Replacement stages a new encrypted secret while the old
  authenticator and codes keep working, then swaps secret and recovery-code set
  in one transaction; `src/lib/auth/factorCodec.ts` mirrors the provider's
  secret, code and recovery-code formats with public exports only, proven by
  real provider login tests. Disabling is permitted only when neither the staff
  role nor the stored policy requires a factor. New recovery codes are shown
  once, inside a disposable flow that unmounts the action results.
- Sessions are the provider's Redis-backed sessions, projected without tokens,
  current first, in pages of 20; revoke one, sign out other devices, sign out
  everywhere. The password form's "Sign out other devices (recommended)"
  checkbox maps to the provider's own `revokeOtherSessions`.
- Throttles (Redis, fail closed): email initiation 5/hour, sends 60 s per
  purpose and 10/hour, public proofs 30 per request and 60 per address per ten
  minutes, factor setup initiation 5/hour, setup codes 5 per attempt per
  fifteen minutes. Outcomes are explicit DTOs (`SyncOutcome`,
  `EmailRequestOutcome`, `EmailProofOutcome`, `SetupStarted`,
  `RecoveryCodesIssued`, `SessionPage`) with closed lifecycle codes; nothing
  reuses the admin `UserMutationOutcome`.
- Nothing here writes to the staff log: it holds what staff do to other
  accounts, not what a user does to their own (see "Logs").

Migration `0005_settings_requests_and_security_version.sql` adds the two
request tables and the `security_version` / `session_revocation_pending` user
columns; it was generated by drizzle-kit and reviewed to contain only those
changes (the hand-written `user_admin_*` indexes are untouched).

## Logs

The logs module (`app/(LogsModule)`, contracts in its `_/README.md`) owns
`staff_log` and `email_log`, their writers and the admin lists
`/admin/staff-logs` and `/admin/email-logs`. The sidebar lists them under
"System": navigation categories are staff-facing information architecture
composed in `app/_/navigation.ts` and may hold pages of several modules.

**Staff log** (decision record: ADR 0003).

- One entry per staff action that succeeded and changed something. Refused
  and failed attempts, a user's actions on their own account, anonymous
  flows and sent emails are not entries; refusals and failures are in the
  application log, written by the action builder.
- An entry points at its resource by type and ID without a foreign key, so
  any module can log about its resources and ask for their history, and the
  logs module knows none of their tables. Users are the exception: the
  acting staff member is a real reference, read live for their current name.
- The message is an array of generic snapshot blocks, declared and rendered
  by the logs module only. A block is complete on its own: rendering makes
  no lookup. A new action composes existing blocks.
- The service that performed the action writes the entry with
  `recordStaffLog`, after the action is confirmed and outside its
  transaction; one action is one entry. If the write fails the action
  stands and the staff member is told it was not logged. The action builder
  persists nothing.
- Entries are append-only, enforced by triggers.
- Reading is admin-only (`roles: ["admin"]`), not MCP-eligible, without
  step-up. The list page keeps filters and pagination in the URL.
  `StaffLogWidget` embeds the log in another module's admin page with its
  state in the component, and renders nothing for a viewer who may not read
  the log.

**Email log.**

- `sendEmail` (`src/lib/email/send.ts`) logs every email the application
  sends, requested by the enclosing operation's context
  (`currentOperationContext`, since Better Auth's email hooks receive none)
  or anonymously for the provider's own endpoints. The global email sender
  importing the logs module's recorders is deliberate: a registration step
  that could be forgotten would fail silently, with nothing logged.
- Attempts are event-time snapshots without foreign keys to other tables.
  An attempt's initiation snapshot is immutable and only its observation
  columns change, through honest status transitions (`unknown` resolves
  once), enforced by database checks and a trigger.
- Redaction is permanent and happens before persistence, search documents
  and idempotency digests. The producer declares its secrets; links and
  denied keys are removed regardless. There is no raw-content storage.
- Every write is idempotent on a caller key compared by a digest of the
  sanitized payload; retries form a chain allocated under a lock.
- The reads are admin-only, not MCP-eligible, without step-up. The list is
  SSR; details load on demand into a dialog selected by `?log=<id>`.

No deletion, retention, export or delivery tracking exists for either log.

Migration `0006_logs_email_and_staff.sql` needs PostgreSQL 18+ (the shared
`uuidv7()` default) and `pg_trgm`; its extension statement and its triggers
are hand-written additions to the drizzle-kit output.

## Infrastructure and effects

Use PostgreSQL with Drizzle for persistent data and Redis for shared transient state. Redis is required where it holds sessions, rate limits, or verification grants; an outage there must fail the affected protected operation safely, not silently skip its checks. Requests have finite Redis retry and command timeouts while the client may reconnect in the background; Redis remains mandatory, like Postgres.

Presence is advisory and can degrade independently: show that presence is unavailable, expire stale entries after disconnect/heartbeat loss, and permit normal authorized form use. Presence subscription requires staff authorization; avoid leaking raw URL query strings or unrelated page details. Presence is not a locking or save-conflict system.

R2 failures fail uploads without reporting success. Resend failures do not claim that a code or email was sent. Unrelated reads need not fail when those services are unavailable. Development substitutes must be explicit and must not become production success fallbacks.

Database changes that must succeed together use a transaction. For effects outside that transaction, state whether loss is acceptable. Required eventual delivery needs durable retry; best-effort presence does not justify adding a general event bus. R2 and database updates require explicit ordering and cleanup on partial failure, not a claim of cross-service atomicity.

Ordinary users may use the settings pages without 2FA, and may optionally enroll an authenticator there. Already enrolled accounts must complete their login challenge. Setup enrolls the initial administrator. Future administration surfaces retain staff verification requirements. Assign one role per user. Role composition is out of scope; this is a product default, not a Better Auth limitation. Do not expose impersonation, a role editor, bulk operations, or additional plugins merely because a dependency provides them.

## Agent completion defaults

Before implementing a feature, identify its owner, required surfaces, authorization, MCP eligibility and step-up, and existing reusable code. Infer these from accepted requirements and established conventions; ask only about consequential ambiguity.

Complete the requested behavior and necessary integration. Update affected existing interfaces and tools; new tools follow agreed agent workflows. Neither a new module nor a new action implies a new MCP tool, REST endpoint, navigation section, or migration.

Verification should exercise the shared operation's behavior and relevant adapter guarantees. Verify MCP exclusion independently of step-up, and verification despite full admin permissions. For roles, verify consistent decisions across entry points. For utilities, test meaningful semantic cases rather than implementation structure. Verify that non-admin code cannot reach admin-only implementation and that server-only dependencies stay out of browser code.

## Authority, defaults, and exceptions

Architecture is the source for current constraints and defaults; the glossary defines product terms; module READMEs define non-obvious caller contracts; ADRs explain consequential decisions. The short agent instructions route readers to those sources. Current explicit user requirements can revise the design; update the relevant source rather than leaving contradictions.

Hard constraints include policy enforcement, explicit MCP opt-in without step-up, runtime separation, and admin-scope isolation. Current scope constraints include no tenancy and no application REST endpoints. These can change through an explicit scope decision, not an incidental implementation exception.

Defaults include filenames, shared-directory names, internal subdivisions, extraction timing, and the infrastructure choices above. An agent may make a local reversible exception with a concrete reason and appropriate verification. For example, keep an image helper local when its only consumer is one capability, or keep a small definition’s handler as a direct call to its service rather than extracting another helper. An exception to a default cannot weaken a hard constraint.


## Authentication views and bootstrap

`/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, and `/auth/reset-password`
are guest-only. `/auth/email-confirmation?token=…` and
`/auth/email-change/confirm?token=…` work with or without a session.
Sign-up sends a confirmation email and creates a session; verification is not
required to open `/panel`. That page is an empty entry point carrying only its
breadcrumb; account identity and sign-out live in the shell's account menu, and
the settings pages are described under "Account settings". Password reset
revokes sessions and preserves existing 2FA; its completion runs through the
guarded public operation `auth.passwordReset.complete` (the provider's direct
`reset-password` POST is hidden, the emailed link's GET callback is not), so it
shares the account lock with the settings lifecycles and honours the reset
cutoff. Recovery codes replace the second factor, not the password.

`/auth/setup` is available only when the installation table is empty and no users
exist. After setup, the installation row stores the root user's ID and creation
time. There are no setup environment flags, recovery passwords, rate limits, or
second-admin setup paths. Root account replacement is outside the current scope.

Next.js validates this state at server startup and caches it for subsequent
requests. Before setup completes, only the setup page and its static assets are
accessible; other pages redirect there and APIs are blocked. An existing user
without an installation record blocks setup as well as normal application access.
The setup transaction rechecks both tables to reject duplicate submissions.

The setup flow starts in `app/(AuthModule)/_/operations/setup.ts`:
`setupRootAdmin` requires a guest and delegates account creation to
`createRootAdminAccount` in `db/setupService.ts`. The service requires an empty installation table and no users. It binds the existing Better Auth
configuration to a Drizzle transaction and calls the server-only `createUser` API.
Better Auth owns IDs, password hashing and credential records. An advisory lock
serializes competing submissions; account creation and the installation marker
commit together. No custom TOTP secret, challenge cookie or Redis enrollment
record exists.

The admin initially has `twoFactorRequired=true` and `twoFactorEnabled=false`.
Password sign-in creates a Better Auth session restricted by application policy
to enrollment, sign-out and email confirmation. `/auth/enroll` uses provider
`twoFactor.enable({ method: "totp" })` and `verifyTotp`; recovery codes appear after
verification. Interrupted enrollment can restart after sign-in even with
the initial setup page closed. Subsequent logins use Better Auth's factor challenge and
single-use recovery codes. Ordinary users have no enrollment UI.

The HTTP auth boundary keeps admin operations and factor settings private, and
hides the provider's account and session management endpoints (`update-user`,
`change-password`, `change-email`, `list-sessions`, `revoke-session`,
`revoke-sessions`, `revoke-other-sessions`, `reset-password` POST): the
application's guarded operations own validation, password and step-up checks
and lifecycle coordination for them. Over HTTP, `two-factor/enable` and
`two-factor/verify-totp` serve required enrollment only; `verify-backup-code`
serves anonymous sign-in only. Provider login challenges and recovery remain
available; sign-up, sign-in, sign-out, request-password-reset and ordinary email
verification are unchanged.
Official shadcn components use Radix primitives and prefixed Tailwind utilities;
theme tokens are document-level and the reset is scoped to `.app-ui` (see
"Application shell and dashboard access"). Each form has its own component and hook, React Hook
Form uses shared Zod schemas, and every exported schema has a matching
capitalized `z.infer` type. Server Actions directly export
`toServerAction(definition)` with inferred types (for example
`setupRootAdminAction = toServerAction(setupRootAdmin)`), as
verified against the installed Next.js compiler.
