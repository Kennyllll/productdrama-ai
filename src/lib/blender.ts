// Blender 产品渲染（TASK-012b）。调用本机 Blender 渲染带材质的 GLB，输出透明背景 PNG（含接触阴影）与产品遮罩。
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface RenderSpec {
  glb: string;
  out: string;
  out_mask?: string;
  width: number;
  height: number;
  azimuth_deg: number;
  elevation_deg: number;
  yaw_deg?: number;
  roll_deg?: number; // 侧倾（靠物 / 倒地）
  steer_deg?: number; // 车把转向（需要 <glb>.rig.json）
  pitch_deg?: number;
  lens_mm: number;
  distance_m?: number | null;
  target_height_frac?: number;
  key_dir_deg: number;
  key_elev_deg: number;
  key_kelvin: number;
  key_strength?: number;
  fill_strength?: number;
  rim_strength?: number;
  env_strength?: number;
  env_color?: [number, number, number];
  env_image?: string; // 用空场景图当环境光
  key_mix?: number; // 有环境图时灯光强度倍数（默认 0.25）
  cine_rim?: number; // 电影轮廓灯强度（0 = 关）
  cine_rim_kelvin?: number;
  exposure?: number;
  floor_roughness?: number;
  out_refl?: string;
  samples?: number;
}

const CANDIDATES = [
  process.env.BLENDER_PATH ?? "",
  "/Applications/Blender.app/Contents/MacOS/Blender",
  path.join(process.env.HOME ?? "", "Applications/Blender.app/Contents/MacOS/Blender"),
  "/usr/bin/blender",
  "/usr/local/bin/blender",
];

export function findBlender(): string | null {
  return CANDIDATES.find((p) => p && fs.existsSync(p)) ?? null;
}

export const RENDER_SCRIPT = path.join(process.cwd(), "scripts", "blender", "render_product.py");
export const SILHOUETTE_SCRIPT = path.join(process.cwd(), "scripts", "blender", "silhouettes.py");

export interface SilhouetteView {
  azimuth_deg: number;
  elevation_deg: number;
  roll_deg: number;
  steer_deg?: number; // 车把转向（需要 <glb>.rig.json）
}

/** 一次 Blender 调用批量渲染产品剪影（Workbench，无光照，几秒），用于和 AI 画面里的产品比对视角 */
export async function renderSilhouettes(glb: string, outDir: string, lensMm: number, views: SilhouetteView[]): Promise<{ files: string[]; grips: [number, number][][] }> {
  const blender = findBlender();
  if (!blender) throw new BlenderError("未找到 Blender。请安装 Blender 4.2 到 /Applications，或设置环境变量 BLENDER_PATH");
  // 转向会改变模型本身，按转向角分组，每组一次 Blender 调用
  const groups = new Map<number, number[]>();
  views.forEach((v, i) => groups.set(v.steer_deg ?? 0, [...(groups.get(v.steer_deg ?? 0) ?? []), i]));
  const files: string[] = new Array(views.length);
  const grips: [number, number][][] = new Array(views.length);
  for (const [steer, idx] of groups) {
    const sub = path.join(outDir, `steer${steer}`);
    fs.mkdirSync(sub, { recursive: true });
    const specFile = path.join(sub, "spec.json");
    fs.writeFileSync(specFile, JSON.stringify({ glb, out_dir: sub, size_px: 400, lens_mm: lensMm, steer_deg: steer, views: idx.map((i) => views[i]) }));
    await new Promise<void>((resolve, reject) => {
      execFile(blender, ["-b", "-noaudio", "--python", SILHOUETTE_SCRIPT, "--", specFile], { timeout: 5 * 60 * 1000, maxBuffer: 32 * 1024 * 1024 }, (err, out, errOut) => {
        if (err || !String(out).includes("SIL_OK")) reject(new BlenderError(`剪影渲染失败：${String(errOut || err?.message || "").split("\n").filter(Boolean).slice(-2).join(" / ")}`));
        else resolve();
      });
    });
    const gf = path.join(sub, "grips.json");
    const g = fs.existsSync(gf) ? (JSON.parse(fs.readFileSync(gf, "utf8")) as [number, number][][]) : [];
    idx.forEach((i, k) => {
      files[i] = path.join(sub, `sil_${k}.png`);
      grips[i] = g[k] ?? [];
    });
  }
  return { files, grips };
}

export class BlenderError extends Error {}

/** 渲染一张产品图。耗时约 30–120 秒（CPU Cycles）。 */
export async function renderProduct(spec: RenderSpec): Promise<{ image: string; mask: string; reflection: string; meta: Record<string, unknown> }> {
  const blender = findBlender();
  if (!blender) throw new BlenderError("未找到 Blender。请安装 Blender 4.2 到 /Applications，或设置环境变量 BLENDER_PATH");
  if (!fs.existsSync(RENDER_SCRIPT)) throw new BlenderError("缺少渲染脚本 scripts/blender/render_product.py");
  fs.mkdirSync(path.dirname(spec.out), { recursive: true });
  const mask = spec.out_mask ?? spec.out.replace(/\.png$/, "-mask.png");
  const reflection = spec.out_refl ?? spec.out.replace(/\.png$/, "-refl.png");
  const specFile = spec.out.replace(/\.png$/, ".json");
  fs.writeFileSync(specFile, JSON.stringify({ ...spec, out_mask: mask, out_refl: reflection }));
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      blender,
      ["-b", "-noaudio", "--python", RENDER_SCRIPT, "--", specFile],
      { timeout: 10 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 },
      (err, out, errOut) => {
        if (err) reject(new BlenderError(`Blender 渲染失败：${String(errOut || err.message).split("\n").filter(Boolean).slice(-3).join(" / ")}`));
        else resolve(String(out));
      },
    );
  });
  const line = stdout.split("\n").find((l) => l.startsWith("RENDER_OK"));
  if (!line || !fs.existsSync(spec.out)) throw new BlenderError("Blender 未输出渲染结果");
  return { image: spec.out, mask, reflection, meta: JSON.parse(line.slice("RENDER_OK".length)) as Record<string, unknown> };
}

export const SCENE_SCRIPT = path.join(process.cwd(), "scripts", "blender", "render_scene.py");

export interface SceneRenderMeta {
  grips: number[][];
  contact: { part: string; px: number[]; world: number[] };
  roll_deg: number;
  yaw_deg: number;
  wheel_z: number;
}

/** 3D 场景匹配渲染：按解出的相机出整幅 RGBA（车 + 地面 / 墙面阴影），可直接叠在空场景上 */
export async function renderScene(spec: Record<string, unknown> & { out: string }): Promise<{ image: string; mask: string; meta: SceneRenderMeta }> {
  const blender = findBlender();
  if (!blender) throw new BlenderError("未找到 Blender。请安装 Blender 4.2 到 /Applications，或设置环境变量 BLENDER_PATH");
  fs.mkdirSync(path.dirname(spec.out), { recursive: true });
  const mask = spec.out.replace(/\.png$/, "-mask.png");
  const specFile = spec.out.replace(/\.png$/, ".json");
  fs.writeFileSync(specFile, JSON.stringify({ ...spec, out_mask: mask }));
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(blender, ["-b", "-noaudio", "--python", SCENE_SCRIPT, "--", specFile], { timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) reject(new BlenderError(`Blender 场景渲染失败：${String(errOut || err.message).split("\n").filter(Boolean).slice(-3).join(" / ")}`));
      else resolve(String(out));
    });
  });
  const line = stdout.split("\n").find((l) => l.startsWith("SCENE_OK"));
  if (!line || !fs.existsSync(spec.out)) throw new BlenderError("Blender 未输出场景渲染结果");
  return { image: spec.out, mask, meta: JSON.parse(line.slice("SCENE_OK".length)) as SceneRenderMeta };
}
