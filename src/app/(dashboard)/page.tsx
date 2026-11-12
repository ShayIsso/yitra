export const dynamic = "force-dynamic";

import { HomeScreen } from "@/components/home/home-screen";
import { isBankType } from "@/lib/bank-registry";
import { getCategories } from "@/lib/categories";
import { listCredentials } from "@/lib/credentials";
import { getHomeMonthRange } from "./home-month-range";

export default async function HomePage() {
  const [categories, credentials, range] = await Promise.all([
    getCategories(),
    listCredentials(),
    getHomeMonthRange(),
  ]);
  // A credential for a retired institution cannot sync, so it is not
  // "connected" (ADR-0013 §4); the month outlook counts the same way.
  const banks = credentials
    .filter((c) => isBankType(c.bankType))
    .map(({ id, bankType, displayName }) => ({ id, bankType, displayName }));
  return <HomeScreen range={range} categories={categories} banks={banks} />;
}
