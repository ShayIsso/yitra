"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowsClockwiseIcon,
  BankIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ListChecksIcon,
  MoonIcon,
  PiggyBankIcon,
  SparkleIcon,
  TagIcon,
  TargetIcon,
  WalletIcon,
} from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import { useTheme } from "@/components/theme";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SECTION,
  SECTION_GROUPS,
  SECTION_PARAM,
  SECTION_TITLES,
  SETTINGS_SECTIONS,
  parseSettingsSection,
  settingsSectionHref,
  type SettingsSection,
} from "./sections";
import { sectionTitleId } from "./parts";

/** A row's trailing value in the grouped list; money is formatted here, client-side. */
export type SectionSummary =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "amount"; readonly amount: number; readonly suffix: string };

const SECTION_ICONS: Record<SettingsSection, React.ReactNode> = {
  accounts: <BankIcon weight="regular" />,
  categories: <TagIcon />,
  rules: <ListChecksIcon />,
  ai: <SparkleIcon weight="regular" />,
  targets: <TargetIcon />,
  budgets: <WalletIcon />,
  goals: <PiggyBankIcon weight="regular" />,
  scheduler: <ArrowsClockwiseIcon weight="regular" />,
  appearance: <MoonIcon />,
};

const PHONE_QUERY = "(max-width: 47.99rem)";

const rowId = (section: SettingsSection) => `settings-nav-${section}`;

/**
 * The settings page's frame (#325). On a phone it is a native-style grouped
 * list; a row drills into its section and a back link returns. From `md` the
 * list becomes a sticky side nav beside the selected section. Which section is
 * open lives in the URL (`?section=`), written with `history.pushState` so the
 * drill is instant (no server round trip) yet reload and back/forward keep it.
 *
 * Every section stays mounted and the inactive ones are `hidden`, so an open
 * form or a half-typed field survives a trip back to the list.
 */
export function SettingsLayout({
  panes,
  summaries,
}: {
  panes: Record<SettingsSection, React.ReactNode>;
  summaries: Partial<Record<SettingsSection, SectionSummary>>;
}) {
  const searchParams = useSearchParams();
  const requested = parseSettingsSection(searchParams.get(SECTION_PARAM));
  const shown = requested ?? DEFAULT_SECTION;
  const { theme } = useTheme();

  // Where focus goes after a navigation the owner made here (not on first load).
  const pendingFocus = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.getElementById(id)?.focus();
  }, [requested]);

  function navigate(event: React.MouseEvent<HTMLAnchorElement>, to: SettingsSection | null) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (to === requested) return;
    const phone = window.matchMedia(PHONE_QUERY).matches;
    if (phone) {
      pendingFocus.current = to ? sectionTitleId(to) : requested ? rowId(requested) : null;
      window.scrollTo({ top: 0 });
    }
    window.history.pushState(null, "", settingsSectionHref(to));
  }

  const summaryFor = (section: SettingsSection): SectionSummary | undefined =>
    section === "appearance"
      ? { kind: "text", text: theme === "dark" ? "כהה" : "בהיר" }
      : summaries[section];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 md:gap-8">
      {/* A drilled-in phone view is titled by its section; the page's h1 stays for screen readers. */}
      <header className={cn("flex flex-col gap-1", requested && "max-md:sr-only")}>
        <h1 className="text-headline font-semibold tracking-tight">הגדרות</h1>
        <p className="text-muted-foreground text-body">חשבונות, סיווג, תכנון והעדפות.</p>
      </header>
      <div className="flex flex-col gap-6 md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
        <nav
          aria-label="חלקי ההגדרות"
          className={cn(
            "flex flex-col gap-6 md:sticky md:top-8 md:gap-5",
            requested && "max-md:hidden",
          )}
        >
          {SECTION_GROUPS.map((group, index) => (
            <div key={group.label} className="flex flex-col gap-2 md:gap-1">
              <p
                id={`settings-group-${index}`}
                className="text-muted-foreground text-caption px-4 font-medium md:px-3"
              >
                {group.label}
              </p>
              <ul
                aria-labelledby={`settings-group-${index}`}
                className="bg-card divide-border flex flex-col divide-y overflow-hidden rounded-xl border border-[color:var(--card-border)] shadow-[var(--card-shadow)] md:divide-y-0 md:border-0 md:bg-transparent md:shadow-none"
              >
                {group.sections.map((section) => (
                  <li key={section}>
                    <NavRow
                      section={section}
                      current={section === shown}
                      summary={summaryFor(section)}
                      onNavigate={(event) => navigate(event, section)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={cn("min-w-0 md:max-w-3xl", !requested && "max-md:hidden")}>
          <a
            href={settingsSectionHref(null)}
            onClick={(event) => navigate(event, null)}
            className="text-primary text-body focus-visible:ring-ring -ms-2 mb-3 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-medium outline-none focus-visible:ring-3 md:hidden"
          >
            <CaretRightIcon className="size-4" />
            כל ההגדרות
          </a>
          {SETTINGS_SECTIONS.map((section) => (
            <div key={section} hidden={section !== shown} className="page-enter">
              {panes[section]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NavRow({
  section,
  current,
  summary,
  onNavigate,
}: {
  section: SettingsSection;
  current: boolean;
  summary: SectionSummary | undefined;
  onNavigate: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <a
      id={rowId(section)}
      href={settingsSectionHref(section)}
      onClick={onNavigate}
      aria-current={current ? "true" : undefined}
      className={cn(
        "group focus-visible:ring-ring flex min-h-14 items-center gap-3 px-4 py-2 outline-none focus-visible:ring-3 focus-visible:ring-inset",
        "hover:bg-muted transition-colors md:min-h-11 md:rounded-lg md:px-3 md:py-1.5",
        current && "md:bg-muted md:font-semibold",
      )}
    >
      <span
        className={cn(
          "bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5",
          "md:text-muted-foreground md:size-auto md:bg-transparent",
          current && "md:text-foreground",
        )}
      >
        {SECTION_ICONS[section]}
      </span>
      <span className="text-lead md:text-body min-w-0 flex-1 truncate">
        {SECTION_TITLES[section]}
      </span>
      {summary && (
        <span className="text-muted-foreground text-body max-w-[45%] shrink-0 truncate md:hidden">
          {summary.kind === "text" ? (
            summary.text
          ) : (
            <>
              <Amount amount={summary.amount} colorize={false} fractionDigits={0} />{" "}
              {summary.suffix}
            </>
          )}
        </span>
      )}
      <CaretLeftIcon className="text-muted-foreground size-4 shrink-0 md:hidden" />
    </a>
  );
}
