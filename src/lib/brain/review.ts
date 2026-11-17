// 大脑小测：读整条短视频 + 一镜的 3D / 文字 / 首帧，按技能规则给判断。只给建议，不改数据、不花生成费。
import "server-only";
import fs from "node:fs";
import sharp from "sharp";
import { brainShotInputs } from "@/app/short-actions";
import { getShortVideo } from "@/lib/shorts-repo";
import { findTemplate } from "@/lib/shorts";
import { listDecisions, listRules } from "@/lib/production-repo";
import { BRAIN_MODEL, kimiChat, parseJson, type KimiPart, type KimiUsage } from "@/lib/brain/kimi";

/** 先把散在代码里的规则写成几张技能卡；以后挪进技能库（可看、可改、有版本） */
const SKILLS = `
【技能：TikTok 随手拍】画面要像家长用手机随手拍的 TikTok/UGC：普通手持构图、轻微抖动、普通光线、生活里的杂乱，不要电影感、不要摆拍感、不要 AI 味。镜头之间要有关联，但不要求动作严格接上一镜：跳剪、换角度、反应镜头、时间跳跃、换家庭换场地都可以；产品、品牌、相关配件在需要时保持一致。
【技能：拍摄者】拍摄者永远不露脸。先定拍摄者姿态（站 / 蹲 / 坐地），露出身体的哪部分由机位高度、俯角、焦段算出来，拍不到的部位不能写进画面。“空着的手入镜”要写明哪只手、从哪个角进来、做什么动作（动作必填）。影子单独控制。
【技能：3D 为准】每镜的“3D 摆位描述”是从已保存 3D 算出来的事实（产品位置/朝向/姿态、每个人的位置/姿态/朝向、画面人数、机位）。手写的画面、机位、产品状态、首帧提示词、运动提示词是创意层，只管服装、情绪、光线、细节；和 3D 冲突的句子要指出来并给出改法。场地/主题也以本镜选的场地为准。
【技能：平衡车品类】产品几何、比例、颜色、Logo 位置不能改；两个轮子着地（除非 3D 姿态是抬起/侧倒）；骑行时手握把手、屁股在座椅上、脚踩地或抬起；孩子年龄和体型要配得上产品尺寸；建议戴头盔，户外有大人看护更安全；不要危险动作。
【硬规则】花钱的步骤（首帧 $0.10、视频按秒计费）必须用户在审批框点批准；已采用的镜头不改；你只能提建议和问题，不能自己执行。
`.trim();

const SYSTEM = `你是产品短视频项目的“大脑”（AI 导演）。你要统领整条视频：看产品资料、整条分镜、这一镜的 3D 事实、手写文字、最终发给生成模型的提示词、图片，以及以前的生成和返工记录，按下面的技能卡判断，然后用简体中文给用户清楚、具体、可执行的结论。
${SKILLS}

图片说明会写在每张图前面。判断时：
- 有首帧：逐项对照 3D 构图和事实（人数、每个人的位置和姿态、产品形状/朝向/姿态、拍摄者露出部分、场地、像不像 TikTok 随手拍），给出“首帧通过”还是“重做”，重做要写清楚原因和具体改法。
- 没有首帧：检查文字和 3D 是否一致、这一镜在整条视频里是否合理、是否可以确认构图，把要用户拍板的事写成问题。
- 不要编造看不到的东西；拿不准的写进 questions。

只输出一个 JSON 对象：
{"summary":"一句话结论","verdict":"frame_pass|frame_redo|ready_to_confirm|fix_text_first|needs_user_decision","findings":[{"level":"blocker|warn|ok","area":"人数/产品/拍摄者/场地/文字/连续性/安全/风格…","what":"看到了什么","evidence":"依据（引用 3D 事实或文字原句）","fix":"建议怎么改"}],"text_edits":[{"field":"description|camera|productNote|framePrompt|motionPrompt","old":"原句","new":"建议改成"}],"questions":["需要用户拍板的问题"],"next_step":"建议的下一步（花钱的要写价格并说明需要批准）"}`;

const jpeg = async (file: string) =>
  `data:image/jpeg;base64,${(await sharp(fs.readFileSync(file)).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer()).toString("base64")}`;

export async function reviewShot(videoId: string, shotNo: number): Promise<{ model: string; result: unknown; usage: KimiUsage; images: string[] }> {
  const v = getShortVideo(videoId);
  if (!v) throw new Error("短视频不存在");
  const s = v.shots[shotNo - 1];
  if (!s) throw new Error(`没有 #${shotNo}`);
  const inp = await brainShotInputs(videoId, s.id);
  const t = findTemplate(v.templateId);
  const concept = v.concepts.find((c) => c.id === v.conceptId);

  const overview = v.shots
    .map((x, i) => `#${i + 1} [${x.stage}] ${x.beat} | 场地 ${x.scene ? `${x.scene.id} v${x.scene.v} 主题 ${x.scene.theme}` : v.room} | 家庭 ${x.family ?? 1} | ${x.description.slice(0, 120)}`)
    .join("\n");
  const shotText = [
    `阶段：${s.stage}`,
    `画面：${s.description}`,
    `机位：${s.camera}`,
    `产品状态：${s.productNote}`,
    `拍摄者设置：${s.operator || "（空 = 站着）"}`,
    `特殊要求：${s.special || "无"}`,
    `首帧提示词（手写）：${s.framePrompt}`,
    `运动提示词（手写）：${s.motionPrompt}`,
    s.issues?.length ? `以前返工记下的问题：${s.issues.map((x) => `${x.text}（${x.status}）`).join("；")}` : "",
    inp.jobs.length ? `生成记录：${inp.jobs.map((j) => `${j.kind} ${j.status} $${j.usd} 原因：${j.reason || "—"}`).join("；")}` : "生成记录：无",
  ]
    .filter(Boolean)
    .join("\n");

  const rules = listRules(v.projectId);
  const decisions = listDecisions(v.projectId);
  const parts: KimiPart[] = [
    {
      type: "text",
      text: [
        `## 产品\n${inp.product}`,
        `## 项目规则库（must = 必须遵守，warn = 要检查）\n${rules.map((r) => `- [${r.level}·${r.layer}] ${r.text}${r.source ? `（来源：${r.source}）` : ""}`).join("\n") || "（空）"}`,
        `## 用户定下的决定\n${decisions.map((d) => `- ${d.text}${d.context ? `（${d.context}）` : ""}`).join("\n") || "（空）"}`,
        `## 这条短视频\n标题：${v.title}；模板：${t.label}；${concept ? `创意：${JSON.stringify(concept).slice(0, 800)}` : ""}\n简介：${v.brief}`,
        `## 整条分镜\n${overview}`,
        `## 要检查的是 #${shotNo}\n${shotText}`,
        `## #${shotNo} 的 3D 摆位描述（事实）\n${inp.blocking || "（还没保存 3D）"}`,
        `## #${shotNo} 最终发给首帧模型的提示词\n${inp.framePrompt}`,
      ].join("\n\n"),
    },
  ];
  const images: string[] = [];
  const add = async (label: string, file: string | null) => {
    if (!file) return;
    parts.push({ type: "text", text: label }, { type: "image_url", image_url: { url: await jpeg(file) } });
    images.push(label);
  };
  await add("图：产品实物参考照（产品必须长这样）", inp.refs[0] ?? null);
  await add("图：按本镜机位渲染的产品角度参考", inp.angle);
  await add(`图：#${shotNo} 已保存的 3D 构图（灰色人偶 = 人的位置和姿态）`, inp.comp);
  await add(`图：#${shotNo} 当前首帧（要检查的生成结果）`, inp.frame);
  parts.push({ type: "text", text: `请检查 #${shotNo}，只输出 JSON。` });

  const { message, usage } = await kimiChat({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: parts },
    ],
    effort: "high",
    maxTokens: 24_000,
    json: true,
  });
  return { model: BRAIN_MODEL, result: parseJson(message.content), usage, images };
}
