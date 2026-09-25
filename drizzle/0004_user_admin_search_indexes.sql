-- Search and sort indexes for the user administration list (app/(AuthModule)/admin/users).
--
-- Prerequisite: the pg_trgm extension. The migration installs it when the role
-- may (superuser or a role with CREATE on the database); otherwise it fails
-- loudly rather than silently leaving the trigram indexes out - install the
-- extension first with a privileged role and re-run.
--
-- Index creation here is transactional, which takes a write lock on "user"
-- for the duration. On an already-large live deployment, apply this migration
-- in a maintenance window or replace it with a separately reviewed
-- CREATE INDEX CONCURRENTLY script run outside a transaction; do not put
-- CONCURRENTLY inside this file.
--
-- These indexes are hand-written and must be preserved when the auth schema
-- is regenerated: drizzle-kit does not know about them.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "user_admin_name_trgm_idx" ON "user" USING gin (lower("name") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "user_admin_email_trgm_idx" ON "user" USING gin (lower("email") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "user_admin_created_at_id_idx" ON "user" ("created_at", "id");
--> statement-breakpoint
CREATE INDEX "user_admin_lower_name_id_idx" ON "user" (lower("name"), "id");
--> statement-breakpoint
CREATE INDEX "user_admin_lower_email_id_idx" ON "user" (lower("email"), "id");
