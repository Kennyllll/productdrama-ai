// 3D 布景先行的合成：AI 写实图 + Blender 真车像素。
// 1) 去重影：AI 重画的车和真车不完全重合，露在真车轮廓外 / 轮辐空洞里的 AI 车，用「同布景、车不可见但保留车影」的底图（按 AI 色调匹配）填掉
// 2) 真车按 mask 贴回，AI 的低频光影按比例迁移到真车上（只在车的 mask 内取样，深色件限制增益，避免轮胎发灰）
import sharp from "sharp";

const raw1 = (w: number, h: number) => ({ raw: { width: w, height: h, channels: 1 as const } });
const raw3 = (w: number, h: number) => ({ raw: { width: w, height: h, channels: 3 as const } });

async function blur1(x: Buffer, w: number, h: number, s: number): Promise<Buffer> {
  return sharp(x, raw1(w, h)).blur(Math.max(0.3, s)).extractChannel(0).raw().toBuffer();
}
async function blur3(x: Buffer, w: number, h: number, s: number): Promise<Buffer> {
  return sharp(x, raw3(w, h)).blur(Math.max(0.3, s)).raw().toBuffer();
}
/** 近似圆形膨胀 / 腐蚀（模糊 + 阈值） */
async function dilate(x: Buffer, w: number, h: number, r: number): Promise<Buffer> {
  const b = await blur1(x, w, h, r / 2);
  const o = Buffer.alloc(w * h);
  for (let i = 0; i < o.length; i++) o[i] = b[i] > 6 ? 255 : 0;
  return o;
}
async function erode(x: Buffer, w: number, h: number, r: number): Promise<Buffer> {
  const inv = Buffer.alloc(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = 255 - x[i];
  const d = await dilate(inv, w, h, r);
  for (let i = 0; i < d.length; i++) d[i] = 255 - d[i];
  return d;
}
/** 填满被包围的空洞（从边框泛洪，没被泛洪到的背景就是洞） */
function fillHoles(x: Buffer, w: number, h: number): Buffer {
  const seen = new Uint8Array(w * h);
  const st: number[] = [];
  const push = (i: number) => {
    if (!seen[i] && x[i] === 0) { seen[i] = 1; st.push(i); }
  };
  for (let X = 0; X < w; X++) { push(X); push((h - 1) * w + X); }
  for (let Y = 0; Y < h; Y++) { push(Y * w); push(Y * w + w - 1); }
  while (st.length) {
    const i = st.pop()!, X = i % w;
    if (X > 0) push(i - 1);
    if (X < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  const o = Buffer.alloc(w * h);
  for (let i = 0; i < o.length; i++) o[i] = seen[i] ? 0 : 255;
  return o;
}

async function rgb8(input: Buffer | string, w: number, h: number): Promise<Buffer> {
  return sharp(input).resize(w, h, { fit: "fill" }).removeAlpha().toColourspace("srgb").raw({ depth: "uchar" }).toBuffer();
}

export async function composeSetFirst(o: { ai: Buffer; cad: string; plate: string; mask: string; deghost?: boolean; occluder?: string; ghostReach?: number }): Promise<{ image: Buffer; ghostPx: number; box: { x0: number; y0: number; x1: number; y1: number } }> {
  const meta = await sharp(o.cad).metadata();
  const W = meta.width ?? 0, H = meta.height ?? 0, N = W * H;
  if (!W || !H) throw new Error("Blender 布景渲染图无效");
  const [ai, cad, plate, mRaw] = await Promise.all([
    rgb8(o.ai, W, H),
    rgb8(o.cad, W, H),
    rgb8(o.plate, W, H),
    sharp(o.mask).ensureAlpha().extractChannel(3).raw({ depth: "uchar" }).toBuffer(),
  ]);
  // 人偶轮廓：车的 mask 已经按 3D 遮挡扣掉了人在车前面的部分；这里只保证人（腿、手）不被当成 AI 车的重影填掉
  const occ = o.occluder
    ? await sharp(o.occluder).resize(W, H, { fit: "fill" }).ensureAlpha().extractChannel(3).raw({ depth: "uchar" }).toBuffer()
    : Buffer.alloc(N);
  const mb = Buffer.alloc(N);
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let i = 0; i < N; i++)
    if (mRaw[i] > 128) {
      mb[i] = 255;
      const x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  if (x1 <= x0) throw new Error("布景渲染里没有车");

  // AI 车可能出现的范围：真车轮廓闭合、填洞（轮辐空洞、车架三角）后再外扩。
  // 主流程给 AI 的是无车底图，AI 不应画车；这里只兜底去掉贴着真车边缘的少量残影
  const r45 = Math.round(W * 0.017);
  const solid = fillHoles(await erode(await dilate(mb, W, H, r45), W, H, r45), W, H);
  for (let i = 0; i < N; i++) if (mb[i]) solid[i] = 255;
  const reg = await dilate(solid, W, H, W * (o.ghostReach ?? 0.008));

  // 底图按 AI 色调匹配：用车附近以外的像素算低频比例，两个尺度，车内部用大尺度
  const keep = await dilate(solid, W, H, W * 0.004);
  const w3 = Buffer.alloc(N * 3), aiW = Buffer.alloc(N * 3), plW = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++)
    if (!keep[i]) for (let c = 0; c < 3; c++) { w3[i * 3 + c] = 255; aiW[i * 3 + c] = ai[i * 3 + c]; plW[i * 3 + c] = plate[i * 3 + c]; }
  const sig = W * 0.006;
  const [wb, ab, pb, , ab2, pb2, aiLo] = await Promise.all([
    blur3(w3, W, H, sig), blur3(aiW, W, H, sig), blur3(plW, W, H, sig),
    blur3(w3, W, H, sig * 6), blur3(aiW, W, H, sig * 6), blur3(plW, W, H, sig * 6),
    blur3(ai, W, H, 1.5),
  ]);
  const pm = Buffer.alloc(N * 3), pf = Buffer.alloc(N * 3), rt = new Float32Array(N * 3);
  for (let j = 0; j < N * 3; j++) {
    const r1 = (ab[j] + 2) / (pb[j] + 2), r2 = (ab2[j] + 2) / (pb2[j] + 2);
    const k = Math.min(1, wb[j] / 255 / 0.15);
    const ratio = wb[j] > 3 ? r1 * k + r2 * (1 - k) : r2;
    rt[j] = r2;
    // pm 带 AI 的细节，只用来判断哪里是 AI 车；pf 不带 AI 细节，用来填（否则 AI 车的边缘会跟着填进去，又成重影）
    pf[j] = Math.max(0, Math.min(255, Math.round(plate[j] * ratio)));
    pm[j] = Math.max(0, Math.min(255, Math.round(plate[j] * ratio + 0.6 * (ai[j] - aiLo[j]))));
  }
  // 只替换「AI 那里明显不是背景」的像素（露出来的 AI 车），其余保留 AI 原貌
  const d = Buffer.alloc(N);
  for (let i = 0; i < N; i++) d[i] = Math.min(255, (Math.abs(ai[i * 3] - pm[i * 3]) + Math.abs(ai[i * 3 + 1] - pm[i * 3 + 1]) + Math.abs(ai[i * 3 + 2] - pm[i * 3 + 2])) / 3);
  const db = await blur1(d, W, H, 2);
  let ghost: Buffer = Buffer.alloc(N);
  // AI 只看无车底图时不该有重影；AI 改了墙面 / 影子时这里的差异是布景差异，用 CG 底图填反而出彩虹色斑和半透明轮影
  if (o.deghost !== false) for (let i = 0; i < N; i++) ghost[i] = reg[i] && !mb[i] && db[i] > 28 ? 255 : 0;
  ghost = await dilate(ghost, W, H, 4);
  let ghostPx = 0;
  const occD = await dilate(occ, W, H, 3);
  for (let i = 0; i < N; i++) if (mb[i] || occD[i]) ghost[i] = 0; else if (ghost[i]) ghostPx++;
  const gf = await blur1(ghost, W, H, 1.5);

  // 真车光影：用车周围环境的「AI / Blender 底图」低频比例（只在车外取样），
  // 不用 AI 车自己的像素：AI 车和真车错位时，会把 AI 车的座椅 / 轮子形状「打光」到真车上
  const alpha = await blur1(mRaw, W, H, 1.2);
  const out = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) {
    const a = alpha[i] / 255, f = gf[i] / 255;
    const lum = (cad[i * 3] + cad[i * 3 + 1] + cad[i * 3 + 2]) / 3;
    const gMax = lum < 50 ? 1.3 + (lum / 50) * 1.2 : 2.5;
    for (let c = 0; c < 3; c++) {
      const j = i * 3 + c;
      const bg = ai[j] * (1 - f) + pf[j] * f;
      let v = bg;
      if (a > 0) {
        const g = Math.max(0.35, Math.min(gMax, rt[j]));
        v = Math.min(255, cad[j] * g) * a + bg * (1 - a);
      }
      out[j] = Math.round(v);
    }
  }
  const image = await sharp(out, raw3(W, H)).png().toBuffer();
  return { image, ghostPx, box: { x0: x0 / W, y0: y0 / H, x1: x1 / W, y1: y1 / H } };
}
