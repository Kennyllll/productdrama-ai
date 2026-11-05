// 本地写实化（图不出本机）：调用 ~/pd-tools/sd-venv 里的 SDXL + ControlNet（scripts/sd/photoreal.py）。
// Blender 深度和布景线稿锁住几何，替代云端 Flare 的写实化这一步
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VENV_PY = path.join(os.homedir(), "pd-tools", "sd-venv", "bin", "python");
const SCRIPT = path.join(process.cwd(), "scripts", "sd", "photoreal.py");

export function localPhotorealReady(): boolean {
  return fs.existsSync(VENV_PY) && fs.existsSync(SCRIPT);
}

export interface LocalPhotorealSpec {
  plate: string;
  depth: string;
  out: string;
  prompt: string;
  negative?: string;
  width?: number;
  strength?: number;
  steps?: number;
  cfg?: number;
  cn_scale?: number;
  seed?: number;
}

export async function localPhotoreal(spec: LocalPhotorealSpec): Promise<Buffer> {
  if (!localPhotorealReady()) throw new Error("本地写实化模型没装好（~/pd-tools/sd-venv）");
  const specFile = spec.out.replace(/\.\w+$/, "") + "-sd.json";
  fs.writeFileSync(specFile, JSON.stringify(spec));
  await new Promise<void>((resolve, reject) => {
    execFile(VENV_PY, [SCRIPT, specFile], { timeout: 20 * 60 * 1000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, HF_HOME: path.join(os.homedir(), "pd-tools", "hf"), HF_HUB_OFFLINE: "1", PYTORCH_ENABLE_MPS_FALLBACK: "1" } }, (err, out, errOut) => {
      if (err || !String(out).includes("PHOTOREAL_OK")) reject(new Error(`本地写实化失败：${String(errOut || err?.message || "").split("\n").filter(Boolean).slice(-3).join(" / ")}`));
      else resolve();
    });
  });
  return fs.readFileSync(spec.out);
}
