// 工厂 3D STEP → GLB：本机 OpenCASCADE（cadquery-ocp）转换，免费、不联网。
// 转换工具装在 ~/.productdrama/cad-python（约 1 GB，第一次用时在产品页一键安装）。
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ENV_DIR = path.join(os.homedir(), ".productdrama", "cad-python");
const SCRIPT = path.join(process.cwd(), "scripts", "cad", "step_to_glb.py");
const win = process.platform === "win32";
const envPython = () => path.join(ENV_DIR, win ? "Scripts" : "bin", win ? "python.exe" : "python");

export const MAX_STEP_BYTES = 300 * 1024 * 1024;
export const NEED_CAD_TOOLS = "第一次导入 STEP 要先安装 CAD 转换工具：点「安装转换工具」（免费，约 1 GB，几分钟）";

/** STEP 文件头：ISO-10303-21 */
export const isStep = (buf: Buffer) => buf.subarray(0, 200).toString("latin1").includes("ISO-10303-21");

export const cadToolsReady = () => fs.existsSync(envPython());

function run(cmd: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) =>
      err ? reject(Object.assign(err, { stdout: String(stdout), stderr: String(stderr) })) : resolve(String(stdout)),
    ),
  );
}

/** 建私有 Python 环境并装 cadquery-ocp + ezdxf（只装一次） */
export async function installCadTools(): Promise<void> {
  if (cadToolsReady()) return;
  fs.mkdirSync(path.dirname(ENV_DIR), { recursive: true });
  let made = false;
  for (const py of win ? ["py", "python"] : ["python3", "python"]) {
    try {
      await run(py, ["-m", "venv", ENV_DIR], 120_000);
      made = true;
      break;
    } catch {
      // 换下一个名字再试
    }
  }
  if (!made) throw new Error("这台电脑没有 Python 3：先从 python.org 安装 Python 3.10 以上，再点安装");
  try {
    await run(envPython(), ["-m", "pip", "install", "-q", "cadquery-ocp", "ezdxf"], 30 * 60_000);
  } catch (e) {
    fs.rmSync(ENV_DIR, { recursive: true, force: true });
    throw new Error(`安装转换工具失败（检查网络后重试）：${String((e as { stderr?: string }).stderr ?? e).slice(-300)}`);
  }
}

export interface StepInfo {
  /** STEP 原坐标的长宽高（米，x / y / z） */
  sizeM: [number, number, number];
  parts: number;
  colored: number;
  names: string[];
}

/** up：STEP 里哪根轴朝上（SolidWorks 常是 y，多数 CAD 是 z） */
export async function stepToGlb(step: Buffer, up: "z" | "y" = "z"): Promise<{ glb: Buffer; info: StepInfo }> {
  if (!cadToolsReady()) throw new Error(NEED_CAD_TOOLS);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-step-"));
  try {
    const src = path.join(dir, "in.step");
    const out = path.join(dir, "out.glb");
    fs.writeFileSync(src, step);
    let stdout = "";
    try {
      stdout = await run(envPython(), [SCRIPT, src, out, up], 10 * 60_000);
    } catch (e) {
      stdout = (e as { stdout?: string }).stdout ?? "";
    }
    const last = stdout.trim().split("\n").pop() ?? "";
    let r: { ok?: boolean; error?: string; size_m?: number[]; parts?: number; colored?: number; names?: string[] } = {};
    try {
      r = JSON.parse(last);
    } catch {
      throw new Error("STEP 转换没有结果：文件可能太大或损坏");
    }
    if (!r.ok || !fs.existsSync(out)) throw new Error(r.error || "STEP 转换失败");
    const s = r.size_m ?? [];
    return {
      glb: fs.readFileSync(out),
      info: { sizeM: [s[0] ?? 0, s[1] ?? 0, s[2] ?? 0], parts: r.parts ?? 0, colored: r.colored ?? 0, names: (r.names ?? []).slice(0, 50) },
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** 产品长度（厘米）：朝上那根轴以外最长的一边 */
export function stepLengthCm(info: StepInfo, up: "z" | "y"): number {
  const [x, y, z] = info.sizeM;
  return Math.round(Math.max(x, up === "z" ? y : z) * 1000) / 10;
}

// ---- 工厂 2D 图纸（DXF）：读尺寸标注 + 出预览图 ----
const DXF_SCRIPT = path.join(process.cwd(), "scripts", "cad", "dxf_info.py");
export const MAX_DXF_BYTES = 50 * 1024 * 1024;

/** DWG 文件头 AC10xx：平台读不了，要另存为 DXF */
export const isDwg = (buf: Buffer) => /^AC10\d\d/.test(buf.subarray(0, 6).toString("latin1"));
export const isDxf = (buf: Buffer) => {
  const h = buf.subarray(0, 4096).toString("latin1");
  return h.startsWith("AutoCAD Binary DXF") || (/\bSECTION\b/.test(h) && /\b(HEADER|ENTITIES|TABLES)\b/.test(h));
};

export interface DxfDim {
  kind: string;
  valueMm: number;
  text: string;
}
export interface DxfInfo {
  units: number;
  extentsMm: [number, number];
  dims: DxfDim[];
}

export async function readDxf(dxf: Buffer): Promise<{ info: DxfInfo; png: Buffer }> {
  if (!cadToolsReady()) throw new Error(NEED_CAD_TOOLS);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-dxf-"));
  try {
    const src = path.join(dir, "in.dxf");
    const out = path.join(dir, "out.png");
    fs.writeFileSync(src, dxf);
    let stdout = "";
    try {
      stdout = await run(envPython(), [DXF_SCRIPT, src, out], 5 * 60_000);
    } catch (e) {
      stdout = (e as { stdout?: string }).stdout ?? "";
    }
    let r: { ok?: boolean; error?: string; units?: number; extents_mm?: number[]; dims?: { kind: string; value_mm: number; text: string }[] } = {};
    try {
      r = JSON.parse(stdout.trim().split("\n").pop() ?? "");
    } catch {
      throw new Error("图纸读取没有结果：文件可能损坏");
    }
    if (!r.ok || !fs.existsSync(out)) throw new Error(r.error ? `读不了这个 DXF：${r.error}` : "读不了这个 DXF");
    const e = r.extents_mm ?? [];
    return {
      png: fs.readFileSync(out),
      info: { units: r.units ?? 0, extentsMm: [e[0] ?? 0, e[1] ?? 0], dims: (r.dims ?? []).map((d) => ({ kind: d.kind, valueMm: d.value_mm, text: d.text })) },
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
