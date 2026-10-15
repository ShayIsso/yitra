import { db } from "@/db";
import { aiSuggestions } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Closes the open `pending_review` suggestions of transactions that something
 * other than the suggestion itself just categorized. `superseded` is
 * deliberately outside `getSuppressedPairs`: the user never rejected the guess.
 * Exported through the module index so categorization writers in modules that
 * ai-categorization imports (merchant-memory) stay free of an import cycle and
 * compose this at their call site.
 */
export async function supersedeOpenSuggestions(
  transactionIds: string[],
  client: Pick<typeof db, "update"> = db,
): Promise<void> {
  if (transactionIds.length === 0) return;
  await client
    .update(aiSuggestions)
    .set({ status: "superseded", updatedAt: new Date() })
    .where(
      and(
        inArray(aiSuggestions.transactionId, transactionIds),
        eq(aiSuggestions.status, "pending_review"),
      ),
    );
}
