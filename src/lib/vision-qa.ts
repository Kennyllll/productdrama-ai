// 视觉质检（Gemini）：看最终关键帧，按清单找结构 / 物理错误。仅服务端调用；Key 只保存在本机 SQLite，不记录日志。
import sharp from "sharp";
import { getDb } from "@/lib/db";

export const VISION_MODEL = "gemini-2.5-flash";
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

async function generate(parts: Part[], timeoutMs: number): Promise<unknown> {
  const key = getVisionKey();
  if (!key) throw new Error("尚未配置视觉质检 Key");
  let res: Response;
  try {
    res = await fetch(`${BASE}/${VISION_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new Error(timedOut ? "Gemini 响应超时" : "网络错误，无法连接 Gemini");
  }
  if (!res.ok) throw new Error(STATUS_MESSAGES[res.status] ?? `Gemini 返回错误（HTTP ${res.status}）`);
  const body = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini 没有返回内容");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini 返回的不是有效 JSON");
  }
}

export async function testVision(): Promise<void> {
  await generate([{ text: 'Reply with this JSON only: {"ok": true}' }], 30_000);
}

const jpegPart = async (img: Buffer, max: number): Promise<Part> => ({
  inline_data: { mime_type: "image/jpeg", data: (await sharp(img).resize(max, max, { fit: "inside" }).jpeg({ quality: 88 }).toBuffer()).toString("base64") },
});

export interface VisionReview {
  pass: boolean;
  issues: string[];
}

/** 按清单审一张关键帧；返回的问题是中文短句，pass=false 即不合格 */
export async function reviewKeyframe(o: { image: Buffer; productRef?: Buffer; productName: string; productFacts: string; physics: string; description: string; productNote: string }): Promise<VisionReview> {
  const name = o.productName || "product";
  const prompt = [
    "You are a strict film continuity and physics supervisor reviewing a generated still for a live-action commercial short film. Only report real problems that are clearly visible; no style opinions.",
    `Image 1 is the still.${o.productRef ? ` Image 2 is a studio render of the real ${name} (${o.productFacts}).` : ` The product is the ${name} (${o.productFacts}).`}`,
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
    'Return JSON only: {"pass": boolean, "issues": string[]}. Each issue is ONE short sentence in Simplified Chinese naming the object and the problem (e.g. "摩托车有三个轮子"). pass must be false if there is any issue.',
  ].join("\n");
  const parts: Part[] = [{ text: prompt }, await jpegPart(o.image, 1536)];
  if (o.productRef) parts.push(await jpegPart(o.productRef, 768));
  const data = (await generate(parts, 120_000)) as { pass?: unknown; issues?: unknown };
  const issues = Array.isArray(data.issues) ? data.issues.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
  return { pass: data.pass === true && issues.length === 0, issues };
}
