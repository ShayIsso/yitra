/** A category's colour as a small dot, the form category colour takes (ADR-0015). */
export function CategoryDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}
