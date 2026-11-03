// 受保护合成（TASK-012b）：把 Blender 渲染的产品（透明背景，含接触阴影）放进 AI 空场景；
// AI 融合后再用产品遮罩把原始产品像素贴回，保证产品几何与 Logo 零变化。
import fs from "node:fs";
import sharp from "sharp";

export interface Placement {
  x: number; // 产品中心水平位置 0–1
  y: number; // 产品底部垂直位置 0–1
  scale: number; // 产品高度 / 画面高度
}

async function alphaBounds(png: string | Buffer): Promise<{ left: number; top: number; width: number; height: number; w: number; h: number }> {
  const img = sharp(png).ensureAlpha();
  const { width: w = 0, height: h = 0 } = await img.metadata();
  const alpha = await img.extractChannel("alpha").raw().toBuffer();
  let l = w, t = h, r = -1, b = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alpha[row + x] > 64) {
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
    }
  }
  if (r < 0) throw new Error("产品渲染为空（遮罩里没有像素）");
  return { left: l, top: t, width: r - l + 1, height: b - t + 1, w, h };
}

/**
 * 把产品渲染（带阴影）与产品遮罩按同一变换放到场景尺寸上；返回合成图与对齐后的遮罩。
 * reflection：同机位渲染的地面倒影层（黑底），按强度以 screen 方式叠在产品之下。
 */
export async function composeProduct(plate: Buffer, productPng: string, maskPng: string, place: Placement, reflection?: { file: string; strength: number }) {
  const meta = await sharp(plate).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const bb = await alphaBounds(maskPng);
  const s = (place.scale * H) / bb.height;
  const rw = Math.max(1, Math.round(bb.w * s));
  const rh = Math.max(1, Math.round(bb.h * s));
  // 产品包围盒中心 x → place.x * W；包围盒底部 → place.y * H
  const left = Math.round(place.x * W - (bb.left + bb.width / 2) * s);
  const top = Math.round(place.y * H - (bb.top + bb.height) * s);
  // 渲染画布可能比场景大或超出边界：只保留与场景相交的部分
  const cx0 = Math.max(0, left);
  const cy0 = Math.max(0, top);
  const cx1 = Math.min(W, left + rw);
  const cy1 = Math.min(H, top + rh);
  if (cx1 <= cx0 || cy1 <= cy0) throw new Error("产品完全在画面之外，请调整位置或比例");
  const crop = { left: cx0 - left, top: cy0 - top, width: cx1 - cx0, height: cy1 - cy0 };
  const resize = (file: string) => sharp(file).ensureAlpha().resize(rw, rh, { kernel: "lanczos3" }).extract(crop).png().toBuffer();
  const [product, mask] = await Promise.all([resize(productPng), resize(maskPng)]);
  const onCanvas = (layer: Buffer) =>
    sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: layer, left: cx0, top: cy0 }])
      .png()
      .toBuffer();
  const [productLayer, maskLayer] = await Promise.all([onCanvas(product), onCanvas(mask)]);
  let bg = sharp(plate).removeAlpha();
  if (reflection && reflection.strength > 0 && fs.existsSync(reflection.file)) {
    const refl = await sharp(reflection.file)
      .removeAlpha()
      .resize(rw, rh, { kernel: "lanczos3" })
      .extract(crop)
      .linear(reflection.strength, 0)
      .png()
      .toBuffer();
    const reflLayer = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: refl, left: cx0, top: cy0 }])
      .png()
      .toBuffer();
    bg = sharp(await bg.composite([{ input: reflLayer, blend: "screen" }]).png().toBuffer());
  }
  const composite = await bg.composite([{ input: productLayer }]).png().toBuffer();
  const maskGray = await sharp(maskLayer).extractChannel("alpha").png().toBuffer();
  return { composite, mask: maskGray, width: W, height: H, box: { left, top, width: rw, height: rh } };
}

// ---------- 接触镜头：AI 出完整画面 → 绿色遮罩定位 → CAD 对齐替换 ----------

/** 从「产品被涂成纯绿」的图里取产品遮罩（单通道 raw，场景尺寸） */
/** 绿 = 产品，红 = 座椅（用来判断车头朝向）。返回单通道遮罩 + 朝向 */
export async function greenMask(png: Buffer, width: number, height: number): Promise<Buffer & { facing?: "left" | "right" | null }> {
  const rgb = await sharp(png).resize(width, height, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const m = Buffer.alloc(width * height) as Buffer & { facing?: "left" | "right" | null };
  const xs: number[] = [], ys: number[] = [];
  const isGreen = (i: number) => { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; return g > 150 && r < 120 && b < 120 && g - Math.max(r, b) > 90; };
  const isRed = (i: number) => { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; return r > 200 && g < 70 && b < 70; };
  for (let i = 0; i < m.length; i++) if (isGreen(i)) { xs.push(i % width); ys.push(Math.floor(i / width)); }
  m.facing = null;
  if (xs.length < 50) return m;
  // 绿色主体的 2–98 百分位包围盒（外扩 15%）：只在里面接受绿 / 红像素，排除草地、夕阳等干扰
  const pct = (a: number[], q: number) => a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) * q)];
  const x0 = pct(xs, 0.02), x1 = pct(xs, 0.98), y0 = pct(ys, 0.02), y1 = pct(ys, 0.98);
  const px = (x1 - x0) * 0.15, py = (y1 - y0) * 0.15;
  let sx = 0, sn = 0, rx = 0, rn = 0;
  for (let i = 0; i < m.length; i++) {
    const x = i % width, y = Math.floor(i / width);
    if (x < x0 - px || x > x1 + px || y < y0 - py || y > y1 + py) continue;
    const g = isGreen(i), r = !g && isRed(i);
    if (!g && !r) continue;
    m[i] = 255; sx += x; sn++;
    if (r) { rx += x; rn++; }
  }
  if (rn > 30 && sn) m.facing = rx / rn > sx / sn ? "left" : "right";
  return m;
}

export interface MaskFit {
  scale: number; // CAD 渲染 → 场景像素的缩放
  left: number;
  top: number;
  iou: number;
  coverage: number; // 绿色区域被 CAD 覆盖的比例
}

/** 把 CAD 渲染的产品遮罩（相似变换：缩放 + 平移）对齐到绿色遮罩，最大化 IoU */
export async function fitMask(cadMaskPng: string, target: Buffer, W: number, H: number): Promise<MaskFit> {
  const bb = await alphaBounds(cadMaskPng);
  const step = Math.max(1, Math.round(bb.w / 160));
  const alpha = await sharp(cadMaskPng).ensureAlpha().extractChannel("alpha").raw().toBuffer();
  const pts: number[] = [];
  for (let y = 0; y < bb.height; y += step) for (let x = 0; x < bb.width; x += step) if (alpha[(bb.top + y) * bb.w + (bb.left + x)] > 64) pts.push(x, y);
  let tl = W, tt = H, tr = -1, tb = -1, tn = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (target[y * W + x] > 128) { tn++; if (x < tl) tl = x; if (x > tr) tr = x; if (y < tt) tt = y; if (y > tb) tb = y; }
  if (tn < 50) throw new Error("绿色遮罩为空：AI 没有把产品涂成绿色，请重试");
  const s0 = Math.sqrt(((tr - tl + 1) / bb.width) * ((tb - tt + 1) / bb.height));
  const cx = (tl + tr) / 2, cy = (tt + tb) / 2;
  const cadArea = pts.length * step * step;
  let best: MaskFit = { scale: s0, left: 0, top: 0, iou: -1, coverage: 0 };
  const evalFit = (s: number, dx: number, dy: number) => {
    const left = cx - (bb.left + bb.width / 2) * s + dx;
    const top = cy - (bb.top + bb.height / 2) * s + dy;
    let inter = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const x = Math.round(left + (bb.left + pts[i]) * s), y = Math.round(top + (bb.top + pts[i + 1]) * s);
      if (x >= 0 && y >= 0 && x < W && y < H && target[y * W + x] > 128) inter++;
    }
    const interPx = inter * step * step * s * s;
    const cadPx = cadArea * s * s;
    const iou = interPx / (cadPx + tn - interPx);
    if (iou > best.iou) best = { scale: s, left, top, iou, coverage: interPx / tn };
  };
  const span = Math.max(W, H);
  for (let s = s0 * 0.8; s <= s0 * 1.2; s += s0 * 0.025) for (let dx = -span * 0.04; dx <= span * 0.04; dx += span * 0.005) for (let dy = -span * 0.04; dy <= span * 0.04; dy += span * 0.005) evalFit(s, dx, dy);
  // 细化：在最优解附近用更小步长再搜一遍（以最优解的中心为基准）
  const coarse = best;
  const ccx = coarse.left + (bb.left + bb.width / 2) * coarse.scale, ccy = coarse.top + (bb.top + bb.height / 2) * coarse.scale;
  const evalFine = (s: number, dx: number, dy: number) => {
    const left = ccx - (bb.left + bb.width / 2) * s + dx, top = ccy - (bb.top + bb.height / 2) * s + dy;
    let inter = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const x = Math.round(left + (bb.left + pts[i]) * s), y = Math.round(top + (bb.top + pts[i + 1]) * s);
      if (x >= 0 && y >= 0 && x < W && y < H && target[y * W + x] > 128) inter++;
    }
    const interPx = inter * step * step * s * s, cadPx = cadArea * s * s;
    const iou = interPx / (cadPx + tn - interPx);
    if (iou > best.iou) best = { scale: s, left, top, iou, coverage: interPx / tn };
  };
  for (let s = coarse.scale * 0.96; s <= coarse.scale * 1.04; s += coarse.scale * 0.005) for (let dx = -span * 0.006; dx <= span * 0.006; dx += span * 0.001) for (let dy = -span * 0.006; dy <= span * 0.006; dy += span * 0.001) evalFine(s, dx, dy);
  return best;
}

/**
 * 用对齐后的 CAD 渲染替换 AI 画面里的产品：只在「绿色遮罩 ∩ CAD 遮罩」内替换（被手 / 腿遮挡的部分保留 AI），
 * tone 模式下光线低频取 AI、形状细节取 CAD。
 */
export async function replaceProduct(ai: Buffer, productPng: string, cadMaskPng: string, fit: MaskFit, green: Buffer, W: number, H: number, mode: ProtectMode = "tone") {
  const meta = await sharp(productPng).metadata();
  const rw = Math.max(1, Math.round((meta.width ?? 1) * fit.scale));
  const rh = Math.max(1, Math.round((meta.height ?? 1) * fit.scale));
  const left = Math.round(fit.left), top = Math.round(fit.top);
  const cx0 = Math.max(0, left), cy0 = Math.max(0, top), cx1 = Math.min(W, left + rw), cy1 = Math.min(H, top + rh);
  if (cx1 <= cx0 || cy1 <= cy0) throw new Error("对齐后的产品完全在画面外");
  const crop = { left: cx0 - left, top: cy0 - top, width: cx1 - cx0, height: cy1 - cy0 };
  const onCanvas = async (file: string, channels: 3 | 4) => {
    const layer = await sharp(file).ensureAlpha().resize(rw, rh, { kernel: "lanczos3" }).extract(crop).png().toBuffer();
    return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: layer, left: cx0, top: cy0 }]).raw().toBuffer().then((b) => (channels === 4 ? b : b));
  };
  const [prodRaw, maskRaw] = await Promise.all([onCanvas(productPng, 4), onCanvas(cadMaskPng, 4)]);
  const base = sharp(ai).resize(W, H, { fit: "fill" }).removeAlpha();
  const [a, aLow] = await Promise.all([base.clone().raw().toBuffer(), base.clone().blur(6).raw().toBuffer()]);
  // CAD 低频：把产品层铺在 AI 画面上后再模糊，避免透明区拉黑
  const flat = Buffer.from(a);
  for (let i = 0; i < W * H; i++) { const al = prodRaw[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) flat[i * 3 + c] = Math.round(a[i * 3 + c] * (1 - al) + prodRaw[i * 4 + c] * al); }
  const flatLow = await sharp(flat, { raw: { width: W, height: H, channels: 3 } }).blur(6).raw().toBuffer();
  // grade：整辆车用同一组通道增益（曝光 + 色温），由 AI 画的车和 CAD 车在重叠区域的平均亮度之比得出；CAD 像素的相对明暗和颜色不变
  const gain = [1, 1, 1];
  if (mode === "grade") {
    const sa = [0, 0, 0], sb = [0, 0, 0];
    for (let i = 0; i < W * H; i++) {
      if (maskRaw[i * 4 + 3] <= 128 || green[i] <= 128) continue;
      for (let c = 0; c < 3; c++) { sa[c] += a[i * 3 + c]; sb[c] += prodRaw[i * 4 + c]; }
    }
    const lum = (v: number[]) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    const exposure = Math.min(1.15, Math.max(0.55, lum(sa) / Math.max(1, lum(sb))));
    for (let c = 0; c < 3; c++) {
      const tint = sb[c] > 0 && sa[c] > 0 ? (sa[c] / lum(sa)) / (sb[c] / lum(sb)) : 1;
      gain[c] = exposure * Math.min(1.12, Math.max(0.88, tint));
    }
  }
  const out = Buffer.from(a);
  let replaced = 0;
  for (let i = 0; i < W * H; i++) {
    const al = prodRaw[i * 4 + 3] / 255;
    if (al <= 0 || green[i] <= 128) continue;
    for (let c = 0; c < 3; c++) {
      const j = i * 3 + c;
      const cad = prodRaw[i * 4 + c];
      const v = mode === "tone" ? Math.max(0, Math.min(255, aLow[j] + (cad - flatLow[j]))) : Math.min(255, cad * gain[c]);
      out[j] = Math.round(a[j] * (1 - al) + v * al);
    }
    replaced++;
  }
  const final = await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  return { final, replacedPixels: replaced, gain };
}

/** 对齐后的 CAD 产品遮罩铺到场景画布（单通道 raw，0/255） */
export async function placedMask(cadMaskPng: string, fit: MaskFit, W: number, H: number): Promise<Buffer> {
  const meta = await sharp(cadMaskPng).metadata();
  const rw = Math.max(1, Math.round((meta.width ?? 1) * fit.scale));
  const rh = Math.max(1, Math.round((meta.height ?? 1) * fit.scale));
  const left = Math.round(fit.left), top = Math.round(fit.top);
  const cx0 = Math.max(0, left), cy0 = Math.max(0, top), cx1 = Math.min(W, left + rw), cy1 = Math.min(H, top + rh);
  const out = Buffer.alloc(W * H);
  if (cx1 <= cx0 || cy1 <= cy0) return out;
  const a = await sharp(cadMaskPng).ensureAlpha().resize(rw, rh).extractChannel("alpha").extract({ left: cx0 - left, top: cy0 - top, width: cx1 - cx0, height: cy1 - cy0 }).raw().toBuffer();
  const w = cx1 - cx0;
  for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) out[y * W + x] = a[(y - cy0) * w + (x - cx0)] > 128 ? 255 : 0;
  return out;
}

/**
 * 残影区域：AI 画的产品（绿色遮罩）里没被 CAD 产品盖住的部分，外扩几像素。
 * 返回 raw 遮罩和「残影涂成品红 #FF00FF」的图（交给 AI 补背景）。
 */
export async function ghostRegion(ai: Buffer, green: Buffer, cadPlaced: Buffer, W: number, H: number, grow = 6) {
  const ghost = Buffer.alloc(W * H);
  for (let i = 0; i < ghost.length; i++) if (green[i] > 128 && cadPlaced[i] <= 128) ghost[i] = 255;
  // 外扩 grow 像素（可分离的方形最大值滤波），但不进入 CAD 产品区域
  const tmp = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) {
    let last = -1e9;
    for (let x = 0; x < W; x++) if (ghost[y * W + x]) last = x; else if (x - last <= grow) tmp[y * W + x] = 255;
    last = 1e9;
    for (let x = W - 1; x >= 0; x--) if (ghost[y * W + x]) { last = x; tmp[y * W + x] = 255; } else if (last - x <= grow) tmp[y * W + x] = 255;
  }
  const grown = Buffer.alloc(W * H);
  for (let x = 0; x < W; x++) {
    let last = -1e9;
    for (let y = 0; y < H; y++) if (tmp[y * W + x]) { last = y; grown[y * W + x] = 255; } else if (y - last <= grow) grown[y * W + x] = 255;
    last = 1e9;
    for (let y = H - 1; y >= 0; y--) if (tmp[y * W + x]) last = y; else if (last - y <= grow) grown[y * W + x] = 255;
  }
  let n = 0;
  for (let i = 0; i < grown.length; i++) { if (cadPlaced[i] > 128) grown[i] = 0; if (grown[i] > 128) n++; }
  const rgb = await sharp(ai).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  for (let i = 0; i < grown.length; i++) if (grown[i] > 128) { rgb[i * 3] = 255; rgb[i * 3 + 1] = 0; rgb[i * 3 + 2] = 255; }
  const painted = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  return { mask: grown, painted, pixels: n };
}

export type ProtectMode = "pixel" | "tone" | "grade";

/**
 * 把产品贴回 AI 融合结果，返回最终图与 AI 在产品区域试图改动的平均差异（0–255）。
 * - pixel：产品区域逐像素用合成图（渲染）覆盖，连光线也不变。
 * - tone：产品的形状 / 细节 / Logo（高频）来自渲染，光线 / 色温 / 曝光（低频）来自 AI 融合结果；几何同样不会变。
 */
export async function protectProduct(harmonized: Buffer, composite: Buffer, maskGray: Buffer, width: number, height: number, mode: ProtectMode = "tone") {
  const raw = (img: sharp.Sharp) => img.raw().toBuffer();
  const base = sharp(harmonized).resize(width, height, { fit: "fill" }).removeAlpha();
  const comp = sharp(composite).removeAlpha();
  const [a, b, m, aLow, bLow, mSoft] = await Promise.all([
    raw(base.clone()),
    raw(comp.clone()),
    raw(sharp(maskGray).toColourspace("b-w")),
    raw(base.clone().blur(6)),
    raw(comp.clone().blur(6)),
    raw(sharp(maskGray).toColourspace("b-w").blur(0.8)),
  ]);
  const out = Buffer.from(a);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < m.length; i++) {
    const w = mSoft[i] / 255;
    if (w <= 0) continue;
    for (let c = 0; c < 3; c++) {
      const j = i * 3 + c;
      const product = mode === "tone" ? Math.max(0, Math.min(255, aLow[j] + (b[j] - bLow[j]))) : b[j];
      out[j] = Math.round(a[j] * (1 - w) + product * w);
    }
    if (m[i] > 128) {
      sum += Math.abs(a[i * 3] - b[i * 3]) + Math.abs(a[i * 3 + 1] - b[i * 3 + 1]) + Math.abs(a[i * 3 + 2] - b[i * 3 + 2]);
      n++;
    }
  }
  const final = await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return { final, aiDrift: n ? sum / (3 * n) : 0, protectedPixels: n };
}
