"use client";

import * as React from "react";
import Link from "next/link";
import { MonthlyView } from "./monthly-view";
import { Segmented } from "./parts";
import { TrendsView } from "./trends-view";

type View = "monthly" | "trends";

export function ReportsPanel() {
  const [view, setView] = React.useState<View>("monthly");
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-headline font-bold tracking-tight">דוחות</h1>
          <p className="text-body text-muted-foreground mt-1">
            כל חודש שנסגר מול אותו חודש אשתקד, ומגמות לאורך זמן. החודש הנוכחי חי ב
            <Link href="/" className="text-primary underline-offset-4 hover:underline">
              מסך הבית
            </Link>
            .
          </p>
        </div>
        <Segmented<View>
          label="סוג הדוח"
          value={view}
          onChange={setView}
          options={[
            { value: "monthly", label: "דוח חודשי" },
            { value: "trends", label: "מגמות" },
          ]}
          className="w-full sm:w-auto"
        />
      </header>
      {view === "monthly" ? <MonthlyView /> : <TrendsView />}
    </div>
  );
}
