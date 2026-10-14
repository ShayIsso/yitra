import { NextResponse } from "next/server";
import { getInstitutionsWithRecordedSuccess, drizzleSyncRunStore } from "@/lib/sync/runs";

/**
 * The institution ids this install has synced successfully at least once — the
 * evidence that retires an experimental caveat (ADR-0013 §3). A GET route rather
 * than a Server Action so the institution picker can read it from `/setup`
 * without putting an action in that auth-exempt page's module graph.
 */
export async function GET() {
  const observed = await getInstitutionsWithRecordedSuccess(drizzleSyncRunStore);
  return NextResponse.json({ observed });
}
