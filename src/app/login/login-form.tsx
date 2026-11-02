"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WarningCircleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WRONG_PASSWORD = "סיסמה שגויה. נסו שוב.";
const UNREACHABLE = "לא הצלחנו להתחבר לשרת. נסו שוב.";
const FAILED = "הכניסה נכשלה. נסו שוב.";

export function LoginForm({ destination }: { destination: "/" | "/setup" }) {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The input is disabled while the request runs, so focus returns to it once
  // the error is rendered; the error itself is announced by its alert role.
  useEffect(() => {
    if (error) inputRef.current?.focus();
  }, [error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
    } catch {
      setError(UNREACHABLE);
      setLoading(false);
      return;
    }

    if (res.ok) {
      router.push(destination);
      return;
    }
    if (res.status === 401) {
      setPassword("");
      setError(WRONG_PASSWORD);
    } else {
      setError(FAILED);
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor={inputId}>סיסמה</Label>
        <Input
          ref={inputRef}
          id={inputId}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          disabled={loading}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-destructive text-body flex items-center gap-1.5"
          >
            <WarningCircleIcon className="size-4 shrink-0" />
            {error}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="text-lead w-full" disabled={loading || !password}>
        {loading ? "נכנסים..." : "כניסה"}
      </Button>
    </form>
  );
}
