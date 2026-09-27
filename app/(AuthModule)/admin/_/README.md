# User administration

`/admin/users` (list) and `/admin/users/[userId]` (detail), served by the auth
module's admin scope. This file records the non-obvious contracts; the
architecture document owns the rules they follow.

## Entry points and authority

- The list lives in the `(list)` route group (`admin/users/(list)/page.tsx`
  with its own `loading.tsx` and `error.tsx`) so that its skeleton and error
  boundary wrap the list only: a `loading.tsx` directly under `users/` would
  also wrap `users/[userId]`, and every detail visit would first flash the
  list skeleton. The URL is unchanged.

- Pages are `page(authRoutes.adminUsers | adminUser, …)`. The route rule admits
  the viewer; every read and mutation then checks its own permissions again.
  Listing (`user.list`) and inspecting (`user.get`) are separate grants: a role
  with one and not the other sees the list without links, or opens a direct
  detail URL without a way back.
- Reads go through `queries.ts`, the trusted `server-render` entry point
  (`toServerQuery`), never through a browser Server Action. Mutations are
  `defineAction` definitions in `operations/`, exported through `actions.ts`
  with `mcpAllowed: false`; nothing here is an MCP tool or an HTTP endpoint,
  and `/api/auth/admin/*` stays blocked.
- Every operation declares `roles: STAFF_ROLES`: to any other account it
  answers NOT_FOUND, as if it did not exist. Permissions combine with AND:
  `user.get` plus `user.update` / `user.set-email` / `user.send-verification` /
  `user.send-password-reset` / `session.revoke` / `user.ban`. Moderators
  receive list, get, update, ban and send-verification by default. Step-up
  (`five_minutes`) applies to the email change and to applying or replacing a
  ban, and to their effect-recovery twins; nothing else.

## Target rules

Evaluated by the pure `evaluateUserAction` in `policy.ts` from freshly loaded
rows and `installation.rootUserId`, on every invocation: root is untouchable by
anyone else; root may only rename themselves, resend their own verification,
request their own reset email and revoke their own sessions; every other actor
is refused actions on their own account; staff targets additionally need
`user.manage-staff`; the last effectively unbanned admin cannot be banned
(counted under the global admin-ban lock, so competing bans cannot both pass).
The detail DTO publishes the same decisions as `capabilities` for presentation
only.

## Data and URL state

DTOs in `types.ts` are explicit projections with ISO 8601 UTC dates; auth rows
are never returned. `queryState.ts` is the list's URL codec: unknown or repeated
parameters fall back to defaults, the page redirects to the canonical form
after authorization, and an out-of-range page folds onto the last one.
`returnTo` on a detail link is accepted only as a relative `/admin/users` URL
whose query survives the codec.

Effective ban status is `banned IS TRUE AND (ban_expires IS NULL OR ban_expires
> asOf)`, evaluated once per read in SQL and in `effectiveAccessStatus`; an
expiry at `asOf` means active, and expired bans are never rewritten by reads.
Search is a literal, case-insensitive substring of name or email (LIKE wildcards
escaped) plus an exact ID match. Count and page share one repeatable-read,
read-only transaction with a 5-second statement timeout.

## Code layout

- `db/users/`: `reads.ts` (list and detail projections), `targets.ts` (fresh
  target load and policy decision), `outcomes.ts` (unchanged / completed /
  partial), `providerErrors.ts`, and one file per capability: `profile.ts`
  (name, email and their retries), `sessions.ts`, `bans.ts`, `emails.ts`,
  `throttle.ts`.
- `hooks/actions/`: one hook per one-click action (`useSendVerification`,
  `useUnbanUser`, the `useRetry*` recoveries, ...), each a thin binding of
  its Server Action to the shared `useUserMutation`, which owns feedback,
  refresh and root's self-sign-out redirect. `hooks/form/` holds the three
  form controllers; `useFeedback` (src/lib/hooks) is the per-section feedback state, rendered by the shared `ActionFeedback`.
- `components/users/`: `list/` (table, columns, filters), `detail/` (header,
  feedback, `sections/`, `forms/`) and the shared `UserBadges`. Each section
  calls the hooks it needs and owns its flow; nothing is aggregated above it.
  Every form (name, email, ban) opens in a modal (`FormDialog` /
  `UserBanDialog`); the sections only show read-only values and buttons.
- Confirmations (sign out everywhere, remove ban, change email) go through
  the imperative `confirm()` of `src/components/feedback/ConfirmDialog`, a
  `react-call` callable mounted once at the app root, so no component keeps
  open/closed state for a yes/no question. The verification modal is the
  other callable.

## Provider consistency

Provider writes use the global `auth` instance (`adminUpdateUser`, `banUser`,
`unbanUser`) with the actor's request headers from `ctx.getRequestHeaders()`;
they are never wrapped in an outer transaction. Short account actions run under
`withUserAccountLock` (`app/(AuthModule)/_/db/userAccountLock.ts`): a
PostgreSQL advisory lock held by a read-only transaction on a dedicated
two-connection pool, with 5-second lock and statement timeouts. Bans first take
the global admin-ban lock. Email is never sent while the lock is held.

Session effects are performed explicitly through
`src/lib/auth/userSessionEffects.ts` and observed: a committed name or unban
refreshes cached user copies, an email change or ban revokes current sessions
and verifies they are gone. The provider's own hooks are best-effort and are
never taken as confirmation. Outcomes are truthful: `unchanged`, `completed`,
or `partial` with `committed` and `failedEffects`; a partial outcome is
recovered through the dedicated `retry*` operations, which re-read the current
target and never replay the failed request's values. No SQL/Redis/email
atomicity is claimed.

An administrative email change writes `email`, `emailVerified: false` and the
server-owned `passwordResetInvalidBefore` in one provider update; the
`resetTokenPolicy` before-hook then refuses reset links issued at or before
that instant. Before that write, and before a ban's, the target's pending
account-settings state is retired under the same lock
(`retirePendingSecurityState` in the module-wide settings services: pending
email change/correction requests, staged authenticator setups, and a
security-version increment that invalidates the target's step-up grants); a
failure there blocks the mutation. The session authority now refuses an
effectively banned account outright, so a banned admin's session cannot act
at all.

The two email actions are throttled in Redis (60 seconds per target and action,
20 attempts per actor per 10 minutes) and fail closed when Redis is down.

## Scope exceptions

The detail forms ship without editing presence, stale-edit detection or
optimistic concurrency: name and email are saved separately, last committed
write wins, and the lock only serializes security invariants. There is no user
creation, deletion, role editor, avatar editing, impersonation or bulk action.

## Migrations and prerequisites

`0003_user_password_reset_cutoff.sql` adds the cutoff column (the installed
Better Auth CLI, 1.4.21, generates `timestamp("password_reset_invalid_before")`
for the field but also rewrites the session table for the secondary-storage
setup, so the schema file was edited by hand to that output instead of being
regenerated wholesale). `0004_user_admin_search_indexes.sql` requires the
`pg_trgm` extension and creates the `user_admin_*` indexes transactionally;
apply it in a maintenance window on a large live table or replace it with a
reviewed `CREATE INDEX CONCURRENTLY` script. Preserve these indexes when the
auth schema is regenerated.

## Verification

`bun run test` runs the policy, codec, operation, page, table and view suites
and the provider integration suite. The latter runs only against isolated
services: set `TEST_DATABASE_URL` and `TEST_REDIS_URL` to test-only PostgreSQL
and Redis databases (they must differ from `DATABASE_URL` and `REDIS_URL`; the
suite refuses otherwise and skips when unset). The database needs `pg_trgm`.
Scale evidence for the list queries is recorded in `docs/evidence.md`.
