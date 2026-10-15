CREATE TABLE "reconciliation_rejections" (
	"txn_a_id" uuid NOT NULL,
	"txn_b_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_rejections_txn_a_id_txn_b_id_pk" PRIMARY KEY("txn_a_id","txn_b_id"),
	CONSTRAINT "ck_reconciliation_rejections_ordered" CHECK ("reconciliation_rejections"."txn_a_id" <= "reconciliation_rejections"."txn_b_id")
);
--> statement-breakpoint
ALTER TABLE "reconciliation_rejections" ADD CONSTRAINT "reconciliation_rejections_txn_a_id_transactions_id_fk" FOREIGN KEY ("txn_a_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_rejections" ADD CONSTRAINT "reconciliation_rejections_txn_b_id_transactions_id_fk" FOREIGN KEY ("txn_b_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reconciliation_rejections_txn_b" ON "reconciliation_rejections" USING btree ("txn_b_id");