"use client";

import { Button } from "@/components/ui/button";
import { ProviderForm } from "@/components/provider-form";
import { SectionBody, SectionHeader, CONTROLS } from "@/components/settings/parts";
import type { ProviderSettingsView } from "@/lib/ai-categorization";

/** The provider step's home in Settings (epic #248 §10): the same form, saved in place. */
export function ProviderSection({ initial }: { initial: ProviderSettingsView }) {
  return (
    <SectionBody labelledBy="ai">
      <SectionHeader
        section="ai"
        description="הספק שמסווג תנועות שהכללים והזיכרון לא זיהו. השינוי חל מהסנכרון הבא, בלי להפעיל מחדש."
      />
      <div className={`max-w-2xl ${CONTROLS}`}>
        <ProviderForm
          initial={initial}
          announceSaved
          actions={({ pending, pinned }) =>
            pinned ? null : (
              <div>
                <Button type="submit" disabled={pending}>
                  {pending ? "שומר..." : "שמור"}
                </Button>
              </div>
            )
          }
        />
      </div>
    </SectionBody>
  );
}
