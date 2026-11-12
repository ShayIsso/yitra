export const dynamic = "force-dynamic";

import { HomeScreen } from "@/components/home/home-screen";
import { homeMonthOf } from "@/components/home/month";
import { isBankType } from "@/lib/bank-registry";
import { getCategories } from "@/lib/categories";
import { listCredentials } from "@/lib/credentials";

export default async function HomePage() {
  const [categories, credentials] = await Promise.all([getCategories(), listCredentials()]);
  // A credential for a retired institution cannot sync, so it is not "connected".
  const banks = credentials
    .filter((c) => isBankType(c.bankType))
    .map(({ id, bankType, displayName }) => ({ id, bankType, displayName }));
  return (
    <HomeScreen currentMonth={homeMonthOf(new Date())} categories={categories} banks={banks} />
  );
}
