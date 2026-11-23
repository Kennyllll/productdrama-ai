// 把 GLB 变成灰模：删掉所有贴图、顶点色和材质，换成统一的浅灰色。纯 JS，不用 Blender（Hub / Vercel 上也能跑）。
// AI 建模猜出来的 Logo、贴纸是糊的，留着会误导首帧；灰模只负责形状和角度，颜色和 Logo 以真实照片为准。

const KEEP_EXT = new Set(["KHR_draco_mesh_compression", "KHR_mesh_quantization", "EXT_meshopt_compression"]);

interface Gltf {
  materials?: unknown[];
  textures?: unknown[];
  images?: unknown[];
  samplers?: unknown[];
  meshes?: { primitives?: { material?: number; attributes?: Record<string, number> }[] }[];
  nodes?: Record<string, unknown>[];
  scenes?: { nodes?: number[] }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

function writeGlb(json: Gltf, rest: Buffer): Buffer {
  let text = Buffer.from(JSON.stringify(json), "utf8");
  const pad = (4 - (text.length % 4)) % 4;
  if (pad) text = Buffer.concat([text, Buffer.alloc(pad, 0x20)]);
  const head = Buffer.alloc(20);
  head.write("glTF", 0, "ascii");
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + text.length + rest.length, 8);
  head.writeUInt32LE(text.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, text, rest]);
}

function readGlb(buf: Buffer): { json: Gltf; rest: Buffer } {
  if (buf.length < 20 || buf.subarray(0, 4).toString("ascii") !== "glTF" || buf.readUInt32LE(4) !== 2) throw new Error("不是 GLB 文件");
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error("GLB 第一块不是 JSON");
  // BIN 块原样保留
  return { json: JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8")) as Gltf, rest: buf.subarray(20 + jsonLen) };
}

/** 整个模型绕竖轴（+Y）转 deg 度：在所有根节点外面套一层带旋转的节点，网格数据不动 */
export function turnGlb(buf: Buffer, deg: number): Buffer {
  const { json, rest } = readGlb(buf);
  const a = (deg * Math.PI) / 360;
  json.nodes = json.nodes ?? [];
  for (const s of json.scenes ?? []) {
    json.nodes.push({ name: "turn", rotation: [0, Math.sin(a), 0, Math.cos(a)], children: s.nodes ?? [] });
    s.nodes = [json.nodes.length - 1];
  }
  return writeGlb(json, rest);
}

/** 让最低点落在 y = 0（贴地）。只处理节点没有自己变换的模型（AI 建模出来的一般是这样）；别的情况原样返回 */
export function groundGlb(buf: Buffer): Buffer {
  const { json, rest } = readGlb(buf) as { json: Gltf & { accessors?: { min?: number[] }[] }; rest: Buffer };
  const moved = (n: Record<string, unknown>) => n.matrix || n.scale || n.translation || (n.rotation && n.name !== "turn");
  if ((json.nodes ?? []).some(moved)) return buf;
  let minY = Infinity;
  for (const m of json.meshes ?? []) for (const p of m.primitives ?? []) {
    const a = p.attributes?.POSITION;
    const v = a === undefined ? undefined : json.accessors?.[a]?.min?.[1];
    if (typeof v === "number") minY = Math.min(minY, v);
  }
  if (!Number.isFinite(minY) || Math.abs(minY) < 1e-6) return buf;
  json.nodes = json.nodes ?? [];
  for (const s of json.scenes ?? []) {
    json.nodes.push({ name: "ground", translation: [0, -minY, 0], children: s.nodes ?? [] });
    s.nodes = [json.nodes.length - 1];
  }
  return writeGlb(json, rest);
}

export function grayGlb(buf: Buffer): Buffer {
  const { json, rest } = readGlb(buf);
  json.materials = [{ name: "gray", pbrMetallicRoughness: { baseColorFactor: [0.72, 0.72, 0.72, 1], metallicFactor: 0, roughnessFactor: 0.8 }, doubleSided: true }];
  for (const m of json.meshes ?? []) {
    for (const p of m.primitives ?? []) {
      p.material = 0;
      if (p.attributes) for (const k of Object.keys(p.attributes)) if (k.startsWith("COLOR_")) delete p.attributes[k];
    }
  }
  delete json.textures;
  delete json.images;
  delete json.samplers;
  if (json.extensionsUsed) json.extensionsUsed = json.extensionsUsed.filter((e) => KEEP_EXT.has(e));
  if (json.extensionsRequired) json.extensionsRequired = json.extensionsRequired.filter((e) => KEEP_EXT.has(e));
  if (!json.extensionsUsed?.length) delete json.extensionsUsed;
  if (!json.extensionsRequired?.length) delete json.extensionsRequired;
  return writeGlb(json, rest);
}

/** AI 模型没有单位：按真实长度缩放，水平最长的一边 = lengthM 米。根节点外套一层缩放节点，网格数据不动；重复调用只改这层的比例 */
/** 缩放到真实长度要乘的比例（水平最长的一边 = lengthM 米）；量不出来返回 null */
export function realSizeFactor(buf: Buffer, lengthM: number): number | null {
  const { json } = readGlb(buf) as { json: Gltf & { accessors?: { min?: number[]; max?: number[] }[] } };
  const lo = [Infinity, Infinity];
  const hi = [-Infinity, -Infinity];
  for (const m of json.meshes ?? []) for (const p of m.primitives ?? []) {
    const a = p.attributes?.POSITION;
    const acc = a === undefined ? undefined : json.accessors?.[a];
    if (!acc?.min || !acc.max) continue;
    [0, 2].forEach((ax, i) => {
      lo[i] = Math.min(lo[i], acc.min![ax]);
      hi[i] = Math.max(hi[i], acc.max![ax]);
    });
  }
  const len = Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  return Number.isFinite(len) && len > 0 && lengthM > 0 ? lengthM / len : null;
}

export function scaleGlb(buf: Buffer, lengthM: number): Buffer {
  const k = realSizeFactor(buf, lengthM);
  if (!k) return buf;
  const { json, rest } = readGlb(buf) as { json: Gltf; rest: Buffer };
  json.nodes = json.nodes ?? [];
  const old = json.nodes.find((n) => n.name === "real-size");
  if (old) old.scale = [k, k, k];
  else
    for (const sc of json.scenes ?? []) {
      json.nodes.push({ name: "real-size", scale: [k, k, k], children: sc.nodes ?? [] });
      sc.nodes = [json.nodes.length - 1];
    }
  return writeGlb(json, rest);
}

/** 模型网格自己的长宽高（x / y / z，没算节点缩放和旋转）：只用来比例比对 */
export function glbSizeRaw(buf: Buffer): [number, number, number] {
  const { json } = readGlb(buf) as { json: Gltf & { accessors?: { min?: number[]; max?: number[] }[] } };
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const m of json.meshes ?? []) for (const p of m.primitives ?? []) {
    const a = p.attributes?.POSITION;
    const acc = a === undefined ? undefined : json.accessors?.[a];
    if (!acc?.min || !acc.max) continue;
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], acc.min[i]);
      hi[i] = Math.max(hi[i], acc.max[i]);
    }
  }
  return [0, 1, 2].map((i) => (Number.isFinite(hi[i] - lo[i]) ? hi[i] - lo[i] : 0)) as [number, number, number];
}
