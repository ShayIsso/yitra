"use client";

import { MoonIcon, SunIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { useTheme, type Theme } from "@/components/theme";
import { cn } from "@/lib/utils";
import { SectionBody, SectionHeader } from "./parts";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "בהיר", icon: <SunIcon /> },
  { value: "dark", label: "כהה", icon: <MoonIcon /> },
];

/** The theme choice, the same one the shell's toggle flips; it is kept per browser. */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <SectionBody labelledBy="appearance">
      <SectionHeader
        section="appearance"
        description="ערכת הצבעים של האפליקציה. הבחירה נשמרת בדפדפן הזה."
      />
      <Card className="px-4">
        <fieldset className="flex flex-col gap-3">
          <legend className="text-body mb-3 font-medium">ערכת צבעים</legend>
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            {OPTIONS.map((option) => {
              const checked = theme === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "has-focus-visible:ring-ring flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 transition-colors has-focus-visible:ring-3 [&_svg]:size-5",
                    checked
                      ? "border-primary bg-muted font-semibold"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="settings-theme"
                    value={option.value}
                    checked={checked}
                    onChange={() => setTheme(option.value)}
                    className="sr-only"
                  />
                  {option.icon}
                  {option.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      </Card>
    </SectionBody>
  );
}
