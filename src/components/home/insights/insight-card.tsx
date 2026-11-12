"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDotsIcon,
  CaretLeftIcon,
  CreditCardIcon,
  FireIcon,
  GaugeIcon,
  SparkleIcon,
  TrayIcon,
} from "@/components/icons";
import { CategoryDot } from "@/components/category-dot";
import { Amount } from "@/components/ui/amount";
import { Card } from "@/components/ui/card";
import { monthPosition, type Insight, type InsightMonth } from "@/lib/analytics/insights";
import { cn } from "@/lib/utils";
import { formatDayMonth } from "../format";
import { HeroAmount } from "../hero-states";
import { CategoryIcon } from "@/components/category-icon";
import { cardDebitLines, insightHref, isAttentionInsight } from "./insight-view";

/** Every card in the row is this size, the skeleton's bones included, so loading shifts nothing. */
export const INSIGHT_CARD_SIZE = "h-44 w-60 shrink-0 snap-start";

export type CardInsight = Exclude<Insight, { kind: "recap" }>;

const COUNT = new Intl.NumberFormat("he-IL");

function Value({ amount }: { amount: number }) {
  return <Amount amount={amount} size="title" figure colorize={false} fractionDigits={0} />;
}

/** One insight card: a duotone mark, an eyebrow, a title, the figure the server returned. */
export function InsightCard({
  insight,
  month,
  today,
}: {
  insight: CardInsight;
  month: InsightMonth;
  today: string;
}) {
  const href = insightHref(insight, month);
  const attention = isAttentionInsight(insight);
  const { mark, body } = cardContent(insight, month, today);

  const card = (
    <Card className={cn("h-full gap-0 p-4", href && "hover-tint")}>
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "grid size-9 place-items-center rounded-full",
            attention ? "bg-attention text-attention-foreground" : "bg-muted text-foreground",
          )}
        >
          {mark}
        </span>
        {href && <CaretLeftIcon className="text-muted-foreground size-4" />}
      </div>
      <div className="mt-auto flex min-w-0 flex-col">{body}</div>
    </Card>
  );

  return href ? (
    <Link
      href={href}
      className={cn(
        INSIGHT_CARD_SIZE,
        "press focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-3",
      )}
    >
      {card}
    </Link>
  ) : (
    <div className={INSIGHT_CARD_SIZE}>{card}</div>
  );
}

function Eyebrow({
  children,
  attention = false,
}: {
  children: React.ReactNode;
  attention?: boolean;
}) {
  return (
    <p
      className={cn(
        "text-caption truncate",
        attention ? "text-attention-text font-medium" : "text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <p className="text-body line-clamp-2 font-semibold">{children}</p>;
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="text-caption text-muted-foreground truncate tabular-nums">{children}</p>;
}

const MARK = "size-5";

function cardContent(
  insight: CardInsight,
  month: InsightMonth,
  today: string,
): { mark: React.ReactNode; body: React.ReactNode } {
  switch (insight.kind) {
    case "card-debit": {
      const { shown, more } = cardDebitLines(insight.cards);
      const several = insight.cards.length > 1;
      return {
        mark: <CreditCardIcon weight="duotone" className={MARK} />,
        body: (
          <>
            <Eyebrow>{several ? "חיובי אשראי קרובים" : "חיוב אשראי קרוב"}</Eyebrow>
            <Value amount={insight.total} />
            {/* Each card charges on its own date: never one combined date. */}
            <ul className="mt-0.5">
              {shown.map((c) => (
                <li
                  key={c.accountId}
                  className="text-caption text-muted-foreground flex gap-1 tabular-nums"
                >
                  <span className="truncate">{c.displayName}</span>
                  <span className="shrink-0">· {formatDayMonth(c.date)}</span>
                  {several && <HeroAmount amount={c.amount} className="ms-auto shrink-0" />}
                </li>
              ))}
              {more > 0 && (
                <li className="text-caption text-muted-foreground">
                  {more === 1 ? "ועוד כרטיס אחד" : `ועוד ${COUNT.format(more)} כרטיסים`}
                </li>
              )}
            </ul>
          </>
        ),
      };
    }
    case "uncategorized":
      return {
        mark: <TrayIcon weight="duotone" className={MARK} />,
        body: (
          <>
            <Eyebrow>{insight.count === 1 ? "מחכה לסיווג" : "מחכות לסיווג"}</Eyebrow>
            <Title>
              {insight.count === 1
                ? "עסקה אחת בלי קטגוריה"
                : `${COUNT.format(insight.count)} עסקאות בלי קטגוריה`}
            </Title>
            <Caption>לסיווג</Caption>
          </>
        ),
      };
    case "needs-review":
      return {
        mark: <SparkleIcon weight="duotone" className={MARK} />,
        body: (
          <>
            <Eyebrow>הצעות סיווג</Eyebrow>
            <Title>
              {insight.count === 1
                ? "הצעה אחת מחכה לאישור"
                : `${COUNT.format(insight.count)} הצעות מחכות לאישור`}
            </Title>
            <Caption>לאישור ההצעות</Caption>
          </>
        ),
      };
    case "budget-risk": {
      const [first, ...rest] = insight.budgets;
      return {
        mark: <GaugeIcon weight="duotone" className={MARK} />,
        body: (
          <>
            <Eyebrow attention>
              {first.verdict === "over" ? "עבר את התקציב" : "בדרך לעבור את התקציב"}
              {rest.length > 0 && ` · ועוד ${COUNT.format(rest.length)}`}
            </Eyebrow>
            <Title>{first.categoryName}</Title>
            <p className="text-body text-muted-foreground tabular-nums">
              <HeroAmount amount={first.spent} className="text-foreground font-semibold" /> מתוך{" "}
              <HeroAmount amount={first.limit} />
            </p>
          </>
        ),
      };
    }
    case "upcoming-recurring":
      return {
        mark: <CalendarDotsIcon weight="duotone" className={MARK} />,
        body: (
          <>
            <Eyebrow>קבועים שעוד יחויבו החודש</Eyebrow>
            <Title>
              {insight.charges.length === 1
                ? insight.charges[0].name
                : `${COUNT.format(insight.charges.length)} חיובים קבועים`}
            </Title>
            <Value amount={insight.total} />
          </>
        ),
      };
    case "category-jump":
      return {
        mark: <CategoryIcon icon={insight.icon} className={MARK} />,
        body: (
          <>
            <Eyebrow>
              {monthPosition(month, today).phase === "current"
                ? "עלייה מול אותם ימים בחודש שעבר"
                : "עלייה מול החודש שעבר"}
            </Eyebrow>
            <Title>
              <span className="me-1.5 inline-flex align-middle">
                <CategoryDot color={insight.color} />
              </span>
              {insight.name}
            </Title>
            <p className="text-body flex flex-wrap items-baseline gap-x-1">
              <span className="text-muted-foreground">עוד</span>
              <Value amount={insight.change} />
            </p>
            <Caption>
              <HeroAmount amount={insight.amount} /> לעומת <HeroAmount amount={insight.previous} />
            </Caption>
          </>
        ),
      };
    case "biggest-expense":
      return {
        mark: <FireIcon weight="duotone" className={MARK} />,
        body: (
          <>
            <Eyebrow>ההוצאה הגדולה ביותר</Eyebrow>
            <p className="text-body truncate font-semibold">{insight.description}</p>
            <Value amount={insight.amount} />
            <Caption>
              {formatDayMonth(insight.date)}
              {insight.categoryName && ` · ${insight.categoryName}`}
            </Caption>
          </>
        ),
      };
  }
}
