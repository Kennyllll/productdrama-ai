// 关键帧提示词与模型选项（TASK-012）。纯函数，客户端和服务端共用。
import type { FilmStyle, LocalShot, VisualSpec } from "@/lib/types";

export const KEYFRAME_MODELS = [
  { id: "marketing-studio/image/sunburst", label: "GPT Image 2.5 Sunburst（编辑精度最好，支持 21:9，最多 16 张参考图）", maxRefs: 16 },
  { id: "xai/grok-imagine-image-2.0", label: "Grok Image 2.0（实测超过 4 张参考图会失败，最宽 16:9）", maxRefs: 4 },
] as const;
export type KeyframeModel = (typeof KEYFRAME_MODELS)[number]["id"];
export const isKeyframeModel = (m: unknown): m is KeyframeModel => KEYFRAME_MODELS.some((x) => x.id === m);

export function modelInput(model: KeyframeModel, prompt: string, imageUrls: string[], aspect: VisualSpec["aspectRatio"]): Record<string, unknown> {
  const vertical = aspect === "9:16";
  if (model === "marketing-studio/image/sunburst") {
    return {
      prompt,
      image_urls: imageUrls,
      quality: "high",
      resolution: "2k",
      aspect_ratio: vertical ? "9:16" : aspect === "16:9" ? "16:9" : "21:9",
      enhance_prompt: false,
    };
  }
  return { prompt, image_urls: imageUrls, quality: "medium", resolution: "2k", aspect_ratio: vertical ? "9:16" : "16:9" };
}

export function buildKeyframePrompt(
  shot: LocalShot,
  style: FilmStyle,
  cast: { id: string; name: string; description: string }[],
  spec: VisualSpec,
  productName: string,
  eggName: string | null,
): string {
  const people = cast.filter((c) => shot.characterIds.includes(c.id));
  const lines = [
    `Cinematic film still, single frame from a ${spec.aspectRatio} feature film. Photorealistic, shot on cinema camera, ${spec.grain || "fine 35mm film grain"}, no text overlays, no watermark.`,
    `Scene: ${shot.description}`,
    `Camera: ${shot.size}, ${shot.lens}mm lens, ${shot.angle}, movement intent ${shot.camera}. Composition: ${shot.composition}.`,
    `Lighting: ${shot.lighting}. Color grade: ${spec.colorGrade}. Depth of field: ${spec.depthOfField}.`,
    `Visual reference (borrow only lighting, color and camera language, do not copy characters, logos or iconic shots): ${style.film} (${style.director}, ${style.year}) — ${style.keywords.join(", ")}.`,
  ];
  if (people.length) lines.push(`Characters (match the reference photos exactly, same face, age and outfit): ${people.map((p) => `${p.name}${p.description ? ` — ${p.description}` : ""}`).join("; ")}.`);
  if (shot.product !== "无") {
    lines.push(
      `Product: ${productName || "the product"} appears as ${shot.product === "主体" ? "the hero subject" : "a background element"}${shot.productNote ? ` — ${shot.productNote}` : ""}. Use the product reference photos: keep exact geometry, proportions, colors, materials and logo placement; do not redesign, recolor or add parts; logo must be legible and undistorted.`,
    );
  } else {
    lines.push("The product does not appear in this frame.");
  }
  if (shot.hasPetEasterEgg && eggName) lines.push(`Easter egg: ${eggName} appears subtly in the frame (match its reference photos), not the focus.`);
  if (shot.dialogue.trim()) lines.push("Characters are mid-conversation; natural expressions, no speech bubbles or subtitles.");
  return lines.join("\n");
}
