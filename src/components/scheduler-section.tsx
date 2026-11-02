"use client";

import { useState } from "react";
import { CheckIcon, InfoIcon } from "@/components/icons";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { saveSchedulerConfigAction } from "@/app/actions/scheduler";
import { SectionBody, SectionHeader, CONTROLS } from "@/components/settings/parts";
import { cn } from "@/lib/utils";

type SchedulerConfig = {
  enabled: boolean;
  cronTime: string;
};

type Props = {
  initialConfig: SchedulerConfig;
};

export function SchedulerSection({ initialConfig }: Props) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [cronTime, setCronTime] = useState(initialConfig.cronTime);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("idle");
    setErrorMessage(null);

    const result = await saveSchedulerConfigAction({ enabled, cronTime });

    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error);
    } else {
      setStatus("saved");
    }

    setSaving(false);
  }

  return (
    <SectionBody labelledBy="scheduler">
      <SectionHeader
        section="scheduler"
        description="סנכרון אחד ביום, בשעה שתבחרו. שינויים נכנסים לתוקף בהפעלה הבאה של האפליקציה."
      />

      <Card className={cn("gap-0 py-0", CONTROLS)}>
        <form onSubmit={handleSubmit}>
          <div className="divide-border flex flex-col divide-y">
            <label
              htmlFor="scheduler-enabled"
              className="flex min-h-14 cursor-pointer items-center justify-between gap-4 px-4 py-3"
            >
              <span className="text-body font-medium">סנכרון אוטומטי יומי</span>
              <Switch
                id="scheduler-enabled"
                checked={enabled}
                onCheckedChange={(checked) => {
                  setEnabled(checked);
                  setStatus("idle");
                }}
              />
            </label>

            <div className="flex flex-col gap-2 px-4 py-3">
              <div className="flex min-h-11 items-center justify-between gap-4">
                <Label htmlFor="cron-time" className={cn(!enabled && "text-muted-foreground")}>
                  שעת סנכרון
                </Label>
                <Input
                  id="cron-time"
                  type="time"
                  dir="ltr"
                  value={cronTime}
                  onChange={(e) => {
                    setCronTime(e.target.value);
                    setStatus("idle");
                  }}
                  className="w-32 tabular-nums"
                  disabled={!enabled}
                />
              </div>
              <p className="text-muted-foreground text-caption flex items-start gap-1.5">
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                בנקים שדורשים קוד חד-פעמי (OTP) מדולגים בסנכרון המתוזמן.
              </p>
            </div>
          </div>

          <div className="bg-muted/50 flex flex-wrap items-center gap-3 rounded-b-xl border-t px-4 py-3">
            <Button type="submit" disabled={saving} className="max-md:px-4">
              {saving ? "שומר..." : "שמור"}
            </Button>
            {status === "error" && errorMessage && (
              <p role="alert" className="text-destructive text-body">
                {errorMessage}
              </p>
            )}
            {status === "saved" && (
              <p
                role="status"
                className="text-muted-foreground text-body inline-flex items-center gap-1.5"
              >
                <CheckIcon className="size-4" />
                ההגדרות נשמרו ויחולו בהפעלה הבאה.
              </p>
            )}
          </div>
        </form>
      </Card>
    </SectionBody>
  );
}
