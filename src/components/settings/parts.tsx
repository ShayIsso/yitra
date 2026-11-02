"use client";

import * as React from "react";
import { ArrowsClockwiseIcon, PlusIcon, WarningCircleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SECTION_TITLES, type SettingsSection } from "./sections";

/**
 * Applied to every settings container holding form controls:
 * - each control gets a 44px target on a phone (ADR-0015); the shared
 *   input/select/button primitives are desktop-dense, so the views raise them
 *   in one place;
 * - native pickers (month, time) follow the app theme, since the browser draws
 *   their glyphs from `color-scheme`, not from the page's colours.
 * Dialogs portal out of the page, so their content applies it again
 * (`SHEET_CONTROLS`).
 */
export const CONTROLS =
  "max-md:[&_[data-slot=input]]:h-11 max-md:[&_[data-slot=select-trigger]]:h-11 max-md:[&_[data-slot=button]]:min-h-11 dark:[&_input]:[color-scheme:dark]";

/** For a settings DialogContent: phone touch targets plus the wider desktop dialog. */
export const SHEET_CONTROLS = cn(CONTROLS, "md:max-w-md");

export function sectionTitleId(section: SettingsSection): string {
  return `settings-${section}-title`;
}

/**
 * A section's heading row: the h2 a drill-in focuses, an explainer, and the
 * section's primary action at the inline end.
 */
export function SectionHeader({
  section,
  description,
  action,
}: {
  section: SettingsSection;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
        <h2
          id={sectionTitleId(section)}
          tabIndex={-1}
          className="text-title font-semibold tracking-tight outline-none"
        >
          {SECTION_TITLES[section]}
        </h2>
        {description && (
          <p className="text-muted-foreground text-body max-w-prose text-pretty">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

/** The add action in a section header. */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button onClick={onClick} className="max-md:min-h-11 max-md:px-4">
      <PlusIcon className="size-4" />
      {label}
    </Button>
  );
}

/** A section's body: its header, then its content, evenly spaced. */
export function SectionBody({
  labelledBy,
  children,
}: {
  labelledBy: SettingsSection;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={sectionTitleId(labelledBy)} className="flex flex-col gap-5">
      {children}
    </section>
  );
}

/** A grouped list on a card surface; children are `<li>` rows. */
export function SettingsList({ className, children, ...props }: React.ComponentProps<"ul">) {
  return (
    <Card className="gap-0 py-0">
      <ul className={cn("divide-border flex flex-col divide-y", className)} {...props}>
        {children}
      </ul>
    </Card>
  );
}

/**
 * One list row. The main area is a button (opening the row's editor) when
 * `onOpen` is given, so the whole row is the tap target; trailing actions sit
 * beside it as siblings, never nested inside it.
 */
export function SettingsRow({
  leading,
  title,
  subtitle,
  trailing,
  onOpen,
  openLabel,
  indent = false,
  className,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  onOpen?: () => void;
  /** Accessible name for the open button when the visible title alone is ambiguous. */
  openLabel?: string;
  indent?: boolean;
  className?: string;
}) {
  const main = (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body truncate font-medium">{title}</span>
        {subtitle && (
          <span className="text-caption text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
            {subtitle}
          </span>
        )}
      </span>
    </>
  );

  return (
    <li
      className={cn("flex min-h-16 items-center gap-1 pe-2", indent ? "ps-8" : "ps-0", className)}
    >
      {onOpen ? (
        <button type="button" onClick={onOpen} aria-label={openLabel} className={ROW_BUTTON}>
          {main}
        </button>
      ) : (
        <div className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-2.5">{main}</div>
      )}
      {trailing && <div className="flex shrink-0 items-center">{trailing}</div>}
    </li>
  );
}

/** The tappable main area of a list row. */
export const ROW_BUTTON =
  "hover:bg-muted focus-visible:ring-ring flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-lg px-4 py-2.5 text-start transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset";

/** A leading tile for a row: a glyph on sand. */
export function RowTile({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5">
      {children}
    </span>
  );
}

/** A trailing 44px icon action (touch screens come in every width). Its label is for screen readers. */
export function RowAction({
  label,
  onClick,
  disabled,
  destructive = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "size-11 [&_svg]:size-5",
        destructive && "text-destructive hover:text-destructive",
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </Button>
  );
}

/** A designed empty state: a glyph, what is missing, why it matters, and the way to add one. */
export function SectionEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="items-center gap-0 px-6 py-10 text-center">
      <span className="bg-muted text-muted-foreground mb-4 flex size-14 items-center justify-center rounded-full [&_svg]:size-7">
        {icon}
      </span>
      <p className="text-lead font-semibold">{title}</p>
      <p className="text-muted-foreground text-body mt-1 max-w-sm text-pretty">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

/**
 * An inline error for one section, with a retry. `onRetry` defaults to
 * reloading the page, which re-reads every section's data and keeps the
 * `?section=` it is on. Not `router.refresh()`: in the production build
 * (headless, #325) a refresh of this page fetched fresh data but never
 * committed it, leaving the error on screen.
 */
export function SectionError({
  message = "לא הצלחנו לטעון את הנתונים של החלק הזה.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const [pending, setPending] = React.useState(false);

  function retry() {
    if (onRetry) {
      onRetry();
      return;
    }
    setPending(true);
    window.location.reload();
  }

  return (
    <div
      role="alert"
      className="bg-muted text-body flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl p-4"
    >
      <WarningCircleIcon weight="fill" className="text-attention-text size-5 shrink-0" />
      <p className="min-w-0 flex-1 basis-48">{message}</p>
      <Button
        type="button"
        variant="outline"
        onClick={retry}
        disabled={pending}
        className="max-md:min-h-11 max-md:px-4"
      >
        <ArrowsClockwiseIcon className="size-4" />
        {pending ? "טוען..." : "נסה שוב"}
      </Button>
    </div>
  );
}

/** A section whose data failed to load server-side: its heading, then the error and a retry. */
export function SectionLoadError({ section }: { section: SettingsSection }) {
  return (
    <SectionBody labelledBy={section}>
      <SectionHeader section={section} />
      <SectionError />
    </SectionBody>
  );
}
