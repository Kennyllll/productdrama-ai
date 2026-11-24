// 上传的 GLB 是工厂 CAD 导出的（精确）还是照片 / AI 建的（近似）：看文件里的生成工具和零件数；猜不出返回 null，再问人
export type GlbOrigin = "factory" | "ai";

const AI_GEN = /tripo|meshy|rodin|hyper3d|hunyuan|trellis|luma|csm\.ai|kaedim/i;
const CAD_GEN = /open ?cascade|solidworks|onshape|fusion ?360|inventor|\bcreo\b|\bcatia\b|siemens nx|rhino|freecad|\bcad\b/i;

interface GlbJson {
  asset?: { generator?: string };
  meshes?: unknown[];
  images?: unknown[];
}

function glbJson(buf: Buffer): GlbJson | null {
  if (buf.length < 20 || buf.subarray(0, 4).toString("ascii") !== "glTF") return null;
  const len = buf.readUInt32LE(12);
  if (buf.subarray(16, 20).toString("ascii") !== "JSON" || 20 + len > buf.length) return null;
  try {
    return JSON.parse(buf.subarray(20, 20 + len).toString("utf8")) as GlbJson;
  } catch {
    return null;
  }
}

export function guessGlbOrigin(buf: Buffer): GlbOrigin | null {
  const j = glbJson(buf);
  if (!j) return null;
  const gen = String(j.asset?.generator ?? "");
  if (AI_GEN.test(gen)) return "ai";
  if (CAD_GEN.test(gen)) return "factory";
  const meshes = j.meshes?.length ?? 0;
  // CAD 导出每个零件一个网格；AI 建模是一整块网格 + 贴图
  if (meshes >= 5) return "factory";
  if (meshes <= 1 && (j.images?.length ?? 0) > 0) return "ai";
  return null;
}
