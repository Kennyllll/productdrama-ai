// 视频检查的问题都写成「第 X 秒起：…」。成片只用 [trimStart, trimStart + useSeconds)，问题落在用的这段以外就不算；挪一下能避开就自动挪
export type TrimAdvice = { trimStart: number; keep: string[]; cut: string[]; note: string };

const fmt = (x: number) => String(Math.round(x * 10) / 10);

export function issueStart(text: string): number | null {
  const m = text.match(/第\s*(\d+(?:\.\d+)?)\s*秒/);
  return m ? Number(m[1]) : null;
}

export function trimAdvice(issues: string[], s: { trimStart: number; useSeconds: number; genSeconds: number }): TrimAdvice {
  const t0 = s.trimStart || 0;
  const use = s.useSeconds;
  const none: TrimAdvice = { trimStart: t0, keep: issues, cut: [], note: "" };
  const times = issues.map(issueStart);
  if (!issues.length || times.some((t) => t === null)) return none;
  const first = Math.min(...(times as number[]));
  if (first >= t0 + use) return { trimStart: t0, keep: [], cut: issues, note: `问题都在第 ${fmt(t0 + use)} 秒以后，成片只用 ${fmt(t0)}–${fmt(t0 + use)} 秒，已经剪掉` };
  if (first >= use) return { trimStart: 0, keep: [], cut: issues, note: `已自动改成用 0–${fmt(use)} 秒，避开第 ${fmt(first)} 秒起的问题` };
  const can = Math.floor(first * 2) / 2;
  return can >= 1.5 ? { ...none, note: `只有前 ${fmt(can)} 秒没问题：把这一镜「用几秒」改成 ${fmt(can)} 就能避开` } : none;
}
