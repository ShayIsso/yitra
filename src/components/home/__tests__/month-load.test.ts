import { describe, it, expect } from "vitest";
import {
  INITIAL_MONTH_LOAD,
  monthLoadReducer,
  monthLoadView,
  type MonthLoad,
  type MonthLoadAction,
} from "@/components/home/month-load";

type Load = MonthLoad<string>;

function run(actions: MonthLoadAction<string>[]): Load {
  return actions.reduce<Load>(monthLoadReducer, INITIAL_MONTH_LOAD);
}

const request = (seq: number, key: string): MonthLoadAction<string> => ({
  type: "request",
  seq,
  key,
});
const ok = (seq: number, key: string, data: string): MonthLoadAction<string> => ({
  type: "settle",
  seq,
  key,
  result: { ok: true, data },
});
const fail = (seq: number, key: string): MonthLoadAction<string> => ({
  type: "settle",
  seq,
  key,
  result: { ok: false },
});

describe("monthLoadView", () => {
  it("is loading before anything arrived", () => {
    expect(monthLoadView(run([request(1, "2026-11")]))).toEqual({
      data: null,
      current: false,
      failed: false,
      pending: true,
    });
  });

  it("shows the requested month's data once it arrives", () => {
    expect(monthLoadView(run([request(1, "2026-11"), ok(1, "2026-11", "nov")]))).toEqual({
      data: "nov",
      current: true,
      failed: false,
      pending: false,
    });
  });

  it("ignores a stale answer: quick Oct then Sep taps end on Sep whatever order they land", () => {
    const view = monthLoadView(
      run([
        request(1, "2026-10"),
        request(2, "2026-09"),
        ok(2, "2026-09", "sep"),
        ok(1, "2026-10", "oct"),
      ]),
    );
    expect(view).toMatchObject({ data: "sep", current: true });
  });

  it("keeps the month's data on screen while the same month refetches", () => {
    const view = monthLoadView(
      run([request(1, "2026-11"), ok(1, "2026-11", "before"), request(2, "2026-11")]),
    );
    expect(view).toEqual({ data: "before", current: true, failed: false, pending: true });
  });

  it("replaces the data once the refetch lands", () => {
    const view = monthLoadView(
      run([
        request(1, "2026-11"),
        ok(1, "2026-11", "before"),
        request(2, "2026-11"),
        ok(2, "2026-11", "after"),
      ]),
    );
    expect(view.data).toBe("after");
  });

  it("marks the previous month's data as not current while another month loads", () => {
    const view = monthLoadView(
      run([request(1, "2026-11"), ok(1, "2026-11", "nov"), request(2, "2026-10")]),
    );
    expect(view).toEqual({ data: "nov", current: false, failed: false, pending: true });
  });

  it("reports a failure for the requested month", () => {
    const view = monthLoadView(run([request(1, "2026-11"), fail(1, "2026-11")]));
    expect(view).toEqual({ data: null, current: true, failed: true, pending: false });
  });

  it("is pending again while a failed month retries", () => {
    const view = monthLoadView(
      run([request(1, "2026-11"), fail(1, "2026-11"), request(2, "2026-11")]),
    );
    expect(view).toMatchObject({ failed: true, pending: true });
  });
});
