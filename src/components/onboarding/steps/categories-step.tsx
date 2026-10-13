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
    <li className="flex items-center gap-2 text-sm">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: entry.color }}
      />
      <span>{entry.name}</span>
      <span className="text-muted-foreground ms-auto text-xs">{TYPE_LABELS[entry.type]}</span>
    </li>
  );
}

function Section({ title, entries }: { title: string; entries: TaxonomyEntry[] }) {
  return (
    <section className="border-border rounded-lg border">
      <h3 className="bg-muted/50 px-4 py-2 text-sm font-semibold">{title}</h3>
      <ul className="flex flex-col gap-2 px-4 py-3">
        {entries.map((entry) => (
          <Entry key={entry.name} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function Taxonomy({ view }: { view: TaxonomyView }) {
  return (
    <div className="flex flex-col gap-4">
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
      {load.status === "loading" && <Skeleton className="h-64 w-full" />}
      {load.status === "ready" && <Taxonomy view={load.view} />}
      {load.status === "error" && (
        <p role="alert" className="text-muted-foreground text-sm">
          לא הצלחנו להציג את הקטגוריות כרגע. הן יתווספו בסיום ההגדרה, ואפשר לראות אותן בהגדרות.
        </p>
      )}
      <StepFooter navigation={navigation} />
    </div>
  );
}
