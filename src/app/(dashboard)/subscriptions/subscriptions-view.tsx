"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsDownUpIcon,
  ClockIcon,
  MoonIcon,
  PauseIcon,
  RepeatIcon,
  SparkleIcon,
  TrendUpIcon,
  WarningCircleIcon,
} from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  acceptPriceChangeAction,
  cancelRecurringAction,
  confirmNewlyDetectedAction,
  dismissNewlyDetectedAction,
  pauseRecurringAction,
} from "@/app/actions/recurring";
import type { Category } from "@/lib/categories";
import { cn } from "@/lib/utils";
import {
  filterSubscriptionRows,
  sortSubscriptionRows,
  visibleFilters,
  type AnomalyAlerts,
  type FilterKey,
  type SortDir,
  type SortKey,
  type SubscriptionLiveness,
  type SubscriptionRow,
} from "./rows";

// ── labels and formatting (client-side only: hydration rule) ─────────────────

const CADENCE_LABELS: Record<SubscriptionRow["cadence"], string> = {
  monthly: "חודשי",
  quarterly: "רבעוני",
  annual: "שנתי",
};

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "הכל",
  price_change: "שינוי מחיר",
  missed_payment: "חיוב שלא הגיע",
  newly_detected: "זוהו חדשים",
  dormant: "לא פעילים",
  active: "פעילים",
};

const SORT_OPTIONS: { value: `${SortKey}:${SortDir}`; label: string }[] = [
  { value: "projectedDate:asc", label: "תשלום הבא: הקרוב קודם" },
  { value: "projectedDate:desc", label: "תשלום הבא: הרחוק קודם" },
  { value: "expectedAmount:desc", label: "סכום: הגבוה קודם" },
  { value: "expectedAmount:asc", label: "סכום: הנמוך קודם" },
];

// Evidence dates are UTC midnights (projectSeries), so they format in UTC: a
// local zone west of UTC would otherwise print the previous day.
const DATE = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const formatDate = (d: Date | string) => DATE.format(typeof d === "string" ? new Date(d) : d);
const DAY_MONTH = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const formatDayMonth = (iso: string) => DAY_MONTH.format(new Date(iso));

const PCT = new Intl.NumberFormat("he-IL", {
  style: "percent",
  signDisplay: "exceptZero",
  maximumFractionDigits: 1,
});

function inDays(n: number): string {
  if (n === 0) return "היום";
  if (n === 1) return "מחר";
  if (n === 2) return "בעוד יומיים";
  return `בעוד ${n} ימים`;
}

function lateBy(n: number): string {
  if (n === 1) return "באיחור של יום";
  if (n === 2) return "באיחור של יומיים";
  return `באיחור של ${n} ימים`;
}

// ── page ──────────────────────────────────────────────────────────────────────

type RowAlerts = {
  price?: AnomalyAlerts["priceChanges"][number];
  missed?: AnomalyAlerts["missedPayments"][number];
  fresh?: AnomalyAlerts["newlyDetected"][number];
  dormant?: AnomalyAlerts["dormant"][number];
};

function alertsFor(id: string, alerts: AnomalyAlerts): RowAlerts {
  return {
    price: alerts.priceChanges.find((a) => a.patternId === id),
    missed: alerts.missedPayments.find((a) => a.patternId === id),
    fresh: alerts.newlyDetected.find((a) => a.patternId === id),
    dormant: alerts.dormant.find((a) => a.patternId === id),
  };
}

type ActionResult = Promise<{ error?: string }>;

export function SubscriptionsView({
  subscriptions,
  alerts,
  categories,
}: {
  subscriptions: SubscriptionRow[];
  alerts: AnomalyAlerts;
  categories: Category[];
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "projectedDate",
    dir: "asc",
  });
  const [filter, setFilter] = useState<FilterKey>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cancelTarget, setCancelTarget] = useState<SubscriptionRow | null>(null);
  const [namingTarget, setNamingTarget] = useState<SubscriptionRow | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(id: string, action: (input: { id: string }) => ActionResult) {
    setBusyId(id);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    startTransition(async () => {
      const result = await action({ id });
      if (result.error) setErrors((prev) => ({ ...prev, [id]: result.error! }));
      setBusyId(null);
    });
  }

  if (subscriptions.length === 0) return <EmptySubscriptions />;

  const filters = visibleFilters(alerts);
  // A filter whose alerts all resolved (after an action) falls back to all.
  const activeFilter = filters.length === 0 || filters.includes(filter) ? filter : "all";
  const rows = filterSubscriptionRows(
    sortSubscriptionRows(subscriptions, sort.key, sort.dir),
    alerts,
    filters.length === 0 ? "all" : activeFilter,
  );
  const countFor = (key: FilterKey) => filterSubscriptionRows(subscriptions, alerts, key).length;
  const isAlertFilter = (key: FilterKey) => key !== "all" && key !== "active";

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }
  const ariaSort = (key: SortKey) =>
    sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {filters.length > 0 ? (
          <div role="group" aria-label="סינון" className="flex flex-wrap gap-2">
            {filters.map((key) => {
              const count = countFor(key);
              const pressed = activeFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setFilter(pressed && key !== "all" ? "all" : key)}
                  className={cn(
                    "text-body focus-visible:ring-ring/50 inline-flex h-11 items-center gap-2 rounded-full border px-3.5 font-medium transition-colors outline-none focus-visible:ring-3 md:h-9",
                    pressed
                      ? "bg-primary text-primary-foreground border-transparent"
                      : "bg-card text-foreground hover:bg-muted",
                  )}
                >
                  {FILTER_LABELS[key]}
                  <span
                    className={cn(
                      "text-caption min-w-5 rounded-full px-1.5 tabular-nums",
                      pressed
                        ? "bg-primary-foreground text-primary"
                        : isAlertFilter(key) && key !== "dormant"
                          ? "bg-attention text-attention-foreground"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-body text-muted-foreground">
            {subscriptions.length} חיובים קבועים, אין שינויים שדורשים תשומת לב.
          </p>
        )}
        <Select
          value={`${sort.key}:${sort.dir}`}
          onValueChange={(v) => {
            if (!v) return;
            const [key, dir] = v.split(":") as [SortKey, SortDir];
            setSort({ key, dir });
          }}
        >
          <SelectTrigger aria-label="מיון" className="h-11 w-full gap-2 sm:w-64 md:h-9">
            <ArrowsDownUpIcon className="text-muted-foreground size-4" />
            <span className="flex-1 text-start">
              {SORT_OPTIONS.find((o) => o.value === `${sort.key}:${sort.dir}`)?.label}
            </span>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="gap-0 py-0">
        <div
          className={cn(
            ROW_GRID,
            "text-caption text-muted-foreground hidden border-b px-4 py-1.5 font-medium lg:grid",
          )}
        >
          <span className="self-center [grid-area:name]">חיוב</span>
          <SortHeader
            area="[grid-area:amount] justify-self-end"
            label="סכום צפוי"
            sort={ariaSort("expectedAmount")}
            onClick={() => toggleSort("expectedAmount")}
          />
          <SortHeader
            area="[grid-area:next]"
            label="תשלום הבא"
            sort={ariaSort("projectedDate")}
            onClick={() => toggleSort("projectedDate")}
          />
          <span className="self-center [grid-area:status]">סטטוס</span>
          <span className="sr-only [grid-area:actions]">פעולות</span>
        </div>
        {rows.length === 0 ? (
          <div className="text-body text-muted-foreground flex flex-col items-center gap-3 px-4 py-10 text-center">
            אין חיובים שמתאימים לסינון הזה.
            <Button variant="outline" className="h-11 md:h-9" onClick={() => setFilter("all")}>
              הצגת הכל
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <SubscriptionItem
                key={row.id}
                row={row}
                rowAlerts={alertsFor(row.id, alerts)}
                busy={isPending && busyId === row.id}
                locked={isPending}
                error={errors[row.id]}
                onAcceptPrice={() => run(row.id, acceptPriceChangeAction)}
                onPause={() => run(row.id, pauseRecurringAction)}
                onDismiss={() => run(row.id, dismissNewlyDetectedAction)}
                onRequestCancel={() => setCancelTarget(row)}
                onRequestName={() => setNamingTarget(row)}
              />
            ))}
          </ul>
        )}
      </Card>

      <p className="text-caption text-muted-foreground max-w-2xl">
        התשלום הבא הוא החיוב האחרון שזוהה בתוספת מחזור החיוב. חיוב שמאחר עדיין צפוי; אחרי שבוע
        באיחור הוא מסומן כחיוב שלא הגיע, ואחרי שקט של מחזור וחצי המנוי מסומן כלא פעיל.
      </p>

      <CancelDialog target={cancelTarget} onClose={() => setCancelTarget(null)} />
      <NamingDialog
        target={namingTarget}
        categories={categories}
        onClose={() => setNamingTarget(null)}
      />
    </div>
  );
}

// One grid serves the phone card and the desktop row: below md the row stacks
// name/amount, next charge/status, the alert, then the actions; from md each
// field takes a column and the alert spans the row beneath it.
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 [grid-template-areas:'name_amount'_'next_status'_'alert_alert'_'actions_actions'] lg:grid-cols-[minmax(0,1fr)_7.5rem_15rem_8.5rem_9.5rem] lg:[grid-template-areas:'name_amount_next_status_actions'_'alert_alert_alert_alert_alert']";

function SortHeader({
  area,
  label,
  sort,
  onClick,
}: {
  area: string;
  label: string;
  sort: "ascending" | "descending" | "none";
  onClick: () => void;
}) {
  const Icon =
    sort === "ascending" ? ArrowUpIcon : sort === "descending" ? ArrowDownIcon : ArrowsDownUpIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`מיון לפי ${label}${sort === "none" ? "" : sort === "ascending" ? ", עולה" : ", יורד"}`}
      className={cn(
        "hover:text-foreground focus-visible:ring-ring/50 -mx-1.5 inline-flex h-8 items-center gap-1 rounded-lg px-1.5 font-medium outline-none focus-visible:ring-3",
        sort !== "none" && "text-foreground",
        area,
      )}
    >
      {label}
      <Icon className={cn("size-3.5", sort === "none" && "opacity-60")} />
    </button>
  );
}

// ── one subscription ──────────────────────────────────────────────────────────

function SubscriptionItem({
  row,
  rowAlerts,
  busy,
  locked,
  error,
  onAcceptPrice,
  onPause,
  onDismiss,
  onRequestCancel,
  onRequestName,
}: {
  row: SubscriptionRow;
  rowAlerts: RowAlerts;
  busy: boolean;
  locked: boolean;
  error?: string;
  onAcceptPrice: () => void;
  onPause: () => void;
  onDismiss: () => void;
  onRequestCancel: () => void;
  onRequestName: () => void;
}) {
  const label = row.displayName ?? row.merchant;
  const hasAlert = Boolean(
    rowAlerts.price || rowAlerts.missed || rowAlerts.fresh || rowAlerts.dormant,
  );
  return (
    <li
      className={cn(ROW_GRID, "gap-y-2 px-4 py-3.5 lg:items-center", busy && "opacity-60")}
      aria-busy={busy}
    >
      <div className="min-w-0 [grid-area:name]">
        <p className="text-body truncate font-semibold">{label}</p>
        <p className="text-caption text-muted-foreground truncate">
          {CADENCE_LABELS[row.cadence]}
          {row.displayName && (
            <>
              {" · "}
              <bdi>{row.merchant}</bdi>
            </>
          )}
        </p>
      </div>
      <div className="text-body text-end font-semibold [grid-area:amount]">
        <Amount amount={row.expectedAmount} colorize={false} />
      </div>
      <div className="min-w-0 [grid-area:next]">
        <LivenessText liveness={row.liveness} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5 [grid-area:status] lg:justify-start">
        <StatusBadge status={row.status} />
        <AlertBadge rowAlerts={rowAlerts} />
      </div>
      {(hasAlert || error) && (
        <div className="space-y-2 [grid-area:alert] lg:pt-1">
          {rowAlerts.price && (
            <AlertPanel
              icon={<TrendUpIcon weight="duotone" className="text-attention-text size-5" />}
              text={
                <>
                  המחיר {rowAlerts.price.newAmount > rowAlerts.price.oldAmount ? "עלה" : "ירד"} מ-
                  <Amount amount={rowAlerts.price.oldAmount} colorize={false} /> ל-
                  <Amount amount={rowAlerts.price.newAmount} colorize={false} />{" "}
                  <span className="tabular-nums">({PCT.format(rowAlerts.price.pctChange)})</span>
                </>
              }
            >
              <Button
                variant="outline"
                className="h-11 md:h-8"
                disabled={locked}
                onClick={onAcceptPrice}
              >
                {busy ? "שומר…" : "אישור המחיר החדש"}
              </Button>
              <CancelButton disabled={locked} onClick={onRequestCancel} />
            </AlertPanel>
          )}
          {rowAlerts.missed && (
            <AlertPanel
              icon={<ClockIcon weight="fill" className="text-attention-text size-5" />}
              text={
                <>
                  חיוב של <Amount amount={row.expectedAmount} colorize={false} /> היה צפוי ב-
                  {formatDate(rowAlerts.missed.projectedDate)} ולא הגיע.
                </>
              }
            >
              <Button
                variant="outline"
                className="h-11 gap-1.5 md:h-8"
                disabled={locked}
                onClick={onPause}
              >
                <PauseIcon weight="fill" className="size-3.5" />
                {busy ? "שומר…" : "השהיה"}
              </Button>
              <CancelButton disabled={locked} onClick={onRequestCancel} />
            </AlertPanel>
          )}
          {rowAlerts.dormant && (
            <AlertPanel
              icon={<MoonIcon className="text-muted-foreground size-5" />}
              text={
                rowAlerts.dormant.lastObservedChargeDate === null
                  ? "לא נמצא אף חיוב תואם בהיסטוריה. ייתכן שהמנוי הסתיים."
                  : `לא זוהה חיוב מאז ${formatDate(rowAlerts.dormant.lastObservedChargeDate)} (${rowAlerts.dormant.silenceDays} ימים). ייתכן שהמנוי הסתיים.`
              }
            >
              <CancelButton disabled={locked} onClick={onRequestCancel} />
            </AlertPanel>
          )}
          {rowAlerts.fresh && (
            <AlertPanel
              icon={<SparkleIcon weight="duotone" className="text-primary size-5" />}
              text={
                <>
                  זוהה חיוב חוזר חדש:{" "}
                  <Amount amount={rowAlerts.fresh.expectedAmount} colorize={false} />{" "}
                  {CADENCE_LABELS[rowAlerts.fresh.cadence]}. לאשר ולתת לו שם?
                </>
              }
            >
              <Button className="h-11 md:h-8" disabled={locked} onClick={onRequestName}>
                אישור ומתן שם
              </Button>
              <Button variant="ghost" className="h-11 md:h-8" disabled={locked} onClick={onDismiss}>
                {busy ? "שומר…" : "התעלמות"}
              </Button>
            </AlertPanel>
          )}
          {error && (
            <p role="alert" className="text-body text-destructive flex items-center gap-1.5">
              <WarningCircleIcon weight="fill" className="size-4 shrink-0" />
              {error}
            </p>
          )}
        </div>
      )}
      {/* The price, missed and dormant panels already offer the cancel action. */}
      {!(rowAlerts.price || rowAlerts.missed || rowAlerts.dormant) && (
        <div className="flex justify-end [grid-area:actions]">
          <CancelButton disabled={locked} onClick={onRequestCancel} quiet />
        </div>
      )}
    </li>
  );
}

function CancelButton({
  disabled,
  onClick,
  quiet = false,
}: {
  disabled: boolean;
  onClick: () => void;
  quiet?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-11 md:h-8",
        quiet ? "text-muted-foreground hover:text-destructive" : "text-destructive",
      )}
    >
      סימון כמבוטל
    </Button>
  );
}

function AlertPanel({
  icon,
  text,
  children,
}: {
  icon: React.ReactNode;
  text: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/70 flex flex-col gap-2 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span>{text}</span>
      </p>
      <div className="flex flex-wrap gap-2 sm:shrink-0 sm:flex-nowrap">{children}</div>
    </div>
  );
}

/** What the evidence says about the next charge (ADR-0012): never the stored date. */
function LivenessText({ liveness }: { liveness: SubscriptionLiveness }) {
  switch (liveness.kind) {
    case "upcoming":
      return (
        <p className="text-body">
          <span className="tabular-nums">{formatDate(liveness.projectedDate)}</span>
          <span className="text-caption text-muted-foreground block">
            {inDays(liveness.daysUntil)} · חויב לאחרונה {formatDayMonth(liveness.lastChargeDate)}
          </span>
        </p>
      );
    case "late":
      return (
        <p className="text-body">
          <span className="tabular-nums">{formatDate(liveness.projectedDate)}</span>
          <span className="text-caption text-muted-foreground flex items-center gap-1">
            <ClockIcon weight="fill" className="size-3.5 shrink-0" />
            {lateBy(liveness.daysLate)}, עדיין צפוי
          </span>
        </p>
      );
    case "silent":
      return (
        <p className="text-body text-muted-foreground">
          אין תשלום צפוי
          <span className="text-caption block">
            אין חיוב מאז {formatDate(liveness.lastChargeDate)}
          </span>
        </p>
      );
    case "no-evidence":
      return <p className="text-body text-muted-foreground">אין עדות לחיוב</p>;
  }
}

function StatusBadge({ status }: { status: SubscriptionRow["status"] }) {
  if (status === "paused") {
    return (
      <span
        className="text-caption bg-muted text-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
        title="מושהה: לא נכלל בתחזית החיובים הקרובים"
      >
        <PauseIcon weight="fill" className="size-3" />
        מושהה
      </span>
    );
  }
  return (
    <span className="text-caption bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-medium">
      {status === "active" ? "פעיל" : "בוטל"}
    </span>
  );
}

/** One badge per row, by priority. Dormant outranks missed: long overdue reads as "likely ended". */
function AlertBadge({ rowAlerts }: { rowAlerts: RowAlerts }) {
  const attention = "bg-attention-subtle text-attention-text";
  if (rowAlerts.price)
    return (
      <Badge className={attention} icon={<WarningCircleIcon weight="fill" className="size-3" />}>
        שינוי מחיר
      </Badge>
    );
  if (rowAlerts.dormant) return <Badge className="text-muted-foreground border">לא פעיל</Badge>;
  if (rowAlerts.missed)
    return (
      <Badge className={attention} icon={<ClockIcon weight="fill" className="size-3" />}>
        לא הגיע
      </Badge>
    );
  if (rowAlerts.fresh)
    return (
      <Badge
        className="border-primary/40 text-primary border"
        icon={<SparkleIcon className="size-3" />}
      >
        חדש
      </Badge>
    );
  return null;
}

function Badge({
  className,
  icon,
  children,
}: {
  className: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "text-caption inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium whitespace-nowrap",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

// ── dialogs ───────────────────────────────────────────────────────────────────

function CancelDialog({
  target,
  onClose,
}: {
  target: SubscriptionRow | null;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = target ? (target.displayName ?? target.merchant) : "";

  function confirm() {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelRecurringAction({ id: target.id });
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !pending) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>לסמן את {label} כמבוטל?</DialogTitle>
          <DialogDescription>
            החיוב יוסר מהרשימה ומתחזית החיובים הקרובים. זה לא מבטל את המנוי מול העסק, ואין דרך
            להחזיר אותו מכאן.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-body text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            חזרה
          </Button>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            {pending ? "מסמן…" : "סימון כמבוטל"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NamingDialog({
  target,
  categories,
  onClose,
}: {
  target: SubscriptionRow | null;
  categories: Category[];
  onClose: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {/* Keyed by row so each opening starts from an empty form. */}
        {target && (
          <NamingForm key={target.id} target={target} categories={categories} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NamingForm({
  target,
  categories,
  onDone,
}: {
  target: SubscriptionRow;
  categories: Category[];
  onDone: () => void;
}) {
  const nameId = useId();
  const categoryId = useId();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await confirmNewlyDetectedAction({
        id: target.id,
        name: name.trim(),
        categoryId: category || null,
      });
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle>אישור חיוב חוזר</DialogTitle>
        <DialogDescription>
          <bdi>{target.merchant}</bdi>
          {" · "}
          <Amount amount={target.expectedAmount} colorize={false} />{" "}
          {CADENCE_LABELS[target.cadence]}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor={nameId} className="text-body font-medium">
            שם המנוי
          </label>
          <Input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="לדוגמה: שירות מוזיקה"
            autoComplete="off"
            className="h-11 md:h-9"
            aria-invalid={error ? true : undefined}
          />
        </div>
        {categories.length > 0 && (
          <div className="space-y-1.5">
            <label htmlFor={categoryId} className="text-body font-medium">
              קטגוריה <span className="text-muted-foreground font-normal">(לא חובה)</span>
            </label>
            <select
              id={categoryId}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 text-body dark:bg-input/30 h-11 w-full rounded-lg border px-2.5 outline-none focus-visible:ring-3 md:h-9"
            >
              <option value="">ללא קטגוריה</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && (
          <p role="alert" className="text-body text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onDone}>
          ביטול
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "שומר…" : "אישור"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── empty ─────────────────────────────────────────────────────────────────────

function EmptySubscriptions() {
  return (
    <div className="bg-card flex flex-col items-center rounded-xl border border-[color:var(--card-border)] px-6 py-12 text-center shadow-[var(--card-shadow)]">
      <span className="bg-muted text-primary mb-4 grid size-14 place-items-center rounded-full">
        <RepeatIcon weight="duotone" className="size-7" />
      </span>
      <p className="text-lead font-semibold">עוד לא זוהו חיובים חוזרים</p>
      <p className="text-body text-muted-foreground mt-1 max-w-sm">
        אחרי כמה חודשים של עסקאות, Yitra מזהה לבד תשלומים שחוזרים על עצמם: מנויים, ביטוחים וחיובים
        תקופתיים.
      </p>
      <Button className="mt-5 h-11 px-5 md:h-9" nativeButton={false} render={<Link href="/sync" />}>
        לסנכרון
      </Button>
    </div>
  );
}
