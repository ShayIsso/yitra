"use client";

import { RouteLoadError } from "@/components/route-load-error";

export default function ReconciliationError({ unstable_retry }: { unstable_retry: () => void }) {
  return (
    <RouteLoadError
      title="תיבת ההתאמות"
      message="לא הצלחנו לטעון את ההתאמות הממתינות."
      onRetry={unstable_retry}
    />
  );
}
