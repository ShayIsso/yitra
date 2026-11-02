"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  ArrowsLeftRightIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
  type GlyphProps,
} from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function StatePanel({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: ComponentType<GlyphProps<"duotone">>;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <Card className="items-center gap-0 px-6 py-14 text-center">
      <span className="bg-muted text-foreground mb-4 grid size-14 place-items-center rounded-full">
        <Icon weight="duotone" className="size-7" />
      </span>
      <h2 className="text-lead font-semibold">{title}</h2>
      <p className="text-body text-muted-foreground mt-1 max-w-sm">{body}</p>
      <div className="mt-5">{action}</div>
    </Card>
  );
}

export function NoTransactions() {
  return (
    <StatePanel
      icon={ArrowsLeftRightIcon}
      title="עוד אין כאן תנועות"
      body="אחרי הסנכרון הראשון יופיעו כאן כל התנועות מהבנקים ומכרטיסי האשראי, מסודרות לפי יום."
      action={
        <Link href="/sync" className={cn(buttonVariants(), "h-11 px-5")}>
          לסנכרון
        </Link>
      }
    />
  );
}

export function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <StatePanel
      icon={MagnifyingGlassIcon}
      title="אין תנועות שמתאימות לסינון"
      body="אפשר לשנות את החיפוש, את טווח התאריכים או את הקטגוריה, או לנקות את הסינון."
      action={
        <Button variant="outline" onClick={onClear} className="h-11 px-5">
          ניקוי הסינון
        </Button>
      }
    />
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card role="alert" className="items-start gap-3 p-4 sm:flex-row sm:items-center">
      <WarningCircleIcon weight="fill" className="text-attention size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold">לא הצלחנו לטעון את התנועות</p>
        <p className="text-body text-muted-foreground">
          ייתכן שהשרת לא זמין לרגע. הנתונים שלך לא נפגעו.
        </p>
      </div>
      <Button variant="outline" onClick={onRetry} className="h-11 px-5 sm:h-9">
        ניסיון חוזר
      </Button>
    </Card>
  );
}

/** Mirrors the feed's day group: heading, then rows of name/meta and amount. */
function FeedSkeleton() {
  return (
    <div className="space-y-5 lg:hidden" aria-hidden>
      {[3, 2].map((count, g) => (
        <div key={g}>
          <Skeleton className="mx-1 mb-2 h-4 w-28" />
          <Card className="divide-border gap-0 divide-y py-0">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}

/** Mirrors the table: header row, then dense rows with the amount at the end. */
function TableSkeleton() {
  return (
    <Card className="hidden gap-0 py-0 lg:flex" aria-hidden>
      <div className="border-border flex h-10 items-center gap-4 border-b px-4">
        <Skeleton className="h-3 w-full" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="border-border flex h-[3.25rem] items-center gap-4 border-b px-4 last:border-0"
        >
          <Skeleton className="size-4" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </Card>
  );
}

export function ListSkeleton() {
  return (
    <div role="status" aria-label="טוען תנועות">
      <FeedSkeleton />
      <TableSkeleton />
    </div>
  );
}
