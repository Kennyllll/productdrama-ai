// 创意与剧本的本地规则（TASK-003）：模板生成、剧本骨架、校验与检查。纯函数，服务端和客户端共用，不调用 AI。
import { beatTypeLabel, filmStyles, productRoles, themeLibrary } from "@/lib/mock/demo";
import type { Beat, EpisodeNumber, LocalCreative, LocalProposal, LocalScene, LocalScript, ScriptEpisode, StoryCore } from "@/lib/types";

export const EPISODE_SECONDS = 45;
/** 中文口播约 4 字 / 秒 */
export const CHARS_PER_SECOND = 4;

export const newId = () => Math.random().toString(36).slice(2, 10);

export const emptyStoryCore: StoryCore = { audience: "", protagonist: "", want: "", need: "", stakes: "", truth: "", productBridge: "", styleNote: "" };

export const STORY_CORE_FIELDS: { key: Exclude<keyof StoryCore, "styleNote">; label: string; placeholder: string }[] = [
  { key: "audience", label: "观众与情感痛点", placeholder: "谁会看、他们心里真正在意什么。例：第一次放手让孩子独立的父母，骄傲又舍不得" },
  { key: "protagonist", label: "主角（具体的人）", placeholder: "名字、年龄、一个只属于他的细节或心结。例：Leo，7 岁，口袋里总装着妈妈留下的旧手电筒" },
  { key: "want", label: "主角想要什么（外在目标）", placeholder: "看得见的目标。例：一个人滑到街角的面包店" },
  { key: "need", label: "主角真正需要什么（内在成长）", placeholder: "他自己没意识到的成长。例：相信没有爸爸牵着，自己也可以" },
  { key: "stakes", label: "失败会失去什么", placeholder: "真实的代价。例：错过和爸爸约好的最后一个夏天" },
  { key: "truth", label: "想让观众记住的一句话", placeholder: "例：放手，是另一种陪伴" },
  { key: "productBridge", label: "产品如何成为情感桥梁", placeholder: "产品在哪个关键时刻帮人物跨过情感难关，而不是展示功能" },
];

export const emptyCreative: LocalCreative = {
  themeIds: [],
  freeText: "",
  styleId: filmStyles[0].id,
  roleId: productRoles[0].id,
  proposals: [],
  selectedProposalId: null,
  storyCore: emptyStoryCore,
};

const labelOf = (list: { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id;

export function buildProposals(c: Pick<LocalCreative, "themeIds" | "freeText" | "styleId" | "roleId">, productName: string): LocalProposal[] {
  const product = productName.trim() || "产品";
  const role = labelOf(productRoles, c.roleId);
  const film = filmStyles.find((f) => f.id === c.styleId)?.film;
  const themes = c.themeIds.map((id) => labelOf(themeLibrary, id)).join("、") || "未指定主题";
  const tail = `${film ? `视觉参考《${film}》。` : ""}${c.freeText.trim() ? `创意要点：${c.freeText.trim()}` : ""}`;
  return [
    {
      id: newId(),
      direction: "旅程型",
      title: `${product}：未知的旅程`,
      logline: `主角带着${product}踏上一段关于${themes}的旅程，${product}作为「${role}」在关键时刻改变了局面。${tail}`,
      episodeArcs: ["启程", "阻碍", "抉择", "归来"],
    },
    {
      id: newId(),
      direction: "挑战型",
      title: `${product}：第一次挑战`,
      logline: `一个想证明自己的主角面对一次挑战（${themes}），${product}以「${role}」的身份陪他从挫败走向突破。${tail}`,
      episodeArcs: ["目标", "挫败", "转机", "突破"],
    },
    {
      id: newId(),
      direction: "情感型",
      title: `${product}：留下的记忆`,
      logline: `两个人之间有一个未解开的心结（${themes}），${product}以「${role}」的身份串起四个瞬间，让他们重新靠近。${tail}`,
      episodeArcs: ["疏离", "相遇", "误会", "和解"],
    },
  ];
}

const BEAT_TEMPLATE: [Beat["type"], number, number, Beat["intensity"]][] = [
  ["hook", 0, 12, 2],
  ["conflict", 12, 24, 3],
  ["turn", 24, 38, 4],
  ["cliffhanger", 38, 45, 4],
];

export const emptyScene = (): LocalScene => ({ id: newId(), heading: "", summary: "", lines: [] });

export function buildSkeleton(p: LocalProposal): LocalScript {
  return {
    proposalId: p.id,
    episodes: p.episodeArcs.map((arc, i) => ({
      number: (i + 1) as EpisodeNumber,
      title: arc,
      synopsis: i === 0 ? p.logline : "",
      beats: BEAT_TEMPLATE.map(([type, startSec, endSec, intensity]) => ({
        type: i === 3 && type === "cliffhanger" ? "resolution" : type,
        startSec,
        endSec,
        description: "",
        intensity,
      })),
      scenes: [emptyScene()],
    })),
  };
}

/** 英文台词约 2.5 词 / 秒 */
export const WORDS_PER_SECOND = 2.5;

export function dialogueSeconds(ep: ScriptEpisode): number {
  const seconds = ep.scenes
    .flatMap((s) => s.lines)
    .reduce((n, l) => {
      const t = l.text.trim();
      if (!t) return n;
      if (/[\u4e00-\u9fff]/.test(t)) return n + t.replace(/\s/g, "").length / CHARS_PER_SECOND;
      return n + t.split(/\s+/).length / WORDS_PER_SECOND;
    }, 0);
  return Math.round(seconds);
}

export function checkEpisode(ep: ScriptEpisode): string[] {
  const warnings: string[] = [];
  const beats = [...ep.beats].sort((a, b) => a.startSec - b.startSec);
  if (beats.length === 0) warnings.push("没有节拍");
  else {
    if (beats[0].startSec !== 0) warnings.push("第一个节拍应从 0 秒开始");
    if (beats[beats.length - 1].endSec !== EPISODE_SECONDS) warnings.push(`最后一个节拍应在 ${EPISODE_SECONDS} 秒结束`);
    beats.forEach((b, i) => {
      const label = beatTypeLabel[b.type];
      if (b.endSec <= b.startSec) warnings.push(`${label}：结束时间需晚于开始时间`);
      if (i > 0 && b.startSec !== beats[i - 1].endSec) {
        warnings.push(`${beatTypeLabel[beats[i - 1].type]}与${label}之间${b.startSec > beats[i - 1].endSec ? "有空档" : "时间重叠"}`);
      }
      if (!b.description.trim()) warnings.push(`${label}：还没有描述`);
    });
  }
  if (ep.scenes.length === 0) warnings.push("还没有场景");
  ep.scenes.forEach((s, i) => {
    if (!s.heading.trim()) warnings.push(`场景 ${i + 1}：缺少场景标题`);
  });
  const ds = dialogueSeconds(ep);
  if (ds > EPISODE_SECONDS / 2) warnings.push(`台词约 ${ds} 秒，超过本集时长一半，台词偏多，建议用画面表达`);
  return warnings;
}

// ---- 服务端保存前的数据清洗：只保留已知字段并限制长度 ----

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

export function sanitizeCreative(input: unknown): LocalCreative {
  const o = obj(input);
  const proposals: LocalProposal[] = arr(o.proposals)
    .slice(0, 3)
    .map((p) => {
      const q = obj(p);
      const arcs = arr(q.episodeArcs);
      return {
        id: str(q.id, 40) || newId(),
        direction: str(q.direction, 20),
        title: str(q.title, 100),
        logline: str(q.logline, 1000),
        episodeArcs: [str(arcs[0], 120), str(arcs[1], 120), str(arcs[2], 120), str(arcs[3], 120)],
        source: (q.source === "ai" ? "ai" : "template") as LocalProposal["source"],
      };
    });
  const selected = str(o.selectedProposalId, 40);
  const styleId = str(o.styleId, 40);
  const roleId = str(o.roleId, 40);
  return {
    themeIds: arr(o.themeIds).filter((id): id is string => typeof id === "string" && themeLibrary.some((t) => t.id === id)),
    freeText: str(o.freeText, 1000),
    styleId: filmStyles.some((f) => f.id === styleId) ? styleId : emptyCreative.styleId,
    roleId: productRoles.some((r) => r.id === roleId) ? roleId : emptyCreative.roleId,
    proposals,
    selectedProposalId: proposals.some((p) => p.id === selected) ? selected : null,
    storyCore: (() => {
      const sc = obj(o.storyCore);
      return {
        audience: str(sc.audience, 500),
        protagonist: str(sc.protagonist, 500),
        want: str(sc.want, 500),
        need: str(sc.need, 500),
        stakes: str(sc.stakes, 500),
        truth: str(sc.truth, 500),
        productBridge: str(sc.productBridge, 500),
        styleNote: str(sc.styleNote, 800),
      };
    })(),
  };
}

const BEAT_TYPES = Object.keys(beatTypeLabel) as Beat["type"][];

export function sanitizeScript(input: unknown): LocalScript {
  const o = obj(input);
  const eps = arr(o.episodes);
  return {
    proposalId: str(o.proposalId, 40),
    episodes: [0, 1, 2, 3].map((i) => {
      const e = obj(eps[i]);
      return {
        number: (i + 1) as EpisodeNumber,
        title: str(e.title, 100),
        synopsis: str(e.synopsis, 1000),
        beats: arr(e.beats)
          .slice(0, 8)
          .map((b) => {
            const x = obj(b);
            return {
              type: BEAT_TYPES.includes(x.type as Beat["type"]) ? (x.type as Beat["type"]) : "hook",
              startSec: int(x.startSec, 0, EPISODE_SECONDS, 0),
              endSec: int(x.endSec, 0, EPISODE_SECONDS, EPISODE_SECONDS),
              description: str(x.description, 500),
              intensity: int(x.intensity, 1, 5, 3) as Beat["intensity"],
            };
          }),
        scenes: arr(e.scenes)
          .slice(0, 20)
          .map((s) => {
            const x = obj(s);
            return {
              id: str(x.id, 40) || newId(),
              heading: str(x.heading, 100),
              summary: str(x.summary, 1000),
              lines: arr(x.lines)
                .slice(0, 50)
                .map((l) => {
                  const y = obj(l);
                  return { id: str(y.id, 40) || newId(), speaker: str(y.speaker, 40), text: str(y.text, 500), translation: str(y.translation, 500) };
                }),
            };
          }),
      };
    }),
  };
}
