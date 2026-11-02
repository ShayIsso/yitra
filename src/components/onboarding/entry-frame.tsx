import { BrandMark } from "@/components/brand-mark";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Every control inside an entry screen gets a 44px target (ADR-0015). The
 * forms mounted here are shared with Settings (credential fields, institution
 * picker, provider form), whose controls stay desktop-dense there, so the
 * entry screens raise them in one place instead of forking each form.
 */
const TOUCH_TARGETS =
  "[&_[data-slot=input]]:h-11 [&_[data-slot=select-trigger]]:h-11 [&_[data-slot=button]]:min-h-11";

export type EntryFrameProps = {
  /** Content of the dark-teal hero pane. */
  readonly hero: React.ReactNode;
  readonly children: React.ReactNode;
};

/**
 * The frame of the screens outside the app shell: login and the first-run
 * wizard. On desktop a card with the hero pane beside the content; on a phone
 * the card dissolves (`display: contents`) so the hero becomes a band above
 * the content, which sits on the page itself and can pin a step's actions to
 * the bottom of the viewport.
 */
export function EntryFrame({ hero, children }: EntryFrameProps) {
  return (
    <main className="flex flex-1 flex-col gap-6 px-4 pt-4 pb-6 md:items-center md:justify-center md:px-6 md:py-10">
      <Card className="w-full max-w-4xl min-w-0 gap-0 py-0 max-md:contents md:min-h-[34rem] md:flex-row">
        <aside className="bg-hero text-hero-foreground relative flex flex-col overflow-hidden rounded-xl p-5 md:w-72 md:shrink-0 md:rounded-none md:p-7">
          <div
            aria-hidden="true"
            className="from-hero-foreground/10 pointer-events-none absolute inset-0 bg-radial-[120%_70%_at_100%_0%] to-transparent to-60%"
          />
          <div className="relative flex flex-1 flex-col gap-5">{hero}</div>
        </aside>
        <div className={cn("flex min-w-0 flex-1 flex-col md:p-10", TOUCH_TARGETS)}>{children}</div>
      </Card>
    </main>
  );
}

/** The mark on a paper tile, so the identity violet never sits on the teal hero. */
export function EntryBrand() {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-card flex size-10 shrink-0 items-center justify-center rounded-lg">
        <BrandMark className="h-5 w-auto" />
      </span>
      <span className="text-title font-semibold tracking-tight">Yitra</span>
    </div>
  );
}

export function EntryHeading({
  eyebrow,
  title,
  description,
  titleRef,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  titleRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <header className="flex flex-col gap-1.5">
      {eyebrow && <p className="text-muted-foreground text-caption font-medium">{eyebrow}</p>}
      <h1
        ref={titleRef}
        tabIndex={titleRef ? -1 : undefined}
        className="text-title md:text-headline font-semibold text-balance outline-none"
      >
        {title}
      </h1>
      {description && (
        <p className="text-muted-foreground text-body max-w-prose text-pretty">{description}</p>
      )}
    </header>
  );
}
