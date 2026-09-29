# Design evidence

These observations explain the problems the architecture addresses. Source implementations are evidence, not requirements to preserve their structure.

## Unwanted behavior

- Agents created MCP tools without a useful agent workflow.
- Agents sometimes implemented only actions when the requested public functionality needed a REST interface. The lesson is explicit surface selection; REST is outside the present application scope.
- Technical helpers were modeled as business modules, while useful shared functions remained difficult to discover.

## Repository observations

Inspected source: `/Users/lukaszrzasa/WebstormProjects/torzeszowapi-2-agent`.

- `CLAUDE.md` requires MCP changes with every feature, while the Comments README explicitly omits module MCP tools. This conflict motivates workflow-based selection and explicit registration.
- Assets combines image encoding, upload restrictions, and media usage tracking. Technical reuse and business ownership are separate concerns; the entire capability is not a utility.
- Metrics contains product-specific subjects and dimensions alongside counting infrastructure. Global use does not remove product policy.
- Module `_` files are imported across capabilities. Direct cross-module imports are permitted; module encapsulation checks are deferred. Admin-only scope remains a separate restriction.

Inspected starter: `/Users/lukaszrzasa/WebstormProjects/next-x-betterauth-x-mcp-template`.

- One Better Auth instance consumes shared role definitions. The custom admin bypass and plugin evaluation still need matching semantics.
- The action builder centralizes validation, authorization and verification, but its session-based identity path does not establish MCP identity automatically.
- Redis holds authentication state and verification data. Treating every Redis operation as optional would undermine those guarantees.
- Multiple step-up pools add policy complexity. One fixed verification window provides a simpler default.

## External references

- [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure): underscore-prefixed folders are excluded from routing, not from imports.
- [Better Auth two-factor authentication](https://better-auth.com/docs/plugins/2fa): passwordless sign-in methods are not challenged by login 2FA by default. Password sign-in avoids inheriting that additional policy path.

## Alternatives considered

- Separate `src/modules` placement was rejected in favor of capability colocation under `app`.
- Explicit permission grants for admin were rejected in favor of unrestricted administrative authority.
- Automatic tool parity with actions was rejected in favor of selected workflows.
- Browser approval for sensitive MCP operations was rejected: those operations are unavailable through MCP.
- A complete media library, dirty-state presence, and edit locks were excluded to keep the requested scope focused.

## User administration list: scale check (2026-09-25)

Setup: disposable database `app_scale` on PostgreSQL 16.13 (Ubuntu package),
seeded with 100,000 synthetic users (14×14 international name combinations,
three email domains, ~7% null role, 1% moderator, 0.1% admin, 4% banned with a
mix of permanent, future and expired expiries), `ANALYZE` run, migrations
0000–0004 applied. Hardware: 2 vCPU Intel Xeon @ 2.80GHz, 7 GB RAM, sandbox
container; all reads served from shared buffers (warm cache). Timings are
representative of plan shape, not an SLA. The SQL below is exactly what
`usersQueryService.ts` emits (captured with `log_statement = 'all'`).

| Query | Plan | Time |
| --- | --- | --- |
| A. default first page (created_at desc), count | Seq Scan on "user" | 10.645 ms |
| A. default first page (created_at desc), rows | Index Scan Backward using user_admin_created_at_id_idx | 0.039 ms |
| B. selective substring search "lovelace 4242", count | Bitmap Index Scan on user_admin_name_trgm_idx, Bitmap Index Scan on user_admin_email_trgm_idx, Bitmap Index Scan on user_pkey | 0.776 ms |
| B. selective substring search "lovelace 4242", rows | Sort Method: quicksort, Bitmap Index Scan on user_admin_name_trgm_idx, Bitmap Index Scan on user_admin_email_trgm_idx, Bitmap Index Scan on user_pkey | 0.528 ms |
| C. short search "ab", count | Seq Scan on "user" | 71.848 ms |
| C. short search "ab", rows | Sort Method: quicksort, Seq Scan on "user" | 72.216 ms |
| D. combined filters role=moderator, verified=no, status=banned, count | Seq Scan on "user" | 13.847 ms |
| D. combined filters, rows | Index Scan Backward using user_admin_created_at_id_idx | 0.772 ms |
| E. sort by name asc, first page | Index Scan using user_admin_lower_name_id_idx | 0.055 ms |
| F. sort by email desc, first page | Index Scan Backward using user_admin_lower_email_id_idx | 0.033 ms |
| G. deep page: email desc, page 3000 of 4000 (offset 74975) | Index Scan Backward using user_admin_lower_email_id_idx | 44.417 ms |
| H. deep page: created_at desc, last page (offset 99975) | Index Scan Backward using user_admin_created_at_id_idx | 21.457 ms |
| I. search with wildcard characters treated literally: "%_" matches nothing | Seq Scan on "user" | 68.013 ms |
| J. exact ID match (the sequential scan is the test's own sub-select locating an ID) | Seq Scan on "user", Bitmap Index Scan on user_admin_name_trgm_idx, Bitmap Index Scan on user_admin_email_trgm_idx, Bitmap Index Scan on user_pkey | 3.309 ms |

Observations:

- Default first page, name sort and email sort use the `user_admin_*` B-tree
  indexes as ordered scans: constant work for the first pages.
- A selective substring search (`lovelace 4242`) uses both trigram indexes and
  the primary key in a `BitmapOr`, under 1 ms. Non-ASCII search text
  (`rząsa 10`) takes the same path.
- A two-character search (`ab`) cannot use trigrams (three characters are
  needed) and falls back to a sequential scan of the 1,628-page table
  (~70 ms here). This is the documented pg_trgm limitation; the feature keeps
  literal substring semantics rather than rejecting short queries. The
  5-second statement timeout bounds it on larger tables.
- Search text made only of escaped wildcard characters (`%_`) is matched
  literally, returns nothing, and also scans sequentially for the same reason.
- Combined role/verified/status filters count with a sequential scan
  (~14 ms): there is no index on role tokens or ban state by design; the page
  itself is served through the created-at index with a filter.
- Deep OFFSET pages walk the index to the offset (page 3,000 by email:
  ~44 ms and 17,285 buffers; the last created-at page: ~21 ms). Numbered
  pagination with LIMIT/OFFSET is the accepted first-release trade-off; the
  cost grows linearly with the offset.
- The exact count for every page is a full index or table scan (~10 ms at
  this size) and grows with data volume.

Full `EXPLAIN (ANALYZE, BUFFERS)` output is in
`docs/evidence/admin-users-explain-2026-09-25.txt`.

## Logs lists: scale check (2026-09-27)

Setup: disposable database `app_scale` on PostgreSQL 18.4 (embedded-postgres
build), migrations 0000–0006, seeded directly in SQL (synthetic, never
through the recorders and never in an application database) with 100,000
`email_log` rows - 90,000 initial attempts over 365 days (~64% accepted, 18%
failed, 9% unknown, 9% sending; 5,000 recipients, 80% with a user ID, five
subject templates) plus 10,000 retries forming attempt 2 of 10,000 chains.
`ANALYZE` run. Hardware: 2 vCPU
Intel Xeon @ 2.10GHz, 7 GB RAM, sandbox container; `work_mem` 4MB,
`shared_buffers` 128MB; warm cache. The SQL is exactly what the admin query
services emitted through their guarded operations (captured with
`log_statement = 'all'`). Timings are representative of plan shape, not an
SLA.

| Query | Plan | Time |
| --- | --- | --- |
| E1. email default (30 days, newest first), count | Index Only Scan using email_log_started_at_id_idx | 1.731 ms |
| E1. email default, rows | Index Scan using email_log_started_at_id_idx | 0.103 ms |
| E2. email selective search "Template 42" (all time), count | Bitmap Index Scan on email_log_search_text_trgm_idx | 4.991 ms |
| E2. email selective search, rows | top-N heapsort, Bitmap Index Scan on email_log_search_text_trgm_idx | 4.743 ms |
| E3. email two-character search "pe" (all time), count | Seq Scan on email_log | 137.385 ms |
| E3. email two-character search, rows | Index Scan using email_log_started_at_id_idx (filter) | 0.126 ms |
| E4. email exact recipient (all time), count | Index Only Scan using email_log_recipient_email_started_at_id_idx | 0.080 ms |
| E4. email exact recipient, rows | quicksort, Bitmap Index Scan on email_log_recipient_email_started_at_id_idx | 0.144 ms |
| E5. email exact recipient user ID (all time), count | Index Only Scan using email_log_recipient_user_started_at_id_idx | 0.065 ms |
| E5. email exact recipient user ID, rows | quicksort, Bitmap Index Scan on email_log_recipient_user_started_at_id_idx | 0.191 ms |
| E6. email status failed (30 days), count | Index Only Scan using email_log_status_started_at_id_idx | 0.220 ms |
| E6. email status failed, rows | Index Scan using email_log_status_started_at_id_idx | 0.119 ms |
| E7. email deep page 3000 of 4000 (all time), count | Index Only Scan using email_log_chain_attempt_idx | 12.756 ms |
| E7. email deep page 3000, rows | external merge sort, Parallel Seq Scan on email_log | 115.209 ms |
| E8. email detail, row | Index Scan using email_log_pkey | 0.057 ms |
| E8. email detail, chain count | BitmapOr of email_log_pkey and email_log_chain_attempt_idx | 0.087 ms |
| E8. email detail, chain page | quicksort, BitmapOr of email_log_pkey and email_log_chain_attempt_idx | 0.104 ms |

Observations:

- The default 30-day pages, the status filter and every exact lookup
  (recipient, recipient user) are served by the documented
  `(…, time DESC, id DESC)` indexes, as ordered scans or small bitmap scans:
  well under a millisecond for rows, a few milliseconds for the 30-day count.
- Selective metadata search uses the `search_text` trigram indexes (~5 ms).
  A two-character search cannot use trigrams and counts with a sequential
  scan (~140 ms here), the same documented `pg_trgm` limitation as the user
  list; literal substring semantics are kept rather than rejecting short
  queries, and the 5-second statement timeout bounds larger tables.
- The email retry chain is a `BitmapOr` of the primary key and the unique
  `(original_log_id, attempt_number)` index.
- Deep OFFSET pages grow linearly with the offset. At page 3,000 of all-time
  email logs the planner prefers a parallel sequential scan with a disk sort
  (~115 ms, `work_mem` 4MB) over walking 75,000 index entries. Numbered
  pagination remains the
  accepted first-release trade-off, and the default 30-day window keeps
  ordinary pages small.
- Unfiltered all-time counts are full index-only scans (~13 ms at this
  size) and grow with the data.

Full `EXPLAIN (ANALYZE, BUFFERS)` output is in
`docs/evidence/logs-explain-2026-09-27.txt`. That run also measured an
`audit_log` table, which the staff log has since replaced; its sections of
the file describe a table that no longer exists. The staff log's queries
(`staff_log`, the same index shapes) have not been measured at scale.
