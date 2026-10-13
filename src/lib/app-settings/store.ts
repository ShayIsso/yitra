import { and, isNull } from "drizzle-orm";
import type { AiProviderKind } from "@/lib/ai-categorization";
import { decrypt, encrypt } from "@/lib/crypto";
import { projectAppSettings, type AppSettings } from "./settings";

/** A provider choice and the key it needs; `null` clears any stored key. */
export type CategorizationSelection = {
  readonly provider: AiProviderKind;
  readonly apiKey: string | null;
};

export type AppSettingsStore = {
  read(): Promise<AppSettings>;
  /**
   * Stores the first app-password hash, and reports whether this call is the
   * one that did it. `false` means a hash was already stored or onboarding was
   * already complete. The write is conditioned on both in the same statement,
   * because its caller (`/setup`'s password step) runs without a session: an
   * unconditional writer there would let anyone who can reach the port reset
   * the password for as long as the wizard is open (ADR-0014 §4).
   *
   * There is deliberately no unconditional setter. Changing an existing
   * password is a different operation — authenticated, and proving the current
   * password — and belongs to whatever feature introduces it.
   */
  claimAppPassword(hash: string): Promise<boolean>;
  /** Reads the bcrypt hash. The only path by which it leaves the store. */
  readAppPasswordHash(): Promise<string | null>;
  /**
   * Records first-run completion, and reports whether this call is the one that
   * did it. `false` means onboarding was already complete — the write is
   * conditioned on the timestamp still being null, so a double submit or a
   * replayed request is rejected by construction rather than by check-then-act
   * (ADR-0014 §4).
   */
  completeOnboarding(completedAt: Date): Promise<boolean>;
  setCategorization(selection: CategorizationSelection): Promise<void>;
  /** Decrypts the stored key. The only path by which it leaves the store. */
  readCategorizationApiKey(): Promise<string | null>;
};

const SINGLETON_ID = 1;

/**
 * The database barrel is imported per call rather than at module load, so this
 * module can be imported without opening a connection — the same reason
 * `makeDrizzleSchedulerConfigStore` does it (ADR-0007).
 */
async function connect() {
  const [{ db }, { appSettings }] = await Promise.all([import("@/db"), import("@/db/schema")]);
  return { db, appSettings };
}

type Connection = Awaited<ReturnType<typeof connect>>;

/**
 * The write that makes onboarding completion a write-once fact (ADR-0014 §4):
 * the SET applies only while the timestamp is null, and `returning` is what
 * turns "no rows affected" into the caller's rejection.
 *
 * Built separately from its execution so a test can assert the emitted SQL.
 * Both halves are invisible to a Store fake — a fake can only reimplement the
 * rule as the check-then-act ADR-0014 §4 rejects — and swapping `setWhere` for
 * the deprecated `where` would silently move the predicate onto the conflict
 * target instead, leaving a replayed submission able to overwrite the date.
 */
export function buildCompleteOnboardingWrite(
  { db, appSettings }: Connection,
  completedAt: Date,
  now: Date,
) {
  return db
    .insert(appSettings)
    .values({ id: SINGLETON_ID, onboardingCompletedAt: completedAt, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { onboardingCompletedAt: completedAt, updatedAt: now },
      setWhere: isNull(appSettings.onboardingCompletedAt),
    })
    .returning({ id: appSettings.id });
}

/**
 * The write behind `claimAppPassword`, built separately from its execution for
 * the same reason as `buildCompleteOnboardingWrite`: the predicate is invisible
 * to a Store fake, and `setWhere` (not the deprecated `where`) is what places it
 * on the UPDATE rather than on the conflict target.
 */
export function buildClaimAppPasswordWrite(
  { db, appSettings }: Connection,
  hash: string,
  now: Date,
) {
  return db
    .insert(appSettings)
    .values({ id: SINGLETON_ID, appPasswordHash: hash, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { appPasswordHash: hash, updatedAt: now },
      setWhere: and(isNull(appSettings.appPasswordHash), isNull(appSettings.onboardingCompletedAt)),
    })
    .returning({ id: appSettings.id });
}

export function makeDrizzleAppSettingsStore(): AppSettingsStore {
  return {
    async read(): Promise<AppSettings> {
      const { db, appSettings } = await connect();

      const row = await db.query.appSettings.findFirst();
      if (!row) {
        await db.insert(appSettings).values({ id: SINGLETON_ID }).onConflictDoNothing();
        return projectAppSettings(null);
      }
      return projectAppSettings({
        onboardingCompletedAt: row.onboardingCompletedAt,
        appPasswordHash: row.appPasswordHash,
        categorizationProvider: row.categorizationProvider,
        categorizationKey: {
          encrypted: row.categorizationApiKeyEncrypted,
          iv: row.categorizationApiKeyIv,
          authTag: row.categorizationApiKeyAuthTag,
        },
      });
    },

    async claimAppPassword(hash: string): Promise<boolean> {
      const written = await buildClaimAppPasswordWrite(await connect(), hash, new Date());
      return written.length > 0;
    },

    async readAppPasswordHash(): Promise<string | null> {
      const { db } = await connect();

      const row = await db.query.appSettings.findFirst();
      return row?.appPasswordHash ?? null;
    },

    async completeOnboarding(completedAt: Date): Promise<boolean> {
      const written = await buildCompleteOnboardingWrite(await connect(), completedAt, new Date());
      return written.length > 0;
    },

    async setCategorization(selection: CategorizationSelection): Promise<void> {
      const { db, appSettings } = await connect();

      const key =
        selection.apiKey === null
          ? { encrypted: null, iv: null, authTag: null }
          : encrypt(selection.apiKey);
      const columns = {
        categorizationProvider: selection.provider,
        categorizationApiKeyEncrypted: key.encrypted,
        categorizationApiKeyIv: key.iv,
        categorizationApiKeyAuthTag: key.authTag,
        updatedAt: new Date(),
      };

      await db
        .insert(appSettings)
        .values({ id: SINGLETON_ID, ...columns })
        .onConflictDoUpdate({ target: appSettings.id, set: columns });
    },

    async readCategorizationApiKey(): Promise<string | null> {
      const { db } = await connect();

      const row = await db.query.appSettings.findFirst();
      const encrypted = row?.categorizationApiKeyEncrypted;
      const iv = row?.categorizationApiKeyIv;
      const authTag = row?.categorizationApiKeyAuthTag;
      if (!encrypted || !iv || !authTag) return null;

      return decrypt({ encrypted, iv, authTag });
    },
  };
}

export const drizzleAppSettingsStore: AppSettingsStore = makeDrizzleAppSettingsStore();
