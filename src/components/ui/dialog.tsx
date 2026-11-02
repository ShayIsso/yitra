"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "@/components/icons";

/**
 * The app's one dialog primitive, responsive by construction (#315, spec #312
 * story 54): below `md` the content is a bottom sheet (full width, anchored to
 * the bottom edge, top corners rounded, slides up); from `md` up it is a
 * centred dialog. The switch is pure CSS, so there is no viewport hook and no
 * hydration mismatch.
 *
 * Composition:
 *
 *   <Dialog open={open} onOpenChange={setOpen}>        // or uncontrolled + <DialogTrigger>
 *     <DialogContent>                                  // showCloseButton (default true)
 *       <DialogHeader>
 *         <DialogTitle>…</DialogTitle>                 // required: names the dialog
 *         <DialogDescription>…</DialogDescription>     // optional
 *       </DialogHeader>
 *       …body…                                         // a <form> may wrap body + footer
 *       <DialogFooter>                                 // last; its direct children are the actions
 *         <Button variant="outline">ביטול</Button>
 *         <Button>שמור</Button>                        // primary action last
 *       </DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 *
 * - Width: the centred dialog is `md:max-w-sm`; widen it with a `md:max-w-*`
 *   className on DialogContent. The sheet is always full width.
 * - Height: content taller than the viewport scrolls inside the popup while
 *   DialogFooter stays pinned to its bottom edge, so the primary action is
 *   never below the fold of a long phone form.
 * - Footer: actions sit side by side (end-aligned) from `md`; in the sheet
 *   they stack full width, primary on top, each at least 44px tall. Only the
 *   footer's direct children are sized, so put the actions there directly.
 * - Close button: a 44px X in the top end corner unless `showCloseButton` is
 *   false; DialogHeader reserves end padding for it only when it is shown.
 * - Focus: Base UI traps focus while open, closes on Escape and on a backdrop
 *   press, and returns focus to the trigger.
 * - Motion: the sheet slides up, the dialog zooms in; under reduced motion both
 *   only fade (ADR-0015 "Motion").
 */
function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

/** tw-animate reads these at animation time; zeroing them leaves the fade alone. */
const REDUCED_MOTION_FADE_ONLY =
  "motion-reduce:[--tw-enter-translate-y:0]! motion-reduce:[--tw-exit-translate-y:0]! motion-reduce:[--tw-enter-scale:1]! motion-reduce:[--tw-exit-scale:1]!";

// No backdrop blur: it would repaint the whole scrolling page behind the
// dialog every frame (ADR-0015 "Motion").
function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/30 duration-150",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-close-button={showCloseButton ? "" : undefined}
        className={cn(
          "bg-popover text-popover-foreground ring-foreground/10 fixed z-50 grid max-h-[calc(100dvh-2rem)] w-full gap-4 overflow-y-auto overscroll-contain p-4 text-sm ring-1 outline-none",
          // Sheet (< md)
          "inset-x-0 bottom-0 rounded-t-xl duration-200",
          "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom",
          // Centred dialog (md+)
          "md:inset-x-auto md:start-1/2 md:top-1/2 md:bottom-auto md:max-w-sm md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:duration-100 md:rtl:translate-x-1/2",
          "md:data-open:zoom-in-95 md:data-open:slide-in-from-bottom-0 md:data-closed:zoom-out-95 md:data-closed:slide-out-to-bottom-0",
          REDUCED_MOTION_FADE_ONLY,
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={<Button variant="ghost" className="absolute end-1.5 top-1.5 size-11" />}
          >
            <XIcon className="size-5" />
            <span className="sr-only">סגירה</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex min-h-6 flex-col justify-center gap-2 in-data-[close-button]:pe-9",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 border-t p-4 md:flex-row md:justify-end md:rounded-b-xl",
        // Pinned to the popup's bottom edge. The sticky inset is measured from
        // the popup's content box (inside its p-4), hence -bottom-4 to match
        // -mb-4; bottom-0 would float it 1rem up over the last field.
        "sticky -bottom-4",
        // muted/50 made opaque: content scrolls beneath the pinned footer.
        "bg-[color-mix(in_oklab,var(--muted)_50%,var(--popover))]",
        "max-md:*:min-h-11",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>סגירה</DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
