# Logs

Two logs, both admin-only to read, in the sidebar's **System** category
(which is navigation, not module ownership):

- the **staff log** at `/admin/staff-logs`: what staff changed;
- the **email log** at `/admin/email-logs`: every email the application sent.

This file holds the caller contracts; the architecture document owns the
rules they follow, and ADR 0003 the reasons for the staff log's shape.

## Layout

| Path | What it is |
| --- | --- |
| `_/routes.ts` | `logsRoutes.staffLogs`, `logsRoutes.emailLogs` (admin only) |
| `_/staffLog/blocks.ts` | The message blocks, their builders, `messageText` |
| `_/staffLog/schema.ts` | Entry and block schemas, the tolerant block reader |
| `_/db/staffLogService.ts` | `recordStaffLog` |
| `_/types.ts`, `_/schema.ts`, `_/redaction.ts`, `_/derivation.ts` | Email log contracts, content policy and derived values |
| `_/db/emailLogService.ts` | `beginEmailLog`, `completeEmailLog` |
| `admin/_/…` | List schemas, URL codecs, read services, the guarded reads, tables, the email dialog, `StaffLogWidget` |
| `src/lib/db/schema/logs.ts` | `staff_log`, `email_log`; migration `drizzle/0006_logs_email_and_staff.sql` |

## Staff log

One entry per staff action that **succeeded** and **changed something**.
Refused or failed attempts, actions of users on their own account, and
actions that only send an email are not entries.

An entry is who acted, a stable action key, the resource acted on, and a
message:

| Column | Meaning |
| --- | --- |
| `actor_id` | The staff member. A real reference to `user`; their name is read when the log is shown |
| `action` | A key such as `user.banned`, for filtering. Never rendered as the message |
| `resource_type`, `resource_id` | What was acted on. No foreign key: any module's resource fits |
| `message` | The blocks below |
| `message_text` | The message as plain text, derived on write, for search |

Entries are append-only: the database refuses to update or delete one.

### Writing an entry

```ts
import { recordStaffLog } from "@/app/(LogsModule)/_/db/staffLogService";
import { date, text, user } from "@/app/(LogsModule)/_/staffLog/blocks";

await recordStaffLog(ctx, {
  action: "user.banned",
  resource: { type: "user", id: target.id },
  message: [text("Banned "), user(target), text(" until "), date(expires)],
});
```

- Call it from the service that performed the action, after the action is
  confirmed, with the context that service received. The actor is
  `ctx.user` and cannot be passed in.
- One staff action is one entry. What the action caused (sessions signed
  out, pending requests cancelled) belongs in its sentence, or nowhere.
- It throws `StaffLogError` when the entry is invalid or cannot be stored.
  The action already happened, so the caller does not undo it: it tells the
  staff member that the change was made but not logged. User administration
  does this with the `unrecorded` flag of its outcome
  (`app/(AuthModule)/admin/_/db/users/staffLog.ts`).
- The write is its own statement, outside the caller's transaction.

### Message blocks

A message is an ordered array of blocks that reads as one sentence. Text
blocks carry their own spacing.

| Block | Shape | Builder |
| --- | --- | --- |
| `text` | `{ value }` | `text("Banned ")` |
| `user` | `{ id, label }` | `user({ id, name })` |
| `date` | `{ value }`, an ISO 8601 UTC instant | `date(expires)` |
| `url` | `{ href, label }`, http(s) or an application path | `url(href, label)` |
| `value` | `{ value }`, a name, an address, a reason | `value(reason)` |

**Blocks are snapshots.** Each carries everything needed to show it, taken
when the action happened. Rendering is one loop over the array, with no
relation, lookup or further call. A `user` block shows the name it was
given, and links to the user's page for the current state. Give it the
account as it is *after* the action.

**Blocks are generic.** A new action composes the existing blocks and
changes nothing in this module. Do not add a block per action. A new block
type is for a new *kind of thing to show* and is added in three places
together: the `StaffLogBlock` union, `staffLogBlockSchema`, and the switch in
`admin/_/components/staffLogs/StaffLogMessage.tsx`.

**The logs module is the only place that knows blocks.** Its renderer may
import another module's routes to build a link (as it does for `user`);
other modules never render blocks themselves.

Limits: 1-50 blocks; text and values up to 4,000 characters; labels up to
200; no control characters (`value()` folds line breaks into spaces). A
stored block this release cannot read is shown as "[unsupported content]" in
its place.

### Reading

`listStaffLogsOperation` (`logs.staff.list`) serves the list page and every
widget. It is `roles: ["admin"]`, not MCP-eligible, without step-up; a
moderator or user is answered NOT_FOUND. Filters combine with AND:

| Filter | Meaning |
| --- | --- |
| `q` | Case-insensitive substring of the message text |
| `range`, `from`, `to` | As for the email log, below |
| `actorId` | The staff member who acted |
| `actions` | Any of up to 20 action keys; empty is every action |
| `resourceId` | The resource acted on. The ID alone is enough |
| `resourceType` | Every resource of one kind. Never needed beside an ID |

Entries come newest first. The only join is to `user`, for the actor's
current name.

**The list page** keeps its state in the URL (`q`, `range`, `from`, `to`,
`actor`, `action`, `resourceId`, `page`, `pageSize`), so a view can be linked.
`resourceId` has no control; it arrives from a link.

**The widget** embeds the log in another module's admin page:

```tsx
import { StaffLogWidget, useCanViewStaffLog } from "@/app/(LogsModule)/admin/_/components/staffLogs/StaffLogWidget";

<StaffLogWidget resourceId={invoice.id} />
<StaffLogWidget actorId={member.id} action={["user.banned", "user.ban.updated"]} />
```

| Prop | Meaning |
| --- | --- |
| `resourceId` | Everything done to this resource |
| `actorId` | Everything this staff member did |
| `action` | One action key, or several |
| `revision` | Any value that changes when the log may have grown; the widget reads again |
| `label` | Names the list for assistive technology |

The widget has its own search and pagination, held in component state and
never in the URL, so it cannot collide with the page around it or with a
second widget. For a viewer who may not read the staff log it renders
nothing and reads nothing. Use `useCanViewStaffLog()` to leave out the
heading or tab around it as well. The user detail page mounts it this way
(`UserStaffLogSection`).

### Entries written today

All by user administration, with `resource_type` `user`:

| Action | Message |
| --- | --- |
| `user.name.updated` | Changed name from `old` to **user** |
| `user.email.updated` | Changed email of **user** from `old` to `new` |
| `user.banned` | Banned **user** until **date** (or "permanently"). Reason: `reason` |
| `user.ban.updated` | Updated ban of **user**: until **date**. Reason: `reason` |
| `user.unbanned` | Unbanned **user** |
| `user.sessions.revoked` | Signed out all sessions of **user** |
| `user.sessions.retried` | Retried session sign-out (or session refresh) for **user** |

A sign-out or retry that could not be confirmed is not an entry.

## Email log

Every email the application sends records one attempt. The requester and
recipient are event-time snapshots without foreign keys.

```ts
type LogContext = AuthedCtx | PublicCtx;
type RecordResult = { id: string; duplicate: boolean };

beginEmailLog(ctx, input: BeginEmailLogInput): Promise<RecordResult>;
completeEmailLog(ctx, input: CompleteEmailLogInput): Promise<RecordResult>;
```

Server-only services, called by `sendEmail` with the genuine context of the
enclosing operation. They are not Server Actions, MCP tools or HTTP
endpoints.

**Requester.** Derived from `ctx` alone: an authenticated context records
`{ kind: "user", id: ctx.user.id, label: ctx.user.name }` (redacted, clipped
to 200 characters, "Unnamed user" when empty); a public context records
`Anonymous` with no ID. Input cannot set or override it.

### Attempts

`BeginEmailLogInput`: `recordKey`, optional `startedAt`, `recipientEmail`
(stored trimmed and lowercase), optional `recipientUserId` /
`recipientLabel`, `subject`, `contentText` (plain text the sender rendered;
never HTML or a React node - ≤ 128 KiB), optional `provider`, optional
`previousAttemptId`, and `secrets`. The attempt starts as `sending`; nothing
is sent.

`CompleteEmailLogInput`: `id`, `status` (`accepted` | `failed` | `unknown`),
optional `completedAt`, `providerMessageId`, `errorCode`, `errorMessage`,
`stackTrace`, and `secrets`.

- From `sending` any of the three is recorded. `accepted` means the provider
  took the message, not that it reached an inbox.
- The identical completion again returns `duplicate: true`; a different one
  for a terminal row is `COMPLETION_CONFLICT` and overwrites nothing.
- `unknown` may be resolved **once** to `accepted` or `failed`. The
  resolution replaces the diagnostics with exactly what it supplies (an old
  timeout is not kept as the failure's cause), keeps the provider message ID
  unless it supplies one, and moves `completed_at` / `updated_at`.
- Once `unknown` is resolved, the resolution is the recorded observation:
  a late replay of the earlier `unknown` completion is `COMPLETION_CONFLICT`,
  not a duplicate. A caller retrying its completion call should treat that
  conflict as "already recorded" after re-reading the row if it matters.
- A row left in `sending` is never converted; after 15 minutes the dialog
  says that no completion was recorded, and it stays filterable as sending.

Retries: pass the chain's **latest** attempt as `previousAttemptId`. The
recorder locks the chain's original row, rechecks the key, requires the
predecessor to be the latest attempt (`STALE_PREDECESSOR` otherwise) and the
recipient email and user ID to be the original's (`RECIPIENT_MISMATCH`; a
different recipient is a new chain), then allocates the next attempt number.
Competing retries serialize; exactly one wins. Subject and body may differ,
because a resend regenerates its tokens. The module never generates tokens,
chooses templates or reconstructs an email from redacted content.

A redacted attempt as stored:

```json
{
  "recipientEmail": "alice@example.test",
  "recipientUserId": "user-42",
  "recipientLabel": "Alice",
  "subject": "[REDACTED] is your verification code",
  "contentText": "Your verification code is [REDACTED].\nConfirm: [REDACTED]",
  "status": "accepted",
  "provider": "resend",
  "attemptNumber": 2,
  "originalLogId": "01900000-0000-7000-8000-000000000001",
  "previousAttemptId": "01900000-0000-7000-8000-000000000001",
  "requester": { "kind": "user", "id": "user-42", "label": "Alice" }
}
```

### Idempotency

Every email log write is keyed. `record_key` is unique in the database (not checked by a
racy lookup first) and `input_digest` is the SHA-256 of the canonical
(key-sorted) *sanitized* payload: the caller's semantic fields including a
supplied predecessor and any supplied timestamp, plus the requester
kind and ID. It excludes `ctx.requestId`, context-derived names, generated
IDs and timestamps, attempt numbers, previews, search documents and
secrets. So a retried request (a new request ID, a renamed actor) gets the
original ID back with `duplicate: true`, while another actor, or any other
payload, under the same key is `RECORD_KEY_CONFLICT`. The first recording's
snapshots stay. Completions fingerprint only the log ID and the sanitized
observation.

Keys are visible ASCII, 1-200 characters. Derive them from the business
event, or a UUID the operation generated once and reused on retry.

### Errors

Recorders throw only `LogRecordingError` (`code`, `issues`), never with a
`cause`, and with fixed messages: `INVALID_RECORD`, `RECORD_KEY_CONFLICT`,
`NOT_FOUND`, `STALE_PREDECESSOR`, `RECIPIENT_MISMATCH`,
`COMPLETION_CONFLICT`, `STORAGE_FAILED`. Issues name paths and codes (a
database failure keeps only its SQLSTATE and constraint name), never values,
so a failure logged through the action builder's cause chain cannot leak
content or secrets.

**The caller decides the failure policy.** This module does not decide
whether sending fails when recording fails; `sendEmail` writes the failure
to the application log and still sends. Never record a recorder failure
through the recorder.

Recording runs in its own statements, not inside the caller's transaction.

## Redaction

Both email recorders take a required `secrets: Record<string, string |
readonly string[]>` - `{}` when there are none. Keys are semantic labels
(`verificationCode`, `resetUrl`); values are the exact sensitive strings and
any other rendered forms of them. They live in memory for the call only and
are never stored, hashed into a digest, logged or returned.

Before anything is persisted, previewed, indexed or hashed:

1. Input is bounded first (512 KiB of JSON for the whole record, secrets
   included), then validated (errors never echo input): 128 KiB of email
   text, 128 KiB of stack input. Oversize input is rejected, never stored partially.
2. Declared secrets (≤ 100 values, ≤ 8 KiB each) and their
   `encodeURIComponent` and HTML-escaped forms become `[REDACTED]`. Matching
   is literal and removes every character any occurrence covers, so
   overlapping secrets leave nothing behind.
3. Every http(s) and mailto URL becomes `[REDACTED LINK]`, declared or not;
   surrounding punctuation stays. An apostrophe inside a URL is part of it.
4. Values under denied keys (`password`, `currentPassword`, `newPassword`,
   `token`, `accessToken`, `refreshToken`, `secret`, `otp`, `code`,
   `authenticatorCode`, `recoveryCode`, `recoveryCodes`, `backupCodes`,
   `authorization`, `cookie`, `sessionToken`; compared case-insensitively without separators, exact
   names only) become `[REDACTED]` whatever their type. A number whose
   digits contain a declared secret is replaced whole.
5. The sanitized record is validated again; stacks are then cut to 32 KiB
   and error messages to 4,000 characters, with a marker, on code-point
   boundaries - after redaction, so a cut cannot expose part of a token.

Display fields (subject, body, labels, error code/message/stack) are
rewritten. Structural fields (record keys, recipient email, every ID,
provider) are validated, never rewritten: a declared secret in one of
them rejects the record (`INVALID_RECORD`, `sensitive_value`).

**Producer responsibility.** Nothing blanks six-digit numbers by pattern
(IDs, dates and counts look the same), and the module cannot recognize an
undeclared secret or an encoding it does not know. The integration must
declare every code, token and link it put into the content - including the
forms that appear in a subject or a provider's error text. Known hazards:
verification codes appear in subjects as well as bodies; confirmation URLs
appear in buttons and in fallback text; provider exceptions repeat the
subject or URL. Test each producer against its real templates.

For thrown values use `serializeErrorForLog(error, secrets)`: it reads only
`name`, `message` and `stack` along at most five `cause` levels (omitting,
not cutting, any part over 16 KiB), redacts them, and returns
`{ errorMessage, stackTrace }` for the recorder. It never serializes other
properties of a provider error. Recorders accept no `Error` objects.

## Email integration

`sendEmail` (`src/lib/email/send.ts`) is the application's only way to send
mail. It renders the message once (the HTML sent and its plain-text form,
which is also what the log keeps), begins an attempt, calls Resend and
completes the attempt with what came back: `accepted` with the provider's
message ID; `failed` when the provider answered with a refusal or nothing
left the application (no API key); `unknown` when no answer came back (no
HTTP status, a thrown transport fault), because the message may or may not
have been accepted. Each message function in `src/lib/email/index.tsx`
declares its secrets - the token, the link built from it, the code - and
the recipient account. The requester is the enclosing operation's context
(the admin who asked for a verification email), found through
`currentOperationContext()` because Better Auth calls the email hooks
without one; a message Better Auth sends from its own endpoints (sign-up,
forgot password, the sign-in code) has no operation and is requested
anonymously. A log write that fails is written to the application log and
the email is still sent; a delivery failure still throws
`EmailDeliveryError` to the caller, whose flow already handles it.

Diagnostics never carry a query's bound parameters: `serializeErrorForLog`
(and the application log, through `describeErrorSafely` in
`src/lib/errorMessage.ts`) keep the statement of a query error and replace
its parameters, which hold values no caller could declare (password
hashes, token digests).

Not part of this module: sending or resending from the dialog, provider
webhooks and delivery tracking, retention.

## Database

`staff_log` and `email_log` (see `src/lib/db/schema/logs.ts`). IDs use the
shared `uuidv7()` default, which needs **PostgreSQL 18+** (the repository
baseline in `compose.yml`); trigram search needs **`pg_trgm`**, installed by
0004 and ensured again by 0006. Timestamps are `timestamptz`; neither table
uses the generic auto-updating `updatedAt`.

Three hand-written triggers, unknown to drizzle-kit (keep them when
regenerating): one makes an email attempt's initiation snapshot immutable
and its status move only `sending → accepted | failed | unknown` and
`unknown → accepted | failed`; two refuse any update or delete of a staff
log entry. Database checks enforce the email log's vocabularies, chain shape
and size limits, and the staff log's action format and nonempty message.
`staff_log.actor_id` and the email chain references are `ON DELETE
RESTRICT`. There is no delete service, retention, purge or export.

## Email list and dialog

Pages are `page(logsRoutes.*, …)`. The email reads in
`admin/_/operations/logQueries.ts` declare `roles: ["admin"]`,
`mcpAllowed: false` and `stepUp: "none"`. The list is SSR (`queries.ts`,
`toServerQuery`); the dialog read is a Server Action (`actions.ts`) because
it loads on demand, and it re-checks access itself.

URL (canonical, defaults omitted; unknown or repeated keys fall back to
defaults and the page redirects after authorization):

| Parameter | Values |
| --- | --- |
| `q` | literal, case-insensitive substring of `search_text`, ≤ 200 characters |
| `range` | `30d` (default), `24h`, `7d`, `90d`, `all`, `custom` with `from` & `to` (`YYYY-MM-DD`, UTC, `to` included); an incomplete or reversed custom range falls back to 30 days |
| `sort` / `direction` | `time` (default) / `desc`; also `recipient`, `subject`; the ID breaks ties in the same direction |
| `page` / `pageSize` | 1-1,000,000 / 10, 25 (default), 50, 100; a page past the end folds onto the last |
| `log` | the dialog's record (UUID); never filters the table |
| `status`, `recipient`, `userId` | exact matches (`recipient` lowercase) |

Filters combine with AND. Relative ranges are elapsed days ending at one
server `asOf` instant per read. Count and page share one repeatable-read,
read-only snapshot with a 5-second statement timeout; the staff log reads
work the same way.

The dialog opens from a real "View details" button (rows are not click
targets). Opening and switching attempts push a history entry with the
native History API (no server round trip); closing replaces the entry
without `log`, so Back does not reopen what was just closed. A record
outside the current filters is shown with a note. Attempt pagination (20
per page) is dialog-local. NOT_FOUND shows "This log is not available"; a
transport or server failure offers Retry (the read only); an authentication
or authorization refusal uses the shared handler and keeps no content.
Content is plain text escaped by React. Copy buttons copy the stored,
redacted value.

Requester and recipient links come from `admin/_/entityNavigation.ts`, and
only when the destination's access rule admits the viewer.

## Verification

`bun run test` includes `tests/logs/*`, `tests/logs-views/lists.test.jsx`
and, for the entries of user administration, `tests/admin-users/*`. The
integration suites need `TEST_DATABASE_URL` naming a test-only PostgreSQL 18
database distinct from `DATABASE_URL`, and skip themselves (saying so)
otherwise. A skipped suite is not evidence.
