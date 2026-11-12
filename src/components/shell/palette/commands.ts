import type { ComponentType } from "react";
import { CalendarBlankIcon, FunnelIcon, ListChecksIcon } from "@/components/icons";
import {
  compareMonths,
  homeHref,
  monthName,
  shiftMonth,
  type HomeMonth,
  type MonthRange,
} from "@/components/home/month";
import { monthKey } from "@/components/reports/format";
import { transactionsHref } from "@/lib/transactions/view-params";
import { ALL_DESTINATIONS } from "../nav";

export type PaletteGroup = "pages" | "transactions" | "months";

export type PaletteCommand = {
  id: string;
  group: PaletteGroup;
  label: string;
  /** Muted text after the label; searchable like a keyword. */
  hint?: string;
  keywords: readonly string[];
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const GROUP_LABELS: Record<PaletteGroup, string> = {
  pages: "עמודים",
  transactions: "תנועות",
  months: "חודשים",
};

export type PaletteSection = { group: PaletteGroup; label: string; commands: PaletteCommand[] };

/**
 * Commands under their group headings, the groups in the order their first
 * command appears, so ranked results put the group with the best match first.
 */
export function groupCommands(commands: readonly PaletteCommand[]): PaletteSection[] {
  const sections = new Map<PaletteGroup, PaletteSection>();
  for (const command of commands) {
    let section = sections.get(command.group);
    if (!section) {
      section = { group: command.group, label: GROUP_LABELS[command.group], commands: [] };
      sections.set(command.group, section);
    }
    section.commands.push(command);
  }
  return [...sections.values()];
}

/** How far back the month commands reach; older months stay a few taps away on home. */
const RECENT_MONTHS = 12;

function pageCommands(): PaletteCommand[] {
  return ALL_DESTINATIONS.map((d) => ({
    id: `page:${d.href}`,
    group: "pages",
    label: d.label,
    keywords: d.keywords,
    href: d.href,
    icon: d.icon,
  }));
}

function transactionCommands(current: HomeMonth): PaletteCommand[] {
  const filter = (
    id: string,
    view: {
      label: string;
      href: string;
      keywords: readonly string[];
      icon?: PaletteCommand["icon"];
    },
  ): PaletteCommand => ({
    id: `transactions:${id}`,
    group: "transactions",
    label: view.label,
    keywords: ["תנועות", "transactions", ...view.keywords],
    href: view.href,
    icon: view.icon ?? FunnelIcon,
  });
  return [
    filter("review", {
      label: "ממתינות לסקירה",
      href: transactionsHref({ needsReview: true }),
      keywords: ["review", "לבדיקה"],
      icon: ListChecksIcon,
    }),
    filter("uncategorized", {
      label: "ללא קטגוריה",
      href: transactionsHref({ uncategorized: true }),
      keywords: ["uncategorized", "לא מסווגות"],
    }),
    filter("this-month", {
      label: "תנועות החודש",
      href: transactionsHref({ month: monthKey(current) }),
      keywords: ["this month"],
    }),
    filter("last-month", {
      label: "תנועות החודש שעבר",
      href: transactionsHref({ month: monthKey(shiftMonth(current, -1)) }),
      keywords: ["last month"],
    }),
    filter("pending", {
      label: "תנועות בהמתנה",
      href: transactionsHref({ status: "pending" }),
      keywords: ["pending", "ממתין"],
    }),
  ];
}

/**
 * The home screen's months, newest first: the current month back a year, but
 * never before the range's first month, so every month offered is one the
 * home screen's own navigation can show (`isBrowsable`).
 */
function monthCommands({ first, current }: MonthRange): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  for (let back = 0; back < RECENT_MONTHS; back++) {
    const m = shiftMonth(current, -back);
    if (compareMonths(m, first) < 0) break;
    const [mm, yyyy] = [String(m.month).padStart(2, "0"), String(m.year)];
    commands.push({
      id: `month:${monthKey(m)}`,
      group: "months",
      label: `${monthName(m)} ${m.year}`,
      hint: back === 0 ? "החודש" : back === 1 ? "החודש שעבר" : undefined,
      keywords: [`${mm}/${yyyy}`, `${m.month}/${yyyy}`, monthKey(m), "חודש", "month"],
      href: homeHref(m, current),
      icon: CalendarBlankIcon,
    });
  }
  return commands;
}

/** Every palette command, in display order: pages, then transaction views, then months. */
export function paletteCommands(range: MonthRange): PaletteCommand[] {
  return [...pageCommands(), ...transactionCommands(range.current), ...monthCommands(range)];
}
