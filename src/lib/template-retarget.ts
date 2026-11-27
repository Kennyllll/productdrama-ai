// 套模板到别的产品 / 家庭：免费把旧产品名、旧人名换成新的；换不了的旧词列出来让人核对
import type { FamilyMember, MemberRole } from "./families";

export interface TemplateCastMember {
  slot: number;
  id: string;
  name: string;
  role: MemberRole;
  child: boolean;
  family: string;
}
export interface Swap {
  from: string;
  to: string;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 英文词按整词换（不把 Leo 换进 Leopard），中文直接换 */
function wordRe(w: string): RegExp {
  const latin = /^[\w' -]+$/.test(w);
  return new RegExp(latin ? `(?<![A-Za-z])${esc(w)}(?![A-Za-z])` : esc(w), "gi");
}

export function swapText(text: string, swaps: Swap[]): { text: string; n: number } {
  let n = 0;
  let out = text;
  // 长的先换：「Miller family」先于「Miller」
  for (const s of [...swaps].sort((a, b) => b.from.length - a.from.length)) {
    if (!s.from.trim() || s.from === s.to) continue;
    out = out.replace(wordRe(s.from), () => (n++, s.to));
  }
  return { text: out, n };
}

/** 家庭名去掉「家 / family」：「Miller 家」→ Miller */
export const familyWord = (name: string) => name.replace(/\s*(家|family)$/i, "").trim();

const isChild = (m: Pick<FamilyMember, "role" | "age">) => m.role === "son" || m.role === "daughter" || m.age < 14;

/** 旧家庭成员 → 新家庭成员：同一个家庭位置里先按角色配，再按大人 / 小孩配；配不上的不换 */
export function mapCast(
  old: TemplateCastMember[],
  fresh: { slot: number; name: string; members: Pick<FamilyMember, "id" | "name" | "role" | "age">[] }[],
): { swaps: Swap[]; ids: Map<string, string>; unmatched: string[] } {
  const swaps: Swap[] = [];
  const ids = new Map<string, string>();
  const unmatched: string[] = [];
  for (const slot of new Set(old.map((o) => o.slot))) {
    const f = fresh.find((x) => x.slot === slot);
    const used = new Set<string>();
    for (const o of old.filter((x) => x.slot === slot)) {
      const pool = (f?.members ?? []).filter((m) => !used.has(m.id));
      const m = pool.find((x) => x.role === o.role) ?? pool.find((x) => isChild(x) === o.child);
      if (!m) {
        unmatched.push(o.name);
        continue;
      }
      used.add(m.id);
      ids.set(o.id, m.id);
      swaps.push({ from: o.name, to: m.name });
    }
  }
  return { swaps, ids, unmatched };
}

/** 文字里还留着的旧词（旧产品名里的英文词、没配上的旧人名、旧家庭名） */
export function leftovers(texts: { label: string; text: string }[], words: string[]): string[] {
  const ws = [...new Set(words.map((w) => w.trim()).filter((w) => w.length >= 3))];
  return texts.flatMap(({ label, text }) => {
    const hit = ws.filter((w) => wordRe(w).test(text));
    return hit.length ? [`${label}：还写着 ${hit.map((h) => `「${h}」`).join("、")}`] : [];
  });
}
