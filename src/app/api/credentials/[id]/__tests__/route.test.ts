import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { enabledBankEntries, isSecretFieldKind } from "@/lib/bank-registry";
import { CredentialNotFoundError } from "@/lib/credentials/errors";

vi.mock("@/lib/credentials", () => ({
  getDecryptedCredentials: vi.fn(),
}));

import { getDecryptedCredentials } from "@/lib/credentials";
import { GET } from "../route";

const ROW_ID = "3f8a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const SYNTHETIC_SECRET = "synthetic-secret-value";

async function getPrefill(stored: { bankType: string; credentials: Record<string, string> }) {
  vi.mocked(getDecryptedCredentials).mockResolvedValue(
    stored as Awaited<ReturnType<typeof getDecryptedCredentials>>,
  );
  const res = await GET(new NextRequest(`http://localhost/api/credentials/${ROW_ID}`), {
    params: Promise.resolve({ id: ROW_ID }),
  });
  return { status: res.status, text: await res.text() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/credentials/:id", () => {
  it("prefills a bank account's national ID and account number, never its password", async () => {
    const { status, text } = await getPrefill({
      bankType: "discount",
      credentials: { id: "000000001", password: SYNTHETIC_SECRET, num: "000123" },
    });

    expect(status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      bankType: "discount",
      safeFields: { id: "000000001", num: "000123" },
    });
  });

  it("prefills a card issuer's internet username, never its password", async () => {
    const { text } = await getPrefill({
      bankType: "visaCal",
      credentials: { username: "sample-user", password: SYNTHETIC_SECRET },
    });

    expect(JSON.parse(text).safeFields).toEqual({ username: "sample-user" });
  });

  it("never returns a secret-kind field's value for any registered institution", async () => {
    for (const entry of enabledBankEntries()) {
      const credentials = Object.fromEntries(
        entry.credentialFields.map((field) => [
          field.key,
          isSecretFieldKind(field.kind) ? SYNTHETIC_SECRET : `sample-${field.key}`,
        ]),
      );

      const { status, text } = await getPrefill({ bankType: entry.id, credentials });

      expect(status).toBe(200);
      expect(text).not.toContain(SYNTHETIC_SECRET);
    }
  });

  it("exposes no stored field at all for an institution no longer registered", async () => {
    const { status, text } = await getPrefill({
      bankType: "retiredInstitution",
      credentials: { username: "sample-user", password: SYNTHETIC_SECRET },
    });

    expect(status).toBe(200);
    expect(JSON.parse(text).safeFields).toEqual({});
  });

  it("answers 404 without detail when the credential does not exist", async () => {
    vi.mocked(getDecryptedCredentials).mockRejectedValue(new CredentialNotFoundError(ROW_ID));

    const res = await GET(new NextRequest(`http://localhost/api/credentials/${ROW_ID}`), {
      params: Promise.resolve({ id: ROW_ID }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});
