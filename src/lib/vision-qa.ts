// 视觉质检（先用 Gemini，Gemini 没 Key 或出错就用大脑的 Kimi K3 看图）：看最终关键帧，按清单找结构 / 物理错误。仅服务端调用；Key 只保存在本机 SQLite，不记录日志。
import { AsyncLocalStorage } from "node:async_hooks";
import sharp from "sharp";
import { getDb } from "@/lib/db";
import type { KimiPart } from "@/lib/brain/kimi";

/** 按顺序尝试：Google 下线旧模型时返回 404，繁忙时 503，换下一个 */
export const VISION_MODELS = ["gemini-3.5-flash", "gemini-3.8-flash"];
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const STATUS_MESSAGES: Record<number, string> = {
  400: "请求格式错误或 Key 无效",
  401: "Gemini Key 无效",
  403: "Gemini Key 无权限，请检查是否开通 Generative Language API",
  429: "Gemini 请求过于频繁或额度用完，请稍后再试",
  500: "Gemini 服务器错误，请稍后再试",
  503: "Gemini 服务繁忙，请稍后再试",
};

export function getVisionKey(): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'vision'").get() as { value: string } | undefined;
  try {
    const o = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
    return typeof o.apiKey === "string" ? o.apiKey : "";
  } catch {
    return "";
  }
}

export function saveVisionKey(apiKey: string) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES ('vision', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ provider: "gemini", apiKey }));
}

export function visionPublicInfo(): { configured: boolean; keyHint: string } {
  const k = getVisionKey();
  return { configured: k !== "", keyHint: k ? `••••${k.slice(-4)}` : "" };
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

// kimi.ts 带 server-only，单元测试里不能直接 import：Key 在这里读，调用时再动态加载
function getBrainKey(): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'brain'").get() as { value: string } | undefined;
  try {
    const o = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
    return typeof o.apiKey === "string" ? o.apiKey : "";
  } catch {
    return "";
  }
}

/** Gemini 或大脑 Kimi 有一个能用，就能自动检查 */
export function visionReady(): boolean {
  return !!getVisionKey() || !!getBrainKey();
}

// K3 看图按 token 收费：包在 withVisionSpend 里的检查，花了多少记下来写进账本（Gemini 不回报价格，不记）
const spend = new AsyncLocalStorage<{ usd: number }>();
export async function withVisionSpend<T>(fn: () => Promise<T>): Promise<{ value: T; usd: number }> {
  const box = { usd: 0 };
  const value = await spend.run(box, fn);
  return { value, usd: box.usd };
}

// Gemini 欠费 / Key 失效时每次都会失败：失败后 10 分钟内直接用 K3，不白等
let geminiDownUntil = 0;

async function generate(parts: Part[], timeoutMs: number): Promise<unknown> {
  let gErr = "";
  if (getVisionKey() && Date.now() >= geminiDownUntil) {
    try {
      return await geminiGenerate(parts, timeoutMs);
    } catch (e) {
      gErr = e instanceof Error ? e.message : "Gemini 请求失败";
      geminiDownUntil = Date.now() + 10 * 60_000;
    }
  }
  if (!getBrainKey()) throw new Error(gErr || "尚未配置视觉质检 Key");
  try {
    return await kimiGenerate(parts, timeoutMs);
  } catch (e) {
    throw new Error(`${gErr ? `${gErr}；` : ""}Kimi K3 也没看成：${e instanceof Error ? e.message : "未知错误"}`);
  }
}

async function kimiGenerate(parts: Part[], timeoutMs: number): Promise<unknown> {
  const { kimiChat, parseJson } = await import("@/lib/brain/kimi");
  const content: KimiPart[] = parts.map((p) =>
    "text" in p ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` } },
  );
  const { message, usage } = await kimiChat({ messages: [{ role: "user", content }], effort: "low", json: true, timeoutMs: timeoutMs * 2 });
  const box = spend.getStore();
  if (box) box.usd += usage.usd;
  return parseJson(message.content);
}

async function geminiGenerate(parts: Part[], timeoutMs: number): Promise<unknown> {
  const key = getVisionKey();
  let res: Response | null = null;
  let lastErr = "";
  let quota = false;
  // Gemini 高峰期经常 503：每轮把模型都试一遍，最多 3 轮，轮间等待
  outer: for (let round = 0; round < 3; round++) {
    if (round) await new Promise((r) => setTimeout(r, round * 8_000));
    for (const model of VISION_MODELS) {
      try {
        res = await fetch(`${BASE}/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        lastErr = timedOut ? "Gemini 响应超时" : "网络错误，无法连接 Gemini";
        res = null;
        if (timedOut) continue;
        break;
      }
      if (res.ok) break;
      lastErr = STATUS_MESSAGES[res.status] ?? `Gemini 返回错误（HTTP ${res.status}）`;
      // 免费层每个模型每天只有少量请求；按模型分开计数，换下一个模型试
      if (res.status === 429 && /PerDay|FreeTier/i.test(await res.clone().text().catch(() => ""))) quota = true;
      if (res.status !== 404 && res.status !== 503 && res.status !== 429) break;
    }
    if (res?.ok || (res && res.status !== 503) || quota) break outer;
  }
  if (!res?.ok && quota) throw new Error("Gemini 免费额度今天已用完（每个模型每天约 20 次），请在 Google AI Studio 给该项目开通付费，或明天再试");
  if (!res?.ok) throw new Error(res?.status === 404 ? "Gemini 模型已下线，请更新 VISION_MODELS" : lastErr || "Gemini 请求失败");
  const body = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] } | null;
  const text = body?.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini 没有返回内容");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini 返回的不是有效 JSON");
  }
}

export async function testVision(): Promise<void> {
  await generate([{ text: 'Reply with this JSON only: {"ok": true}' }], 45_000);
}

const jpegPart = async (img: Buffer, max: number): Promise<Part> => ({
  inline_data: { mime_type: "image/jpeg", data: (await sharp(img).resize(max, max, { fit: "inside" }).jpeg({ quality: 88 }).toBuffer()).toString("base64") },
});

export interface VisionReview {
  pass: boolean;
  issues: string[];
  /** 其中产品形状 / 零件和实物不一致的问题 */
  product?: string[];
}

/** 照片 / AI 建的模型：按每张实物照的角度截一张模型图，逐零件找形状不一样的地方 */
export async function compareModelToPhotos(o: { productName: string; structure: string; pairs: { label: string; render: Buffer; photo: Buffer }[] }): Promise<{ label: string; issues: string[] }[]> {
  const name = o.productName || "product";
  const prompt = [
    `Each pair below shows a 3D model render of the ${name} (gray or plain) and then a real photo of the same product from about the same angle.`,
    o.structure ? `The real product is: ${o.structure}` : "",
    "For every pair, compare the SHAPE part by part and list every part of the 3D model that differs from the real photo: missing, extra, merged, bent differently, wrong size or proportion, wrong position, a hole or cut-out that is missing or filled. Check the handlebar and its stem, the seat and backrest (holes), baskets, fenders, pedals and cranks, every frame tube and how it bends, every wheel and its size.",
    "Ignore colors, materials, textures, logos, stickers, background, lighting and small differences of camera angle.",
    'Return JSON only: {"pairs": [{"pair": number, "issues": string[]}]}. Each issue is ONE short sentence in Simplified Chinese naming the part (e.g. "车把立管是直的，实物向后弯"). Empty issues if the shape matches.',
  ].filter(Boolean).join("\n");
  const parts: Part[] = [{ text: prompt }];
  for (const [i, p] of o.pairs.entries()) parts.push({ text: `Pair ${i + 1} (${p.label}): 3D model render, then real photo.` }, await jpegPart(p.render, 1024), await jpegPart(p.photo, 1024));
  const data = (await generate(parts, 150_000)) as { pairs?: unknown };
  const got = Array.isArray(data.pairs) ? (data.pairs as { pair?: unknown; issues?: unknown }[]) : [];
  return o.pairs.map((p, i) => {
    const r = got.find((x) => x.pair === i + 1);
    const issues = Array.isArray(r?.issues) ? r.issues.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()).slice(0, 8) : [];
    return { label: p.label, issues };
  });
}

export interface SupportSpot {
  support: string;
  /** 空场景里不该有的人 / 车（AI 没听话画进去了） */
  intruders: string[];
  /** 车应占的框（0–1，相对画面）：轮子落在支撑物前的地面上，车顶碰到支撑物 */
  box: { x0: number; y0: number; x1: number; y1: number };
  /** 车顶在画面里应朝哪边倾才能靠到支撑物：away = 支撑物在车后面、正对镜头 */
  lean: "left" | "right" | "away";
}

/** 单独逐辆检查车辆：嵌进墙 / 门框、被墙体切断、结构变形。混在大清单里时 Gemini 常漏看 */
export async function vehicleProblems(plate: Buffer): Promise<string[]> {
  const prompt = [
    "Look only at the vehicles in this film still (motorcycles, cars, bicycles, scooters). Check each one as a strict film continuity supervisor.",
    "1. Is any part of it hidden or cut off? A part may only be hidden by an object that is clearly IN FRONT of it (closer to the camera) and that is physically separate from it. If the vehicle's body or a wheel disappears into a wall, door jamb, garage door frame, pillar, side wall or the floor — so that in 3D the vehicle would have to overlap that solid surface — it is embedded, which is an error. A vehicle standing right at an opening edge with its rear vanishing behind the jamb is embedded unless there is visible room behind the jamb.",
    "2. Count its wheels and check they sit on the floor on real axles; check for melted, missing or duplicated parts.",
    'Return JSON only: {"vehicles": [{"name": string, "hidden_by": string | null, "embedded": boolean, "wheels": number, "deformed": boolean}], "problems": string[]} with problems short Simplified Chinese phrases for every embedded or deformed vehicle (e.g. "摩托车一半嵌在墙里", "摩托车有三个轮子"), [] if none.',
  ].join("\n");
  const data = (await generate([{ text: prompt }, await jpegPart(plate, 1536)], 90_000)) as { problems?: unknown };
  return Array.isArray(data.problems) ? data.problems.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

export async function locateSupport(o: { plate: Buffer; productName: string; productNote: string; description: string; sizeHint: string; cast?: boolean }): Promise<SupportSpot | { support: ""; intruders: string[]; box: null; lean: "away" }> {
  const prompt = [
    o.cast
      ? "You are a film set dresser. The image is a film still with the cast already in place; the product is NOT in it yet, so any bicycle or balance bike visible in it is an error and must be listed in intruders. Use the people in the photo as the scale reference: the product's size relative to the child must be realistic."
      : "You are a film set dresser. The image is a location plate without the cast (no people).",
    `The ${o.productName || "product"} (${o.sizeHint}) will be placed leaning against a support, as described: ${o.productNote}`,
    `Shot description: ${o.description}`,
    "Find that support (e.g. a wall, step, porch post) in the image. Then decide where the product stands: both wheels on the floor directly in front of the support surface, viewed roughly from the side, its top touching the support, at the correct perspective scale for its distance from the camera (compare with doors, shelves, bins and floor lines). The product must not overlap the camera-facing area of other large objects.",
    `Also list anything that should NOT be in this image: ${o.cast ? "any person not described in the shot, any repeated or duplicated person, and any" : "any person, animal,"} bicycle, balance bike, scooter or kids' ride-on toy (even partly visible); any larger vehicle (motorcycle, car) that the shot description does not name; and any vehicle that is deformed (wrong number of wheels, wheels not on axles, melted or impossible parts — a motorcycle has exactly 2 wheels); and any vehicle or object that intersects, passes through or is embedded in a wall, door frame, pillar or the floor (part of it vanishing into a solid surface instead of standing fully in front of it, e.g. "摩托车一半嵌在墙里"). Count each vehicle's wheels before judging.`,
    'Return JSON only: {"intruders": string[], "found": boolean, "support": string, "lean": "left" | "right" | "away", "box_2d": [ymin, xmin, ymax, xmax]} with lean the direction, in the image, the product\'s top must tilt to rest on the support ("away" if the support surface is behind the product facing the camera; "left"/"right" if it is a side wall or object beside the product), with intruders short Simplified Chinese phrases (e.g. "多了一辆自行车", "摩托车有三个轮子"), and box_2d the product\'s full bounding box (wheels bottom to handlebar top) in 0–1000 normalized image coordinates. found=false if the described support is not in the image.',
  ].join("\n");
  const [data, broken] = await Promise.all([
    generate([{ text: prompt }, await jpegPart(o.plate, 1536)], 90_000) as Promise<{ intruders?: unknown; found?: unknown; support?: unknown; lean?: unknown; box_2d?: unknown }>,
    vehicleProblems(o.plate),
  ]);
  const intruders = [...(Array.isArray(data.intruders) ? data.intruders.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []), ...broken];
  const none = { support: "" as const, intruders, box: null, lean: "away" as const };
  const lean = data.lean === "left" || data.lean === "right" ? data.lean : "away";
  const b = Array.isArray(data.box_2d) ? data.box_2d.map(Number) : [];
  if (data.found !== true || b.length !== 4 || b.some((v) => !Number.isFinite(v))) return none;
  const [y0, x0, y1, x1] = b.map((v) => Math.min(1, Math.max(0, v / 1000)));
  if (x1 - x0 < 0.02 || y1 - y0 < 0.03) return none;
  return { support: typeof data.support === "string" && data.support ? data.support : "support", intruders, box: { x0, y0, x1, y1 }, lean };
}

/** 按清单审一张关键帧；返回的问题是中文短句，pass=false 即不合格 */
export async function reviewKeyframe(o: { image: Buffer; productRef?: Buffer; zoom?: Buffer; productName: string; productFacts: string; physics: string; description: string; productNote: string }): Promise<VisionReview> {
  const name = o.productName || "product";
  const prompt = [
    "You are a strict film continuity and physics supervisor reviewing a generated still for a live-action commercial short film. Only report real problems that are clearly visible; no style opinions.",
    `Image 1 is the still.${o.productRef ? ` Image 2 is a studio render of the real ${name} (${o.productFacts}).` : ` The product is the ${name} (${o.productFacts}).`}${o.zoom ? ` Image ${o.productRef ? 3 : 2} is a close-up crop of image 1 around the ${name}: use it to judge its tires touching the floor, its lean and whether its handlebar or saddle touches the support.` : ""}`,
    `Shot description: ${o.description}`,
    `How the ${name} should appear: ${o.productNote}`,
    "Checklist:",
    "1. Every vehicle in the frame (bikes, motorcycles, cars, strollers) has a correct, undistorted structure: correct number of wheels, round wheels attached to the frame, plausible parts and plausible size relative to the people.",
    `2. Exactly one ${name}; every person appears exactly once; no duplicated, merged or ghosted figures or objects.`,
    `3. The ${name} obeys its physics (${o.physics || "no kickstand, cannot stand by itself"}): it is held, ridden or pushed, or leans on a support that its handlebar or saddle visibly touches, or lies on the ground. It must not stand upright unsupported, and must not appear to lean on an object that is actually in front of or behind it with a gap.`,
    `4. If a person holds or rides the ${name}: hands really grip the handlebar grips, a rider really sits on the saddle, feet are on the ground or lifted; scale between child and ${name} is plausible.`,
    `5. Both tires of the ${name} touch the ground with contact shadows, unless a person lifts it.`,
    "6. Human anatomy is correct (hands, fingers, limbs, faces), and adults and children are scaled correctly to each other and to the scene.",
    "7. The location reads as a real North American suburban setting consistent with the description.",
    "8. No garbled text, watermarks or extra logos.",
    "Before judging, look closely at every vehicle: count its visible wheels and check each wheel is a separate round wheel on its own axle (a motorcycle has exactly 2 wheels, front and rear; watch for an extra wheel hidden behind people or other objects).",
    'Return JSON only: {"vehicles": [{"name": string, "wheels": number, "ok": boolean, "problem": string}], "pass": boolean, "issues": string[]}. Each issue is ONE short sentence in Simplified Chinese naming the object and the problem (e.g. "摩托车有三个轮子"); include every vehicle problem in issues too. pass must be false if there is any issue.',
  ].join("\n");
  const parts: Part[] = [{ text: prompt }, await jpegPart(o.image, 1536)];
  if (o.productRef) parts.push(await jpegPart(o.productRef, 768));
  if (o.zoom) parts.push(await jpegPart(o.zoom, 1024));
  const data = (await generate(parts, 120_000)) as { pass?: unknown; issues?: unknown; vehicles?: unknown };
  const issues = Array.isArray(data.issues) ? data.issues.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
  if (Array.isArray(data.vehicles))
    for (const v of data.vehicles as { name?: unknown; ok?: unknown; problem?: unknown }[])
      if (v?.ok === false && !issues.length) issues.push(`${typeof v.name === "string" ? v.name : "车辆"}结构有问题${typeof v.problem === "string" && v.problem ? `：${v.problem}` : ""}`);
  return { pass: data.pass === true && issues.length === 0, issues };
}

/** 3D 场景匹配用的几何线索（像素坐标）：墙脚线、空白段、侧墙脚线、已知高度的参照物、地平线 */
export async function locateGeometry(o: { plate: Buffer; support: string; width: number; height: number }): Promise<import("./scene-geometry").SceneGeom | null> {
  const prompt = [
    "You are a VFX matchmove artist preparing this location photo for 3D camera matching. Be precise; coordinates are [y, x] normalised to 0-1000.",
    `Support surface: ${o.support}.`,
    'Return JSON only: {"horizon": number | null, "wall_base": [[y, x], [y, x]], "clear_span": [[y, x], [y, x]] | null, "side_base": [[y, x], [y, x]] | null, "refs": [{"name": string, "height_m": number, "top": [y, x], "bottom": [y, x]}]}',
    "horizon: image row of the true horizon / camera eye level (null if you cannot judge).",
    "wall_base: two points far apart on the straight line where that support wall meets the floor.",
    "clear_span: the part of wall_base in front of which the wall is bare and the floor is empty, wide enough for a small children's bike to lean there.",
    "side_base: the floor line of a different wall perpendicular to it, if one is visible, else null.",
    "refs: 1-4 upright things standing on the same floor whose real height you know well (interior door 2.03 m, garage door opening 2.13 m, adult man 1.78 m, adult woman 1.63 m, 3-4 year old child 0.98 m, kitchen counter 0.91 m, car wheel 0.66 m, motorcycle wheel 0.64 m, motorcycle handlebar top 1.1 m); bottom = exactly where it touches the floor, top = the point directly above it at that height. Only use things whose bottom is on that same main floor and whose top is inside the frame: skip doors raised on steps, landings or curbs, and anything cut off by the frame edge.",
  ].join("\n");
  const data = (await generate([{ text: prompt }, await jpegPart(o.plate, 1536)], 90_000)) as Record<string, unknown>;
  const pt = (v: unknown) => (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number") ? { x: (v[1] / 1000) * o.width, y: (v[0] / 1000) * o.height } : null);
  const line = (v: unknown) => {
    if (!Array.isArray(v) || v.length !== 2) return null;
    const a = pt(v[0]), b = pt(v[1]);
    return a && b ? ([a, b] as [{ x: number; y: number }, { x: number; y: number }]) : null;
  };
  const wallBase = line(data.wall_base);
  if (!wallBase) return null;
  const refs = (Array.isArray(data.refs) ? data.refs : [])
    .map((r: { name?: unknown; height_m?: unknown; top?: unknown; bottom?: unknown }) => ({ name: String(r.name ?? ""), heightM: Number(r.height_m), top: pt(r.top), bottom: pt(r.bottom) }))
    .filter((r): r is { name: string; heightM: number; top: { x: number; y: number }; bottom: { x: number; y: number } } => !!r.top && !!r.bottom && r.heightM > 0.2 && r.heightM < 4 && r.top.y > 0.01 * o.height && r.bottom.y < 0.99 * o.height && r.bottom.y - r.top.y > 0.02 * o.height);
  return {
    horizonY: typeof data.horizon === "number" ? (data.horizon / 1000) * o.height : null,
    wallBase,
    clearSpan: line(data.clear_span),
    sideBase: line(data.side_base),
    refs,
  };
}

/** 规则 #1 逐零件比对看几遍图（多数票） */
const PRODUCT_VOTES = 3;
const FRAME_PARTS = "handlebar stem, seat backrest (and any hole in it), front basket, rear basket, pedals and cranks, wheels (count and sizes), frame tube, front fender, logo";

/** 逐零件结果 → 违反规则 #1 的问题。看几遍图投票：同一个零件至少 minVotes 遍都说「看得清、明显不一样」才算，单次看图的误报和漏报互相抵消 */
export function frameProductIssues(runs: unknown[], minVotes = Math.floor(runs.length / 2) + 1): string[] {
  const votes = new Map<string, { n: number; note: string }>();
  for (const parts of runs) {
    if (!Array.isArray(parts)) continue;
    const seen = new Set<string>();
    for (const p of parts as { part?: unknown; visible?: unknown; same?: unknown; note?: unknown }[]) {
      if (!p || typeof p !== "object" || p.visible !== "clear" || p.same !== "no") continue;
      const part = String(p.part ?? "零件").toLowerCase().trim();
      if (seen.has(part)) continue;
      seen.add(part);
      const v = votes.get(part) ?? { n: 0, note: typeof p.note === "string" && p.note.trim() ? p.note.trim() : `${part}和实物不一样` };
      v.n++;
      votes.set(part, v);
    }
  }
  return [...votes.values()].filter((v) => v.n >= minVotes).map((v) => v.note).slice(0, 8);
}

/** 短视频首帧：对照提示词和 3D 摆位看图，只报明显看得出的不一致 */
export async function reviewShortFrame(o: { image: Buffer; productName: string; productFacts: string; framePrompt: string; description: string; facts3d: string; holiday: string; noBox: boolean; car?: { person: string }; groundMax?: number; productRefs?: Buffer[]; refNotes?: string[]; cadRender?: Buffer }): Promise<VisionReview> {
  const name = o.productName || "product";
  const prompt = o.car
    ? [
        "You check a generated first frame of a TikTok video against what it was supposed to show. Only report real, clearly visible problems; no style opinions.",
        `Image prompt that was used: ${o.framePrompt}`,
        "Checklist:",
        `1. Exactly one person: ${o.car.person}. They sit in the driver's seat of a parked car taking a front-camera selfie (arm toward the camera, looking into the lens). Nobody else, nobody duplicated.`,
        "2. Their age, gender, hair and clothes match that description.",
        `3. Must not appear anywhere: the ${name}, any tricycle, bike, stroller or ride-on toy, any box or packaging, the phone itself, garbled text, watermarks.`,
        "4. Human anatomy is correct (hands, fingers, limbs, faces).",
        'Return JSON only: {"pass": boolean, "issues": string[]}. Each issue is ONE short sentence in Simplified Chinese naming who or what and the problem (e.g. "画面里出现了三轮车").',
      ].join("\n")
    : [
    "You check a generated first frame of a TikTok product video against what it was supposed to show. Only report real, clearly visible problems; no style opinions.",
    `Product: ${name} (${o.productFacts}).`,
    `Image prompt that was used: ${o.framePrompt}`,
    `Shot description (Chinese): ${o.description}`,
    `3D blocking (the truth for people, poses, product direction and camera): ${o.facts3d}`,
    `Holiday: ${o.holiday}.`,
    "Checklist:",
    "1. People: the number of people and who they are (adult/child, boy/girl) match the 3D blocking; nobody extra, nobody missing, nobody duplicated.",
    `2. Poses: anyone riding sits on the saddle with both hands on the handlebar grips${o.facts3d.includes("pedal") ? " and both feet on the pedals, one pedal up and forward and the other down and back (they sit at opposite ends of the crank; both at the same height is wrong)" : ""}; standing, crouching or pointing people do what the blocking says.`,
    `3. The ${name} faces the way the blocking says (front toward camera / three-quarter / side) and is plausibly sized next to the people.`,
    o.productRefs?.length && !o.cadRender && !o.car
      ? `4. Exactly one ${name}, not duplicated; its parts and structure are judged only in "parts" (4b), never in "issues".`
      : `4. Exactly one ${name}, with the correct structure (count the wheels, round wheels on axles, no melted or missing parts).`,
    ...(o.productRefs?.length
      ? [
          `4b. Compare the ${name} part by part with the real product in the reference photos (the images after the still, each labelled with its view; for each part use the photo whose view is closest to the still). Judge each part from THIS camera angle. Fill "parts" with one entry for each of: ${FRAME_PARTS}. visible = "clear" only if that part's shape is plainly visible in the still; a part seen edge-on, from behind, too small to make out, hidden by a person or cut by the frame edge is "partly" or "hidden": a backrest seen from the side shows only its edge, so its hole is not visible; when the product is under about a quarter of the frame height, small parts (pedals, cranks, holes, logo) are not "clear". Count every wheel, including any small extra wheel under the frame. same = "no" only if a clearly visible part is plainly different from the real product: missing, extra, wrong count or position, straight where the real one clearly bends, solid where the real one has a hole that faces the camera here. For each part first write "expect": how that part looks in the reference photo taken from the closest angle (e.g. the backrest is a ring with a big see-through oval hole, so the background shows through it), then "seen": how it looks in the still, then decide. A stem that rises straight and curves only near the top is a bent stem. Small differences in curvature, perspective, light or detail are "yes"; if not sure, "unsure".`,
        ]
      : []),
    ...(o.cadRender
      ? [
          `4c. The image right after the still is the exact factory CAD model of the ${name} rendered from this shot's camera angle (it may be gray or plain). The ${name} in the still must have exactly this shape: report every part whose shape, bend, proportion, hole, size or position differs from the CAD render. Colors may differ.`,
        ]
      : []),
    o.holiday === "none" ? "5. No holiday decorations, trees, gifts, bows or holiday outfits." : `5. The holiday look (${o.holiday}) is present and does not cover the product.`,
    `6. Must not appear: the person filming (only a hand or feet at the frame edge if the prompt says so)${o.noBox ? ", any box, packaging or wrapping" : ""}, garbled text, watermarks, extra logos.`,
    "7. Human anatomy is correct (hands, fingers, limbs, faces).",
    `8. Framing like real phone ads: empty ground or floor below the lowest wheel or foot takes at most about ${o.groundMax ?? 20}% of the frame height; the ${name} (with its rider, if any) is not tiny; an adult next to the product is not shown full-length standing while the ${name} is a small object at their feet.`,
    o.productRefs?.length
      ? 'Return JSON only: {"pass": boolean, "issues": string[], "parts": [{"part": string, "expect": string, "seen": string, "visible": "clear" | "partly" | "hidden", "same": "yes" | "no" | "unsure", "note": string}]}. Each issue is ONE short sentence in Simplified Chinese naming who or what and the problem (e.g. "小孩的脚没有踩在脚踏上", "产品下面空地太多，约占画面 40%"); product part differences go only in "parts", whose "note" is one short Simplified Chinese sentence saying what differs (empty if same is "yes").'
      : 'Return JSON only: {"pass": boolean, "issues": string[], "product": string[]}. Each issue is ONE short sentence in Simplified Chinese naming who or what and the problem (e.g. "小孩的脚没有踩在脚踏上", "产品下面空地太多，约占画面 40%"). "product" repeats only the issues where the product itself differs from the real product (a part missing, extra, bent, reshaped, resized or moved); a part hidden by a person or the frame edge is not an issue.',
  ].join("\n");
  const refs = o.car ? [] : (o.productRefs ?? []).slice(0, 5);
  const parts = [{ text: prompt }, await jpegPart(o.image, 1536)];
  if (o.cadRender && !o.car) parts.push({ text: `Exact factory CAD render of the ${name} from this shot's camera angle:` }, await jpegPart(o.cadRender, 1024));
  for (const [i, r] of refs.entries()) parts.push({ text: `Reference photo ${i + 1} of the real ${name}${o.refNotes?.[i] ? ` (${o.refNotes[i]})` : ""}:` }, await jpegPart(r, 1024));
  type Raw = { pass?: unknown; issues?: unknown; product?: unknown; parts?: unknown };
  const perPart = !!o.productRefs?.length && !o.cadRender && !o.car;
  const [data, ...more] = (await Promise.all(Array.from({ length: perPart ? PRODUCT_VOTES : 1 }, () => generate(parts, 120_000)))) as Raw[];
  const strs = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()).slice(0, 8) : []);
  // 逐零件：只有看得清、而且明显不一样的零件才算违反规则 #1；看不清、被挡、拿不准的不算
  const product = perPart ? frameProductIssues([data, ...more].map((d) => d.parts)) : strs(data.product);
  const issues = [...new Set([...strs(data.issues), ...product])];
  // 逐零件投票时，第一遍的 pass 可能只是因为被投掉的零件问题，以投票后的问题清单为准
  return { pass: (perPart || data.pass === true) && issues.length === 0, issues, product };
}

/** 短视频成片：按时间截的帧 + 真实产品照，查产品有没有变形、零件消失，人有没有变脸 */
export async function reviewShortVideo(o: { frames: { t: number; img: Buffer }[]; productRef: Buffer | null; productName: string; productFacts: string; productAbsent: boolean }): Promise<VisionReview> {
  const name = o.productName || "product";
  const prompt = (o.productAbsent
    ? [
        "You check a generated TikTok selfie clip, given frames sampled every 0.5 s. Only report real, clearly visible problems; no style opinions.",
        `1. The ${name}, any tricycle, bike, stroller or ride-on toy must never appear in any frame.`,
        "2. It is the same person in every frame: face, hair and clothes do not change; nobody else appears.",
        "3. Human anatomy is correct (hands, fingers, limbs, faces); no garbled text or watermarks.",
      ]
    : [
        "You check a generated TikTok product clip, given frames sampled every 0.5 s and a reference photo of the real product. Only report real, clearly visible problems; no style opinions.",
        `Product: ${name} (${o.productFacts}).`,
        "1. In EVERY frame where the product is visible, compare it with the reference photo and with the first frame: count the wheels and how many are at the back; every part in the reference (baskets, seat and backrest, fender, pedals, handlebar) is still there; the two pedals stay at opposite ends of the crank (one up, one down, never level side by side); nothing melts, merges, bends, duplicates, disappears or changes size relative to the rest of the product; colors and logo stay the same.",
        "2. A part that is only hidden behind a person or cut by the frame edge is fine.",
        "3. People keep the same face, hair and clothes in every frame; nobody appears or vanishes; anatomy is correct.",
        "4. No glowing spots, flashes, garbled text or watermarks. Logo text: if the logo on the product is large enough to read in the first frame, it must read the same letters in every later frame; report it if the letters change or turn into gibberish (e.g. KRIDDO becoming PNDDS). If it is too small to read, do not judge it.",
        "5. If the product moves, it only moves forward: front wheel first, in the direction its front end points. Judge it against the ground and background (when the camera follows it, the background slides the opposite way). Report it if it rolls backward (rear wheels leading) or slides sideways.",
        "6. The product stays in view: report it if a hand, arm or person covers most of the product for 1 second or longer (for example the filming person's hand moving in front of it), or if the product leaves the frame.",
      ]
  ).concat('Return JSON only: {"pass": boolean, "issues": string[]}. Each issue is ONE short sentence in Simplified Chinese that starts with the time, e.g. "第 2.5 秒起：右后轮不见了".').join("\n");
  const parts: Part[] = [{ text: prompt }];
  if (o.productRef && !o.productAbsent) parts.push({ text: "Reference photo of the real product:" }, await jpegPart(o.productRef, 1024));
  for (const fr of o.frames) parts.push({ text: `Frame at ${fr.t.toFixed(1)} s:` }, await jpegPart(fr.img, 768));
  const data = (await generate(parts, 180_000)) as { pass?: unknown; issues?: unknown };
  const issues = Array.isArray(data.issues) ? data.issues.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
  return { pass: data.pass === true && !issues.length, issues };
}

type Dir = "left" | "right" | "toward" | "away";
const OPPOSITE: Record<Dir, Dir> = { left: "right", right: "left", toward: "away", away: "toward" };

/** 车有没有倒着走：分别问车头朝哪、车往哪走（看背景参照物），程序比较；一次问「有没有倒退」模型常看不出来 */
export async function checkMoveDirection(frames: { t: number; img: Buffer }[]): Promise<string | null> {
  if (frames.length < 3) return null;
  const pick = [frames[0], frames[Math.floor(frames.length / 2)], frames[frames.length - 1]];
  const prompt = [
    "These are 3 frames of one phone clip in time order (first, middle, last). Answer about the tricycle (or other ride-on product) only.",
    'facing: which way its FRONT (front wheel and handlebar) points in the image: "left", "right", "toward" (the camera), "away", or "unclear".',
    'moved: how the tricycle itself moved over the ground from the first to the last frame. Judge it against fixed things (houses, poles, mailboxes, trees, lines and cracks on the ground), not against the frame edges: if the camera pans to follow it, the background slides the opposite way, so the tricycle moved opposite to the background. One of "left", "right", "toward", "away", "none", "unclear".',
    'Return JSON only: {"facing": string, "moved": string}.',
  ].join("\n");
  const parts: Part[] = [{ text: prompt }];
  for (const f of pick) parts.push({ text: `Frame at ${f.t} s:` }, await jpegPart(f.img, 768));
  const d = (await generate(parts, 120_000)) as { facing?: unknown; moved?: unknown };
  const facing = d.facing as Dir, moved = d.moved as Dir;
  if (!(facing in OPPOSITE) || !(moved in OPPOSITE)) return null;
  return OPPOSITE[facing] === moved ? `全程：车在倒着走（车头朝${ZH[facing]}，车却往${ZH[moved]}移动），三轮车只能车头在前往前走` : null;
}
const ZH: Record<Dir, string> = { left: "左", right: "右", toward: "镜头", away: "远处" };
