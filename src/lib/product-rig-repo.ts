// 每个产品 3D 模型的接触点（座位、握把、脚）：人偶骑 / 坐在产品上时吸到这些点
import "server-only";
import { getDb } from "@/lib/db";
import { cleanRig, type ProductRig } from "@/lib/figures";

let ready = false;
function db() {
  const d = getDb();
  if (!ready) {
    d.exec(`CREATE TABLE IF NOT EXISTS product_rigs (
      model_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`);
    ready = true;
  }
  return d;
}

export function getRig(modelId: string): ProductRig | null {
  const r = db().prepare("SELECT data FROM product_rigs WHERE model_id = ?").get(modelId) as { data: string } | undefined;
  return r ? cleanRig(JSON.parse(r.data)) : null;
}

export function saveRig(modelId: string, rig: ProductRig) {
  db()
    .prepare("INSERT INTO product_rigs (model_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(model_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
    .run(modelId, JSON.stringify(rig), new Date().toISOString());
}
