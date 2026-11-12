"use client";

import * as React from "react";
import Link from "next/link";
import { CaretLeftIcon, CheckCircleIcon } from "@/components/icons";
import { settingsSectionHref } from "@/components/settings/sections";
import { Card } from "@/components/ui/card";
// Not the module's index: its DB-backed exports must not enter a client bundle.
import {
  ONBOARDING_PATH_STEPS,
  deriveOnboardingPath,
  shouldShowOnboardingPath,
  type OnboardingPathFacts,
  type OnboardingPathStepId,
} from "@/lib/onboarding/path";
import { transactionsHref } from "@/lib/transactions/view-params";
import type { SectionLoad } from "./load";
import { Bone, ListCard, ROW, Section, SectionBody, type LinkTarget } from "./parts";
import { attentionItems, type AttentionCounts } from "./view";

const STEP_DEFS: Record<OnboardingPathStepId, LinkTarget> = {
  connect: { label: "חיבור בנק או כרטיס אשראי", href: settingsSectionHref("accounts") },
  "first-sync": { label: "סנכרון ראשון", href: "/sync" },
  review: { label: "סיווג התנועות שלא סווגו", href: transactionsHref({ uncategorized: true }) },
};

/** Setup steps still open, while the first two aren't done (`shouldShowOnboardingPath`). */
function OnboardingPath({ facts }: { facts: OnboardingPathFacts }) {
  const steps = deriveOnboardingPath(facts);
  if (!shouldShowOnboardingPath(steps)) return null;
  return (
    <Card className="gap-2 p-4" aria-label="השלמת ההגדרה" role="region">
      <p className="text-body font-semibold">להשלמת ההגדרה</p>
      <ol className="flex flex-col">
        {steps.map(({ id, status }) => {
          const { label, href } = STEP_DEFS[id];
          return status === "done" ? (
            <li
              key={id}
              className="text-body text-muted-foreground flex min-h-11 items-center gap-2"
              aria-label={`${label}, הושלם`}
            >
              <CheckCircleIcon weight="fill" className="text-primary size-5 shrink-0" />
              <span className="line-through">{label}</span>
            </li>
          ) : (
            <li key={id}>
              <Link
                href={href}
                className="press text-body focus-visible:ring-ring/50 hover:bg-muted -mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 font-medium outline-none focus-visible:ring-3"
              >
                <span
                  aria-hidden="true"
                  className="border-muted-foreground size-5 shrink-0 rounded-full border-2"
                />
                <span className="flex-1">{label}</span>
                <CaretLeftIcon className="text-muted-foreground size-4" />
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/**
 * What waits for the owner (uncategorized rows, AI suggestions, subscription
 * anomalies, reconciliation groups), each a link to its filtered view, with
 * the setup path above it while setup is unfinished. The two land together:
 * the skeleton stays until the setup facts are known too, so the path never
 * pushes the list (and everything below it) down after it drew.
 */
export function AttentionSection({
  load,
  onboarding,
  expectOnboarding,
}: {
  load: SectionLoad<AttentionCounts>;
  /** Null while a fact is still loading. */
  onboarding: OnboardingPathFacts | null;
  /** The setup card will almost surely show, so the skeleton reserves its room. */
  expectOnboarding: boolean;
}) {
  const together: SectionLoad<{ counts: AttentionCounts; onboarding: OnboardingPathFacts }> = {
    ...load,
    data: load.data !== null && onboarding !== null ? { counts: load.data, onboarding } : null,
    last: null,
  };
  return (
    <Section title="דורש טיפול">
      <SectionBody
        load={together}
        what="מה שדורש טיפול"
        skeleton={<AttentionSkeleton onboarding={expectOnboarding} />}
      >
        {(data) => (
          <>
            <OnboardingPath facts={data.onboarding} />
            <AttentionList counts={data.counts} />
          </>
        )}
      </SectionBody>
    </Section>
  );
}

function AttentionList({ counts }: { counts: AttentionCounts }) {
  const items = attentionItems(counts);
  if (items.length === 0) {
    return (
      <Card className="flex-row items-center gap-3 p-4">
        <CheckCircleIcon weight="fill" className="text-primary size-8 shrink-0" />
        <div className="flex flex-col">
          <p className="text-body font-semibold">הכל מטופל</p>
          <p className="text-body text-muted-foreground">אין תנועות או התאמות שמחכות לך.</p>
        </div>
      </Card>
    );
  }
  return (
    <ListCard>
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className={`${ROW} press hover:bg-muted focus-visible:ring-ring/50 outline-none focus-visible:ring-3 focus-visible:ring-inset`}
          >
            <span className="bg-attention text-attention-foreground text-body grid h-7 min-w-7 shrink-0 place-items-center rounded-full px-2 font-bold tabular-nums">
              {item.count}
            </span>
            <span className="text-body min-w-0 flex-1 font-medium">{item.label}</span>
            <CaretLeftIcon className="text-muted-foreground size-4 shrink-0" />
          </Link>
        </li>
      ))}
    </ListCard>
  );
}

/** The setup card's shape: its title and one 44px line per step. */
function OnboardingSkeleton() {
  return (
    <Card className="gap-2 p-4">
      <p className="text-body">
        <Bone className="w-28" />
      </p>
      <ol className="flex flex-col">
        {ONBOARDING_PATH_STEPS.map((id) => (
          <li key={id} className="text-body flex min-h-11 items-center gap-2">
            <span className="bg-muted size-5 shrink-0 animate-pulse rounded-full" />
            <Bone className="w-40" />
          </li>
        ))}
      </ol>
    </Card>
  );
}

function AttentionSkeleton({ onboarding }: { onboarding: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {onboarding && <OnboardingSkeleton />}
      <ListCard>
        {[0, 1].map((i) => (
          <li key={i} className={ROW}>
            <span className="bg-muted size-7 shrink-0 animate-pulse rounded-full" />
            <span className="text-body flex-1">
              <Bone className="w-36" />
            </span>
          </li>
        ))}
      </ListCard>
    </div>
  );
}
