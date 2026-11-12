"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowElbowDownLeftIcon, MagnifyingGlassIcon } from "@/components/icons";
import { homeMonthOf, type HomeMonth } from "@/components/home/month";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  firstMonthWithData,
  groupCommands,
  paletteCommands,
  type PaletteCommand,
} from "./commands";
import { searchCommands } from "./search";

/** The floor for the month commands: unknown until the months answer arrives. */
type Floor = { status: "loading" } | { status: "known"; first: HomeMonth | null };

function useMonthFloor(open: boolean): Floor {
  const [floor, setFloor] = React.useState<Floor>({ status: "loading" });
  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    // Re-read on every open: a first sync can add a year of months under a palette opened before it.
    fetch("/api/reports/months", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((answer: unknown) => setFloor({ status: "known", first: firstMonthWithData(answer) }))
      .catch(() => {
        if (!controller.signal.aborted) setFloor({ status: "known", first: null });
      });
    return () => controller.abort();
  }, [open]);
  return floor;
}

const optionId = (baseId: string, command: PaletteCommand) =>
  `${baseId}-${command.id.replace(/[^a-zA-Z0-9-]/g, "-")}`;

/**
 * The command palette (#326): a combobox over pages, transaction views and
 * recent home months, inside the app's responsive dialog. Focus stays in the
 * input; arrow keys move the active option (`aria-activedescendant`), Enter
 * opens it. Loaded on first Cmd/Ctrl+K only (see `PaletteLauncher`).
 */
export default function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const baseId = React.useId();
  const listboxId = `${baseId}-listbox`;
  const inputRef = React.useRef<HTMLInputElement>(null);
  /** Set when a command was chosen, so closing moves focus to the new page instead of back. */
  const navigatedRef = React.useRef(false);
  const [query, setQuery] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const floor = useMonthFloor(open);
  React.useEffect(() => {
    if (open) navigatedRef.current = false;
  }, [open]);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActiveId(null);
    }
  }

  // The clock is read per open (a palette left mounted overnight must not offer yesterday's month).
  const current = React.useMemo(() => (open ? homeMonthOf(new Date()) : null), [open]);
  const commands = React.useMemo(() => {
    if (!current) return [];
    const all = paletteCommands({
      current,
      first: floor.status === "known" ? floor.first : null,
    });
    return floor.status === "known" ? all : all.filter((c) => c.group !== "months");
  }, [current, floor]);

  const sections = React.useMemo(
    () => groupCommands(searchCommands(commands, query)),
    [commands, query],
  );
  const visible = React.useMemo(() => sections.flatMap((s) => s.commands), [sections]);
  const active = visible.find((c) => c.id === activeId) ?? visible[0] ?? null;

  React.useEffect(() => {
    if (!active) return;
    document.getElementById(optionId(baseId, active))?.scrollIntoView({ block: "nearest" });
  }, [active, baseId]);

  function choose(command: PaletteCommand) {
    navigatedRef.current = true;
    onOpenChange(false);
    router.push(command.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step !== 0) {
      event.preventDefault();
      if (visible.length === 0) return;
      const index = active ? visible.indexOf(active) : -1;
      setActiveId(visible[(index + step + visible.length) % visible.length].id);
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      choose(active);
    }
  }

  const trimmed = query.trim();
  const resultsLabel =
    trimmed === "" ? "" : visible.length === 0 ? "אין תוצאות" : `${visible.length} תוצאות`;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        // A chosen command replaces the page focus came from: start at the new
        // page's content. Done here, not through finalFocus: given <main>, it
        // focused the first control inside it instead.
        if (!isOpen && navigatedRef.current) {
          document.getElementById("main-content")?.focus({ preventScroll: true });
        }
      }}
    >
      <DialogContent
        data-command-palette=""
        initialFocus={inputRef}
        finalFocus={() => !navigatedRef.current}
        className="flex flex-col gap-0 overflow-hidden p-0 md:top-[12vh] md:max-w-xl md:translate-y-0"
      >
        <DialogTitle className="sr-only">חיפוש מהיר</DialogTitle>
        <div className="flex h-14 shrink-0 items-center gap-3 border-b ps-4 pe-14">
          <MagnifyingGlassIcon className="text-muted-foreground size-5 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="חיפוש עמוד, חודש או תצוגת תנועות"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={active ? optionId(baseId, active) : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="לאן לקפוץ?"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveId(null);
            }}
            onKeyDown={onKeyDown}
            className="text-lead placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent outline-none"
          />
        </div>
        <div
          id={listboxId}
          role="listbox"
          aria-label="תוצאות"
          className="max-h-[min(26rem,55dvh)] min-h-0 overflow-y-auto overscroll-contain p-2 empty:p-0"
        >
          {sections.map((section) => {
            const headingId = `${baseId}-${section.group}`;
            return (
              <div key={section.group} role="group" aria-labelledby={headingId} className="pb-1">
                <div
                  id={headingId}
                  role="presentation"
                  className="text-caption text-muted-foreground px-2 pt-2 pb-1 font-medium"
                >
                  {section.label}
                </div>
                {section.commands.map((command) => (
                  <Option
                    key={command.id}
                    id={optionId(baseId, command)}
                    command={command}
                    active={command === active}
                    onHover={() => setActiveId(command.id)}
                    onChoose={() => choose(command)}
                  />
                ))}
              </div>
            );
          })}
        </div>
        {trimmed !== "" && visible.length === 0 && (
          <div className="px-4 pt-2 pb-8 text-center">
            <p className="text-body">
              לא נמצא דבר עבור “<bdi>{trimmed}</bdi>”
            </p>
            <p className="text-caption text-muted-foreground mt-1">
              אפשר לחפש עמוד, חודש או תצוגת תנועות, למשל “אוקטובר” או “ללא קטגוריה”.
            </p>
          </div>
        )}
        <p role="status" className="sr-only">
          {resultsLabel}
        </p>
        <div
          aria-hidden="true"
          className="text-caption text-muted-foreground hidden items-center gap-4 border-t px-4 py-2 md:flex"
        >
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> ניווט
          </span>
          <span>
            <Kbd>Enter</Kbd> פתיחה
          </span>
          <span>
            <Kbd>Esc</Kbd> סגירה
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Option({
  id,
  command,
  active,
  onHover,
  onChoose,
}: {
  id: string;
  command: PaletteCommand;
  active: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  const Icon = command.icon;
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      // Pointer movement, not entry: a list scrolling under a still pointer must not steal the keyboard's choice.
      onPointerMove={active ? undefined : onHover}
      // Keep focus in the input, where the combobox lives.
      onPointerDown={(e) => e.preventDefault()}
      onClick={onChoose}
      className={cn(
        "text-body flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5",
        active && "bg-muted",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-[1.125rem]",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        <Icon />
      </span>
      <span className="min-w-0 flex-1 truncate">
        {command.label}
        {command.hint && (
          <span className="text-caption text-muted-foreground ms-2">{command.hint}</span>
        )}
      </span>
      {active && (
        <ArrowElbowDownLeftIcon
          aria-hidden="true"
          className="text-muted-foreground hidden size-4 shrink-0 md:block"
        />
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-muted text-foreground text-caption inline-grid h-5 min-w-5 place-items-center rounded px-1 font-sans">
      {children}
    </kbd>
  );
}
