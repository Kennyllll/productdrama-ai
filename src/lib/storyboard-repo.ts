// 分镜的本地存储（TASK-005）。仅在服务端使用。
import { getDb } from "@/lib/db";
import { sanitizeStoryboard } from "@/lib/storyboard";
import type { LocalStoryboard } from "@/lib/types";

export function getStoryboard(projectId: string): LocalStoryboard | null {
  const row = getDb().prepare("SELECT data FROM storyboards WHERE project_id = ?").get(projectId) as { data: string } | undefined;
  return row ? sanitizeStoryboard(JSON.parse(row.data)) : null;
}

export function saveStoryboard(projectId: string, board: LocalStoryboard) {
  const db = getDb();
  db.prepare("INSERT INTO storyboards (project_id, data) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET data = excluded.data").run(
    projectId,
    JSON.stringify(board),
  );
  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), projectId);
}
