import { redirect } from "next/navigation";
import { loginDestination, readLoginView } from "@/lib/onboarding";
import { LoginCard, LoginForm } from "./login-form";

/** Reads the environment and, without an override, the database; never prerendered. */
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [view, params] = await Promise.all([readLoginView(), searchParams]);

  if (view.kind === "redirect") redirect(view.to);

  if (view.kind === "unconfigured") {
    return (
      <LoginCard>
        <div className="text-muted-foreground flex flex-col gap-2 text-center text-sm">
          <p>לא מוגדרת סיסמת כניסה.</p>
          <p>
            ההגדרה הראשונית כבר הושלמה, ולכן לא ניתן לבחור סיסמה מתוך האפליקציה. הגדירו את משתנה
            הסביבה{" "}
            <code dir="ltr" className="font-mono text-xs">
              APP_PASSWORD
            </code>{" "}
            והפעילו את השרת מחדש.
          </p>
        </div>
      </LoginCard>
    );
  }

  const next = typeof params.next === "string" ? params.next : undefined;
  return <LoginForm destination={loginDestination(next)} />;
}
