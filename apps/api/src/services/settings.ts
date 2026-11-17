import { DEFAULT_SETTINGS, type Settings } from "@quikfly/shared";

/** How long a Worker isolate reuses settings before re-reading them. Edits in admin show within this. */
export const SETTINGS_CACHE_MS = 30_000;

let cache: { at: number; value: Settings } | null = null;

/** Stored values over the defaults. Unknown keys in the table are ignored. */
export async function getSettings(db: D1Database): Promise<Settings> {
  if (cache && Date.now() - cache.at < SETTINGS_CACHE_MS) return cache.value;
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const value: Settings = { ...DEFAULT_SETTINGS };
  for (const row of results) {
    if (row.key in DEFAULT_SETTINGS) (value as unknown as Record<string, unknown>)[row.key] = JSON.parse(row.value);
  }
  cache = { at: Date.now(), value };
  return value;
}

/** Writes the given keys (already validated by the route) and returns the merged settings. */
export async function updateSettings(db: D1Database, patch: Partial<Settings>): Promise<Settings> {
  const now = new Date().toISOString();
  const statements = Object.entries(patch).map(([key, v]) =>
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(key, JSON.stringify(v), now),
  );
  if (statements.length) await db.batch(statements);
  cache = null;
  return getSettings(db);
}
