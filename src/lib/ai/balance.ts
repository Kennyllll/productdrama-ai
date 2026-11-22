// DeepSeek 余额（官方接口 GET /user/balance，免费，不扣费）。花钱前查一次，1 分钟内复用；查不到不拦（网络问题不该挡住正常使用）。
export interface Balance {
  ok: boolean;
  /** 例如 "¥12.30" / "$1.20" */
  text: string;
}

interface BalanceJson {
  is_available?: boolean;
  balance_infos?: { currency?: string; total_balance?: string }[];
}

export function parseBalance(j: BalanceJson): Balance {
  const info = j.balance_infos?.[0];
  const sign = info?.currency === "CNY" ? "¥" : info?.currency === "USD" ? "$" : `${info?.currency ?? ""} `;
  const n = Number(info?.total_balance ?? 0);
  return { ok: !!j.is_available && n > 0, text: info ? `${sign}${n.toFixed(2)}` : "未知" };
}

let cache: { at: number; key: string; b: Balance | null } | null = null;

export async function deepseekBalance(baseUrl: string, apiKey: string, maxAgeMs = 60_000): Promise<Balance | null> {
  if (cache && cache.key === apiKey.slice(-6) && Date.now() - cache.at < maxAgeMs) return cache.b;
  let b: Balance | null = null;
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/user/balance`, { headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(5000) });
    if (res.ok) b = parseBalance((await res.json()) as BalanceJson);
  } catch {
    b = null;
  }
  cache = { at: Date.now(), key: apiKey.slice(-6), b };
  return b;
}
