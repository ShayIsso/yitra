/**
 * Pure vocabulary for the **rejected pair** (CONTEXT.md): a pair of transactions
 * the user declined to reconcile. Detectors take a `RejectedPairs` set and never
 * re-propose a pair in it; the store loads and persists it.
 *
 * A suspected-transfer singleton has no counterpart, so its rejection is the
 * pair (id, id).
 */

export type RejectedPair = readonly [string, string];

export type RejectedPairs = ReadonlySet<string>;

export const NO_REJECTIONS: RejectedPairs = new Set<string>();

/** Lowest id first: matches the `txn_a_id <= txn_b_id` CHECK on the table. */
export function canonicalPair(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

export function pairKey(a: string, b: string): string {
  const [lo, hi] = canonicalPair(a, b);
  return `${lo}|${hi}`;
}

export function toRejectedPairs(pairs: Iterable<RejectedPair>): RejectedPairs {
  const keys = new Set<string>();
  for (const [a, b] of pairs) keys.add(pairKey(a, b));
  return keys;
}

export function isRejected(rejected: RejectedPairs, a: string, b: string): boolean {
  return rejected.has(pairKey(a, b));
}

/**
 * What rejecting a group remembers. A settlement group records the lump against
 * each detail, so the same lump/detail set is never proposed again while the
 * lump can still pair with other card rows. Any other group records every pair
 * among its members.
 */
export function pairsToRecordOnReject(
  members: ReadonlyArray<{ id: string; reconciliationRole: string | null }>,
): RejectedPair[] {
  if (members.length === 1) return [[members[0].id, members[0].id]];

  const lump = members.find((m) => m.reconciliationRole === "settlement_lump");
  if (lump) {
    return members
      .filter((m) => m.id !== lump.id)
      .map((detail): RejectedPair => [lump.id, detail.id]);
  }

  const pairs: RejectedPair[] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) pairs.push([members[i].id, members[j].id]);
  }
  return pairs;
}
