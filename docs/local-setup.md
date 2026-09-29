# Local Setup & Validation

> **Getting this running is simple. Validating its security guarantees is rigorous.**

This guide covers the standard local environment setup for `local-setup.md`, but more importantly, it outlines the strict bootstrapping and validation rules designed to prevent unauthorized access and regressions.

## 1. Quick Start

The stack relies on **Bun**, **Docker**, and standard environment variables.

1. Start local dependencies (PostgreSQL, Redis): `docker compose up -d`
2. Apply database migrations: `bun run db:migrate`
3. Install dependencies: `bun install`
4. Start the development server: `bun run dev` (opens [localhost:3000](http://localhost:3000))

*Ensure `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` are configured in your deployment environment.*

## 2. The Zero-Backdoor Bootstrap

How do you securely initialize an empty system? I opted for a strict, one-time bootstrap phase.

On a fresh installation, navigate to `/auth/setup` to create the root administrator. Once this account's ID is written to the installation table, **the setup endpoint is permanently locked.**

*   **No backdoors:** There are no setup environment flags, no hardcoded recovery passwords, and no secondary bootstrap paths.
*   **Fail-safe:** If any user exists in the database, setup is instantly blocked.
*   **Cached security:** Setup status is validated at server start and cached. The setup transaction rechecks the database atomically before committing to prevent race conditions.

## 3. Mandatory MFA & Account Security

Security isn't just about logging in; it's about the entire account lifecycle.

*   **Strict Enrollment:** The root admin (and any mandated staff) must complete Better Auth authenticator enrollment (`/auth/enroll`). If enrollment is interrupted, the system forces resumption on the next sign-in.
*   **Progressive Degradation:** Existing staff without an enrolled factor are heavily restricted. They can only access the enrollment flow, sign-out, and required email confirmations.
*   **Advanced Settings:** The `/settings` dashboard handles complex security state, including session revocation (`session_revocation_pending`) and security versioning (`security_version`). Selecting "Sign out other devices" during a password change is strictly enforced via database state.

## 4. Production-Ready Database Migrations

Migration `0004_user_admin_search_indexes.sql` introduces the `pg_trgm` extension for robust administration search indexing.

*Note on scaling:* The migration installs the extension transactionally. For massive, live `user` tables in production, this should be executed during a maintenance window or replaced with a reviewed `CREATE INDEX CONCURRENTLY` script to prevent table locks.

Migration `0006_logs_email_and_staff.sql` adds the `email_log` and `staff_log` tables behind `/admin/email-logs` and `/admin/staff-logs` (admin only). It requires **PostgreSQL 18+** (the shared `uuidv7()` ID default, as in `compose.yml`) and `pg_trgm`. Its extension statement and its triggers are hand-written additions to the drizzle-kit output; keep them when regenerating. The contracts are in [`app/(LogsModule)/_/README.md`](../app/(LogsModule)/_/README.md). A database that already applied an earlier, uncommitted version of migration 0006 (with `audit_log`) must be reset before migrating.

## 5. Enterprise-Grade Validation

**"A skipped suite is not evidence."**

I rely on isolated integration testing rather than just unit tests. Run the standard suite via `bun run test`, `bun run lint`, `bun run typecheck`, and `bun run build`.

**Deep Integration Testing:**
*   When `DATABASE_URL` is present, the setup integration suite runs. It creates and drops an **isolated PostgreSQL schema** to test atomic bootstrapping, concurrent submissions, and provider 2FA compatibility without polluting application tables.
*   When `TEST_DATABASE_URL` and `TEST_REDIS_URL` are provided, the user-administration and account-settings suites execute against completely distinct, isolated databases.
*   The logs integration suite needs only `TEST_DATABASE_URL` (a test-only PostgreSQL 18 database): it runs the email recorders and the staff log with genuine contexts, the migration's constraints and triggers, concurrency and redaction checks, and the admin reads.
*   If isolation cannot be guaranteed (e.g., missing test DB variables), the test runner explicitly skips these suites and logs a warning. False positives are worse than failed tests.