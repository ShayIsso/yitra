"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowCircleDownIcon,
  ArrowCircleUpIcon,
  ArrowsClockwiseIcon,
  ArrowsLeftRightIcon,
  CheckIcon,
  CreditCardIcon,
  TrayIcon,
  WarningCircleIcon,
  XIcon,
} from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { BankBadge } from "@/components/bank-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  confidenceText,
  directionText,
  isBulkApprovable,
  OWN_ACCOUNT_TRANSFER_CONSEQUENCE,
  reconciliationGroupView,
  suspectedTransferConsequence,
  type PendingGroup,
  type PendingMember,
  type ReconciliationGroupView,
} from "@/components/reconciliation-group-view";
import { bankLabel } from "@/lib/bank-registry";
import { cn } from "@/lib/utils";
import {
  approveReconciliationAction,
  rejectReconciliationAction,
  approveReconciliationsAction,
  rejectReconciliationsAction,
} from "@/app/actions/reconciliation";

type Decision = "approve" | "reject";

const ACTION_BUTTON = "h-11 px-4 md:h-9";
/** Shared by the bulk toolbar and its skeleton, so the two keep one height. */
const TOOLBAR_SURFACE =
  "bg-card flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--card-border)] p-2 shadow-[var(--card-shadow)]";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** An action that answered with an error, or threw, did not happen. */
async function succeeded(action: () => Promise<{ error?: string }>): Promise<boolean> {
  try {
    const result = await action();
    return !result.error;
  } catch {
    return false;
  }
}

function pendingCountText(count: number): string {
  if (count === 0) return "הכל מעודכן";
  return count === 1 ? "קבוצה אחת ממתינה לאישור" : `${count} קבוצות ממתינות לאישור`;
}

// ── Group summary ─────────────────────────────────────────────────────────────

function KindIcon({ view }: { view: ReconciliationGroupView }) {
  const className = "size-5";
  switch (view.kind) {
    case "settlement":
      return <CreditCardIcon weight="duotone" className={className} />;
    case "transfer":
      return <ArrowsLeftRightIcon weight="duotone" className={className} />;
    case "suspected-transfer":
      return view.row.chargedAmount < 0 ? (
        <ArrowCircleUpIcon weight="duotone" className={className} />
      ) : (
        <ArrowCircleDownIcon weight="duotone" className={className} />
      );
    case "group":
      return <TrayIcon weight="duotone" className={className} />;
  }
}

function Figure({ amount }: { amount: number }) {
  return (
    <Amount
      amount={amount}
      fractionDigits={0}
      colorize={false}
      className="text-foreground font-medium"
    />
  );
}

function GroupSummary({ view }: { view: ReconciliationGroupView }) {
  switch (view.kind) {
    case "settlement":
      return (
        <p className="text-muted-foreground text-body">
          <Figure amount={view.lump.chargedAmount} />
          {" חיוב בנקאי "}
          <span aria-hidden="true">&#8596;</span>
          {` ${view.details.length} תנועות כרטיס בסך `}
          <Figure amount={view.detailsTotal} />
        </p>
      );
    case "transfer": {
      const [a, b] = view.legs;
      return (
        <p className="text-muted-foreground text-body">
          <Figure amount={a.chargedAmount} />
          {` ב${bankLabel(a.bankType)}`}
          <span aria-hidden="true"> &#8596; </span>
          <Figure amount={b.chargedAmount} />
          {` ב${bankLabel(b.bankType)}`}
          <span className="tabular-nums">{` · ${formatDate(a.date)}`}</span>
        </p>
      );
    }
    case "suspected-transfer":
      return (
        <p className="text-muted-foreground text-body">
          <span className="text-foreground font-medium">
            {directionText(view.row.chargedAmount)}
          </span>
          {" של "}
          <Figure amount={view.row.chargedAmount} />
          {` ב${bankLabel(view.row.bankType)}`}
        </p>
      );
    case "group":
      return <p className="text-muted-foreground text-body">{view.count} תנועות בקבוצה</p>;
  }
}

function MemberRow({ member }: { member: PendingMember }) {
  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-body font-medium break-words">{member.description}</p>
        <div className="text-muted-foreground text-caption flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="tabular-nums">{formatDate(member.date)}</span>
          <BankBadge bankType={member.bankType} />
          {member.categoryName && (
            <Badge variant="outline" className="text-muted-foreground font-normal">
              {member.categoryName}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <Amount
          amount={member.chargedAmount}
          fractionDigits={0}
          className="text-body font-semibold"
        />
        <span className="text-muted-foreground text-caption">
          {directionText(member.chargedAmount)}
        </span>
      </div>
    </li>
  );
}

// ── Single group card ─────────────────────────────────────────────────────────

function GroupCard({
  group,
  selected,
  onToggle,
  onDecide,
}: {
  group: PendingGroup;
  selected: boolean;
  onToggle: () => void;
  onDecide: (groupId: string, decision: Decision) => Promise<boolean>;
}) {
  const [pending, setPending] = React.useState<Decision | null>(null);
  const [failed, setFailed] = React.useState<Decision | null>(null);
  const titleId = React.useId();
  const view = reconciliationGroupView(group.members);

  async function decide(decision: Decision) {
    setPending(decision);
    setFailed(null);
    const ok = await onDecide(group.groupId, decision);
    // On success the card leaves the list; only a failure stays to be shown.
    if (!ok) {
      setFailed(decision);
      setPending(null);
    }
  }

  return (
    <li>
      <Card
        role="article"
        aria-labelledby={titleId}
        aria-busy={pending !== null || undefined}
        className="gap-0 py-0"
      >
        <div className="flex items-start gap-3 p-4 pb-3">
          <span className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-full">
            <KindIcon view={view} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 id={titleId} className="text-lead font-semibold">
                {view.title}
              </h2>
              <span
                title="ציון ביטחון של ההתאמה"
                className="bg-muted text-muted-foreground text-caption rounded-full px-2 py-0.5 tabular-nums"
              >
                {confidenceText(group.confidence)}
              </span>
            </div>
            <GroupSummary view={view} />
          </div>
        </div>

        {view.kind === "suspected-transfer" && (
          <p className="text-muted-foreground text-body mx-4 mb-3 text-pretty">
            {suspectedTransferConsequence(view.row)}
          </p>
        )}

        {view.kind === "transfer" && view.ownAccount && (
          <p className="text-muted-foreground text-body mx-4 mb-3 text-pretty">
            {OWN_ACCOUNT_TRANSFER_CONSEQUENCE}
          </p>
        )}

        <ul className="divide-border mx-4 divide-y rounded-lg border">
          {group.members.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2 p-4">
          {isBulkApprovable(view) ? (
            <label className="text-body me-auto flex min-h-11 cursor-pointer items-center gap-3 pe-2">
              <Checkbox checked={selected} onCheckedChange={onToggle} aria-label="בחר קבוצה" />
              <span aria-hidden="true">בחר</span>
            </label>
          ) : (
            <p className="text-muted-foreground text-caption min-w-0 flex-1 pe-2 text-pretty">
              זיכוי נכנס מאשרים בנפרד, לא בבחירה מרובה.
            </p>
          )}
          <Button
            className={ACTION_BUTTON}
            onClick={() => decide("approve")}
            disabled={pending !== null}
          >
            <CheckIcon />
            {pending === "approve" ? "מאשר..." : "אשר"}
          </Button>
          <Button
            variant="outline"
            className={ACTION_BUTTON}
            onClick={() => decide("reject")}
            disabled={pending !== null}
          >
            <XIcon />
            {pending === "reject" ? "דוחה..." : "דחה"}
          </Button>
        </div>

        {failed && (
          <div
            role="alert"
            className="border-attention text-body mx-4 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3"
          >
            <WarningCircleIcon weight="fill" className="text-attention-text size-5 shrink-0" />
            <p className="min-w-0 flex-1">
              {failed === "approve" ? "לא הצלחנו לאשר את הקבוצה." : "לא הצלחנו לדחות את הקבוצה."}
            </p>
            <Button variant="outline" className={ACTION_BUTTON} onClick={() => decide(failed)}>
              <ArrowsClockwiseIcon />
              נסה שוב
            </Button>
          </div>
        )}
      </Card>
    </li>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function NothingToReconcile() {
  return (
    <Card className="items-center gap-0 px-6 py-14 text-center">
      <span className="bg-muted text-muted-foreground grid size-16 place-items-center rounded-full">
        <TrayIcon weight="duotone" className="size-8" />
      </span>
      <h2 className="text-title mt-4 font-semibold">אין מה להתאים</h2>
      <p className="text-muted-foreground text-body mt-1.5 max-w-sm text-pretty">
        כל ההתאמות טופלו. אחרי הסנכרון הבא, חיובי כרטיס והעברות בין חשבונות שזוהו יחכו כאן לאישורך.
      </p>
      <Link
        href="/sync"
        className={cn(buttonVariants({ variant: "outline" }), ACTION_BUTTON, "mt-5")}
      >
        לעמוד הסנכרון
      </Link>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function InboxHeader({ children }: { children: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-headline font-bold">תיבת ההתאמות</h1>
      {children}
      <p className="text-muted-foreground text-body text-pretty">
        חיובי כרטיס אשראי מול החיוב הבנקאי שלהם, ושני הצדדים של העברה בין חשבונות. אישור מונע ספירה
        כפולה; דחייה מחזירה את התנועות לסיווג הרגיל.
      </p>
    </header>
  );
}

/**
 * Approved and rejected groups leave the list at once; the server re-renders
 * the route (the actions' `revalidatePath`), so the shell's pending badge and
 * the `groups` prop follow without a reload. No `router.refresh()` on top: the
 * action's response already carries the re-rendered route.
 */
export function ReconciliationInbox({ groups }: { groups: PendingGroup[] }) {
  const router = useRouter();
  const [resolved, setResolved] = React.useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set());
  const [bulkPending, setBulkPending] = React.useState<Decision | null>(null);
  const [bulkFailed, setBulkFailed] = React.useState<Decision | null>(null);

  const visible = groups.filter((g) => !resolved.has(g.groupId));
  const selectable = visible.filter((g) => isBulkApprovable(reconciliationGroupView(g.members)));
  const selectedIds = selectable.filter((g) => selected.has(g.groupId)).map((g) => g.groupId);
  const allSelected = selectable.length > 0 && selectedIds.length === selectable.length;

  function markResolved(groupIds: string[]) {
    setResolved((prev) => new Set([...prev, ...groupIds]));
    setSelected((prev) => new Set([...prev].filter((id) => !groupIds.includes(id))));
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((g) => g.groupId)));
  }

  function toggleOne(groupId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  async function decideOne(groupId: string, decision: Decision): Promise<boolean> {
    const ok = await succeeded(() =>
      decision === "approve"
        ? approveReconciliationAction({ groupId })
        : rejectReconciliationAction({ groupId }),
    );
    if (ok) markResolved([groupId]);
    return ok;
  }

  async function decideSelected(decision: Decision) {
    if (selectedIds.length === 0) return;
    const groupIds = selectedIds;
    setBulkPending(decision);
    setBulkFailed(null);
    let skipped: string[] = [];
    const ok = await succeeded(async () => {
      if (decision === "reject") return rejectReconciliationsAction({ groupIds });
      const result = await approveReconciliationsAction({ groupIds });
      skipped = result.skipped ?? [];
      return result;
    });
    setBulkPending(null);
    if (ok) {
      markResolved(groupIds.filter((id) => !skipped.includes(id)));
    } else {
      // The batch stops at its first failing group, so some may have gone
      // through; a failed action does not revalidate, so refresh to show
      // which are still pending.
      setBulkFailed(decision);
      router.refresh();
    }
  }

  const bulkDisabled = selectedIds.length === 0 || bulkPending !== null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <InboxHeader>
        <p className="text-body font-medium">{pendingCountText(visible.length)}</p>
      </InboxHeader>

      {visible.length === 0 ? (
        <NothingToReconcile />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {selectable.length > 0 && (
              <div
                role="toolbar"
                aria-label="פעולות על קבוצות נבחרות"
                className={cn(TOOLBAR_SURFACE, "sticky top-2 z-10")}
              >
                <label className="text-body flex min-h-11 cursor-pointer items-center gap-3 px-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="בחר הכל"
                  />
                  <span aria-hidden="true" className="tabular-nums">
                    {selectedIds.length > 0 ? `${selectedIds.length} נבחרו` : "בחר הכל"}
                  </span>
                </label>
                <div className="flex w-full gap-2 sm:ms-auto sm:w-auto">
                  <Button
                    className={cn(ACTION_BUTTON, "flex-1 sm:flex-none")}
                    onClick={() => decideSelected("approve")}
                    disabled={bulkDisabled}
                  >
                    <CheckIcon />
                    אשר נבחרים
                  </Button>
                  <Button
                    variant="outline"
                    className={cn(ACTION_BUTTON, "flex-1 sm:flex-none")}
                    onClick={() => decideSelected("reject")}
                    disabled={bulkDisabled}
                  >
                    <XIcon />
                    דחה נבחרים
                  </Button>
                </div>
              </div>
            )}

            {bulkFailed && (
              <div
                role="alert"
                className="bg-card border-attention text-body flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3"
              >
                <WarningCircleIcon weight="fill" className="text-attention-text size-5 shrink-0" />
                <p className="min-w-0 flex-1">
                  {bulkFailed === "approve"
                    ? "לא כל הקבוצות שנבחרו אושרו. הרשימה עודכנה, ואפשר לנסות שוב."
                    : "לא כל הקבוצות שנבחרו נדחו. הרשימה עודכנה, ואפשר לנסות שוב."}
                </p>
                {selectedIds.length > 0 && (
                  <Button
                    variant="outline"
                    className={ACTION_BUTTON}
                    onClick={() => decideSelected(bulkFailed)}
                    disabled={bulkPending !== null}
                  >
                    <ArrowsClockwiseIcon />
                    נסה שוב
                  </Button>
                )}
              </div>
            )}
          </div>

          <ul className="flex flex-col gap-4">
            {visible.map((group) => (
              <GroupCard
                key={group.groupId}
                group={group}
                selected={selected.has(group.groupId)}
                onToggle={() => toggleOne(group.groupId)}
                onDecide={decideOne}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function GroupCardSkeleton() {
  return (
    <li>
      <Card className="gap-0 py-0">
        <div className="flex items-start gap-3 p-4 pb-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-[1.375rem] w-64 max-w-full" />
          </div>
        </div>
        <div className="divide-border mx-4 divide-y rounded-lg border">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Skeleton className="h-[1.375rem] w-40 max-w-full" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <Skeleton className="h-[1.375rem] w-16" />
                <Skeleton className="h-4 w-10" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4">
          <div className="me-auto flex min-h-11 items-center gap-3 pe-2">
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-4 w-8" />
          </div>
          <Skeleton className={cn(ACTION_BUTTON, "w-20 rounded-lg")} />
          <Skeleton className={cn(ACTION_BUTTON, "w-20 rounded-lg")} />
        </div>
      </Card>
    </li>
  );
}

/** The inbox while its groups load, laid out like the populated list. */
export function ReconciliationInboxSkeleton() {
  return (
    <div aria-busy="true" className="flex max-w-3xl flex-col gap-6">
      <span role="status" className="sr-only">
        טוען את תיבת ההתאמות
      </span>
      <InboxHeader>
        <Skeleton className="h-[1.375rem] w-44" />
      </InboxHeader>
      <div className={TOOLBAR_SURFACE}>
        <div className="flex min-h-11 items-center gap-3 px-2">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-4 w-14" />
        </div>
        <div className="flex w-full gap-2 sm:ms-auto sm:w-auto">
          <Skeleton className={cn(ACTION_BUTTON, "flex-1 rounded-lg sm:w-28 sm:flex-none")} />
          <Skeleton className={cn(ACTION_BUTTON, "flex-1 rounded-lg sm:w-28 sm:flex-none")} />
        </div>
      </div>
      <ul className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <GroupCardSkeleton key={i} />
        ))}
      </ul>
    </div>
  );
}
