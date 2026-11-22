import { DEFAULT_STAGE } from "@/lib/hook-stage";
// Hook 库读写集中在这里（以后搬 Supabase 只改这一层）
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { PRESET_HOOKS, type HookData, type HookDef } from "@/lib/hooks";
import { isHookEffect, PRESET_EFFECT } from "@/lib/hook-effects";

let ready = false;
function db() {
  const d = getDb();
  if (!ready) {
    d.exec("CREATE TABLE IF NOT EXISTS hooks (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    const n = (d.prepare("SELECT COUNT(*) AS n FROM hooks").get() as { n: number }).n;
    const seeded = d.prepare("SELECT value FROM settings WHERE key = 'hooks_seeded'").get();
    if (!n && !seeded) {
      for (const h of PRESET_HOOKS) createIn(d, h);
      d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hooks_seeded', '1')").run();
    }
    // 预置 Hook 第 2 版：照真实案例改了镜头（机位、人、切镜、自拍），只改预置名字的那几个
    const ver = d.prepare("SELECT value FROM settings WHERE key = 'hooks_preset_v'").get() as { value: string } | undefined;
    if (Number(ver?.value ?? 0) < 2) {
      for (const r of d.prepare("SELECT id, data FROM hooks").all() as { id: string; data: string }[]) {
        const x = JSON.parse(r.data) as HookData;
        const p = PRESET_HOOKS.find((q) => q.name === x.name);
        if (p) d.prepare("UPDATE hooks SET data = ? WHERE id = ?").run(JSON.stringify({ ...x, about: p.about, seconds: p.seconds, entry: p.entry, stage: p.stage, second: p.second ?? null, selfie: Boolean(p.selfie), effect: p.effect }), r.id);
      }
      d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hooks_preset_v', '2')").run();
    }
    // 第 3 版：新增预置「车里自拍」（只补这一个，你删掉的预置不会回来）
    const v3 = d.prepare("SELECT value FROM settings WHERE key = 'hooks_preset_v'").get() as { value: string } | undefined;
    if (Number(v3?.value ?? 0) < 3) {
      const names = new Set((d.prepare("SELECT data FROM hooks").all() as { data: string }[]).map((r) => (JSON.parse(r.data) as HookData).name));
      for (const p of PRESET_HOOKS) if (p.scene === "car" && !names.has(p.name)) createIn(d, p);
      d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hooks_preset_v', '3')").run();
    }
    // 第 4 版：「车里自拍」的卖点不再给示例值（示例会被当成真卖点），改成必填
    const v4 = d.prepare("SELECT value FROM settings WHERE key = 'hooks_preset_v'").get() as { value: string } | undefined;
    if (Number(v4?.value ?? 0) < 4) {
      const car = PRESET_HOOKS.find((p) => p.scene === "car");
      for (const r of d.prepare("SELECT id, data FROM hooks").all() as { id: string; data: string }[]) {
        const x = JSON.parse(r.data) as HookData;
        if (car && x.name === car.name && x.fields?.some((f) => f.example === "Folds flat in seconds")) d.prepare("UPDATE hooks SET data = ? WHERE id = ?").run(JSON.stringify({ ...x, fields: car.fields }), r.id);
      }
      d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hooks_preset_v', '4')").run();
    }
    // 第 5 版：示例值不再当真值（价格、卖点必填）；预置模板里本来就选填的属性（赠品）标成选填
    const v5 = d.prepare("SELECT value FROM settings WHERE key = 'hooks_preset_v'").get() as { value: string } | undefined;
    if (Number(v5?.value ?? 0) < 5) {
      for (const r of d.prepare("SELECT id, data FROM hooks").all() as { id: string; data: string }[]) {
        const x = JSON.parse(r.data) as HookData;
        const p = PRESET_HOOKS.find((y) => y.name === x.name);
        const opt = new Set(p?.fields.filter((f) => f.optional).map((f) => f.key) ?? []);
        if (opt.size && x.fields?.some((f) => opt.has(f.key) && !f.optional))
          d.prepare("UPDATE hooks SET data = ? WHERE id = ?").run(JSON.stringify({ ...x, fields: x.fields.map((f) => (opt.has(f.key) ? { ...f, optional: true } : f)) }), r.id);
      }
      d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hooks_preset_v', '5')").run();
    }
    // 第 6 版：预置 Hook 带默认运镜（紧迫感从特写往后拉开，机位跟着拉近）：只补还没设运镜的
    const v6 = d.prepare("SELECT value FROM settings WHERE key = 'hooks_preset_v'").get() as { value: string } | undefined;
    if (Number(v6?.value ?? 0) < 6) {
      for (const r of d.prepare("SELECT id, data FROM hooks").all() as { id: string; data: string }[]) {
        const x = JSON.parse(r.data) as HookData;
        const p = PRESET_HOOKS.find((q) => q.name === x.name);
        if (p?.stage?.move && x.stage && !x.stage.move) d.prepare("UPDATE hooks SET data = ? WHERE id = ?").run(JSON.stringify({ ...x, stage: { ...x.stage, move: p.stage.move, dist: p.stage.dist, camH: p.stage.camH } }), r.id);
      }
      d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hooks_preset_v', '6')").run();
    }
    // 第 7 版：照真实广告开头的构图（机位低、主体大、地面少）：预置 Hook 还是旧机位的才换，你调过的不动
    const v7 = d.prepare("SELECT value FROM settings WHERE key = 'hooks_preset_v'").get() as { value: string } | undefined;
    if (Number(v7?.value ?? 0) < 7) {
      const OLD_CAM_H: Record<string, [number, number | null]> = { 价格开场: [1.4, 0.9], 大胆主张: [1.2, 1], 先给结果: [0.9, null], 社会认同: [0.8, 0.7], 对比: [1, null], 车里自拍: [1.4, 0.8] };
      for (const r of d.prepare("SELECT id, data FROM hooks").all() as { id: string; data: string }[]) {
        const x = JSON.parse(r.data) as HookData;
        const p = PRESET_HOOKS.find((q) => q.name === x.name);
        const o = OLD_CAM_H[x.name];
        if (!p || !o || !x.stage) continue;
        const stage = x.stage.camH === o[0] ? { ...p.stage, ...(x.stage.move ? { move: x.stage.move } : {}) } : x.stage;
        const second = x.second && p.second && o[1] !== null && x.second.stage?.camH === o[1] ? { ...x.second, stage: p.second.stage } : x.second;
        if (stage !== x.stage || second !== x.second) d.prepare("UPDATE hooks SET data = ? WHERE id = ?").run(JSON.stringify({ ...x, stage, second, ...(stage !== x.stage ? { about: p.about } : {}) }), r.id);
      }
      d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hooks_preset_v', '7')").run();
    }
    // 第 8 版：紧迫感从特写起拉远（第 6 版只补了运镜，机位还是旧的 1.2 米 / 0.8 米）
    const v8 = d.prepare("SELECT value FROM settings WHERE key = 'hooks_preset_v'").get() as { value: string } | undefined;
    if (Number(v8?.value ?? 0) < 8) {
      for (const r of d.prepare("SELECT id, data FROM hooks").all() as { id: string; data: string }[]) {
        const x = JSON.parse(r.data) as HookData;
        const p = PRESET_HOOKS.find((q) => q.name === x.name && q.stage?.move);
        if (p?.stage && x.stage && x.stage.dist === 1.2 && x.stage.camH === 0.8) d.prepare("UPDATE hooks SET data = ? WHERE id = ?").run(JSON.stringify({ ...x, stage: { ...x.stage, dist: p.stage.dist, camH: p.stage.camH } }), r.id);
      }
      d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hooks_preset_v', '8')").run();
    }
    ready = true;
  }
  return d;
}

function createIn(d: ReturnType<typeof getDb>, data: HookData): string {
  const id = randomUUID();
  const t = new Date().toISOString();
  d.prepare("INSERT INTO hooks (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, JSON.stringify(data), t, t);
  return id;
}

type Row = { id: string; data: string; updated_at: string };
/** 早于 3D 预设 / 出片效果存的 Hook：预置的按名字补上预设，自己建的用默认 */
const toHook = (r: Row): HookDef => {
  const d = JSON.parse(r.data) as HookData;
  return { ...d, stage: d.stage ?? PRESET_HOOKS.find((p) => p.name === d.name)?.stage ?? DEFAULT_STAGE, effect: isHookEffect(d.effect) ? d.effect : (PRESET_EFFECT[d.name] ?? "claimWords"), second: d.second ?? null, selfie: Boolean(d.selfie), id: r.id, updatedAt: r.updated_at };
};

export function listHooks(): HookDef[] {
  return (db().prepare("SELECT id, data, updated_at FROM hooks ORDER BY created_at, rowid").all() as Row[]).map(toHook);
}
export function getHook(id: string): HookDef | null {
  const r = db().prepare("SELECT id, data, updated_at FROM hooks WHERE id = ?").get(id) as Row | undefined;
  return r ? toHook(r) : null;
}
export const createHook = (data: HookData) => createIn(db(), data);
export function saveHook(id: string, data: HookData): boolean {
  return db().prepare("UPDATE hooks SET data = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(data), new Date().toISOString(), id).changes > 0;
}
export function deleteHook(id: string): boolean {
  return db().prepare("DELETE FROM hooks WHERE id = ?").run(id).changes > 0;
}
