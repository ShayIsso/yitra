"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  ArrowsClockwiseIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HEBREW_MONTHS_SHORT, monthKey } from "@/components/reports/format";
import { monthPosition, type Insight, type InsightMonth } from "@/lib/analytics/insights";
import { cn } from "@/lib/utils";
import { monthName } from "../month";
import { useMonthLoad } from "../month-load";
import { INSIGHT_CARD_SIZE, InsightCard, type CardInsight } from "./insight-card";

type RecapInsight = Extract<Insight, { kind: "recap" }>;

/** `/api/insights`: the selected cards (the recap carries its whole fact), and the day they were judged on. */
type InsightsResponse = { today: string; insights: Insight[] };

// The recap story, the dialog primitive and everything else it draws load
// only when the owner opens it (or reaches for it), never with the home route.
const loadRecapStory = () => import("./recap-story");
const RecapStory = dynamic(loadRecapStory, { ssr: false });

async function readInsights(month: InsightMonth, signal: AbortSignal): Promise<InsightsResponse> {
  const res = await fetch(`/api/insights?year=${month.year}&month=${month.month}`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<InsightsResponse>;
}

/** The phone row bleeds to the screen edge (the shell's gutter), so a card peeks past it. */
const ROW =
  "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:scroll-px-0 md:px-0";

/**
 * The home insight cards (#319), in the order insight selection returned
 * them: the upcoming card debit first, the month recap last. Memoized like
 * the sections below it: the home screen re-renders on every clock tick.
 *
 * It loads as soon as it mounts but draws nothing until `visible` (the home
 * screen withholds it in a first-run state). `refreshKey` moves when the data
 * changed (a sync settled, a target saved): the cards stay on screen while
 * they re-read, and only a month change shows the skeleton.
 */
export const InsightsSection = React.memo(function InsightsSection({
  month,
  refreshKey,
  visible,
}: {
  month: InsightMonth;
  refreshKey: string;
  visible: boolean;
}) {
  const titleId = React.useId();
  const [attempt, setAttempt] = React.useState(0);
  const load = useMonthLoad(monthKey(month), `${refreshKey}:${attempt}`, (signal) =>
    // A microtask later, so the hero's outlook request goes out first.
    Promise.resolve().then(() => readInsights(month, signal)),
  );
  const data = load.current ? load.data : null;
  const [row, setRow] = React.useState<HTMLDivElement | null>(null);

  if (!visible) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h2 id={titleId} className="text-lead font-semibold">
          תובנות
        </h2>
        {row && <ScrollButtons row={row} />}
      </div>
      {data !== null ? (
        <InsightsRow
          insights={data.insights}
          month={month}
          today={data.today}
          labelledBy={titleId}
          rowRef={setRow}
        />
      ) : load.failed ? (
        <InsightsError retrying={load.pending} onRetry={() => setAttempt((a) => a + 1)} />
      ) : (
        <InsightsSkeleton />
      )}
    </section>
  );
});

/** Inline-start then inline-end: toward the first card, toward the last. */
type ScrollDirection = -1 | 1;

/**
 * Steps the row a card at a time for a pointer without a horizontal wheel
 * (phones swipe; keyboard users tab through the cards). Drawn from md up,
 * only while the row overflows.
 */
function ScrollButtons({ row }: { row: HTMLDivElement }) {
  const [edges, setEdges] = React.useState({ atStart: true, atEnd: true });

  React.useEffect(() => {
    // RTL: scrollLeft is 0 at the first card and grows negative toward the last.
    const measure = () => {
      const max = row.scrollWidth - row.clientWidth;
      const atStart = row.scrollLeft > -1;
      const atEnd = row.scrollLeft < -max + 1;
      // Scroll fires every frame; only an edge reached or left re-renders.
      setEdges((prev) =>
        prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd },
      );
    };
    measure();
    row.addEventListener("scroll", measure, { passive: true });
    const resized = new ResizeObserver(measure);
    resized.observe(row);
    // A refresh can add or drop cards without resizing the row itself.
    const changed = new MutationObserver(measure);
    changed.observe(row, { childList: true });
    return () => {
      row.removeEventListener("scroll", measure);
      resized.disconnect();
      changed.disconnect();
    };
  }, [row]);

  if (edges.atStart && edges.atEnd) return null;
  const scroll = (direction: ScrollDirection) => {
    const card = row.firstElementChild?.getBoundingClientRect().width ?? row.clientWidth;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Toward the last card is leftwards in RTL.
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    row.scrollBy({ left: -direction * (card + gap), behavior: reduce ? "auto" : "smooth" });
  };
  return (
    <div className="hidden gap-1 md:flex">
      <Button
        variant="outline"
        size="icon"
        aria-label="לתובנות הקודמות"
        disabled={edges.atStart}
        onClick={() => scroll(-1)}
      >
        <CaretRightIcon className="size-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="לתובנות הבאות"
        disabled={edges.atEnd}
        onClick={() => scroll(1)}
      >
        <CaretLeftIcon className="size-4" />
      </Button>
    </div>
  );
}

function InsightsRow({
  insights,
  month,
  today,
  labelledBy,
  rowRef,
}: {
  insights: Insight[];
  month: InsightMonth;
  today: string;
  labelledBy: string;
  rowRef: (row: HTMLDivElement | null) => void;
}) {
  const [recap, setRecap] = React.useState<{ open: boolean } | null>(null);
  const recapCardRef = React.useRef<HTMLButtonElement>(null);
  const recapInsight = insights.find((i): i is RecapInsight => i.kind === "recap") ?? null;

  if (insights.length === 0) {
    return <InsightsEmpty current={monthPosition(month, today).phase === "current"} />;
  }
  return (
    <>
      {/* Focusable so the row scrolls from the keyboard even when its cards aren't links. */}
      <div
        ref={rowRef}
        role="group"
        aria-labelledby={labelledBy}
        tabIndex={0}
        className={cn(
          ROW,
          "stagger focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-3",
        )}
      >
        {insights.map((insight) =>
          insight.kind === "recap" ? (
            <RecapCard
              key="recap"
              ref={recapCardRef}
              recap={insight}
              onOpen={() => setRecap({ open: true })}
            />
          ) : (
            <InsightCard key={insightKey(insight)} insight={insight} month={month} today={today} />
          ),
        )}
      </div>
      {recap && recapInsight && (
        <RecapStory
          recap={recapInsight}
          open={recap.open}
          onOpenChange={(open) => setRecap({ open })}
          finalFocus={recapCardRef}
        />
      )}
    </>
  );
}

function insightKey(insight: CardInsight): string {
  switch (insight.kind) {
    case "category-jump":
      return `${insight.kind}:${insight.categoryId}`;
    case "biggest-expense":
      return `${insight.kind}:${insight.transactionId}`;
    default:
      return insight.kind;
  }
}

/** The recap's entry: last in the row, on the hero's own surface. The story loads on tap. */
function RecapCard({
  recap,
  onOpen,
  ref,
}: {
  recap: RecapInsight;
  onOpen: () => void;
  ref: React.Ref<HTMLButtonElement>;
}) {
  const name = monthName(recap.month);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      // Fetch the story's chunk as the owner reaches for it, so the tap opens it at once.
      onPointerEnter={() => void loadRecapStory()}
      onFocus={() => void loadRecapStory()}
      aria-haspopup="dialog"
      className={cn(
        INSIGHT_CARD_SIZE,
        "press bg-hero text-hero-foreground focus-visible:ring-ring/50 flex flex-col rounded-xl p-4 text-start outline-none focus-visible:ring-3",
      )}
    >
      <span
        aria-hidden="true"
        className="ring-hero-foreground/40 ring-offset-hero grid size-11 place-items-center rounded-full ring-2 ring-offset-2"
      >
        <span className="text-caption font-semibold">
          {HEBREW_MONTHS_SHORT[recap.month.month - 1]}
        </span>
      </span>
      <span className="text-caption text-hero-muted mt-auto">סיכום חודשי</span>
      <span className="text-lead font-semibold">
        {name} {recap.month.year}, בקצרה
      </span>
    </button>
  );
}

function InsightsSkeleton() {
  return (
    <div aria-hidden="true" className={cn(ROW, "overflow-x-hidden")}>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className={cn(INSIGHT_CARD_SIZE, "rounded-xl")} />
      ))}
    </div>
  );
}

/** Closed months never get card-debit, budget or upcoming-bill cards, so their copy names only what can still come. */
function InsightsEmpty({ current }: { current: boolean }) {
  return (
    <Card className="my-1 h-44 flex-row items-center gap-3 p-4">
      <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-full">
        <CheckCircleIcon weight="fill" className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-body font-semibold">
          {current ? "אין כרגע משהו שמחכה לך" : "אין תובנות לחודש הזה"}
        </p>
        <p className="text-body text-muted-foreground max-w-prose text-pretty">
          {current
            ? "חיובי אשראי קרובים, עסקאות שמחכות לסיווג, תקציבים בסיכון ושינויים בולטים בהוצאות יופיעו כאן."
            : "עסקאות שמחכות לסיווג, ההוצאה הגדולה של החודש ושינויים בולטים מול החודש שלפניו יופיעו כאן."}
        </p>
      </div>
    </Card>
  );
}

/** The row's own load failure, at the row's height, with a retry for this section only. */
function InsightsError({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <Card role="alert" className="my-1 h-44 justify-center gap-3 p-4">
      <p className="text-body flex items-center gap-2">
        <WarningCircleIcon weight="fill" className="text-attention-text size-5 shrink-0" />
        לא הצלחנו לטעון את התובנות של החודש.
      </p>
      <Button
        variant="outline"
        className="h-11 gap-1.5 self-start md:h-9"
        disabled={retrying}
        onClick={onRetry}
      >
        <ArrowsClockwiseIcon className="size-4" />
        {retrying ? "טוען..." : "נסה שוב"}
      </Button>
    </Card>
  );
}
