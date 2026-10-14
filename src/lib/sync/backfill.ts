import { acquireAndRelease, type ClaimedRun, type SyncClaim } from "./claim";
import type { AiStepDeps, AiStepEvent, AiSummary } from "./ai-step";

/** Known before any run starts, so no claim is taken and no step begins. */
export type BackfillRefusal =
  | { readonly status: "provider_off" }
  | { readonly status: "sync_running" };

export type BackfillResult =
  | { readonly status: "completed"; readonly summary: AiSummary }
  | { readonly status: "incomplete" };

export type BackfillStart =
  | BackfillRefusal
  /** `result` never rejects. */
  | { readonly status: "started"; readonly result: Promise<BackfillResult> };

/** The wire events of the backfill route's stream, one per SSE `data:` frame. */
export type BackfillStreamEvent =
  | { readonly type: "started" }
  | { readonly type: "heartbeat" }
  | { readonly type: "completed"; readonly summary: AiSummary }
  | { readonly type: "incomplete"; readonly error: string };

export interface BackfillDeps {
  readonly claim: SyncClaim;
  /** Presence only — resolves no provider and reads no key. */
  readonly isProviderConfigured: () => Promise<boolean>;
  readonly runAiStep: (deps: AiStepDeps) => AsyncGenerator<AiStepEvent>;
  readonly ai: AiStepDeps;
}

/**
 * The categorization backfill (#263): the sync's final AI step, run on its own
 * over every still-uncategorized row, for a provider configured after the
 * history was imported — a later sync imports nothing new, so it never would.
 *
 * It is the same step with the same deps, not a second run, so tiers, the
 * overwrite law, suppression, the `ai_suggestions` lifecycle, transfer-guard
 * routing and pacing are a post-sync run's by construction (ADR-0008, ADR-0010).
 * It holds the sync's process claim for its whole duration: both write the same
 * uncategorized rows, so neither may start while the other runs.
 *
 * Answers as soon as the run has started rather than when it ends: the run is
 * not tied to whoever asked for it, so a caller that goes away (a dropped
 * connection) neither stops it nor keeps the claim from releasing when it ends.
 */
export async function startCategorizationBackfill(deps: BackfillDeps): Promise<BackfillStart> {
  if (!(await deps.isProviderConfigured())) return { status: "provider_off" };

  const claimed = acquireAndRelease(deps.claim, () => deps.runAiStep(deps.ai));
  if (claimed === null) return { status: "sync_running" };

  return { status: "started", result: drain(claimed) };
}

async function drain(claimed: ClaimedRun<AiStepEvent>): Promise<BackfillResult> {
  let summary: AiSummary | null = null;
  try {
    for await (const { applied, queued, skipped } of claimed.events) {
      summary = { applied, queued, skipped };
    }
  } catch {
    // The step swallows its own failures; anything escaping it still leaves
    // the rows honestly uncategorized, which is what "incomplete" reports.
  } finally {
    claimed.release();
  }
  return summary ? { status: "completed", summary } : { status: "incomplete" };
}
