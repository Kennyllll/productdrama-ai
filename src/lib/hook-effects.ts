// Hook 开头效果：每个 Hook 照真实广告案例定死字体、样式和出现方式，出片时用 ASS 字幕烧进开头（本机 ffmpeg，免费）。
// 案例来源见 HOOK_CASES（Meta 广告库，2026-11 调查）。字体是 OFL 开源字体，放在 assets/fonts。
export type HookEffectId = "priceBox" | "claimWords" | "resultLines" | "ticker" | "comment" | "vsWords" | "talkWords";

export interface HookEffectDef {
  id: HookEffectId;
  label: string;
  /** 给用户看的一句话：字体、位置、怎么出现 */
  look: string;
  /** 字幕怎么分行 / 分词（给填字幕的人看） */
  tip?: string;
}

export const HOOK_EFFECTS: HookEffectDef[] = [
  { id: "priceBox", label: "顶部白底黑字框", look: "TikTok Sans 粗体，白底黑字框放在顶部，0 秒就在，不动" },
  { id: "claimWords", label: "居中衬线大字逐词出现", look: "Playfair 白色大字居中，一个词一个词出现，约 2 秒出完" },
  { id: "resultLines", label: "上下两行衬线字", look: "Playfair 白字带阴影，上一行下一行，不动", tip: "用 / 分成上下两行，例如 2 years old / Rides 2 miles" },
  { id: "ticker", label: "顶部黑条跑马灯", look: "顶部黑条，TikTok Sans 白色粗体从右往左一直滚" },
  { id: "comment", label: "左上角评论气泡", look: "左上角白色评论气泡（Reply to comment），0 秒弹出" },
  { id: "vsWords", label: "每 0.5 秒跳一个大字", look: "TikTok Sans 特粗，黄绿色字黑描边，每 0.5 秒换一个词" },
  { id: "talkWords", label: "中下方跟读字幕", look: "TikTok Sans 白色粗体黑描边，在画面中下方跟着台词一次出 3 个词，正在说的那个词加紫色底框；切镜后顶部换成紫底白字", tip: "跟读字幕直接用自拍台词；这里填的字写在切镜后的顶部" },
];

export const isHookEffect = (x: unknown): x is HookEffectId => HOOK_EFFECTS.some((e) => e.id === x);
export const effectDef = (id: HookEffectId | undefined) => HOOK_EFFECTS.find((e) => e.id === id);

/** 预设 Hook（按名字）默认用哪个效果 */
export const PRESET_EFFECT: Record<string, HookEffectId> = {
  价格开场: "priceBox",
  大胆主张: "claimWords",
  先给结果: "resultLines",
  紧迫感: "ticker",
  社会认同: "comment",
  对比: "vsWords",
  车里自拍: "talkWords",
};

export interface HookCase {
  adId: string;
  brand: string;
  ran: string;
  text: string;
  motion: string;
  /** public/hook-cases 下的截帧条（开头 4 秒，每格 0.5 秒） */
  img: string;
}

const c = (adId: string, img: string, brand: string, ran: string, text: string, motion: string): HookCase => ({ adId, img: `/hook-cases/${img}.jpg`, brand, ran, text, motion });

export const HOOK_CASES: Record<HookEffectId, HookCase[]> = {
  priceBox: [
    c("936834245646276", "b47", "儿童字帖（个人账号）", "2026-04 起，仍在投放", "顶部白底黑字框，0 秒就在：“Truly sorry to anyone that spent $35 … only $14 with free shipping now”", "人物自拍捂嘴做反应，第 3.5 秒切到产品"),
    c("1557525835434335", "b1", "摩托越野装备", "2025-11 至 2026-11，投了一年", "黑屏画出红白圆环，“BLACK FRIDAY”进圈，第 3.5 秒加红字“SALE”", "第 2.5 秒圆环缩到上方，露出产品视频"),
  ],
  claimWords: [
    c("2045300989619133", "84", "Strolee 婴儿车", "2025-09 起，投了一年多", "“The Cadillac of Strollers”白色大号衬线字居中", "妈妈推车入画，第 2 秒切到小孩爬进车里"),
    c("2365972400498881", "87", "Strolee 婴儿车", "2026-02 起，仍在投放", "“You've never seen a lightweight Double Stroller like this”逐词出现，加箭头指向产品", "第 2 秒切到小孩笑脸"),
    c("1463484415725981", "2", "Guardian Bikes 儿童单车", "2026-10 起，仍在投放", "顶部白框“Parents: Do NOT make this mistake choosing your kid's bike”，底部口播逐词字幕", "对着镜头说话，第 3.5 秒切到三轮车"),
  ],
  resultLines: [
    c("1349654010373295", "54", "儿童平衡车", "2026-06 起，仍在投放", "上方“2 years old”，下方“Electric bike 13mph”，不动", "一镜到底：2 岁孩子骑车驶过"),
    c("1423837003256338", "45", "Guardian Bikes 平衡车", "2026-10 起，仍在投放", "顶部“Taught my son how to ride a bike with no pedals”，底部口播字幕", "妈妈拿着车对镜头说话"),
    c("1729018305010882", "103", "婴儿车（个人账号）", "2026-08 起，仍在投放", "“What I didn't know I wanted from a stroller…”顶部逐词出现", "人推着车走向镜头"),
  ],
  ticker: [
    c("1825251074763410", "b45", "儿童水画本", "2025-11 至 2026-01", "顶部黑底白字跑马灯“BLACK FRIDAY | CYBER MONDAY SALE!”全程滚动", "妈妈自拍手持产品演示"),
    c("1618205453139311", "85", "Firefly 出行用品", "2026-09", "黄色卡通粗字“10 MIN PACK & GO CHALLENGE”居中", "手机特写，第 1.5 秒拉开，第 3.5 秒快切"),
  ],
  comment: [
    c("2549040925556078", "9", "可推三轮车", "2026-06 至 07", "左上角评论气泡“where did you get the little tricycle please”", "产品特写，第 1 秒换角度"),
    c("27192324043787446", "67", "6 合 1 儿童车", "2026-05 至 06", "左上角评论气泡“Wait I really need this for my son!”", "妈妈坐地上翻转展示车"),
    c("2207045203458909", "b31", "儿童玩具", "2025-11 起，仍在投放", "顶部白字“Top selling gift for kids!”", "孩子在玩，第 1 秒切产品特写"),
    c("1401128741431807", "81", "Strolee 婴儿车", "2025-10 起，投了一年多", "“3 Reasons”衬线字逐字母出现，第 3 秒变“Reason #1”", "对镜头说话，第 1 秒切到一家人推车"),
  ],
  vsWords: [
    c("1423138062758028", "18", "多形态儿童车", "2025-12 至 2026-01", "“CAN / BELIEVE / THIS / SAME / BIKE?”每 0.5 秒一个黄绿描边大字", "每个词切一种形态：推车 → 骑 → 平衡车"),
    c("39432274326419953", "43", "Montessori Generation 学步车", "2026-10 起，仍在投放", "红底白字“The perfect gift for 1-year-olds birthday”，第 3 秒换“I tried two”", "第 3 秒切成两辆车并排"),
  ],
  talkWords: [
    c("1587134819248559", "car81", "儿童百科书（Everyday Beauty & Care）", "2026-10 起，仍在投放", "画面中下方白色粗体跟读字幕，一次 2–3 个词，关键词紫色底框；切镜后顶部紫底白字“For the kids that have 100000 questions all the time”", "奶奶坐在车里驾驶座，对着前置摄像头说话，书不入镜；第 4 秒切到书的特写"),
    c("2387951781683606", "car5", "Take 5 换机油", "2026-05 至 06", "画面中下方小号白字跟读字幕，一次 2–3 个词", "妈妈坐驾驶座、系着安全带对镜头说话，第 7 秒切到车外"),
  ],
};

// ---------- ASS 生成 ----------
const W = 1080;
const H = 1920;
const t = (sec: number) => {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
const esc = (s: string) => s.replace(/[{}\\]/g, "").replace(/\n/g, " ").trim();

/** 按字数折行（libass 自动折行对 \an 定位的框不稳定，自己折） */
/** 换行：先按 max 算要几行，再把字数摊匀，免得最后一行只剩一个词 */
export function wrap(text: string, max: number): string[] {
  const n = greedy(text, max).length;
  for (let w = Math.ceil(text.length / n); w < max; w++) {
    const rows = greedy(text, w);
    if (rows.length <= n) return rows;
  }
  return greedy(text, max);
}

function greedy(text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + w).length > max) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

const HEAD = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Box,TikTok Sans,96,&H00000000,&H00000000,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,3,14,0,8,60,60,0,1
Style: Serif,Playfair Display,124,&H00FFFFFF,&H00FFFFFF,&H64000000,&H96000000,0,0,0,0,100,100,0,0,1,3,4,5,60,60,0,1
Style: SerifB,Playfair Display,100,&H00FFFFFF,&H00FFFFFF,&H64000000,&H96000000,-1,0,0,0,100,100,0,0,1,3,4,5,60,60,0,1
Style: Ticker,TikTok Sans,56,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,4,0,0,0,1
Style: Bar,TikTok Sans,10,&H00000000,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Bubble,TikTok Sans,60,&H00000000,&H00000000,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,3,18,0,7,0,0,0,1
Style: BubbleHead,TikTok Sans,38,&H00808080,&H00808080,&H00FFFFFF,&H00FFFFFF,0,0,0,0,100,100,0,0,3,18,0,7,0,0,0,1
Style: Pop,TikTok Sans,170,&H004AF0C8,&H004AF0C8,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,9,0,5,40,40,0,1
Style: Talk,TikTok Sans,76,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,6,0,5,60,60,0,1
Style: TalkHi,TikTok Sans,76,&H00FFFFFF,&H00FFFFFF,&H00BF2C7B,&H00BF2C7B,-1,0,0,0,100,100,0,0,3,10,0,5,60,60,0,1
Style: TopBox,TikTok Sans,54,&H00FFFFFF,&H00FFFFFF,&H00BF2C7B,&H00BF2C7B,-1,0,0,0,100,100,0,0,3,16,0,8,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

const ev = (start: number, end: number, style: string, text: string, layer = 0) => `Dialogue: ${layer},${t(start)},${t(end)},${style},,0,0,0,,${text}`;

/**
 * 开头字幕的 ASS 文件内容。seconds = 开头在成片里多长；offset = 这一段从开头的第几秒开始（开头被切成两段时用）。
 * 空字幕返回 null。
 */
export function hookAss(effect: HookEffectId, caption: string, seconds: number, offset = 0, talk?: { line?: string; cut?: number }): string | null {
  const text = esc(caption);
  if (!text && !(effect === "talkWords" && talk?.line?.trim())) return null;
  const end = Math.max(0.5, seconds);
  const lines: string[] = [];
  const at = (a: number, b: number, style: string, x: string, layer = 0) => {
    const s = a - offset, e = Math.min(b, end) - offset;
    if (e > 0 && e > s) lines.push(ev(Math.max(0, s), e, style, x, layer));
  };
  switch (effect) {
    case "priceBox": {
      at(0, end, "Box", `{\\an8\\pos(${W / 2},230)}${wrap(text, 20).join("\\N")}`);
      break;
    }
    case "claimWords": {
      const words = text.split(/\s+/);
      const step = Math.min(0.4, 2 / words.length);
      const rows = wrap(text, 13);
      words.forEach((_, i) => {
        // 所有词先排好位置，没出现的透明：逐词出现时字不会跳位
        let k = 0;
        const shown = rows.map((r) => r.split(" ").map((w) => (k++ <= i ? w : `{\\alpha&HFF&}${w}{\\alpha&H00&}`)).join(" ")).join("\\N");
        at(i * step, i === words.length - 1 ? end : (i + 1) * step, "Serif", `{\\an5\\pos(${W / 2},${H * 0.2})}${shown}`);
      });
      break;
    }
    case "resultLines": {
      const [top, ...rest] = text.split(/\s*\/\s*/);
      at(0, end, "SerifB", `{\\an5\\pos(${W / 2},${H * 0.1})}${wrap(top, 20).join("\\N")}`);
      if (rest.length) at(0, end, "SerifB", `{\\an5\\pos(${W / 2},${H * 0.88})}${wrap(rest.join(" "), 20).join("\\N")}`);
      break;
    }
    case "ticker": {
      const unit = `${text.toUpperCase()}   |   `;
      const run = unit.repeat(Math.max(2, Math.ceil(90 / unit.length) + 1));
      at(0, end, "Bar", `{\\an7\\pos(0,0)\\p1}m 0 0 l ${W} 0 ${W} 120 0 120{\\p0}`);
      // 按 220 像素/秒从右往左滚
      const dur = Math.max(end, 1);
      at(0, end, "Ticker", `{\\an4\\move(60,60,${60 - Math.round(220 * dur)},60)}${run}`, 1);
      break;
    }
    case "comment": {
      const body = wrap(text, 24).join("\\N");
      const pop = "\\fscx70\\fscy70\\t(0,150,\\fscx100\\fscy100)";
      at(0, end, "BubbleHead", `{\\an7\\pos(80,230)${pop}}Reply to comment`, 1);
      at(0, end, "Bubble", `{\\an7\\pos(80,290)${pop}}${body}`, 0);
      break;
    }
    case "vsWords": {
      const words = text.split(/\s+/).map((w) => w.toUpperCase());
      words.forEach((w, i) => {
        const a = i * 0.5;
        const b = i === words.length - 1 ? end : a + 0.5;
        if (a < end) at(a, b, "Pop", `{\\an5\\pos(${W / 2},${H * 0.6})\\fscx130\\fscy130\\t(0,90,\\fscx100\\fscy100)}${w}`);
      });
      break;
    }
    case "talkWords": {
      // 照案例：跟着台词一次出 3 个词，正在说的词紫底；切镜后顶部紫底白字（这里填的字）
      const said = esc(talk?.line ?? "").split(/\s+/).filter(Boolean);
      const words = said.length ? said : text.split(/\s+/).filter(Boolean);
      const cut = said.length && talk?.cut && talk.cut < end ? talk.cut : end;
      const chunks: string[][] = [];
      for (let i = 0; i < words.length; i += 3) chunks.push(words.slice(i, i + 3));
      // 紫底跟着正在说的词走：按词长估每个词的时长（长词说得久），一组 3 个词同屏，说到哪个词哪个词亮
      const weight = (w: string) => w.replace(/[^A-Za-z0-9']/g, "").length + 2;
      const total = words.reduce((a, w) => a + weight(w), 0) || 1;
      let t0 = 0;
      chunks.forEach((c) => {
        c.forEach((w, k) => {
          const d = (weight(w) / total) * cut;
          const shown = c.map((x, j) => (j === k ? `{\\rTalkHi}${x}{\\rTalk}` : x)).join(" ");
          at(t0, t0 + d, "Talk", `{\\an5\\pos(${W / 2},${Math.round(H * 0.68)})}${shown}`);
          t0 += d;
        });
      });
      if (said.length && text && cut < end) at(cut, end, "TopBox", `{\\an8\\pos(${W / 2},220)}${wrap(text, 28).join("\\N")}`);
      break;
    }
  }
  return lines.length ? HEAD + lines.join("\n") + "\n" : null;
}

/** 正文镜头的字幕，和开头同一款：跟读字幕按词亮紫底，其他效果在中下方白色粗体整句出 */
export function bodyAss(effect: HookEffectId | null | undefined, caption: string, seconds: number, offset = 0): string | null {
  if (!esc(caption)) return null;
  if (effect === "talkWords") return hookAss("talkWords", "", seconds, offset, { line: caption });
  const end = Math.max(0.5, seconds) - offset;
  if (end <= 0) return null;
  return HEAD + ev(0, end, "Talk", `{\\an5\\pos(${W / 2},${Math.round(H * 0.68)})}${wrap(esc(caption), 24).join("\\N")}`) + "\n";
}
