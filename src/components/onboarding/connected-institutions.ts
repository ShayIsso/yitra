/** A connected institution as `GET /api/credentials` lists it — never any secret field. */
export type ConnectedInstitution = {
  readonly id: string;
  readonly bankType: string;
  readonly displayName: string;
};

function isConnected(row: unknown): row is ConnectedInstitution {
  if (row === null || typeof row !== "object") return false;
  const { id, bankType, displayName } = row as Record<string, unknown>;
  return typeof id === "string" && typeof bankType === "string" && typeof displayName === "string";
}

/** `null` when the body is not a list, so each step decides what an unreadable answer means. */
export function connectedInstitutionsFrom(body: unknown): ConnectedInstitution[] | null {
  return Array.isArray(body) ? body.filter(isConnected) : null;
}

/** The wizard's read of what is connected; the visitor is signed in, so the gated route serves it. */
export async function fetchConnectedInstitutions(): Promise<ConnectedInstitution[] | null> {
  try {
    const res = await fetch("/api/credentials");
    return res.ok ? connectedInstitutionsFrom(await res.json()) : null;
  } catch {
    return null;
  }
}
