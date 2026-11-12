/**
 * Nets are rounded to agorot so float residue of rows that cancel (−10.1 −20.2
 * +30.3) is exactly 0 — never a phantom ₪0 bar, a red "₪0" or a "−0" — and so
 * leaves and month totals agree on what "net ≤ 0" means. `|| 0` folds −0 to 0.
 * Dependency-free, so the client-safe analytics files share it with the index.
 */
export function toAgorot(amount: number): number {
  return Math.round(amount * 100) / 100 || 0;
}
