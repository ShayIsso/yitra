import { describe, it, expect } from "vitest";
import {
  OTP_WINDOW_SECONDS,
  initialSyncStreamState,
  refusalMessage,
  syncStreamReducer,
  type ClientSyncEvent,
  type SyncStreamAction,
  type SyncStreamState,
} from "@/components/sync-stream";

const BANK = "synthetic-bank";
const OTHER = "synthetic-card";

function run(actions: SyncStreamAction[], from = initialSyncStreamState()): SyncStreamState {
  return actions.reduce(syncStreamReducer, from);
}

const event = (e: ClientSyncEvent): SyncStreamAction => ({ type: "event", event: e });
const accepted: SyncStreamAction = { type: "accepted" };

describe("a sync run as the stream reports it", () => {
  it("is running from the moment the server accepts the start", () => {
    const state = run([{ type: "start_requested" }, accepted]);
    expect(state.syncing).toBe(true);
  });

  it("tracks each institution's progress independently", () => {
    const state = run([
      accepted,
      event({ type: "progress", bank: BANK, status: "scraping" }),
      event({ type: "progress", bank: OTHER, status: "logging_in" }),
    ]);
    expect(state.bankStates[BANK].status).toBe("scraping");
    expect(state.bankStates[OTHER].status).toBe("logging_in");
  });

  it("keeps the run going after one institution fails", () => {
    const state = run([
      accepted,
      event({ type: "bank_error", bank: BANK, error: "שגיאת התחברות", hasScreenshot: false }),
      event({ type: "progress", bank: OTHER, status: "scraping" }),
    ]);
    expect(state.syncing).toBe(true);
    expect(state.bankStates[BANK]).toMatchObject({ status: "error", error: "שגיאת התחברות" });
    expect(state.bankStates[OTHER].status).toBe("scraping");
  });

  it("ends on sync_complete with the summary and per-institution counts", () => {
    const state = run([
      accepted,
      event({ type: "bank_complete", bank: BANK }),
      event({ type: "sync_complete", summary: { total: 4, byBank: { [BANK]: 4 } } }),
    ]);
    expect(state.syncing).toBe(false);
    expect(state.summary).toEqual({ total: 4, byBank: { [BANK]: 4 } });
    expect(state.bankStates[BANK]).toEqual({ status: "complete", transactionCount: 4 });
  });

  it("records the post-import summaries only when they report something", () => {
    const quiet = run([
      accepted,
      event({ type: "reconciliation_summary", autoApplied: 0, queued: 0 }),
      event({ type: "ai_summary", applied: 0, queued: 0, skipped: 0 }),
    ]);
    expect(quiet.reconciliation).toBeNull();
    expect(quiet.aiSummary).toBeNull();

    const busy = run([
      accepted,
      event({ type: "reconciliation_summary", autoApplied: 1, queued: 2 }),
      event({ type: "ai_summary", applied: 3, queued: 0, skipped: 1 }),
    ]);
    expect(busy.reconciliation).toEqual({ autoApplied: 1, queued: 2 });
    expect(busy.aiSummary).toEqual({ applied: 3, queued: 0, skipped: 1 });
  });

  it("clears the previous run's display only once a new start is accepted", () => {
    const finished = run([
      accepted,
      event({ type: "bank_error", bank: BANK, error: "x", hasScreenshot: false }),
      event({ type: "sync_complete", summary: { total: 0, byBank: {} } }),
    ]);

    const refused = run([{ type: "start_requested" }, { type: "refused", message: "m" }], finished);
    expect(refused.bankStates[BANK].status).toBe("error");
    expect(refused.summary).not.toBeNull();

    const restarted = run([{ type: "start_requested" }, accepted], finished);
    expect(restarted.bankStates).toEqual({});
    expect(restarted.summary).toBeNull();
  });
});

describe("a start awaiting the server's answer", () => {
  it("is pending from the request until the server accepts, refuses or fails it", () => {
    const requested = run([{ type: "start_requested" }]);
    expect(requested.starting).toBe(true);
    expect(run([accepted], requested).starting).toBe(false);
    expect(run([{ type: "refused", message: "m" }], requested).starting).toBe(false);
    expect(run([{ type: "start_failed" }], requested).starting).toBe(false);
  });
});

describe("a refused or broken start", () => {
  it("holds the refusal message without claiming a run of its own", () => {
    const state = run([{ type: "start_requested" }, { type: "refused", message: "כבר פועל" }]);
    expect(state.refusal).toBe("כבר פועל");
    expect(state.syncing).toBe(false);
  });

  it("does not hide a live run behind a refused second start", () => {
    const state = run([accepted, { type: "start_requested" }, { type: "refused", message: "m" }]);
    expect(state.syncing).toBe(true);
  });

  it("forgets an earlier refusal or connection error when a new start is requested", () => {
    const state = run([
      { type: "refused", message: "m" },
      { type: "stream_failed" },
      { type: "start_requested" },
    ]);
    expect(state.refusal).toBeNull();
    expect(state.connectionError).toBe(false);
  });

  it("treats a stream that ends without sync_complete as a failed run, not a running one", () => {
    const state = run([accepted, { type: "stream_failed" }]);
    expect(state.syncing).toBe(false);
    expect(state.connectionError).toBe(true);
  });

  it("reports a start the server answered with an error as a connection error", () => {
    const state = run([{ type: "start_requested" }, { type: "start_failed" }]);
    expect(state.connectionError).toBe(true);
    expect(state.syncing).toBe(false);
  });
});

describe("the refusal message", () => {
  it("is the server's own message when the 409 body carries one", () => {
    expect(refusalMessage({ error: "הודעה מהשרת" })).toBe("הודעה מהשרת");
  });

  it("falls back to a fixed Hebrew message for an unreadable body", () => {
    expect(refusalMessage(null)).toBe("סנכרון או סיווג עסקאות כבר פועלים. נסה שוב בסיומם.");
    expect(refusalMessage({ error: 42 })).toBe(
      "סנכרון או סיווג עסקאות כבר פועלים. נסה שוב בסיומם.",
    );
  });
});

describe("the OTP prompt", () => {
  const prompted = run([accepted, event({ type: "otp_required", bank: BANK })]);

  it("opens a three-minute window for the institution that asked", () => {
    expect(prompted.bankStates[BANK].status).toBe("otp_required");
    expect(prompted.otp[BANK]).toEqual({ secondsLeft: OTP_WINDOW_SECONDS, running: true });
    expect(OTP_WINDOW_SECONDS).toBe(180);
  });

  it("counts down once per tick and stops at zero", () => {
    expect(run([{ type: "otp_tick" }], prompted).otp[BANK].secondsLeft).toBe(179);

    const nearlyDone = run([], {
      ...prompted,
      otp: { [BANK]: { secondsLeft: 1, running: true } },
    });
    expect(run([{ type: "otp_tick" }, { type: "otp_tick" }], nearlyDone).otp[BANK]).toEqual({
      secondsLeft: 0,
      running: false,
    });
  });

  it("freezes the countdown and clears the typed code once submitted", () => {
    const state = run(
      [
        { type: "otp_draft", bank: BANK, code: "1234" },
        { type: "otp_submitted", bank: BANK },
        { type: "otp_tick" },
      ],
      prompted,
    );
    expect(state.otpDrafts[BANK]).toBe("");
    expect(state.otp[BANK]).toEqual({ secondsLeft: OTP_WINDOW_SECONDS, running: false });
  });

  it("stops the countdown when the server reports the window timed out", () => {
    const state = run([event({ type: "otp_timeout", bank: BANK }), { type: "otp_tick" }], prompted);
    expect(state.bankStates[BANK].status).toBe("otp_timeout");
    expect(state.otp[BANK].running).toBe(false);
  });
});
