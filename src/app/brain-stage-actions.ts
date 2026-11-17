"use server";

// 大脑一句话调这一镜的 3D：Kimi 只出“改哪个人偶 / 产品的哪一项”，程序校验后交给 3D 页预览，不自动保存
import { getShortVideo } from "@/lib/shorts-repo";
import { findLocalProject, getProduct } from "@/lib/repo";
import { getProductModel } from "@/lib/model-repo";
import { getRig } from "@/lib/product-rig-repo";
import { listDecisions, listRules, type SetLayout } from "@/lib/production-repo";
import { cleanFigures, FIGURE_POSES, KB002_RIG, RIDE_KINDS, rideKindOf, type FigureSpec } from "@/lib/figures";
import { blockingText } from "@/lib/shorts-blocking";
import { activeItems, findItemType, type SceneItem } from "@/lib/shorts-scenes";
import { BrainError, kimiChat, parseJson } from "@/lib/brain/kimi";
import { SKILLS } from "@/lib/brain/review";

export interface StageDraft {
  figures: FigureSpec[];
  bike?: [number, number];
  bikeYaw: number;
  items: SceneItem[];
  theme: string;
}
export interface StageProposal {
  summary: string;
  figures: FigureSpec[];
  bike?: [number, number];
  bikeYaw: number;
  changes: string[];
  cannot: string[];
  questions: string[];
  camera: string;
  /** 分镜文字要跟着改的建议（程序不改，用户手动改） */
  text: string[];
  usd: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const deg = (r: number) => (r * 180) / Math.PI;
const norm = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const strs = (x: unknown, n = 8) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, n).map((s) => s.trim().slice(0, 200)) : []);

/** 不挡路的物件：地面类、挂在墙上 / 高处的 */
const flat = (i: SceneItem) => i.h < 0.05 || i.z > 0.5 || ["floor", "rug", "path", "lawn", "window", "door", "stocking"].includes(i.type);
/** 点是否在物件占地里（含外扩 m 米） */
function inside(i: SceneItem, x: number, y: number, m: number): boolean {
  const a = (-i.yaw * Math.PI) / 180;
  const px = x - i.x;
  const py = y - i.y;
  const lx = px * Math.cos(a) - py * Math.sin(a);
  const ly = px * Math.sin(a) + py * Math.cos(a);
  return Math.abs(lx) <= i.w / 2 + m && Math.abs(ly) <= i.d / 2 + m;
}
const label = (i: SceneItem) => findItemType(i.type).label;

const SYSTEM = `你是产品短视频项目的“大脑”（AI 导演），现在帮用户摆这一镜的 3D 草图：人偶（灰色小人）放在哪、什么姿势、面朝哪，产品放在哪、车头朝哪。3D 是首帧的事实来源，摆错了画面就会错。

${SKILLS}

坐标：地图 x = 东、y = 北，单位米，地面 z = 0。朝向角：北 = 0°，东 = 90°，南 = 180°，西 = -90°（数值是这个人 / 车头面朝的方向）。
- 不骑车的人偶用 dx、dy 表示相对产品位置的偏移（米），yaw 是面朝方向。
- 骑在产品上：onProduct = true 且 pose = "ride"，位置和朝向跟着产品，手脚自动吸到产品接触点（dx、dy、yaw 写 0）。一辆车最多一个人骑；只有小孩能骑童车。
- 产品用 product.x、product.y（地图位置）和 product.heading（车头朝向角）。
- 可用姿势只有这些：${FIGURE_POSES.map((p) => `${p.id}(${p.label})`).join("、")}。要的姿势不在里面，就选最接近的，把具体动作写进 action，并在 cannot 里说明 3D 摆不出来的部分。
- action：一句简体中文大白话，写这个人在做什么，会进首帧提示词。
- 不能穿进家具：人偶中心离家具边至少 0.2 米。人和产品都要在场地里、摄影机拍得到的范围内（参考给出的“画面右边方向”和“朝向摄影机的角度”）。
- 人和人之间至少 0.4 米，没骑车的人离产品至少 0.35 米，不要挡住产品的正面和 Logo。
- 摄影机你不能动：如果要动，写进 camera（中文一句话，比如“摄影机降低到 0.9 米并拉近 0.5 米”）。
- 家具和装饰你不能动；需要动就写进 cannot。
- 分镜文字（画面、机位、产品状态等）你也不能改；如果改完 3D 后文字和 3D 对不上，把要怎么改写进 text。changes 只写你在 figures / product 里真的改了的东西。
- 用户没提到的人偶和产品保持原样（原样抄回原值）；用户说“其他细节你帮我调”时，你可以按这一镜的故事和技能卡调整没指定的细节，并在 changes 里写清楚。
- 拿不准、要用户拍板的写进 questions；不要编造。

只输出 JSON：{"summary":"一句话","figures":[{"id":"原有人偶沿用原 id，新增的写 new1、new2","kind":"adult|child","pose":"…","onProduct":false,"dx":0,"dy":0,"yaw":0,"action":"…"}],"product":{"x":0,"y":0,"heading":0},"camera":"","text":["分镜文字建议"],"changes":["每条一句中文：改了什么、为什么"],"cannot":["做不到的"],"questions":["要用户拍板的"]}
figures 是改完以后的完整人偶列表（删掉的人偶不写）。`;

/** 让大脑按一句话调这一镜的人偶和产品（Kimi 一次文字调用，不出图）；结果只用于预览 */
export async function brainStageAction(videoId: string, shotId: string, request: string, draft: StageDraft): Promise<{ error?: string; result?: StageProposal }> {
  try {
    const v = getShortVideo(videoId);
    if (!v || !findLocalProject(v.projectId)) throw new Error("短视频不存在");
    const s = v.shots.find((x) => x.id === shotId);
    if (!s) throw new Error("镜头不存在");
    if (s.stage !== "draft") throw new Error("这一镜已经确认构图，先在镜头里点「退回构图」");
    const ask = request.trim().slice(0, 500);
    if (ask.length < 2) throw new Error("先写一句要怎么调");
    const layout = s.layout;
    if (!layout) throw new Error("这一镜还没有 3D 摆位，先打开 3D 保存一次");
    const p = getProduct(v.projectId);
    const m = getProductModel(v.projectId);
    const savedRig = m ? getRig(m.id) : null;
    const rig = savedRig || KB002_RIG;
    const kind = RIDE_KINDS.find((k) => k.k === rideKindOf(p?.rideKind, p?.category))?.label ?? "";
    const cur: SetLayout = { ...layout, figures: draft.figures, figure: draft.figures.length > 0, bike: draft.bike, bikeYaw: draft.bikeYaw };
    const camYaw = deg(Math.atan2(layout.lookAt[0] - layout.camPos[0], layout.lookAt[1] - layout.camPos[1]));
    const bx = draft.bike?.[0] ?? 0;
    const by = draft.bike?.[1] ?? 0;
    const toCam = (x: number, y: number) => Math.round(deg(Math.atan2(layout.camPos[0] - x, layout.camPos[1] - y)));
    const items = activeItems(draft.items, draft.theme);
    const solid = items.filter((i) => !flat(i));
    const floor = items.find((i) => i.type === "floor" || i.type === "lawn" || i.type === "path");

    const shotNo = v.shots.indexOf(s) + 1;
    const text = [
      `## 产品\n${p ? `${p.name}（${p.category}）；产品类型：${kind}` : "（无）"}；接触点：${savedRig ? "已量过" : "没量过，骑车时手脚按估算放"}`,
      `## 项目规则\n${listRules(v.projectId).map((r) => `- [${r.level}] ${r.text}`).join("\n") || "（空）"}`,
      `## 用户定下的决定\n${listDecisions(v.projectId).map((d) => `- ${d.text}`).join("\n") || "（空）"}`,
      `## 整条分镜\n${v.shots.map((x, i) => `#${i + 1} [${x.stage}]${x.hook ? ` 开头「${x.hook.name}」` : ""} ${x.beat} | ${x.description.slice(0, 120)}`).join("\n")}`,
      `## 这一镜 #${shotNo}\n画面：${s.description}\n机位：${s.camera}\n产品状态：${s.productNote}\n特殊要求：${s.special || "无"}\n拍摄者：${s.operator || "站着拍"}`,
      `## 摄影机（你不能动）\n位置 ${layout.camPos.map(r2).join(", ")}，看向 ${layout.lookAt.map(r2).join(", ")}，焦段 ${layout.lens}mm。镜头朝向角 ${Math.round(camYaw)}°；画面右边 = 地图方向 ${Math.round(norm(camYaw + 90))}°，画面左边 = ${Math.round(norm(camYaw - 90))}°；人站在产品旁边要面向摄影机，朝向角约 ${toCam(bx, by)}°。`,
      `## 现在的 3D\n产品：${draft.bike ? `x ${r2(bx)}, y ${r2(by)}，车头朝向 ${Math.round(norm(draft.bikeYaw + 180))}°` : "这一镜没有产品"}\n人偶：${JSON.stringify(draft.figures.map((f) => ({ id: f.id, kind: f.kind, pose: f.pose, onProduct: f.onProduct, dx: r2(f.dx), dy: r2(f.dy), yaw: Math.round(f.yaw), action: f.action ?? "" })))}\n按摄影机算出的画面描述：${blockingText(cur, rig) || "（无）"}`,
      `## 场地里的家具（你不能动；x,y = 占地中心，w 沿朝向 0° 时的东西宽，d 南北深）\n${solid.map((i) => `${label(i)} x ${r2(i.x)} y ${r2(i.y)} w ${i.w} d ${i.d} h ${i.h} 转 ${i.yaw}°`).join("\n") || "（没有挡路的家具）"}${floor ? `\n可走动的地面：${label(floor)} 中心 x ${r2(floor.x)} y ${r2(floor.y)}，${floor.w}×${floor.d} 米` : ""}`,
      `## 用户这次说的话\n${ask}`,
    ].join("\n\n");

    const { message, usage } = await kimiChat({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: text },
      ],
      effort: "high",
      maxTokens: 16_000,
      json: true,
      timeoutMs: 300_000,
    });
    const d = (parseJson(message.content) ?? {}) as Record<string, unknown>;
    const cannot = strs(d.cannot);
    const changes = strs(d.changes, 12);

    // ---- 程序校验：大脑说什么都要过这一关 ----
    let bike = draft.bike;
    let bikeYaw = draft.bikeYaw;
    const pr = d.product as { x?: unknown; y?: unknown; heading?: unknown } | null | undefined;
    if (pr && draft.bike && typeof pr.x === "number" && typeof pr.y === "number") {
      let nx = Math.max(-15, Math.min(15, pr.x));
      let ny = Math.max(-15, Math.min(15, pr.y));
      const hit = solid.find((i) => inside(i, nx, ny, 0.3));
      if (hit) {
        cannot.push(`产品放到 (${r2(nx)}, ${r2(ny)}) 会压到${label(hit)}，产品位置没改`);
        nx = draft.bike[0];
        ny = draft.bike[1];
      }
      bike = [r2(nx), r2(ny)];
      if (typeof pr.heading === "number" && Number.isFinite(pr.heading)) bikeYaw = Math.round(norm(pr.heading - 180));
    }
    const old = new Map(draft.figures.map((f) => [f.id, f]));
    const raw = cleanFigures(d.figures) ?? draft.figures;
    let rider = false;
    const figures = raw.map((f, k): FigureSpec => {
      const n = `人偶${k + 1}（${f.kind === "adult" ? "大人" : "小孩"}）`;
      let g: FigureSpec = { ...f, custom: undefined, actionEn: undefined };
      if (g.pose === "ride" || g.onProduct) {
        const why = !bike ? "这一镜没有产品" : g.kind === "adult" ? "大人不能骑童车" : rider ? "一辆车只能一个人骑" : "";
        if (why) {
          cannot.push(`${n} 不能骑：${why}，改成站着`);
          g = { ...g, pose: "stand", onProduct: false, dx: g.dx || 0.6, dy: g.dy || -0.4 };
        } else {
          rider = true;
          g = { ...g, pose: "ride", onProduct: true, dx: 0, dy: 0, yaw: 0 };
        }
      }
      if (!g.onProduct) {
        g.dx = Math.max(-6, Math.min(6, g.dx));
        g.dy = Math.max(-6, Math.min(6, g.dy));
        const at = () => [(bike?.[0] ?? 0) + g.dx, (bike?.[1] ?? 0) + g.dy] as const;
        let hit = solid.find((i) => inside(i, ...at(), 0.2));
        if (hit) {
          const from = hit;
          // 沿着离开家具中心的方向挪，最多 2 米
          let [x, y] = at();
          const len = Math.hypot(x - from.x, y - from.y) || 1;
          const ux = (x - from.x) / len;
          const uy = (y - from.y) / len;
          for (let t = 0; t < 20 && hit; t++) {
            x += ux * 0.1;
            y += uy * 0.1;
            hit = solid.find((i) => inside(i, x, y, 0.2));
          }
          if (hit) {
            const o = old.get(g.id);
            cannot.push(`${n} 会穿进${label(from)}，位置没改`);
            if (o && !o.onProduct) g = { ...g, dx: o.dx, dy: o.dy };
          } else {
            changes.push(`${n} 原来会穿进${label(from)}，程序把它往外挪了一点`);
            g = { ...g, dx: r2(x - (bike?.[0] ?? 0)), dy: r2(y - (bike?.[1] ?? 0)) };
          }
        }
        if (bike && Math.hypot(g.dx, g.dy) < 0.35) changes.push(`${n} 离产品很近（${r2(Math.hypot(g.dx, g.dy))} 米），看一下有没有贴到车上`);
        g.dx = r2(g.dx);
        g.dy = r2(g.dy);
        g.yaw = Math.round(norm(g.yaw));
      }
      const o = old.get(g.id);
      if (o && o.pose === g.pose && o.onProduct === g.onProduct && o.kind === g.kind && o.custom) g.custom = o.custom;
      if (o && o.action === g.action && o.actionEn) g.actionEn = o.actionEn;
      return g;
    });
    if (!bike && draft.bike) bike = draft.bike;
    if (!savedRig && rider) cannot.push("产品还没量过接触点，骑车的手脚是估算位置，看一下手有没有握到车把");
    const pos = figures.filter((f) => !f.onProduct).map((f) => [f.dx, f.dy]);
    for (let a = 0; a < pos.length; a++)
      for (let b = a + 1; b < pos.length; b++)
        if (Math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1]) < 0.35) changes.push("有两个人站得很近，可能会叠在一起，看一下");

    return {
      result: {
        summary: typeof d.summary === "string" ? d.summary.slice(0, 200) : "",
        figures,
        bike,
        bikeYaw,
        changes,
        cannot,
        questions: strs(d.questions, 5),
        camera: typeof d.camera === "string" ? d.camera.slice(0, 200) : "",
        text: strs(d.text, 5),
        usd: usage.usd,
      },
    };
  } catch (e) {
    return { error: e instanceof BrainError || e instanceof Error ? e.message : "大脑调整失败" };
  }
}
