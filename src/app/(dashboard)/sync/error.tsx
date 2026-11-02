"use client";

import { RouteLoadError } from "@/components/route-load-error";

export default function SyncError({ unstable_retry }: { unstable_retry: () => void }) {
  return (
    <RouteLoadError
      title="סנכרון"
      message="לא הצלחנו לטעון את החשבונות ואת מצב הסנכרון האחרון."
      onRetry={unstable_retry}
    />
  );
}
