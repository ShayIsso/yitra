"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

/**
 * An on/off switch. The control itself is small; give it a 44px target by
 * wrapping it with its text in a `<label>` row (`min-h-11`), as native
 * settings lists do. The thumb travels toward the inline end, so it moves
 * left in RTL.
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer bg-muted-foreground data-checked:bg-primary focus-visible:ring-ring/50 inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors outline-none focus-visible:ring-3 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="bg-card data-checked:bg-primary-foreground pointer-events-none block size-5 rounded-full transition-transform motion-reduce:transition-none ltr:data-checked:translate-x-4 rtl:data-checked:-translate-x-4"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
