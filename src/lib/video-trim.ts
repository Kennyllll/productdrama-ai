// 视频检查的问题都写成「第 X 秒起：…」。成片只用 [trimStart, trimStart + useSeconds)：问题落在这段以外就不算；挪起点或缩短能避开就直接改好
export type TrimAdvice = { trimStart: number; useSeconds: number; keep: string[]; cut: string[]; note: string };

/** 缩短后至少留这么多秒，再短就不像一个镜头了 */
export const MIN_USE_SECONDS = 1.5;

const fmt = (x: number) => String(Math.round(x * 10) / 10);

export function issueStart(text: string): number | null {
  const m = text.match(/第\s*(\d+(?:\.\d+)?)\s*秒/);
  return m ? Number(m[1]) : null;
}

/** hookCut：开头切镜的时间点，缩短后也要留在切点后 0.3 秒以上 */
export function trimAdvice(issues: string[], s: { trimStart: number; useSeconds: number; genSeconds: number; hookCut?: number }): TrimAdvice {
  const t0 = s.trimStart || 0;
  const use = s.useSeconds;
  const none: TrimAdvice = { trimStart: t0, useSeconds: use, keep: issues, cut: [], note: "" };
  const times = issues.map(issueStart);
  if (!issues.length || times.some((t) => t === null)) return none;
  const first = Math.min(...(times as number[]));
  if (first >= t0 + use) return { ...none, keep: [], cut: issues, note: `问题都在第 ${fmt(t0 + use)} 秒以后，成片只用 ${fmt(t0)}–${fmt(t0 + use)} 秒，已经剪掉` };
  if (first >= use) return { ...none, trimStart: 0, keep: [], cut: issues, note: `已自动改成用 0–${fmt(use)} 秒，避开第 ${fmt(first)} 秒起的问题` };
  const can = Math.floor(first * 2) / 2;
  const minUse = Math.max(MIN_USE_SECONDS, s.hookCut ? s.hookCut + 0.3 : 0);
  if (can >= minUse) return { trimStart: 0, useSeconds: can, keep: [], cut: issues, note: `已自动改成只用前 ${fmt(can)} 秒（原来 ${fmt(use)} 秒），避开第 ${fmt(first)} 秒起的问题` };
  return none;
}
