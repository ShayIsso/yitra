"use client";

import * as React from "react";
import Link from "next/link";
import { CaretLeftIcon, CaretRightIcon, XIcon } from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatPercent, monthLabel } from "@/components/reports/format";
import { previousMonth, type RecapFact } from "@/lib/analytics/insights";
import { cn } from "@/lib/utils";
import { HERO_BUTTON } from "../hero-states";
import { monthName } from "../month";
import { recapSlides, type RecapSlide } from "./recap-slides";

const QUIET_BUTTON =
  "press text-body text-hero-foreground inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 outline-none hover:bg-hero-foreground/10 focus-visible:ring-3 focus-visible:ring-hero-foreground/60 disabled:opacity-40";

/** Hero money: whole shekels in the hero's own ink (pos/neg are not checked on the teal). */
function Money({ amount, className }: { amount: number; className?: string }) {
  return <Amount amount={amount} colorize={false} fractionDigits={0} className={className} />;
}

function Figure({ amount }: { amount: number }) {
  return <Amount amount={amount} size="headline" figure colorize={false} fractionDigits={0} />;
}

/**
 * The month recap story (#319): one card at a time on the hero surface,
 * stepped by tap (the inline-end half moves on, the inline-start half goes
 * back, as a story reads in RTL), by the arrow keys or by the buttons. No
 * auto-advance: the owner sets the pace (WCAG 2.2.2). The responsive dialog
 * makes it a sheet on phones; Escape, the close button or the backdrop
 * dismisses it and focus returns to the card that opened it.
 *
 * Loaded lazily by the insights row, so none of this is in home's first load.
 */
export default function RecapStory({
  recap,
  open,
  onOpenChange,
  finalFocus,
}: {
  recap: RecapFact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: React.RefObject<HTMLElement | null>;
}) {
  const slides = React.useMemo(() => recapSlides(recap), [recap]);
  const [index, setIndex] = React.useState(0);
  const nextRef = React.useRef<HTMLButtonElement>(null);
  const at = Math.min(index, slides.length - 1);
  const slide = slides[at];
  const last = at === slides.length - 1;

  const step = (delta: -1 | 1) =>
    setIndex((i) => Math.min(Math.max(i + delta, 0), slides.length - 1));
  const forward = () => (last ? onOpenChange(false) : step(1));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setIndex(0);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) setIndex(0);
      }}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={nextRef}
        finalFocus={finalFocus}
        onKeyDown={(e) => {
          // RTL: the story moves leftwards, so ArrowLeft is forward.
          if (e.key === "ArrowLeft") step(1);
          else if (e.key === "ArrowRight") step(-1);
          else return;
          e.preventDefault();
        }}
        className="bg-hero text-hero-foreground ring-hero-foreground/10 flex min-h-[min(36rem,calc(100dvh-2rem))] flex-col gap-0 p-0 md:max-w-md"
      >
        <div className="flex items-center gap-1.5 px-5 pt-4" aria-hidden="true">
          {slides.map((s, i) => (
            <span
              key={s.kind}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-200",
                i <= at ? "bg-hero-foreground" : "bg-hero-foreground/25",
              )}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 ps-5 pe-2 pt-2">
          <DialogTitle className="text-body font-semibold">
            הסיכום של {monthLabel(recap.month)}
          </DialogTitle>
          <DialogClose className={cn(QUIET_BUTTON, "size-11 px-0")}>
            <XIcon className="size-5" />
            <span className="sr-only">סגירה</span>
          </DialogClose>
        </div>

        <div className="relative flex flex-1 flex-col">
          {/* Tap zones for pointer users; keyboard and screen readers use the buttons below. */}
          <div aria-hidden="true" className="absolute inset-0 flex">
            <div className="flex-1" onClick={() => step(-1)} />
            <div className="flex-1" onClick={forward} />
          </div>
          <div
            aria-live="polite"
            className="pointer-events-none relative flex flex-1 flex-col justify-end px-6 pb-6"
          >
            <p className="sr-only">
              כרטיס {at + 1} מתוך {slides.length}
            </p>
            {/* Keyed by card: its entrance plays once each time a card is shown. */}
            <div key={slide.kind} className="enter flex flex-col gap-3">
              <SlideBody slide={slide} recap={recap} onClose={() => onOpenChange(false)} />
            </div>
          </div>
        </div>

        <div className="border-hero-foreground/15 flex items-center justify-between gap-2 border-t px-3 py-2">
          <button
            type="button"
            className={QUIET_BUTTON}
            disabled={at === 0}
            onClick={() => step(-1)}
          >
            <CaretRightIcon className="size-4" />
            הקודם
          </button>
          <span className="text-caption text-hero-muted tabular-nums" aria-hidden="true">
            {at + 1}/{slides.length}
          </span>
          <button ref={nextRef} type="button" className={QUIET_BUTTON} onClick={forward}>
            {last ? "סיום" : "הבא"}
            {!last && <CaretLeftIcon className="size-4" />}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-body text-hero-muted font-medium">{children}</p>;
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="text-lead text-pretty">{children}</p>;
}

function SlideBody({
  slide,
  recap,
  onClose,
}: {
  slide: RecapSlide;
  recap: RecapFact;
  onClose: () => void;
}) {
  const name = monthName(recap.month);
  switch (slide.kind) {
    case "headline":
      return (
        <>
          <Eyebrow>השורה התחתונה של {name}</Eyebrow>
          <Figure amount={slide.netSavings} />
          <Line>
            {slide.netSavings > 0
              ? `נשאר לך מההכנסות${slide.savingsRate !== null ? `: ${formatPercent(slide.savingsRate)} מהן` : ""}.`
              : slide.netSavings < 0
                ? "יצא יותר ממה שנכנס."
                : "ההכנסות וההוצאות התקזזו."}
          </Line>
          <p className="text-body text-hero-muted tabular-nums">
            נכנסו <Money amount={slide.income} /> · יצאו <Money amount={slide.expenses} />
          </p>
        </>
      );
    case "top-category":
      return (
        <>
          <Eyebrow>לאן הלך הכי הרבה</Eyebrow>
          <p className="text-headline flex items-center gap-2 font-bold">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: slide.color }}
            />
            {slide.name}
          </p>
          <Line>
            <Money amount={slide.amount} className="font-semibold" />,{" "}
            {formatPercent(slide.share * 100)} מההוצאות לפי קטגוריות.
          </Line>
          <div
            aria-hidden="true"
            className="bg-hero-foreground/15 h-2 overflow-hidden rounded-full"
          >
            <div
              className="bg-hero-foreground h-full rounded-full"
              style={{ width: `${Math.min(Math.max(slide.share, 0.02), 1) * 100}%` }}
            />
          </div>
        </>
      );
    case "biggest-change":
      return (
        <>
          <Eyebrow>השינוי הכי גדול מול {monthName(previousMonth(recap.month))}</Eyebrow>
          <p className="text-headline font-bold">{slide.name}</p>
          <Line>
            {slide.direction === "up" ? "עלה" : "ירד"} מ־
            <Money amount={slide.previous} /> ל־
            <Money amount={slide.amount} className="font-semibold" />.
          </Line>
        </>
      );
    case "most-expensive-day":
      return (
        <>
          <Eyebrow>היום הכי יקר</Eyebrow>
          <p className="text-headline font-bold">
            {Number(slide.date.slice(8, 10))} ב{name}
          </p>
          <Line>
            <Money amount={slide.amount} className="font-semibold" /> הוצאות ביום אחד.
          </Line>
          {slide.topDescription && (
            <p className="text-body text-hero-muted">הגדולה שבהן: {slide.topDescription}</p>
          )}
        </>
      );
    case "recurring":
      return (
        <>
          <Eyebrow>חיובים קבועים</Eyebrow>
          <Figure amount={slide.monthlyTotal} />
          <Line>
            {slide.count === 1 ? "חיוב קבוע אחד" : `${slide.count} חיובים קבועים`} בכל חודש.
          </Line>
          <p className="text-body text-hero-muted">לפי החיובים הקבועים הפעילים היום.</p>
        </>
      );
    case "verdict":
      return (
        <>
          <Eyebrow>ולסיום</Eyebrow>
          <VerdictBody verdict={slide.verdict} />
          <div className="pointer-events-auto mt-3 flex flex-wrap gap-2">
            <Link href="/reports" onClick={onClose} className={HERO_BUTTON}>
              לדוח המלא
            </Link>
          </div>
        </>
      );
  }
}

function VerdictBody({ verdict }: { verdict: RecapFact["verdict"] }) {
  if (verdict === null) {
    return (
      <>
        <p className="text-headline font-bold">אין יעד הוצאה</p>
        <Line>עם יעד חודשי, הסיכום יגיד איך החודש נגמר ביחס אליו.</Line>
      </>
    );
  }
  if (verdict.over) {
    return (
      <>
        {/* Over target is an attention state: the one coral mark in the story. */}
        <span className="bg-attention text-attention-foreground text-caption self-start rounded-full px-2.5 py-0.5 font-semibold">
          מעל היעד
        </span>
        <p className="text-headline font-bold">ההוצאות עברו את היעד</p>
        <Line>
          ב־
          <Money amount={verdict.by} className="font-semibold" />, מעל יעד של{" "}
          <Money amount={verdict.target} />.
        </Line>
      </>
    );
  }
  return (
    <>
      <span className="bg-hero-foreground/10 text-caption self-start rounded-full px-2.5 py-0.5 font-semibold">
        בתוך היעד
      </span>
      <p className="text-headline font-bold">ההוצאות נשארו בתוך היעד</p>
      <Line>
        {verdict.by === 0 ? (
          <>
            בדיוק ביעד של <Money amount={verdict.target} />.
          </>
        ) : (
          <>
            <Money amount={verdict.by} className="font-semibold" /> מתחת ליעד של{" "}
            <Money amount={verdict.target} />.
          </>
        )}
      </Line>
    </>
  );
}
