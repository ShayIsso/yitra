"use client";

import * as React from "react";
import Link from "next/link";
import { CategoryDot } from "@/components/category-dot";
import { CaretLeftIcon, CaretRightIcon, XIcon } from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatPercent, monthLabel, reportsMonthHref } from "@/components/reports/format";
import { previousMonth, type RecapFact } from "@/lib/analytics/insights";
import { cn } from "@/lib/utils";
import { HERO_BUTTON, HERO_QUIET_BUTTON, HeroAmount } from "../hero-states";
import { monthName } from "../month";
import { headlineLine, recapSlides, type RecapSlide } from "./recap-slides";

const QUIET_BUTTON = cn(HERO_QUIET_BUTTON, "justify-center disabled:opacity-40");

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
  // Every opening starts from the first card, even one that interrupts the
  // closing animation (the dialog stays mounted between openings).
  const [openSeen, setOpenSeen] = React.useState(open);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) setIndex(0);
  }
  const nextRef = React.useRef<HTMLButtonElement>(null);
  const at = Math.min(index, slides.length - 1);
  const slide = slides[at];
  const last = at === slides.length - 1;

  const step = (delta: -1 | 1) =>
    setIndex((i) => Math.min(Math.max(i + delta, 0), slides.length - 1));
  const forward = () => (last ? onOpenChange(false) : step(1));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
        className="bg-hero text-hero-foreground ring-hero-foreground/10 min-h-[min(36rem,calc(100dvh-2rem))] md:max-w-md"
        bodyClassName="flex flex-col gap-0 p-0"
      >
        <div className="flex items-center gap-1.5 px-5 pt-4" aria-hidden="true">
          {slides.map((s, i) => (
            <span
              key={s.kind}
              className={cn(
                "bg-hero-foreground h-1 flex-1 rounded-full transition-opacity duration-200",
                i > at && "opacity-25",
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
          <Line>{headlineLine(slide)}</Line>
          <p className="text-body text-hero-muted tabular-nums">
            נכנסו <HeroAmount amount={slide.income} /> · יצאו <HeroAmount amount={slide.expenses} />
          </p>
        </>
      );
    case "top-category":
      return (
        <>
          <Eyebrow>לאן הלך הכי הרבה</Eyebrow>
          <p className="text-headline flex items-center gap-2 font-bold">
            <CategoryDot color={slide.color} />
            {slide.name}
          </p>
          <Line>
            <HeroAmount amount={slide.amount} className="font-semibold" />,{" "}
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
            <HeroAmount amount={slide.previous} /> ל־
            <HeroAmount amount={slide.amount} className="font-semibold" />.
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
            <HeroAmount amount={slide.amount} className="font-semibold" /> הוצאות ביום אחד.
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
            <Link href={reportsMonthHref(recap.month)} onClick={onClose} className={HERO_BUTTON}>
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
          <HeroAmount amount={verdict.by} className="font-semibold" />, מעל יעד של{" "}
          <HeroAmount amount={verdict.target} />.
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
            בדיוק ביעד של <HeroAmount amount={verdict.target} />.
          </>
        ) : (
          <>
            <HeroAmount amount={verdict.by} className="font-semibold" /> מתחת ליעד של{" "}
            <HeroAmount amount={verdict.target} />.
          </>
        )}
      </Line>
    </>
  );
}
