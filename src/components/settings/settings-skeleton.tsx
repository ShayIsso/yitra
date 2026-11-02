"use client";

import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SECTION_GROUPS, SECTION_PARAM, parseSettingsSection } from "./sections";

/**
 * The settings page while its data loads, laid out like `SettingsLayout`: the
 * grouped list (or, for a drilled-in phone URL, a section) and from `md` the
 * side nav beside a section of list rows.
 */
export function SettingsSkeleton() {
  const drilled = parseSettingsSection(useSearchParams().get(SECTION_PARAM)) !== null;

  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-6xl flex-col gap-6 md:gap-8">
      <span className="sr-only">טוען הגדרות</span>
      <div className={cn("flex flex-col gap-1", drilled && "max-md:hidden")}>
        <Skeleton className="h-[2.125rem] w-28" />
        <Skeleton className="h-[1.375rem] w-56" />
      </div>
      <div className="flex flex-col gap-6 md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
        <div className={cn("flex flex-col gap-6 md:gap-5", drilled && "max-md:hidden")}>
          {SECTION_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-2 md:gap-1">
              <Skeleton className="mx-4 h-4 w-14 md:mx-3" />
              <Card className="gap-0 py-0 md:border-0 md:bg-transparent md:shadow-none">
                {group.sections.map((section) => (
                  <div
                    key={section}
                    className="flex min-h-14 items-center gap-3 px-4 md:min-h-11 md:px-3"
                  >
                    <Skeleton className="size-9 shrink-0 rounded-lg md:size-5" />
                    <Skeleton className="h-4 flex-1 md:max-w-32" />
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
        <div className={cn("flex min-w-0 flex-col gap-5", !drilled && "max-md:hidden")}>
          <Skeleton className="h-11 w-28 md:hidden" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <Card className="gap-0 py-0">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex min-h-16 items-center gap-3 px-4">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
