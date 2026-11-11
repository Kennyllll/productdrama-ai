// 把一个已经做完的视频项目（例如 E2）导入平台：镜头卡、素材库、费用账本、规则、决定记录、向导历史、时间线、3D 布景。
// 用法：npx tsx scripts/import-showcase.mts <manifest.json>
// 可重复运行：每次先清掉同一集之前导入的数据。不调用任何外部 API。
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb, UPLOAD_DIR } from "../src/lib/db";
import type { LibraryKind, SetLayout, ShotCardData, TimelineData } from "../src/lib/production-repo";

interface ShotSpec extends Omit<ShotCardData, "prompts"> {
  code: string;
  dirs?: string[];
  files?: string[];
  final?: string;
  /** 定稿实际用上的首帧等文件，用来在费用账本里标出“用上了” */
  usedFiles?: string[];
  prompts?: string[];
  layout?: string;
}

interface Manifest {
  projectId: string;
  episode: number;
  roots: Record<string, string>;
  shots: ShotSpec[];
  finals: { label: string; file: string }[];
  timeline: Omit<TimelineData, "deliverables">;
  map?: string;
  rules: { layer: string; level: string; text: string; source: string; scope?: string }[];
  decisions: { text: string; context: string }[];
  guide: { role: "user" | "guide"; context: string; text: string }[];
  ledger: {
    submittedLog: string;
    shotKeys: Record<string, string>;
    usage?: string;
    videoUsdPerSec: number;
    imageUsd: number;
    extra: { shot: string; kind: string; model: string; usd: number; used: boolean; note: string }[];
  };
}

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("用法：npx tsx scripts/import-showcase.mts <manifest.json>");
const M = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
const abs = (p: string) => {
  const [k, ...rest] = p.split("/");
  return M.roots[k] ? path.resolve(M.roots[k], rest.join("/")) : path.resolve(p);
};

const db = getDb();
const pid = M.projectId;
const ep = M.episode;
if (!db.prepare("SELECT 1 FROM projects WHERE id = ?").get(pid)) throw new Error(`项目不存在：${pid}`);
const projectDir = path.join(UPLOAD_DIR, pid);
const libRel = path.join("library", `E${ep}`);
let clock = Date.parse("2026-11-11T00:00:00Z");
const stamp = () => new Date(clock++).toISOString();

// ---- 清掉上一次导入 ----
for (const t of ["shot_cards", "library_files", "ledger", "set_layouts", "timelines"]) db.prepare(`DELETE FROM ${t} WHERE project_id = ? AND episode = ?`).run(pid, ep);
for (const t of ["rules", "decisions", "guide_messages"]) db.prepare(`DELETE FROM ${t} WHERE project_id = ? AND origin = 'import'`).run(pid);
fs.rmSync(path.join(projectDir, libRel), { recursive: true, force: true });

// ---- 素材库 ----
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".mp4": "video/mp4", ".wav": "audio/wav", ".mp3": "audio/mpeg" };
const MAX_FILES = 36;
const MAX_BYTES = 80e6;

function kindOf(name: string): LibraryKind {
  const n = name.toLowerCase();
  if (n.endsWith(".mp4")) return "video";
  if (n.endsWith(".wav") || n.endsWith(".mp3")) return "audio";
  if (/(end-frame|-end\.|end\.png|last|endk|enda)/.test(n)) return "last_frame";
  if (/(first-frame|first\.|start|^frame\.png|ff\d*-frame)/.test(n)) return "first_frame";
  if (/(comp|layout|plan|-m\.png|^[a-z]\d?\.png$|^[a-z]\d[a-z]?\.png$)/.test(n)) return "comp";
  return "check";
}
const KIND_ORDER: LibraryKind[] = ["video", "first_frame", "last_frame", "comp", "check", "audio"];

function scan(dir: string, depth = 2): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth > 1) out.push(...scan(p, depth - 1));
    else if (e.isFile() && MIME[path.extname(e.name).toLowerCase()] && !e.name.endsWith(".r.wav")) out.push(p);
  }
  return out.sort();
}

const insFile = db.prepare(
  "INSERT INTO library_files (id, project_id, episode, shot_code, kind, label, rel_path, mime, size, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
);
const finalSizes = new Set<number>();
function addFile(src: string, code: string, opts: { kind?: LibraryKind; label?: string; status?: string; base?: string } = {}): string | null {
  const ext = path.extname(src).toLowerCase();
  if (!MIME[ext] || !fs.existsSync(src)) return null;
  const size = fs.statSync(src).size;
  if (size > MAX_BYTES) return null;
  const id = randomUUID();
  const rel = path.join(libRel, code || "_deliver", `${id}${ext}`);
  fs.mkdirSync(path.join(projectDir, path.dirname(rel)), { recursive: true });
  fs.copyFileSync(src, path.join(projectDir, rel));
  const label = opts.label ?? (opts.base ? path.relative(opts.base, src) : path.basename(src));
  const status = opts.status ?? (/reject/i.test(src) ? "rejected" : "");
  insFile.run(id, pid, ep, code, opts.kind ?? kindOf(path.basename(src)), label, rel, MIME[ext], size, status, stamp());
  return id;
}

// ---- 镜头卡 ----
const insCard = db.prepare("INSERT INTO shot_cards (id, project_id, episode, code, sort, data) VALUES (?, ?, ?, ?, ?, ?)");
const insLayout = db.prepare("INSERT INTO set_layouts (project_id, episode, shot_code, data, edited, updated_at) VALUES (?, ?, ?, ?, NULL, ?)");
let fileCount = 0;
M.shots.forEach((s, i) => {
  const seen = new Set<string>();
  const candidates: { file: string; base: string }[] = [];
  const push = (file: string, base: string) => {
    const real = fs.existsSync(file) ? fs.realpathSync(file) : "";
    if (!real || seen.has(real)) return;
    seen.add(real);
    candidates.push({ file, base });
  };
  const finalAbs = s.final ? abs(s.final) : "";
  if (finalAbs) push(finalAbs, path.dirname(finalAbs));
  for (const f of s.files ?? []) push(abs(f), path.dirname(abs(f)));
  for (const d of s.dirs ?? []) for (const f of scan(abs(d))) push(f, path.dirname(abs(d)));
  const ranked = candidates
    .map((c, idx) => ({ ...c, idx, k: c.file === finalAbs ? -1 : KIND_ORDER.indexOf(kindOf(path.basename(c.file))) }))
    .sort((a, b) => a.k - b.k || a.idx - b.idx)
    .slice(0, MAX_FILES)
    .sort((a, b) => a.idx - b.idx);
  for (const c of ranked) {
    const isFinal = c.file === finalAbs;
    if (addFile(c.file, s.code, { base: c.base, status: isFinal ? "final" : undefined, kind: isFinal ? "video" : undefined })) fileCount++;
  }
  if (s.status === "final") for (const f of [s.final, ...(s.usedFiles ?? [])]) if (f && fs.existsSync(abs(f))) finalSizes.add(fs.statSync(abs(f)).size);

  const promptFiles = s.prompts ?? (s.dirs ?? []).flatMap((d) => (fs.existsSync(abs(d)) ? fs.readdirSync(abs(d)).filter((f) => /prompt.*\.txt$|^i2v.*\.txt$/.test(f)).map((f) => path.join(d, f)) : []));
  const prompts = promptFiles
    .filter((f) => fs.existsSync(abs(f)))
    .slice(0, 6)
    .map((f) => ({ label: path.basename(f), text: fs.readFileSync(abs(f), "utf8").slice(0, 4000) }));
  const { code, dirs: _d, files: _f, final: _fi, prompts: _p, usedFiles: _u, layout, ...rest } = s;
  void _d; void _f; void _fi; void _p; void _u;
  insCard.run(randomUUID(), pid, ep, code, i, JSON.stringify({ ...rest, prompts } satisfies ShotCardData));

  if (layout && fs.existsSync(abs(layout))) {
    const j = JSON.parse(fs.readFileSync(abs(layout), "utf8"));
    if (Array.isArray(j.cam_pos) && Array.isArray(j.look_at)) {
      const data: SetLayout = {
        lens: Number(j.lens_mm ?? 35),
        camPos: j.cam_pos,
        lookAt: j.look_at,
        bike: Array.isArray(j.place) ? j.place : undefined,
        bikeYaw: typeof j.yaw_off_deg === "number" ? j.yaw_off_deg : 0,
        figure: Boolean(j.mannequin || j.figure),
        aspect: j.width && j.height ? j.width / j.height : 2.333,
        source: path.basename(layout),
        props: (Array.isArray(j.props) ? j.props : []).filter((p: { lo?: unknown; hi?: unknown }) => Array.isArray(p.lo) && Array.isArray(p.hi)).slice(0, 300),
      };
      insLayout.run(pid, ep, code, JSON.stringify(data), stamp());
    }
  }
});

if (M.map && fs.existsSync(abs(M.map))) {
  const props = (JSON.parse(fs.readFileSync(abs(M.map), "utf8")).props ?? []).filter((p: { lo?: unknown; hi?: unknown }) => Array.isArray(p.lo) && Array.isArray(p.hi));
  insLayout.run(pid, ep, "_map", JSON.stringify(props), stamp());
}

// ---- 成片 + 时间线 ----
const deliverables = M.finals.map((f) => ({ label: f.label, fileId: addFile(abs(f.file), "", { kind: "final", label: f.label, status: "final" }) ?? "" })).filter((d) => d.fileId);
db.prepare("INSERT INTO timelines (project_id, episode, data) VALUES (?, ?, ?)").run(pid, ep, JSON.stringify({ ...M.timeline, deliverables } satisfies TimelineData));

// ---- 费用账本：按提交记录逐条估算；用到的素材按输出文件大小对上定稿素材 ----
const insLedger = db.prepare("INSERT INTO ledger (id, project_id, episode, shot_code, kind, model, usd, exact, used, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
const keys = Object.keys(M.ledger.shotKeys).sort((a, b) => b.length - a.length);
const logPath = abs(M.ledger.submittedLog);
const tmpRoot = path.dirname(logPath);
let jobs = 0;
if (fs.existsSync(logPath)) {
  for (const line of fs.readFileSync(logPath, "utf8").split("\n")) {
    const m = line.match(/^(\d{4})-(\d{4}) (\S+) SUBMITTED (?:(kling\w*|seedance) )?(\S+)/);
    if (!m) continue;
    const [, md, hm, logFile, vendor] = m;
    const rel = logFile.startsWith("/tmp/pd-cad/") ? logFile.slice("/tmp/pd-cad/".length) : "";
    if (!rel) continue;
    const local = path.join(tmpRoot, rel);
    const log = fs.existsSync(local) ? fs.readFileSync(local, "utf8") : "";
    const done = log.match(/DONE (\S+) (\d+)/);
    const out = done?.[1] ?? "";
    const isVideo = vendor ? true : out ? out.endsWith(".mp4") : /(^|\/|-)(v\d*|vid\w*|i2v\d*)(\/|\.|$)/.test(rel);
    let seconds = 5;
    const inputJson = out ? path.join(tmpRoot, path.dirname(out.replace("/tmp/pd-cad/", "")), "input.json") : "";
    if (isVideo && inputJson && fs.existsSync(inputJson)) {
      const d = Number(JSON.parse(fs.readFileSync(inputJson, "utf8")).duration);
      if (d > 0) seconds = d;
    }
    const key = keys.find((k) => rel.startsWith(k));
    const shot = key ? M.ledger.shotKeys[key] : "";
    const model = vendor?.startsWith("kling") ? "kling" : isVideo ? "bytedance/seedance-2.5" : "marketing-studio/image/sunburst";
    const usd = model === "kling" ? 0 : isVideo ? +(seconds * M.ledger.videoUsdPerSec).toFixed(2) : M.ledger.imageUsd;
    const used = Boolean(done && finalSizes.has(Number(done[2])));
    const note = `${rel}${model === "kling" ? " · Kling 单价未记录" : ""}${isVideo ? ` · ${seconds} 秒` : ""}${done ? "" : " · 没找到输出文件"}`;
    insLedger.run(randomUUID(), pid, ep, shot, isVideo ? "video" : "first_frame", model, usd, 0, used ? 1 : 0, note, `2026-${md.slice(0, 2)}-${md.slice(2)}T${hm.slice(0, 2)}:${hm.slice(2)}:00`);
    jobs++;
  }
}
for (const x of M.ledger.extra) insLedger.run(randomUUID(), pid, ep, x.shot, x.kind, x.model, x.usd, 0, x.used ? 1 : 0, x.note, "2026-11-08T00:00:00");
if (M.ledger.usage && fs.existsSync(abs(M.ledger.usage))) {
  const buckets = JSON.parse(fs.readFileSync(abs(M.ledger.usage), "utf8")) as { bucket: string; results: { model: string; quantity: string; cost: string }[] }[];
  for (const b of buckets)
    for (const r of b.results) insLedger.run(randomUUID(), pid, ep, "", "usage_day", r.model, Number(r.cost), 1, 0, `${b.bucket.slice(0, 10)} · ${r.quantity} 次`, b.bucket);
}

// ---- 规则、决定、向导历史 ----
const insRule = db.prepare("INSERT INTO rules (id, project_id, scope, layer, level, text, source, origin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'import', ?)");
for (const r of M.rules) insRule.run(randomUUID(), pid, r.scope ?? "project", r.layer, r.level, r.text, r.source, stamp());
const insDec = db.prepare("INSERT INTO decisions (id, project_id, text, context, origin, created_at) VALUES (?, ?, ?, ?, 'import', ?)");
for (const d of M.decisions) insDec.run(randomUUID(), pid, d.text, d.context, stamp());
const insMsg = db.prepare("INSERT INTO guide_messages (id, project_id, role, context, text, origin, created_at) VALUES (?, ?, ?, ?, ?, 'import', ?)");
for (const g of M.guide) insMsg.run(randomUUID(), pid, g.role, g.context, g.text, stamp());

console.log(`导入完成：${M.shots.length} 个镜头卡，${fileCount} 个素材，${deliverables.length} 个成片，${jobs} 条任务记录，${M.rules.length} 条规则，${M.decisions.length} 条决定`);
