ALTER TABLE "bank_credentials" ALTER COLUMN "bank_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sync_runs" ALTER COLUMN "bank" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."bank_type";