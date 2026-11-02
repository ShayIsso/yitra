import { redirect } from "next/navigation";
import { InfoIcon } from "@/components/icons";
import { EntryBrand, EntryFrame, EntryHeading } from "@/components/onboarding/entry-frame";
import { loginDestination, readLoginView } from "@/lib/onboarding";
import { LoginForm } from "./login-form";

/** Reads the environment and, without an override, the database; never prerendered. */
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [view, params] = await Promise.all([readLoginView(), searchParams]);

  if (view.kind === "redirect") redirect(view.to);

  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <EntryFrame hero={<LoginHero />}>
      <section className="enter flex flex-1 flex-col gap-6 md:mx-auto md:w-full md:max-w-sm md:justify-center">
        {view.kind === "unconfigured" ? (
          <>
            <EntryHeading title="לא מוגדרת סיסמת כניסה" />
            <div className="bg-muted text-body flex items-start gap-3 rounded-lg p-4">
              <InfoIcon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
              <p className="leading-relaxed">
                ההגדרה הראשונית כבר הושלמה, ולכן לא ניתן לבחור סיסמה מתוך האפליקציה. הגדירו את משתנה
                הסביבה{" "}
                <code dir="ltr" className="font-mono text-xs">
                  APP_PASSWORD
                </code>{" "}
                והפעילו את השרת מחדש.
              </p>
            </div>
          </>
        ) : (
          <>
            <EntryHeading title="כניסה" description="הזינו את סיסמת הכניסה כדי להמשיך." />
            <LoginForm destination={loginDestination(next)} />
          </>
        )}
      </section>
    </EntryFrame>
  );
}

function LoginHero() {
  return (
    <>
      <EntryBrand />
      <div className="flex flex-col gap-2 md:mt-auto">
        <p className="text-title md:text-headline font-semibold text-balance">
          החודש שלכם, במבט אחד.
        </p>
        <p className="text-hero-muted text-body text-pretty">
          לוח בקרה פיננסי פרטי, שרץ על השרת שלכם.
        </p>
      </div>
    </>
  );
}
