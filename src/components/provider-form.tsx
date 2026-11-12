"use client";

import { useId, useState, useTransition, type ComponentType, type ReactNode } from "react";
import { CloudIcon, HardDrivesIcon, InfoIcon, KeyIcon, ProhibitIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AiProviderKind, ProviderSettingsView } from "@/lib/ai-categorization";
import {
  clearProviderKeyAction,
  saveProviderSettingsAction,
  type ProviderActionResult,
} from "@/app/setup/provider-actions";

type Option = {
  readonly icon: ComponentType<{ className?: string }>;
  readonly label: string;
  readonly description: string;
};

/** The three choices ADR-0008 allows. */
const OPTIONS: Record<AiProviderKind, Option> = {
  off: {
    icon: ProhibitIcon,
    label: "כבוי",
    description: "ללא סיווג אוטומטי. שום מידע לא יוצא מהמחשב.",
  },
  ollama: {
    icon: HardDrivesIcon,
    label: "מקומי (Ollama)",
    description:
      "מודל שרץ אצלכם, במחשב או ברשת הביתית. שום מידע לא יוצא החוצה, ואין צורך במפתח. דורש שרת Ollama פעיל.",
  },
  gemini: {
    icon: CloudIcon,
    label: "חיצוני (Google Gemini)",
    description:
      "תיאורי בתי העסק נשלחים ל-Google לסיווג, אחרי הסרת מספרים ופרטים מזהים. פרטי התחברות ומספרי חשבון לעולם לא נשלחים. דורש מפתח API.",
  },
};

/** Zero-egress first, as the default. */
const OPTION_ORDER: readonly AiProviderKind[] = ["off", "ollama", "gemini"];

type ProviderFormActionsState = {
  readonly pending: boolean;
  /** The environment pins the provider, so submitting saves nothing. */
  readonly pinned: boolean;
};

export type ProviderFormProps = {
  readonly initial: ProviderSettingsView;
  /**
   * Called after a successful save — or at once when the environment pins the
   * provider, since there is then nothing to save.
   */
  readonly onSaved?: (settings: ProviderSettingsView) => void;
  /** Whether to confirm a save inline; the wizard moves on instead. */
  readonly announceSaved?: boolean;
  /** The submit control, rendered last inside the form. */
  readonly actions: (state: ProviderFormActionsState) => ReactNode;
};

/**
 * The categorization-provider form (ADR-0014 §3), mounted by the wizard's
 * provider step and by the Settings section. A stored key is never sent to the
 * browser: the form knows only whether one exists, and offers to replace or
 * delete it.
 */
export function ProviderForm({
  initial,
  onSaved,
  announceSaved = false,
  actions,
}: ProviderFormProps) {
  const [settings, setSettings] = useState(initial);
  const [selected, setSelected] = useState<AiProviderKind>(initial.storedProvider ?? "off");
  const [apiKey, setApiKey] = useState("");
  const [replacingKey, setReplacingKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const pinned = settings.environmentProvider !== null;

  function apply(result: ProviderActionResult): boolean {
    if (result.settings) {
      setSettings(result.settings);
      setApiKey("");
      setReplacingKey(false);
      setError(null);
      setKeyError(null);
      return true;
    }
    setKeyError(result.fieldErrors?.apiKey ?? null);
    setError(result.fieldErrors?.apiKey ? null : (result.error ?? null));
    return false;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pinned) {
      onSaved?.(settings);
      return;
    }
    setSaved(false);
    startTransition(async () => {
      const input = selected === "gemini" ? { provider: selected, apiKey } : { provider: selected };
      const result = await saveProviderSettingsAction(input);
      if (!apply(result) || !result.settings) return;
      setSaved(true);
      onSaved?.(result.settings);
    });
  }

  function handleClearKey() {
    setSaved(false);
    startTransition(async () => {
      const result = await clearProviderKeyAction();
      if (apply(result) && result.settings) setSelected(result.settings.storedProvider ?? "off");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {pinned ? (
        <div className="flex flex-col gap-3">
          <EnvironmentPinned />
          {settings.hasStoredKey && (
            <StoredKeyActions
              note="מפתח API שמור במסד הנתונים, ואינו בשימוש כל עוד הספק נקבע בסביבה."
              onClear={handleClearKey}
              pending={pending}
            />
          )}
        </div>
      ) : (
        <fieldset className="flex flex-col gap-3" disabled={pending}>
          <legend className="sr-only">ספק הסיווג</legend>
          {OPTION_ORDER.map((kind) => (
            <ProviderOption
              key={kind}
              kind={kind}
              checked={selected === kind}
              onSelect={() => {
                setSelected(kind);
                setSaved(false);
                setError(null);
                setKeyError(null);
              }}
            >
              {kind === "gemini" && selected === "gemini" && (
                <KeyField
                  settings={settings}
                  value={apiKey}
                  onChange={setApiKey}
                  replacing={replacingKey}
                  onReplace={() => setReplacingKey(true)}
                  onClear={handleClearKey}
                  error={keyError}
                  pending={pending}
                />
              )}
            </ProviderOption>
          ))}
        </fieldset>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-muted-foreground text-body">
          בשימוש כעת:{" "}
          <span className="text-foreground font-medium">{OPTIONS[settings.effective].label}</span>
        </p>
        {!pinned && settings.hasStoredKey && selected !== "gemini" && (
          <p className="text-muted-foreground text-body">השמירה תמחק את מפתח ה-API השמור.</p>
        )}
        {error && (
          <p role="alert" className="text-destructive text-body">
            {error}
          </p>
        )}
        {announceSaved && saved && !error && (
          <p role="status" className="text-muted-foreground text-body">
            ההגדרה נשמרה ותחול מהסנכרון הבא.
          </p>
        )}
      </div>

      {actions({ pending, pinned })}
    </form>
  );
}

function ProviderOption({
  kind,
  checked,
  onSelect,
  children,
}: {
  kind: AiProviderKind;
  checked: boolean;
  onSelect: () => void;
  children?: ReactNode;
}) {
  const id = useId();
  const option = OPTIONS[kind];
  const Icon = option.icon;

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        checked ? "border-primary bg-muted" : "border-border hover:bg-muted",
      )}
    >
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 p-4">
        <input
          id={id}
          type="radio"
          name="categorization-provider"
          value={kind}
          checked={checked}
          onChange={onSelect}
          className="accent-primary mt-1 size-4 shrink-0"
        />
        <Icon
          className={cn(
            "mt-0.5 size-5 shrink-0",
            checked ? "text-foreground" : "text-muted-foreground",
          )}
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-body font-medium">{option.label}</span>
          <span className="text-muted-foreground text-caption leading-relaxed">
            {option.description}
          </span>
        </span>
      </label>
      {children && <div className="border-border border-t px-4 py-4">{children}</div>}
    </div>
  );
}

function KeyField({
  settings,
  value,
  onChange,
  replacing,
  onReplace,
  onClear,
  error,
  pending,
}: {
  settings: ProviderSettingsView;
  value: string;
  onChange: (value: string) => void;
  replacing: boolean;
  onReplace: () => void;
  onClear: () => void;
  error: string | null;
  pending: boolean;
}) {
  const inputId = useId();

  if (settings.environmentHasKey) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-body flex items-start gap-2">
          <KeyIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            המפתח נלקח ממשתנה הסביבה{" "}
            <code dir="ltr" className="font-mono text-xs">
              GEMINI_API_KEY
            </code>
            , ולכן אין צורך להזין אותו כאן.
          </span>
        </p>
        {settings.hasStoredKey && (
          <StoredKeyActions
            note="מפתח API שמור במסד הנתונים, ואינו בשימוש כל עוד המפתח נקבע בסביבה."
            onClear={onClear}
            pending={pending}
          />
        )}
      </div>
    );
  }

  if (settings.hasStoredKey && !replacing) {
    return (
      <StoredKeyActions
        note="מפתח API שמור ומוצפן."
        onReplace={onReplace}
        onClear={onClear}
        pending={pending}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{settings.hasStoredKey ? "מפתח API חדש" : "מפתח API"}</Label>
      <Input
        id={inputId}
        type="password"
        dir="ltr"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        placeholder="הדביקו כאן את המפתח"
      />
      <p className={error ? "text-destructive text-caption" : "text-muted-foreground text-caption"}>
        {error ?? "המפתח נשמר מוצפן במסד הנתונים שלכם ולא יוצג שוב."}
      </p>
    </div>
  );
}

function EnvironmentPinned() {
  return (
    <div className="bg-muted text-body flex items-start gap-3 rounded-lg px-4 py-4">
      <InfoIcon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
      <p className="leading-relaxed">
        הספק נקבע במשתנה הסביבה{" "}
        <code dir="ltr" className="font-mono text-xs">
          AI_PROVIDER
        </code>
        , שגובר על כל בחירה כאן. כדי לבחור ספק מתוך האפליקציה, הסירו את המשתנה מקובץ הסביבה והפעילו
        את האפליקציה מחדש.
      </p>
    </div>
  );
}

/** A stored key is never shown — only that it exists, and how to replace or delete it. */
function StoredKeyActions({
  note,
  onReplace,
  onClear,
  pending,
}: {
  note: string;
  onReplace?: () => void;
  onClear: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body flex items-start gap-2">
        <KeyIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        {note}
      </p>
      <div className="flex flex-wrap gap-2">
        {onReplace && (
          <Button type="button" variant="outline" size="sm" onClick={onReplace} disabled={pending}>
            החלפת המפתח
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={pending}>
          מחיקת המפתח
        </Button>
      </div>
      <p className="text-muted-foreground text-caption">
        מחיקת המפתח מחזירה גם את הבחירה השמורה למצב כבוי.
      </p>
    </div>
  );
}
