"use client";

import { useState, useTransition } from "react";
import { saveFalKeyAction, testFalAction } from "@/app/model-actions";
import { Card } from "@/components/ui";
import type { FormState } from "@/lib/types";

const field = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm focus:border-amber-400 focus:outline-none";
const btn = "rounded-lg border border-white/15 px-3 py-1.5 text-sm text-neutral-200 hover:bg-white/10 disabled:opacity-40";

export function FalSettingsForm({ initial }: { initial: { configured: boolean; keyHint: string } }) {
  const [info, setInfo] = useState(initial);
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  const save = (clear: boolean) =>
    startTransition(async () => {
      const res = await saveFalKeyAction({ key, clear });
      setStatus(res);
      if (res.info) {
        setInfo(res.info);
        setKey("");
      }
    });

  return (
    <Card title="3D 建模 · fal.ai">
      <div className="space-y-4">
        <p className="text-xs text-neutral-400">
          在 fal.ai 的 Dashboard → API Keys 创建一个 Key。用来把产品白底照建成白模、给白模贴颜色款。Key 只保存在本机数据库；每次建模前先弹审批框显示价格，你同意才提交。
        </p>
        <p className="text-sm text-neutral-400">
          状态：{info.configured ? <span className="text-emerald-300">已配置（{info.keyHint}）</span> : <span className="text-amber-200">未配置</span>}
        </p>
        <label className="block text-sm text-neutral-400">
          API Key
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" aria-label="fal API Key" placeholder={info.configured ? "留空则不修改" : "粘贴 fal 的 Key"} className={`${field} mt-1`} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => save(false)} disabled={pending || !key.trim()} className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-40">
            保存
          </button>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                setStatus({});
                setStatus(await testFalAction());
              })
            }
            disabled={pending || !info.configured}
            className={btn}
          >
            测试 Key（不产生费用）
          </button>
          <button type="button" onClick={() => window.confirm("清除本机保存的 fal Key？") && save(true)} disabled={pending || !info.configured} className={btn}>
            清除
          </button>
        </div>
        <div role="status" className="min-h-5 text-sm">
          {pending ? <span className="text-neutral-400">处理中…</span> : null}
          {!pending && status.ok ? <span className="text-emerald-300">{status.ok}</span> : null}
          {!pending && status.error ? <span className="text-rose-300">{status.error}</span> : null}
        </div>
      </div>
    </Card>
  );
}
