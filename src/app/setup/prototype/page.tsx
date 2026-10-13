import { PrototypeClient } from "./prototype-client";

/**
 * Throwaway sandbox for the #258 prototype gate: the three frame variants over
 * mocked wizard state. No database, no session, no Server Actions — so it is
 * safe under `/setup`'s auth exemption and on an install that already has a
 * password. Deleted once the owner picks a frame.
 */
export default async function SetupPrototypePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { variant } = await searchParams;
  const picked = variant === "b" ? "rail" : variant === "c" ? "focus" : "stepper";
  return <PrototypeClient variant={picked} />;
}
