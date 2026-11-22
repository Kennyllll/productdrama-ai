import "server-only";
import { getDb } from "@/lib/db";
import { cleanFacts, EMPTY_FACTS, type AdFacts } from "@/lib/ad-compliance";

// 广告依据存在 settings 表（key = adfacts:<项目 id>），不用改表结构。
const key = (projectId: string) => `adfacts:${projectId}`;

export function getAdFacts(projectId: string): AdFacts {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key(projectId)) as { value: string } | undefined;
  if (!row) return { ...EMPTY_FACTS };
  try {
    return cleanFacts(JSON.parse(row.value));
  } catch {
    return { ...EMPTY_FACTS };
  }
}

export function saveAdFacts(projectId: string, f: AdFacts) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key(projectId), JSON.stringify(cleanFacts(f)));
}
