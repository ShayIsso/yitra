import { NextRequest, NextResponse } from "next/server";
import { getDecryptedCredentials } from "@/lib/credentials";
import { credentialFieldsFor, nonSecretCredentialValues } from "@/lib/bank-registry";

type Params = { params: Promise<{ id: string }> };

// Credential mutations moved to Server Actions (src/app/actions/credentials.ts);
// this route serves only the edit form's prefill. Passwords are never returned:
// fields are filtered by their registry kind, never by institution (ADR-0013 §2).
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const { bankType, credentials } = await getDecryptedCredentials(id);
    const safeFields = nonSecretCredentialValues(credentialFieldsFor(bankType), credentials);
    return NextResponse.json({ bankType, safeFields });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
