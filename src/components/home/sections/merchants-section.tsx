"use client";

import * as React from "react";
import { StorefrontIcon } from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import type { TopMerchant } from "@/lib/analytics";
import type { SectionLoad } from "./load";
import { Bone, ListCard, Section, SectionBody, SectionEmpty } from "./parts";
import { merchantBarPercents } from "./view";

const ROW = "flex min-h-12 items-center gap-3 px-4 py-2.5";
const SKELETON_ROWS = 5;

function MerchantRow({ merchant, percent }: { merchant: TopMerchant; percent: number }) {
  return (
    <li className={ROW}>
      <span className="text-body min-w-0 flex-1 truncate">{merchant.merchant}</span>
      <span
        aria-hidden="true"
        className="bg-muted h-1.5 w-12 shrink-0 overflow-hidden rounded-full sm:w-20"
      >
        <span
          className="bg-bar-strong block h-full rounded-full"
          style={{ width: `${percent}%` }}
        />
      </span>
      {/* Neutral: the list is money out by definition, so a sign colour would only be noise. */}
      <Amount
        amount={merchant.amount}
        colorize={false}
        fractionDigits={0}
        className="text-body shrink-0 font-semibold whitespace-nowrap"
      />
    </li>
  );
}

/**
 * The month's biggest merchants by net spend. The server ranks them and
 * applies the spend floor (a merchant netting ≤ 0 is absent) and the
 * settlement-lump exclusions; this only draws the list.
 */
export function MerchantsSection({ load }: { load: SectionLoad<TopMerchant[]> }) {
  const { last } = load;
  const skeletonRows = last && last.length > 0 ? last.length : SKELETON_ROWS;
  return (
    <Section title="בתי עסק מובילים">
      <SectionBody
        load={load}
        what="בתי העסק המובילים"
        skeleton={
          <ListCard>
            {Array.from({ length: skeletonRows }, (_, i) => (
              <li key={i} className={ROW}>
                <span className="text-body flex-1">
                  <Bone className="w-28" />
                </span>
                <span className="text-body">
                  <Bone className="w-16" />
                </span>
              </li>
            ))}
          </ListCard>
        }
      >
        {(merchants) => <MerchantList merchants={merchants} />}
      </SectionBody>
    </Section>
  );
}

function MerchantList({ merchants }: { merchants: TopMerchant[] }) {
  const percents = React.useMemo(() => merchantBarPercents(merchants), [merchants]);
  if (merchants.length === 0) {
    return (
      <SectionEmpty
        icon={<StorefrontIcon weight="duotone" className="size-6" />}
        heading="אין הוצאות בבתי עסק החודש"
        explainer="כשיצטברו הוצאות מסווגות בחודש הזה, בתי העסק הגדולים יופיעו כאן."
      />
    );
  }
  return (
    <ListCard>
      {merchants.map((m, i) => (
        <MerchantRow key={`${m.merchant}-${i}`} merchant={m} percent={percents[i]} />
      ))}
    </ListCard>
  );
}
