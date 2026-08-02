ALTER TABLE "turn_usage" ALTER COLUMN "input_tokens" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "turn_usage" ALTER COLUMN "output_tokens" DROP NOT NULL;