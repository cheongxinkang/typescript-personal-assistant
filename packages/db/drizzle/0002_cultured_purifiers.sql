CREATE TABLE "projects" (
	"row_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_date" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"task_generation_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"row_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"estimated_minutes" integer,
	"deadline" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP VIEW "public"."events_current";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "duration_minutes" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "parent_event_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "part_index" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "moved_from_event_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "actual_minutes" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_project_id_idx" ON "projects" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_task_id_idx" ON "tasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_project_id_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "events_task_id_idx" ON "events" USING btree ("task_id");--> statement-breakpoint
CREATE VIEW "public"."projects_current" AS (select distinct on ("projects"."project_id") "row_id", "project_id", "user_id", "title", "description", "target_date", "status", "task_generation_status", "created_at" from "projects" order by "projects"."project_id", "projects"."created_at" desc, "projects"."row_id" desc);--> statement-breakpoint
CREATE VIEW "public"."tasks_current" AS (select distinct on ("tasks"."task_id") "row_id", "task_id", "user_id", "project_id", "title", "description", "estimated_minutes", "deadline", "status", "source", "completed_at", "created_at" from "tasks" order by "tasks"."task_id", "tasks"."created_at" desc, "tasks"."row_id" desc);--> statement-breakpoint
CREATE VIEW "public"."events_current" AS (select distinct on ("events"."event_id") "row_id", "event_id", "user_id", "title", "starts_at", "duration_minutes", "status", "task_id", "parent_event_id", "part_index", "moved_from_event_id", "actual_minutes", "source_message_id", "created_at" from "events" order by "events"."event_id", "events"."created_at" desc, "events"."row_id" desc);