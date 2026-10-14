"use client";

import { Button } from "@/components/ui/button";
import { ProviderForm } from "@/components/provider-form";
import type { ProviderSettingsView } from "@/lib/ai-categorization";

/** The provider step's home in Settings (epic #248 §10): the same form, saved in place. */
export function ProviderSection({ initial }: { initial: ProviderSettingsView }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">סיווג אוטומטי</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          בחירת הספק שמסווג תנועות שהכללים והזיכרון לא זיהו. השינוי חל מהסנכרון הבא, ללא הפעלה מחדש.
        </p>
      </div>

      <div className="max-w-2xl">
        <ProviderForm
          initial={initial}
          announceSaved
          actions={({ pending, pinned }) =>
            pinned ? null : (
              <div>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "שומר..." : "שמור"}
                </Button>
              </div>
            )
          }
        />
      </div>
    </div>
  );
}
