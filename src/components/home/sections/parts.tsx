"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowsClockwiseIcon, CaretLeftIcon, WarningCircleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SectionLoad } from "./load";

/** A titled home section; the title row keeps one height whether or not it has a link. */
export function Section({
  title,
  link,
  children,
}: {
  title: string;
  link?: { label: string; href: string };
  children: React.ReactNode;
}) {
  const titleId = React.useId();
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-11 items-center justify-between gap-3 px-1">
        <h2 id={titleId} className="text-title font-bold">
          {title}
        </h2>
        {link && (
          <Link
            href={link.href}
            className="press text-body text-primary focus-visible:ring-ring/50 -me-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 font-semibold outline-none hover:underline focus-visible:ring-3"
          >
            {link.label}
            <CaretLeftIcon className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** A section's body for each load state: its skeleton, its own error, or the content. */
export function SectionBody<T>({
  load,
  what,
  skeleton,
  children,
}: {
  load: SectionLoad<T>;
  /** Completes "לא הצלחנו לטעון את …". */
  what: string;
  skeleton: React.ReactNode;
  children: (data: T, today: string) => React.ReactNode;
}) {
  if (load.data !== null && load.today !== null) return <>{children(load.data, load.today)}</>;
  if (load.failed) {
    return <SectionError what={what} retrying={load.pending} onRetry={load.retry} />;
  }
  return <div aria-hidden="true">{skeleton}</div>;
}

/** One section's load failure: calm, with a retry for that section alone. */
export function SectionError({
  what,
  retrying,
  onRetry,
}: {
  what: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <Card role="alert" className="flex flex-col items-start gap-3 p-4">
      <p className="text-body flex items-start gap-2">
        <WarningCircleIcon weight="fill" className="text-attention-text mt-0.5 size-5 shrink-0" />
        לא הצלחנו לטעון את {what}.
      </p>
      <Button
        variant="outline"
        className="h-11 gap-1.5 md:h-9"
        disabled={retrying}
        onClick={onRetry}
      >
        <ArrowsClockwiseIcon className="size-4" />
        {retrying ? "טוען..." : "נסה שוב"}
      </Button>
    </Card>
  );
}

/** A designed empty state: a mark, what is missing, and the next step when there is one. */
export function SectionEmpty({
  icon,
  heading,
  explainer,
  action,
}: {
  icon: React.ReactNode;
  heading: string;
  explainer: string;
  action?: { label: string; href: string };
}) {
  return (
    <Card className="flex-row items-start gap-3 p-4">
      <span className="bg-muted text-primary grid size-11 shrink-0 place-items-center rounded-lg">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <p className="text-body font-semibold">{heading}</p>
        <p className="text-body text-muted-foreground">{explainer}</p>
        {action && (
          <Link
            href={action.href}
            className="press text-body text-primary focus-visible:ring-ring/50 -ms-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold outline-none hover:underline focus-visible:ring-3"
          >
            {action.label}
            <CaretLeftIcon className="size-4" />
          </Link>
        )}
      </div>
    </Card>
  );
}

/**
 * A text-height placeholder: an nbsp in the real type step, so a skeleton
 * line's box matches the line it stands in for exactly.
 */
export function Bone({ className }: { className: string }) {
  return (
    <span className={cn("bg-muted inline-block animate-pulse rounded-lg", className)}>&nbsp;</span>
  );
}

/** A card holding a divided list of rows: the shape every list section shares. */
export function ListCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="gap-0 py-0">
      <ul className="divide-border divide-y">{children}</ul>
    </Card>
  );
}

/** The two-line list row every list section draws (and its skeleton copies). */
export const ROW = "flex min-h-16 items-center gap-3 px-4 py-3";

/** A list skeleton: `rows` rows of the shared two-line shape. */
export function ListSkeleton({ rows }: { rows: number }) {
  return (
    <ListCard>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className={ROW}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body">
              <Bone className="w-32" />
            </span>
            <span className="text-caption mt-0.5">
              <Bone className="w-20" />
            </span>
          </span>
          <span className="text-body">
            <Bone className="w-16" />
          </span>
        </li>
      ))}
    </ListCard>
  );
}
