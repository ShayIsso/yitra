"use client";

import * as React from "react";
import { PiggyBankIcon, WarningCircleIcon } from "@/components/icons";
import { settingsSectionHref } from "@/components/settings/sections";
import { Amount } from "@/components/ui/amount";
import type { GoalPaceVerdict } from "@/lib/goals";
import { cn } from "@/lib/utils";
import type { SectionLoad } from "./load";
import { Bone, ListCard, Section, SectionBody, SectionEmpty } from "./parts";
import { goalFillPercent } from "./view";

/** `/api/goals`: the goal ladder (CONTEXT.md "goal ladder"), computed server-side. */
export type GoalsLadder = {
  goals: {
    id: string;
    name: string;
    /** Capped ladder fill: opening plus its slice of the shared savings pool. */
    current: number;
    target: number;
    paceVerdict: GoalPaceVerdict;
  }[];
  /** Pool beyond every goal's need. */
  surplus: number;
};

const PACE_LABEL: Record<GoalPaceVerdict, string> = {
  "ahead-or-on-pace": "בקצב או לפני הקצב",
  "behind-pace": "מאחורי הקצב",
  "no-deadline": "ללא יעד זמן",
};

const GOAL_ROW = "flex flex-col gap-2 px-4 py-3";

function GoalRow({ goal }: { goal: GoalsLadder["goals"][number] }) {
  const percent = goalFillPercent(goal.current, goal.target);
  const behind = goal.paceVerdict === "behind-pace";
  return (
    <li className={GOAL_ROW}>
      <div className="text-body flex items-center justify-between gap-3">
        <span className="truncate font-semibold">{goal.name}</span>
        <span className="text-muted-foreground shrink-0 tabular-nums">{Math.round(percent)}%</span>
      </div>
      {/* Progress, not money: a neutral fill (pos/neg are for amounts). */}
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div className="bg-bar-strong h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
      <div className="text-caption flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-muted-foreground">
          <Amount amount={goal.current} colorize={false} fractionDigits={0} /> מתוך{" "}
          <Amount amount={goal.target} colorize={false} fractionDigits={0} />
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 font-medium",
            behind ? "text-attention-text" : "text-muted-foreground",
          )}
        >
          {behind && <WarningCircleIcon weight="fill" className="size-3.5" />}
          {PACE_LABEL[goal.paceVerdict]}
        </span>
      </div>
    </li>
  );
}

function GoalRowSkeleton() {
  return (
    <li className={GOAL_ROW}>
      <div className="text-body">
        <Bone className="w-28" />
      </div>
      <div className="bg-muted h-2 animate-pulse rounded-full" />
      <div className="text-caption">
        <Bone className="w-36" />
      </div>
    </li>
  );
}

const SURPLUS_ROW = "text-body flex min-h-11 items-center justify-between gap-3 px-4 py-3";

/** Savings goals and how far the shared pool fills each, plus any unallocated surplus. */
export function GoalsSection({ load }: { load: SectionLoad<GoalsLadder> }) {
  return (
    <Section title="יעדי חיסכון" link={{ label: "ניהול", href: settingsSectionHref("goals") }}>
      <SectionBody
        load={load}
        what="יעדי החיסכון"
        skeleton={
          <ListCard>
            <GoalRowSkeleton />
            <GoalRowSkeleton />
          </ListCard>
        }
      >
        {(data) =>
          data.goals.length === 0 ? (
            <SectionEmpty
              icon={<PiggyBankIcon weight="duotone" className="size-6" />}
              heading="עוד אין יעדי חיסכון"
              explainer="יעד כמו קרן חירום או חופשה יופיע כאן, עם ההתקדמות אליו מתוך החיסכון."
              action={{ label: "הגדרת יעד", href: settingsSectionHref("goals") }}
            />
          ) : (
            <ListCard>
              {data.goals.map((goal) => (
                <GoalRow key={goal.id} goal={goal} />
              ))}
              {data.surplus > 0 && (
                <li className={SURPLUS_ROW}>
                  <span className="text-muted-foreground inline-flex items-center gap-2">
                    <PiggyBankIcon weight="duotone" className="size-5" />
                    עודף ללא יעד
                  </span>
                  <Amount
                    amount={data.surplus}
                    colorize={false}
                    fractionDigits={0}
                    className="font-semibold"
                  />
                </li>
              )}
            </ListCard>
          )
        }
      </SectionBody>
    </Section>
  );
}
