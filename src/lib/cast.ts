// 选角与彩蛋角色的本地规则（TASK-004）。纯函数，服务端和客户端共用。
import { characterKindLabel, characterRoleLabel } from "@/lib/mock/demo";
import type { CharacterKind, CharacterRole, EpisodeNumber, LocalCharacterInput } from "@/lib/types";

export const EGG_RULES = [
  "彩蛋角色来自「彩蛋角色库」，可以是宠物、吉祥物、玩偶等，需提供真实参考照",
  "不是主角、不说话、不主导剧情",
  "每集出现约一次，每次可见 1–3 秒",
  "仅安排低风险动作和场景",
  "正式制作前需上传多角度参考照并确认",
];

export const MAX_PHOTOS_PER_OWNER = 10;

export const needsConsent = (kind: CharacterKind) => kind === "child" || kind === "adult";

const OWNER_ID_RE = /^[a-z0-9-]{4,40}$/;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function sanitizeCharacters(input: unknown): LocalCharacterInput[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: LocalCharacterInput[] = [];
  for (const raw of input.slice(0, 50)) {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const id = typeof o.id === "string" && OWNER_ID_RE.test(o.id) && !seen.has(o.id) ? o.id : null;
    const name = str(o.name, 40);
    if (!id || !name) continue;
    seen.add(id);
    const episodes = Array.isArray(o.episodes)
      ? [...new Set(o.episodes.filter((e): e is EpisodeNumber => e === 1 || e === 2 || e === 3 || e === 4))].sort()
      : [];
    out.push({
      id,
      name,
      kind: typeof o.kind === "string" && o.kind in characterKindLabel ? (o.kind as CharacterKind) : "adult",
      role: typeof o.role === "string" && o.role in characterRoleLabel ? (o.role as CharacterRole) : "supporting",
      description: str(o.description, 1000),
      episodes,
      consentConfirmed: o.consentConfirmed === true,
    });
  }
  return out;
}

export function sanitizeEgg(input: unknown): { name: string; species: string; notes: string } {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return { name: str(o.name, 40), species: str(o.species, 20), notes: str(o.notes, 500) };
}
