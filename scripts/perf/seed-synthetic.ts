import "dotenv/config";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  appSettings,
  bankAccounts,
  bankCredentials,
  budgets,
  categories,
  goalsSettings,
  monthlyTargets,
  recurringExpenses,
  savingsGoals,
  syncRuns,
  transactions,
} from "@/db/schema";
import { seedDefaultCategories } from "@/db/seed";
import { enabledBankEntries, type BankKind } from "@/lib/bank-registry";
import { encrypt } from "@/lib/crypto";

/**
 * Seeds a THROWAWAY database with invented, deterministic data so the
 * dashboard renders realistic content for performance measurement and
 * screenshots (docs/perf-baseline.md). Every merchant name and figure here is
 * made up; nothing is derived from a real account.
 *
 *   DATABASE_URL=postgres://…/yitra_perf npx tsx scripts/perf/seed-synthetic.ts
 *
 * Refuses to touch a database that already holds credentials or transactions,
 * so it can never mix invented rows into a real ledger.
 */

const MONTHS_OF_HISTORY = 13;

/** mulberry32 — a fixed seed keeps the row set identical across runs on the same date. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Template = {
  description: string;
  category: string;
  min: number;
  max: number;
  perMonth: number;
  account: "bank" | "card";
};

const TEMPLATES: Template[] = [
  {
    description: "סופר הדוגמה",
    category: "מזון וסופר",
    min: 80,
    max: 620,
    perMonth: 9,
    account: "card",
  },
  {
    description: "מכולת השכונה הבדויה",
    category: "מזון וסופר",
    min: 20,
    max: 140,
    perMonth: 6,
    account: "card",
  },
  {
    description: "קפה ענן",
    category: "מסעדות וקפה",
    min: 14,
    max: 68,
    perMonth: 7,
    account: "card",
  },
  {
    description: "מסעדת הגפן הדמיונית",
    category: "מסעדות וקפה",
    min: 90,
    max: 380,
    perMonth: 2,
    account: "card",
  },
  {
    description: "תחנת דלק אלפא",
    category: "תחבורה",
    min: 150,
    max: 340,
    perMonth: 2,
    account: "card",
  },
  {
    description: "רב-קו לדוגמה",
    category: "תחבורה",
    min: 30,
    max: 90,
    perMonth: 2,
    account: "card",
  },
  {
    description: "פארם בדוי",
    category: "בריאות וטיפוח",
    min: 25,
    max: 210,
    perMonth: 2,
    account: "card",
  },
  {
    description: "קולנוע הירח",
    category: "בילויים ופנאי",
    min: 45,
    max: 160,
    perMonth: 1,
    account: "card",
  },
  {
    description: "חנות בגדים לדוגמה",
    category: "קניות וביגוד",
    min: 70,
    max: 520,
    perMonth: 1,
    account: "card",
  },
  {
    description: "חברת חשמל דמה",
    category: "חשבונות ושירותים",
    min: 240,
    max: 520,
    perMonth: 1,
    account: "bank",
  },
];

const FIXED_MONTHLY = [
  {
    description: "משכורת חברת דוגמה בעמ",
    category: "משכורת",
    amount: 18_400,
    day: 9,
    account: "bank",
  },
  {
    description: "שכר דירה - בעל בית בדוי",
    category: "דיור ושכירות",
    amount: -5_200,
    day: 1,
    account: "bank",
  },
  { description: "DEMO STREAMING", category: "מנויים", amount: -49.9, day: 4, account: "card" },
  { description: "SAMPLE MUSIC", category: "מנויים", amount: -21.9, day: 12, account: "card" },
  { description: "חדר כושר אומגה", category: "מנויים", amount: -219, day: 3, account: "card" },
  {
    description: "הפקדה לתיק השקעות לדוגמה",
    category: "השקעות וחיסכון",
    amount: -2_000,
    day: 11,
    account: "bank",
  },
] as const;

function firstInstitutionOfKind(kind: BankKind): string {
  const entry = enabledBankEntries().find((e) => e.kind === kind);
  if (!entry) throw new Error(`The bank registry has no ${kind} institution`);
  return entry.id;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function assertThrowaway(url: string) {
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (dbName === "yitra" || dbName === "") {
    throw new Error(`Refusing to seed "${dbName || "(default)"}": use a throwaway database.`);
  }
}

async function main() {
  assertThrowaway(process.env.DATABASE_URL ?? "");

  const [{ n: txnCount }] = await db.select({ n: count() }).from(transactions);
  const [{ n: credCount }] = await db.select({ n: count() }).from(bankCredentials);
  if (txnCount > 0 || credCount > 0) {
    throw new Error("Refusing to seed: the database already holds credentials or transactions.");
  }

  const bankInstitution = firstInstitutionOfKind("bank");
  const cardInstitution = firstInstitutionOfKind("card");

  await seedDefaultCategories();
  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories);
  const catId = (name: string) => {
    const hit = cats.find((c) => c.name === name);
    if (!hit) throw new Error(`Missing default category ${name}`);
    return hit.id;
  };

  const placeholder = encrypt(JSON.stringify({ username: "demo", password: "demo" }));
  const [bankCred] = await db
    .insert(bankCredentials)
    .values({
      bankType: bankInstitution,
      displayName: "בנק לדוגמה",
      encryptedCredentials: placeholder.encrypted,
      iv: placeholder.iv,
      authTag: placeholder.authTag,
    })
    .returning({ id: bankCredentials.id });
  const cardPlaceholder = encrypt(JSON.stringify({ username: "demo", password: "demo" }));
  const [cardCred] = await db
    .insert(bankCredentials)
    .values({
      bankType: cardInstitution,
      displayName: "כרטיס לדוגמה",
      encryptedCredentials: cardPlaceholder.encrypted,
      iv: cardPlaceholder.iv,
      authTag: cardPlaceholder.authTag,
    })
    .returning({ id: bankCredentials.id });

  const now = new Date();
  const [bankAcct] = await db
    .insert(bankAccounts)
    .values({
      credentialId: bankCred.id,
      accountNumber: "000-0001",
      balance: "24310.55",
      balanceUpdatedAt: now,
    })
    .returning({ id: bankAccounts.id });
  const [cardAcct] = await db
    .insert(bankAccounts)
    .values({ credentialId: cardCred.id, accountNumber: "0000", balance: null })
    .returning({ id: bankAccounts.id });
  const accountId = { bank: bankAcct.id, card: cardAcct.id } as const;

  const rand = prng(314);
  const rows: (typeof transactions.$inferInsert)[] = [];
  let seq = 0;
  const push = (
    date: Date,
    description: string,
    category: string,
    amount: number,
    account: "bank" | "card",
  ) => {
    const day = isoDate(date);
    rows.push({
      bankAccountId: accountId[account],
      externalId: `perf-${++seq}`,
      date: day,
      processedDate: day,
      description,
      originalAmount: amount.toFixed(2),
      originalCurrency: "ILS",
      chargedAmount: amount.toFixed(2),
      chargedCurrency: "ILS",
      type: "normal",
      status: "completed",
      categoryId: catId(category),
      categorySource: "rule",
    });
  };

  for (let back = MONTHS_OF_HISTORY - 1; back >= 0; back--) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() - back;
    const lastDay =
      back === 0 ? now.getUTCDate() : new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const dayOf = (d: number) => new Date(Date.UTC(year, month, Math.min(d, lastDay)));

    for (const f of FIXED_MONTHLY) {
      if (f.day <= lastDay) push(dayOf(f.day), f.description, f.category, f.amount, f.account);
    }
    for (const t of TEMPLATES) {
      const n = Math.max(1, Math.round((t.perMonth * lastDay) / 30));
      for (let i = 0; i < n; i++) {
        const amount = -(t.min + rand() * (t.max - t.min));
        push(dayOf(1 + Math.floor(rand() * lastDay)), t.description, t.category, amount, t.account);
      }
    }
    if (rand() < 0.4) {
      push(dayOf(15), "החזר מחנות לדוגמה", "קניות וביגוד", 60 + rand() * 120, "card");
    }
  }
  // A few uncategorized rows so the attention counters have something to show.
  for (let i = 0; i < 4; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1 + i));
    if (d <= now) {
      rows.push({
        ...rows[rows.length - 1],
        externalId: `perf-${++seq}`,
        date: isoDate(d),
        processedDate: isoDate(d),
        description: `עסקה לא מסווגת ${i + 1}`,
        categoryId: null,
        categorySource: null,
      });
    }
  }
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(transactions).values(rows.slice(i, i + 200));
  }

  const nextMonthDay = (d: number) =>
    isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, d)));
  await db.insert(recurringExpenses).values(
    FIXED_MONTHLY.filter((f) => f.amount < 0 && f.category === "מנויים").map((f) => ({
      patternFingerprint: `perf:${f.description}:monthly`,
      merchant: f.description.toLowerCase(),
      categoryId: catId(f.category),
      expectedAmount: Math.abs(f.amount).toFixed(2),
      expectedCadence: "monthly" as const,
      nextExpectedDate: nextMonthDay(f.day),
      confirmedAt: now,
    })),
  );

  const targets = { expenseTarget: "11000", savingsTarget: "3000" };
  await db
    .insert(monthlyTargets)
    .values({ id: 1, ...targets })
    .onConflictDoUpdate({ target: monthlyTargets.id, set: targets });
  await db.insert(budgets).values([
    { categoryId: catId("מסעדות וקפה"), monthlyLimit: "900" },
    { categoryId: catId("מזון וסופר"), monthlyLimit: "2600" },
    { categoryId: catId("קניות וביגוד"), monthlyLimit: "500" },
  ]);
  const trackingSince = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
  await db
    .insert(goalsSettings)
    .values({ id: 1, trackingSinceMonth: isoDate(trackingSince).slice(0, 7) })
    .onConflictDoUpdate({
      target: goalsSettings.id,
      set: { trackingSinceMonth: isoDate(trackingSince).slice(0, 7) },
    });
  await db.insert(savingsGoals).values({
    name: "קרן חירום",
    targetAmount: "30000",
    startMonth: isoDate(trackingSince).slice(0, 7),
    openingAmount: "5000",
    priority: 1,
  });

  const lastSync = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  await db.insert(syncRuns).values([
    {
      bank: bankInstitution,
      startedAt: lastSync,
      finishedAt: lastSync,
      status: "success",
      transactionsImported: 12,
    },
    {
      bank: cardInstitution,
      startedAt: lastSync,
      finishedAt: lastSync,
      status: "success",
      transactionsImported: 31,
    },
  ]);

  const existing = await db
    .select({ id: appSettings.id })
    .from(appSettings)
    .where(eq(appSettings.id, 1));
  if (existing.length === 0) {
    await db.insert(appSettings).values({ id: 1, onboardingCompletedAt: now });
  } else {
    await db.update(appSettings).set({ onboardingCompletedAt: now }).where(eq(appSettings.id, 1));
  }

  console.log(`Seeded ${rows.length} synthetic transactions across ${MONTHS_OF_HISTORY} months.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("seed-synthetic failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
