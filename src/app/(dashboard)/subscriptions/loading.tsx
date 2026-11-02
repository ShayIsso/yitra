import { Skeleton } from "@/components/ui/skeleton";
import { SubscriptionsHeader } from "./header";

/** Layout-matched to the populated page: header, filter row, then the list card. */
export default function SubscriptionsLoading() {
  return (
    <div className="space-y-6" aria-busy aria-label="טוען את החיובים הקבועים">
      <SubscriptionsHeader />
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {[16, 24, 20, 18].map((w, i) => (
              <Skeleton
                key={i}
                className="h-11 rounded-full md:h-9"
                style={{ width: `${w * 4}px` }}
              />
            ))}
          </div>
          <Skeleton className="h-11 w-full rounded-lg sm:w-64 md:h-9" />
        </div>
        <div className="bg-card overflow-hidden rounded-xl border border-[color:var(--card-border)] shadow-[var(--card-shadow)]">
          <div className="hidden h-11 border-b lg:block" />
          <ul className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_7.5rem_15rem_8.5rem_9.5rem] lg:items-center"
              >
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-5 w-16 justify-self-end" />
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-5 w-12 justify-self-end rounded-full lg:justify-self-start" />
                <Skeleton className="col-span-2 h-11 w-28 justify-self-end md:h-8 lg:col-span-1" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
