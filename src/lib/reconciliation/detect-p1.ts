import { datesWithin, matchesTransferDescriptor } from "@/lib/transaction-matching";
import { bankKindOf } from "@/lib/bank-registry";
import { scoreP1Confidence } from "./confidence";
import { NO_REJECTIONS, isRejected, type RejectedPairs } from "./rejected-pairs";
import type { ReconciliationCandidate, ReconciliationTransaction } from "./types";

const CYCLE_WINDOW_DAYS = 35;
const OVERLAP_PENALTY = 0.25;
const MIN_CONFIDENCE = 0.7;

function isBankLumpCandidate(tx: ReconciliationTransaction): boolean {
  if (bankKindOf(tx.bankType) !== "bank") return false;
  return matchesTransferDescriptor(tx.description, ["card_settlement"]);
}

function parseDate(dateStr: string): Date {
  // Use noon UTC to avoid timezone boundary issues
  return new Date(`${dateStr}T12:00:00Z`);
}

/** A row from a prepaid institution or one of unknown kind lands on neither side. */
export function detectP1Settlement(
  transactions: ReconciliationTransaction[],
  rejected: RejectedPairs = NO_REJECTIONS,
): ReconciliationCandidate[] {
  const unreconciled = transactions.filter((tx) => tx.reconciliationGroupId === null);

  const bankLumps = unreconciled.filter(isBankLumpCandidate);
  const cardTxns = unreconciled.filter((tx) => bankKindOf(tx.bankType) === "card");

  if (bankLumps.length === 0 || cardTxns.length === 0) return [];

  const rawCandidates: ReconciliationCandidate[] = [];

  for (const lump of bankLumps) {
    const lumpDate = parseDate(lump.date);
    // Rejection is per lump x detail pair: the lump is scored on the card rows it
    // has not been rejected against, so a rejected set is never re-proposed.
    const cycleCardTxns = cardTxns.filter(
      (card) =>
        datesWithin(lumpDate, parseDate(card.date), CYCLE_WINDOW_DAYS) &&
        !isRejected(rejected, lump.id, card.id),
    );

    if (cycleCardTxns.length === 0) continue;

    const confidence = scoreP1Confidence(lump, cycleCardTxns);
    if (confidence < MIN_CONFIDENCE) continue;

    rawCandidates.push({ bankLump: lump, cardDetails: cycleCardTxns, confidence });
  }

  if (rawCandidates.length <= 1) return rawCandidates;

  // Degrade confidence when multiple lumps compete for the same card transactions
  return rawCandidates
    .map((candidate) => {
      const cardIds = new Set(candidate.cardDetails.map((c) => c.id));
      const overlapCount = rawCandidates.filter(
        (other) => other !== candidate && other.cardDetails.some((c) => cardIds.has(c.id)),
      ).length;

      if (overlapCount === 0) return candidate;

      const degraded = candidate.confidence - OVERLAP_PENALTY * overlapCount;
      return { ...candidate, confidence: Math.max(0, degraded) };
    })
    .filter((c) => c.confidence >= MIN_CONFIDENCE);
}
