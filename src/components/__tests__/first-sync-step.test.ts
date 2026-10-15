import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FirstSyncBody } from "@/components/onboarding/steps/first-sync-step";
import type { StepNavigation } from "@/components/onboarding/step-navigation";
import {
  deriveFirstSyncView,
  firstSyncFooter,
  type ConnectedLoad,
} from "@/components/onboarding/steps/first-sync-view";
import {
  initialSyncStreamState,
  syncStreamReducer,
  type ClientSyncEvent,
  type SyncStreamAction,
  type SyncStreamState,
} from "@/components/sync-stream";

const BANK = "synthetic-bank";
const CARD = "synthetic-card";

const connected: ConnectedLoad = {
  status: "ready",
  connected: [
    { id: "cred-1", bankType: BANK, displayName: "Synthetic checking" },
    { id: "cred-2", bankType: CARD, displayName: "Synthetic card" },
  ],
};

const idle = initialSyncStreamState();

function stream(...actions: SyncStreamAction[]): SyncStreamState {
  return actions.reduce(syncStreamReducer, idle);
}

const event = (e: ClientSyncEvent): SyncStreamAction => ({ type: "event", event: e });
const accepted: SyncStreamAction = { type: "accepted" };
const completed = (byBank: Record<string, number>) =>
  event({
    type: "sync_complete",
    summary: { total: Object.values(byBank).reduce((a, b) => a + b, 0), byBank },
  });

describe("the first-sync step before a sync starts", () => {
  it("waits for the connected institutions to load", () => {
    const view = deriveFirstSyncView({ status: "loading" }, idle);
    expect(view.phase).toBe("loading");
    expect(firstSyncFooter(view)).toEqual({ primary: "wait", skip: true });
  });

  it("offers no sync at all when no institution is connected, only a way to finish", () => {
    const view = deriveFirstSyncView({ status: "ready", connected: [] }, idle);
    expect(view.phase).toBe("no-credentials");
    expect(firstSyncFooter(view)).toEqual({ primary: "finish", skip: false });
  });

  it("lets the user finish when the connected institutions cannot be read", () => {
    const view = deriveFirstSyncView({ status: "failed" }, idle);
    expect(view.phase).toBe("unavailable");
    expect(firstSyncFooter(view).primary).toBe("finish");
  });

  it("offers to start the sync, or to skip it, once institutions are connected", () => {
    const view = deriveFirstSyncView(connected, idle);
    expect(view).toMatchObject({ phase: "ready", notice: null });
    expect(firstSyncFooter(view)).toEqual({ primary: "start", skip: true });
  });
});

describe("the first-sync step while syncing", () => {
  it("blocks every way forward or back while the run is live", () => {
    const view = deriveFirstSyncView(
      connected,
      stream(accepted, event({ type: "progress", bank: BANK, status: "scraping" })),
    );
    expect(view.phase).toBe("running");
    expect(firstSyncFooter(view)).toEqual({ primary: "busy", skip: false });
  });

  it("stays running when one institution fails and the next carries on", () => {
    const view = deriveFirstSyncView(
      connected,
      stream(
        accepted,
        event({ type: "bank_error", bank: BANK, error: "שגיאה", hasScreenshot: false }),
        event({ type: "progress", bank: CARD, status: "logging_in" }),
      ),
    );
    expect(view.phase).toBe("running");
  });

  it("shows a refused start as a notice and lets the user try again, without a run of its own", () => {
    const view = deriveFirstSyncView(
      connected,
      stream({ type: "start_requested" }, { type: "refused", message: "כבר פועל" }),
    );
    expect(view).toMatchObject({
      phase: "ready",
      notice: { kind: "refused", message: "כבר פועל" },
    });
    expect(firstSyncFooter(view).primary).toBe("start");
  });

  it("reports a stream that broke off as a connection error and offers a retry", () => {
    const view = deriveFirstSyncView(connected, stream(accepted, { type: "stream_failed" }));
    expect(view).toMatchObject({ phase: "ready", notice: { kind: "connection-error" } });
    expect(firstSyncFooter(view).primary).toBe("start");
  });
});

describe("the first-sync step after the run", () => {
  it("finishes onboarding from a clean run, with nothing left to skip", () => {
    const view = deriveFirstSyncView(
      connected,
      stream(
        accepted,
        event({ type: "bank_complete", bank: BANK }),
        event({ type: "bank_complete", bank: CARD }),
        completed({ [BANK]: 3, [CARD]: 2 }),
      ),
    );
    expect(view).toMatchObject({
      phase: "finished",
      credentialFailure: false,
      retryable: false,
    });
    expect(firstSyncFooter(view)).toEqual({ primary: "finish", skip: false });
  });

  it("points a failed institution back to the institution step and still lets the user finish", () => {
    const view = deriveFirstSyncView(
      connected,
      stream(
        accepted,
        event({
          type: "bank_error",
          bank: BANK,
          error: "פרטי התחברות שגויים",
          hasScreenshot: false,
        }),
        event({ type: "bank_complete", bank: CARD }),
        completed({ [CARD]: 2 }),
      ),
    );
    expect(view).toMatchObject({ phase: "finished", credentialFailure: true, retryable: true });
    expect(firstSyncFooter(view).primary).toBe("finish");
  });

  it("offers a retry, but no credential fix, for a missed OTP window", () => {
    const view = deriveFirstSyncView(
      connected,
      stream(
        accepted,
        event({ type: "otp_required", bank: BANK }),
        event({ type: "otp_timeout", bank: BANK }),
        completed({}),
      ),
    );
    expect(view).toMatchObject({ phase: "finished", credentialFailure: false, retryable: true });
  });

  it("keeps the finished run on screen when a retry is refused", () => {
    const view = deriveFirstSyncView(
      connected,
      stream(
        accepted,
        completed({ [BANK]: 1 }),
        { type: "start_requested" },
        { type: "refused", message: "כבר פועל" },
      ),
    );
    expect(view).toMatchObject({ phase: "finished", notice: { kind: "refused" } });
  });
});

describe("the first-sync step as rendered", () => {
  const navigation: StepNavigation = {
    advance: () => undefined,
    skip: () => undefined,
    back: () => undefined,
    isLast: true,
    pending: false,
  };

  function render(load: ConnectedLoad, state: SyncStreamState): string {
    return renderToStaticMarkup(
      createElement(FirstSyncBody, {
        navigation,
        load,
        stream: state,
        view: deriveFirstSyncView(load, state),
        onStart: () => undefined,
        onOtpChange: () => undefined,
        onOtpSubmit: () => undefined,
      }),
    );
  }

  const INSTITUTION_STEP = 'href="/setup?step=institution"';
  const START = "התחלת סנכרון";
  const FINISH = "סיום וכניסה לאפליקציה";

  it("with nothing connected, offers the institution step and finishing, but no sync", () => {
    const html = render({ status: "ready", connected: [] }, idle);
    expect(html).toContain(INSTITUTION_STEP);
    expect(html).toContain(FINISH);
    expect(html).not.toContain(START);
  });

  it("prompts for the OTP inside the step while the run waits for it", () => {
    const html = render(connected, stream(accepted, event({ type: "otp_required", bank: BANK })));
    expect(html).toContain("הזן קוד SMS");
    expect(html).toContain("3:00");
    expect(html).not.toContain("דילוג");
  });

  it("shows a failed institution's own error beside a completed one, with the way back to fix it", () => {
    const html = render(
      connected,
      stream(
        accepted,
        event({
          type: "bank_error",
          bank: BANK,
          error: "פרטי התחברות שגויים",
          hasScreenshot: false,
        }),
        event({ type: "bank_complete", bank: CARD }),
        completed({ [CARD]: 2 }),
      ),
    );
    expect(html).toContain("פרטי התחברות שגויים");
    expect(html).toContain("2 תנועות");
    expect(html).toContain(INSTITUTION_STEP);
    expect(html).toContain(FINISH);
  });

  it("shows the server's refusal as a plain notice", () => {
    const html = render(
      connected,
      stream({ type: "start_requested" }, { type: "refused", message: "סנכרון כבר פועל" }),
    );
    expect(html).toContain("סנכרון כבר פועל");
    expect(html).toContain(START);
  });

  it("reports what categorization did when the run's AI step ran", () => {
    const html = render(
      connected,
      stream(
        accepted,
        event({ type: "ai_summary", applied: 5, queued: 0, skipped: 0 }),
        completed({ [BANK]: 5 }),
      ),
    );
    expect(html).toContain("5 עסקאות סווגו אוטומטית");
  });
});
