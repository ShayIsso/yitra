import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankCredentials } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";
import type { BankType } from "@/lib/bank-registry";
import { storedCredentialSchema } from "./schemas";
import { CredentialNotFoundError } from "./errors";

// Returns the parsed value, which drops undeclared keys: only that is ever
// encrypted, since the whole blob is handed to the scraper at sync time.
function validateCredentials(
  bankType: string,
  raw: Record<string, string>,
): Record<string, string> {
  return storedCredentialSchema(bankType).parse(raw);
}

export async function addCredential(
  bankType: BankType,
  displayName: string,
  rawCredentials: Record<string, string>,
): Promise<string> {
  const credentials = validateCredentials(bankType, rawCredentials);
  const { encrypted, iv, authTag } = encrypt(JSON.stringify(credentials));
  const [row] = await db
    .insert(bankCredentials)
    .values({ bankType, displayName, encryptedCredentials: encrypted, iv, authTag })
    .returning({ id: bankCredentials.id });
  return row.id;
}

export async function listCredentials(): Promise<
  Array<{ id: string; bankType: string; displayName: string; createdAt: Date }>
> {
  return db.query.bankCredentials.findMany({
    columns: { id: true, bankType: true, displayName: true, createdAt: true },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
}

/**
 * The stored institution id alone, without decrypting the blob, so a caller can
 * refuse a row naming an unregistered institution before any secret is in memory.
 */
export async function getCredentialBankType(id: string): Promise<string> {
  const row = await db.query.bankCredentials.findFirst({
    where: eq(bankCredentials.id, id),
    columns: { bankType: true },
  });
  if (!row) throw new CredentialNotFoundError(id);
  return row.bankType;
}

export async function getDecryptedCredentials(
  id: string,
): Promise<{ bankType: BankType; credentials: Record<string, string> }> {
  const row = await db.query.bankCredentials.findFirst({
    where: eq(bankCredentials.id, id),
  });
  if (!row) throw new CredentialNotFoundError(id);
  const json = decrypt({ encrypted: row.encryptedCredentials, iv: row.iv, authTag: row.authTag });
  return { bankType: row.bankType, credentials: JSON.parse(json) as Record<string, string> };
}

export async function updateCredential(
  id: string,
  update: { displayName?: string; rawCredentials?: Record<string, string> },
): Promise<void> {
  const values: Partial<typeof bankCredentials.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (update.displayName !== undefined) values.displayName = update.displayName;
  if (update.rawCredentials !== undefined) {
    const row = await db.query.bankCredentials.findFirst({
      where: eq(bankCredentials.id, id),
      columns: { bankType: true },
    });
    if (!row) throw new CredentialNotFoundError(id);
    const credentials = validateCredentials(row.bankType, update.rawCredentials);
    const { encrypted, iv, authTag } = encrypt(JSON.stringify(credentials));
    values.encryptedCredentials = encrypted;
    values.iv = iv;
    values.authTag = authTag;
  }
  await db.update(bankCredentials).set(values).where(eq(bankCredentials.id, id));
}

export async function removeCredential(id: string): Promise<void> {
  await db.delete(bankCredentials).where(eq(bankCredentials.id, id));
}
