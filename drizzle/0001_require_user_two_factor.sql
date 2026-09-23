ALTER TABLE "user" ADD COLUMN "two_factor_required" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "user" SET "two_factor_required" = true
WHERE string_to_array(COALESCE("role", ''), ',') && ARRAY['admin', 'moderator'];
