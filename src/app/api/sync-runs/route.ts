import { NextResponse } from "next/server";
import { drizzleSyncRunStore } from "@/lib/sync/runs";
import { getLastRunsForCurrentInstitutions } from "@/lib/sync/current-runs";

export async function GET() {
  const runs = await getLastRunsForCurrentInstitutions(drizzleSyncRunStore);
  return NextResponse.json(runs);
}
