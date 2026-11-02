"use client";

import { useEffect, useState } from "react";
import { loadDefaultCategoriesAction } from "@/app/setup/categories-actions";
import { Skeleton } from "@/components/ui/skeleton";
import type { TaxonomyEntry, TaxonomyView } from "@/lib/onboarding";
import { StepFooter } from "../step-footer";
import type { SetupStepProps, StepMeta } from "../step-navigation";

/** Slot owned by #259: the seeded taxonomy, shown read-only (epic #248 §10). Contract: `../step-navigation.ts`. */
export const categoriesStepMeta: StepMeta = {
  label: "קטגוריות",
  title: "הקטגוריות שלכם",
  description: "יצרנו רשימת קטגוריות התחלתית לסיווג התנועות. אפשר לשנות אותה בכל עת בהגדרות.",
};

const TYPE_LABELS: Record<TaxonomyEntry["type"], string> = {
  income: "הכנסה",
  expense: "הוצאה",
  investment: "השקעה",
  transfer: "העברה",
  ignore: "התעלמות",
};

type Load = { status: "loading" } | { status: "ready"; view: TaxonomyView } | { status: "error" };

function Entry({ entry }: { entry: TaxonomyEntry }) {
  return (
    <li className="text-body flex min-h-9 items-center gap-2.5">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: entry.color }}
      />
      <span className="min-w-0 truncate">{entry.name}</span>
      <span className="text-muted-foreground text-caption ms-auto shrink-0">
        {TYPE_LABELS[entry.type]}
      </span>
    </li>
  );
}

function Section({ title, entries }: { title: string; entries: TaxonomyEntry[] }) {
  return (
    <section className="border-border mb-3 break-inside-avoid rounded-xl border px-4 pt-3 pb-2">
      <h2 className="text-body font-semibold">{title}</h2>
      <ul className="divide-border flex flex-col divide-y">
        {entries.map((entry) => (
          <Entry key={entry.name} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function Taxonomy({ view }: { view: TaxonomyView }) {
  return (
    <div className="md:columns-2 md:gap-3">
      {view.groups.map((group) => (
        <Section key={group.name} title={group.name} entries={group.children} />
      ))}
      {view.standalone.length > 0 && <Section title="קטגוריות נוספות" entries={view.standalone} />}
    </div>
  );
}

export function CategoriesStep({ navigation }: SetupStepProps) {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadDefaultCategoriesAction()
      .then((view): Load => ({ status: "ready", view }))
      .catch((): Load => ({ status: "error" }))
      .then((next) => {
        if (!cancelled) setLoad(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {load.status === "loading" && (
        <div aria-busy="true" className="flex flex-col gap-3 md:flex-row">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl max-md:hidden" />
        </div>
      )}
      {load.status === "ready" && <Taxonomy view={load.view} />}
      {load.status === "error" && (
        <p role="alert" className="text-muted-foreground text-body">
          לא הצלחנו להציג את הקטגוריות כרגע. הן יתווספו בסיום ההגדרה, ואפשר לראות אותן בהגדרות.
        </p>
      )}
      <StepFooter navigation={navigation} />
    </div>
  );
}
