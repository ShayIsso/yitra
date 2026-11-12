"use client";

import * as React from "react";
import Link from "next/link";
import { BankIcon, CaretDownIcon, WarningCircleIcon } from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import { settingsSectionHref } from "@/components/settings/sections";
import { cn } from "@/lib/utils";
import { syncDayLabel } from "./freshness";
import { monthName, type HomeMonth } from "./month";
import {
  closedVerdict,
  equationTerms,
  type ActiveOutlook,
  type ClosedOutlook,
  type EquationTerm,
  type OutlookOf,
} from "./outlook-view";

/*
 * The hero's bodies, one per month-outlook state. Every money figure is a
 * field the outlook returned, rendered through <Amount>; nothing is computed
 * here. The display step is used once per state: the one figure that answers
 * the question.
 */

/** A light action on the dark hero; the paper-on-teal pair is the hero's own AA pair. */
export const HERO_BUTTON =
  "press bg-hero-foreground text-hero text-body inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 font-semibold outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-hero-foreground/60";
const HERO_QUIET_BUTTON =
  "press text-body text-hero-foreground inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 outline-none hover:bg-hero-foreground/10 focus-visible:ring-3 focus-visible:ring-hero-foreground/60";

function Figure({ amount, children }: { amount: number; children?: React.ReactNode }) {
  return (
    <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
      <Amount amount={amount} size="display" colorize={false} fractionDigits={0} />
      {children}
    </p>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-lead flex min-h-7 items-center gap-2 font-medium">{children}</div>;
}

function AsOf({ asOf, nowMs }: { asOf: string; nowMs: number }) {
  return (
    <p className="text-hero-muted text-body mt-1">
      נכון לסנכרון האחרון · {syncDayLabel(asOf, nowMs)}
    </p>
  );
}

function EstimateTag() {
  return (
    <span className="bg-hero-foreground/10 text-hero-muted text-caption rounded-full px-2 py-0.5 font-medium">
      הערכה
    </span>
  );
}

const TERM_LABEL: Record<EquationTerm["term"], string> = {
  target: "יעד",
  spent: "יצא",
  due: "קבועים",
  remaining: "נשאר",
};

function Equation({ outlook }: { outlook: ActiveOutlook }) {
  const [open, setOpen] = React.useState(false);
  const regionId = React.useId();
  const terms = equationTerms(outlook);
  const due = terms.find((t) => t.term === "due");

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((v) => !v)}
        className={cn(HERO_QUIET_BUTTON, "-ms-3")}
      >
        איך זה מחושב
        <CaretDownIcon
          className={cn(
            "size-4 transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <div id={regionId} hidden={!open} className="mt-2">
        <ol
          aria-label="יעד פחות יצא פחות קבועים שווה נשאר"
          className="flex flex-wrap items-center gap-x-1.5 gap-y-2"
        >
          {terms.map((t, i) => (
            <li key={t.term} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-hero-muted">
                  {t.term === "remaining" ? "=" : "−"}
                </span>
              )}
              <span
                className={cn(
                  "flex items-baseline gap-1.5 rounded-full px-3 py-1",
                  t.term === "remaining"
                    ? "bg-hero-foreground/15 ring-hero-foreground/25 ring-1"
                    : "bg-hero-foreground/10",
                )}
              >
                <span className={cn("text-caption", t.term !== "remaining" && "text-hero-muted")}>
                  {TERM_LABEL[t.term]}
                  {t.term === "due" && t.count > 0 && ` (${t.count})`}
                </span>
                <Amount
                  amount={t.amount}
                  colorize={false}
                  fractionDigits={0}
                  className="text-body font-semibold"
                />
              </span>
            </li>
          ))}
        </ol>
        <ul className="text-hero-muted text-caption mt-3 flex max-w-prose list-none flex-col gap-1 text-pretty">
          <li>
            יצא: הוצאות נטו שדווחו עד הסנכרון האחרון. לא כולל תנועות עם תאריך עתידי ולא את חיוב
            כרטיס האשראי החודשי המרוכז, שהתנועות שלו כבר נספרות אחת אחת.
          </li>
          <li>
            קבועים: חיובים קבועים שעוד צפויים החודש
            {due && due.term === "due" && due.late > 0 && `, כולל ${due.late} שמאחרים להגיע`}.
          </li>
        </ul>
      </div>
    </div>
  );
}

export function ActiveBody({ outlook, nowMs }: { outlook: ActiveOutlook; nowMs: number }) {
  const over = outlook.overBy !== null;
  return (
    <div className="flex flex-col">
      <Label>
        {over && <WarningCircleIcon weight="fill" className="size-5" />}
        {over ? "חרגת מהיעד החודש" : "נשאר לך החודש"}
        <EstimateTag />
      </Label>
      {over ? (
        <Figure amount={outlook.overBy!}>
          <span className="text-title font-semibold">מעל היעד</span>
        </Figure>
      ) : (
        <Figure amount={outlook.remaining} />
      )}
      <p className="text-lead mt-3 tabular-nums">
        {over ? (
          "כל הוצאה נוספת החודש מגדילה את החריגה"
        ) : (
          <>
            ≈ <Amount amount={outlook.perDay} colorize={false} fractionDigits={0} /> ליום
            <span className="text-hero-muted">
              {outlook.daysLeft === 1 ? " · היום האחרון בחודש" : ` · עוד ${outlook.daysLeft} ימים`}
            </span>
          </>
        )}
      </p>
      <AsOf asOf={outlook.asOf} nowMs={nowMs} />
      <Equation outlook={outlook} />
    </div>
  );
}

function SpentSoFar({ spent }: { spent: number }) {
  return (
    <>
      <Label>יצא עד עכשיו החודש</Label>
      <Figure amount={spent} />
    </>
  );
}

const NOTE =
  "bg-hero-foreground/10 mt-5 flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between";

export function NoTargetBody({
  outlook,
  nowMs,
  onSetTarget,
}: {
  outlook: OutlookOf<"no-target">;
  nowMs: number;
  onSetTarget: () => void;
}) {
  return (
    <div className="flex flex-col">
      <SpentSoFar spent={outlook.spent} />
      {outlook.usualMonth !== null && (
        <p className="text-lead mt-3">
          בחודש רגיל יוצאות אצלך בערך{" "}
          <Amount amount={outlook.usualMonth} colorize={false} fractionDigits={0} />
        </p>
      )}
      <AsOf asOf={outlook.asOf} nowMs={nowMs} />
      <div className={NOTE}>
        <p className="text-body max-w-prose text-pretty">
          {outlook.suggestedTarget !== null ? (
            <>
              עוד אין יעד הוצאות חודשי. לפי החודשים האחרונים, יעד של{" "}
              <Amount
                amount={outlook.suggestedTarget}
                colorize={false}
                fractionDigits={0}
                className="font-semibold"
              />{" "}
              נראה מתאים. עם יעד אפשר לראות כמה נשאר לך החודש.
            </>
          ) : (
            "עוד אין יעד הוצאות חודשי. עם יעד אפשר לראות כמה נשאר לך החודש."
          )}
        </p>
        <button type="button" onClick={onSetTarget} className={cn(HERO_BUTTON, "shrink-0")}>
          {outlook.suggestedTarget !== null ? "בדיקת היעד המוצע" : "קביעת יעד"}
        </button>
      </div>
    </div>
  );
}

export function ThinHistoryBody({
  outlook,
  nowMs,
  onSetTarget,
}: {
  outlook: OutlookOf<"thin-history">;
  nowMs: number;
  onSetTarget: () => void;
}) {
  return (
    <div className="flex flex-col">
      <SpentSoFar spent={outlook.spent} />
      <AsOf asOf={outlook.asOf} nowMs={nowMs} />
      <div className={NOTE}>
        <p className="text-body max-w-prose text-pretty">
          כדי להעריך איך החודש ייגמר צריך לפחות חודש מלא אחד של היסטוריה מכל החשבונות המחוברים. עד
          אז מוצג כאן רק מה שכבר יצא.
        </p>
        <button
          type="button"
          onClick={onSetTarget}
          className={cn(
            HERO_QUIET_BUTTON,
            "decoration-hero-foreground/40 shrink-0 underline underline-offset-4",
          )}
        >
          קביעת יעד חודשי
        </button>
      </div>
    </div>
  );
}

function ClosedSentence({ outlook, month }: { outlook: ClosedOutlook; month: HomeMonth }) {
  const verdict = closedVerdict(outlook);
  const name = monthName(month);
  const by = (
    <Amount
      amount={Math.abs(verdict.net)}
      colorize={false}
      fractionDigits={0}
      className="font-semibold"
    />
  );
  const head =
    verdict.balance === "surplus" ? (
      <>
        ב{name} נכנס יותר ממה שיצא, ב־{by}
      </>
    ) : verdict.balance === "deficit" ? (
      <>
        ב{name} יצא יותר ממה שנכנס, ב־{by}
      </>
    ) : verdict.balance === "even" ? (
      <>ב{name} ההכנסות וההוצאות התקזזו</>
    ) : (
      <>לא נרשמו הכנסות או הוצאות ב{name}</>
    );
  const target =
    verdict.target === null ? null : "over" in verdict.target ? (
      <>
        , וההוצאות עברו את היעד ב־
        <Amount
          amount={verdict.target.over}
          colorize={false}
          fractionDigits={0}
          className="font-semibold"
        />
      </>
    ) : (
      <>
        , וההוצאות נשארו בתוך היעד של{" "}
        <Amount
          amount={verdict.target.within}
          colorize={false}
          fractionDigits={0}
          className="font-semibold"
        />
      </>
    );
  return (
    <p className="text-lead mt-3 max-w-prose text-pretty">
      {head}
      {target}.
    </p>
  );
}

export function ClosedBody({
  outlook,
  month,
  nowMs,
}: {
  outlook: ClosedOutlook;
  month: HomeMonth;
  nowMs: number;
}) {
  const empty = closedVerdict(outlook).balance === "empty";
  return (
    <div className="flex flex-col">
      <Label>{`סיכום ${monthName(month)}`}</Label>
      {!empty && <Figure amount={outlook.net} />}
      <ClosedSentence outlook={outlook} month={month} />
      {!empty && (
        <p className="text-hero-muted text-body mt-1 tabular-nums">
          הכנסות <Amount amount={outlook.income} colorize={false} fractionDigits={0} /> · הוצאות{" "}
          <Amount amount={outlook.expenses} colorize={false} fractionDigits={0} />
        </p>
      )}
      <AsOf asOf={outlook.asOf} nowMs={nowMs} />
    </div>
  );
}

export function NoConnectionBody() {
  return (
    <div className="flex flex-col items-start gap-4">
      <span className="bg-hero-foreground/10 grid size-12 place-items-center rounded-full">
        <BankIcon weight="duotone" className="size-6" />
      </span>
      <div className="flex flex-col gap-2">
        <h3 className="text-title font-semibold">נתחיל בחיבור הבנק הראשון</h3>
        <p className="text-hero-muted text-body max-w-prose text-pretty">
          Yitra מושכת את התנועות מהבנק ומכרטיסי האשראי, ומכאן תראו בכל חודש כמה יצא וכמה נשאר. פרטי
          ההתחברות נשמרים מוצפנים, רק אצלכם.
        </p>
      </div>
      <Link href={settingsSectionHref("accounts")} className={HERO_BUTTON}>
        חיבור בנק או כרטיס אשראי
      </Link>
    </div>
  );
}
