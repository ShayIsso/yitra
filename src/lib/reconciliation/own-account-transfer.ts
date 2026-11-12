/**
 * Pure and dependency-free: the inbox view (a client component) imports it
 * directly, which the module index could not offer without dragging in the DB.
 */

/**
 * One leg out, one leg in. A zero amount has no direction, so it never pairs.
 * P3's detector and the inbox's approval share this line, so a group is
 * approved as an own-account transfer exactly when it could have been detected
 * as one. A P2 mirror is one charge seen twice, so its legs share a sign.
 */
export function haveOppositeSigns(a: number, b: number): boolean {
  return a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b);
}

/**
 * Whether a group is an own-account transfer (P3). The role check keeps two
 * opposite-sign `settlement_detail` rows left over from an undone lump from
 * passing as one: their approval must never turn card charges into transfers.
 * The phase is not persisted at queue time, so it is read from the shape.
 */
export function isOwnAccountTransfer(
  members: { reconciliationRole: string | null; chargedAmount: number }[],
): boolean {
  return (
    members.length === 2 &&
    members.every((m) => m.reconciliationRole === "transfer_pair") &&
    haveOppositeSigns(members[0].chargedAmount, members[1].chargedAmount)
  );
}
