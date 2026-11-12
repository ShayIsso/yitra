"use client";

import * as React from "react";
import { CheckCircleIcon, GaugeIcon, WarningCircleIcon } from "@/components/icons";
import { VERDICT_LABEL } from "@/components/budget-status-card";
import { settingsSectionHref } from "@/components/settings/sections";
import { Amount } from "@/components/ui/amount";
import { Card } from "@/components/ui/card";
import type { BudgetStatus, BudgetVerdict, SavingsTargetStatus } from "@/lib/budgets";
import type { Category } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { SectionLoad } from "./load";
import { Bone, Section, SectionBody, SectionEmpty } from "./parts";
import { budgetRing } from "./view";

export type BudgetsSummary = {
  budgets: BudgetStatus[];
  savingsTarget: SavingsTargetStatus | null;
};

const RING_SIZE = 56;
const RING_STROKE = 6;

function Ring({ fill, attention }: { fill: number; attention: boolean }) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const c = RING_SIZE / 2;
  return (
    <svg
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      className="-rotate-90"
      aria-hidden="true"
    >
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={RING_STROKE}
        className="text-muted"
      />
      {fill > 0 && (
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${fill} 1`}
          className={attention ? "text-attention" : "text-bar-strong"}
        />
      )}
    </svg>
  );
}

/** The verdict in words with a glyph: coral only when it calls for attention. */
function VerdictChip({ verdict, attention }: { verdict: BudgetVerdict; attention: boolean }) {
  return (
    <span
      className={cn(
        "text-caption inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
        attention ? "bg-attention-subtle text-attention-text" : "bg-muted text-muted-foreground",
      )}
    >
      {attention ? (
        <WarningCircleIcon weight="fill" className="size-3.5" />
      ) : (
        <CheckCircleIcon weight="fill" className="size-3.5" />
      )}
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

const TILE = "flex-row items-center gap-3 p-3";

function RingTile({ status, category }: { status: BudgetStatus; category: Category | undefined }) {
  const { pace } = status;
  const ring = budgetRing(pace);
  return (
    <Card className={TILE}>
      <div className="relative grid shrink-0 place-items-center">
        <Ring fill={ring.fill} attention={ring.attention} />
        {ring.percent !== null && (
          <span className="text-caption absolute font-bold tabular-nums">{ring.percent}%</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start">
        <p className="text-body flex w-full min-w-0 items-center gap-1.5 font-semibold">
          {category && (
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: category.color }}
            />
          )}
          <span className="truncate">{category?.name ?? "—"}</span>
        </p>
        <p className="text-caption text-muted-foreground">
          <Amount amount={pace.spent} colorize={false} fractionDigits={0} /> מתוך{" "}
          <Amount amount={pace.limit} colorize={false} fractionDigits={0} />
        </p>
        <span className="mt-1 flex">
          <VerdictChip verdict={pace.verdict} attention={ring.attention} />
        </span>
      </div>
    </Card>
  );
}

function RingTileSkeleton() {
  return (
    <Card className={TILE}>
      <span className="bg-muted size-14 shrink-0 animate-pulse rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col items-start">
        <p className="text-body">
          <Bone className="w-24" />
        </p>
        <p className="text-caption">
          <Bone className="w-28" />
        </p>
        <span className="bg-muted mt-1 h-5 w-14 animate-pulse rounded-full" />
      </div>
    </Card>
  );
}

const ROW = "flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3";

/** The month's savings target: actual against target, with the month-close verdict in words. */
function SavingsTargetRow({ status }: { status: SavingsTargetStatus }) {
  return (
    <Card className={cn("gap-0 py-0", ROW)}>
      <p className="text-body">
        <span className="text-muted-foreground">יעד חיסכון </span>
        <span className="font-semibold">
          <Amount amount={status.netSavings} colorize={false} fractionDigits={0} /> מתוך{" "}
          <Amount amount={status.target} colorize={false} fractionDigits={0} />
        </span>
      </p>
      {status.verdict === "met" && (
        <span className="text-caption text-muted-foreground inline-flex items-center gap-1 font-medium">
          <CheckCircleIcon weight="fill" className="text-primary size-3.5" />
          הושג
        </span>
      )}
      {status.verdict === "missed" && (
        <span className="text-caption text-attention-text inline-flex items-center gap-1 font-medium">
          <WarningCircleIcon weight="fill" className="size-3.5" />
          לא הושג
        </span>
      )}
    </Card>
  );
}

function SavingsTargetSkeleton() {
  return (
    <Card className={cn("gap-0 py-0", ROW)}>
      <p className="text-body">
        <Bone className="w-48" />
      </p>
    </Card>
  );
}

const GRID = "grid grid-cols-1 gap-2 sm:grid-cols-2";

/**
 * The month's budgets as rings, driven by the pace the budgets module
 * computed (CONTEXT.md "budget pace"), and the savings target when one is set.
 */
export function BudgetsSection({
  load,
  categoriesById,
}: {
  load: SectionLoad<BudgetsSummary>;
  categoriesById: ReadonlyMap<string, Category>;
}) {
  const { last } = load;
  const skeletonTiles = last ? Math.max(1, last.budgets.length) : 2;
  return (
    <Section title="תקציבים" link={{ label: "ניהול", href: settingsSectionHref("budgets") }}>
      <SectionBody
        load={load}
        what="התקציבים"
        skeleton={
          <div className="flex flex-col gap-2">
            {last?.savingsTarget && <SavingsTargetSkeleton />}
            <div className={GRID}>
              {Array.from({ length: skeletonTiles }, (_, i) => (
                <RingTileSkeleton key={i} />
              ))}
            </div>
          </div>
        }
      >
        {(data) => (
          <div className="flex flex-col gap-2">
            {data.savingsTarget && <SavingsTargetRow status={data.savingsTarget} />}
            {data.budgets.length === 0 ? (
              <SectionEmpty
                icon={<GaugeIcon weight="duotone" className="size-6" />}
                heading="עוד אין תקציבים"
                explainer="תקרה חודשית לקטגוריה תופיע כאן כטבעת, עם הקצב שבו החודש מתקדם."
                action={{ label: "הגדרת תקציב", href: settingsSectionHref("budgets") }}
              />
            ) : (
              <div className={GRID}>
                {data.budgets.map((status) => (
                  <RingTile
                    key={status.budget.id}
                    status={status}
                    category={categoriesById.get(status.budget.categoryId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </SectionBody>
    </Section>
  );
}
