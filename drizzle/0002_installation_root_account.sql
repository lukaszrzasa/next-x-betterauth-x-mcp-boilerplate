CREATE TABLE "installation" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"root_user_id" text NOT NULL,
	"initialized_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "installation" ADD CONSTRAINT "installation_root_user_id_user_id_fk" FOREIGN KEY ("root_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;