/** A note on a sand panel, led by an icon: the entry screens' one shape for a message in the flow. */
export function Callout({
  icon,
  role,
  children,
}: {
  icon: React.ReactNode;
  role?: "alert" | "status";
  children: React.ReactNode;
}) {
  return (
    <div role={role} className="bg-muted text-body flex items-start gap-3 rounded-xl p-4">
      <span className="mt-0.5 shrink-0 [&_svg]:size-5">{icon}</span>
      <div className="flex min-w-0 flex-col gap-1 leading-relaxed text-pretty">{children}</div>
    </div>
  );
}
