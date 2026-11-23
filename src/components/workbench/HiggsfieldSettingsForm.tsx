"use client";

import { askConfirm } from "@/components/ConfirmHost";
import { useState, useTransition } from "react";
import { saveHfCredsAction, testHfAction } from "@/app/visual-actions";
import { Card } from "@/components/ui";
import type { FormState } from "@/lib/types";

const field = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm focus:border-amber-400 focus:outline-none";
const btn = "rounded-lg border border-white/15 px-3 py-1.5 text-sm text-neutral-200 hover:bg-white/10 disabled:opacity-40";

export function HiggsfieldSettingsForm({ initial }: { initial: { configured: boolean; keyHint: string } }) {
  const [info, setInfo] = useState(initial);
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState<FormState>({});
  const [checks, setChecks] = useState<{ label: string; result: string }[]>([]);
  const [pending, startTransition] = useTransition();

  const save = (clear: boolean) =>
    startTransition(async () => {
      const res = await saveHfCredsAction({ keyId, secret, clear });
      setStatus(res);
      setChecks([]);
      if (res.info) {
        setInfo(res.info);
        setKeyId("");
        setSecret("");
        if (!clear && (keyId || secret)) {
          const t = await testHfAction();
          setStatus(t);
          setChecks(t.checks ?? []);
        }
      }
    });

  const test = () =>
    startTransition(async () => {
      setStatus({});
      const res = await testHfAction();
      setStatus(res);
      setChecks(res.checks ?? []);
    });

  return (
    <Card title="画面生成 · Higgsfield">
      <div className="space-y-4">
        <p className="text-xs text-neutral-400">
          在 console.higgsfield.ai 创建 API 凭证（Key ID + Secret）。凭证只保存在服务器的数据库里；生成时产品照和角色照会上传到 Higgsfield，结果下载回本机后从对方服务器删除。
        </p>
        <p className="text-sm text-neutral-400">
          状态：{info.configured ? <span className="text-emerald-300">已配置（Key ID {info.keyHint}）</span> : <span className="text-amber-200">未配置</span>}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-neutral-400">
            Key ID
            <input value={keyId} onChange={(e) => setKeyId(e.target.value)} autoComplete="off" aria-label="Higgsfield Key ID" placeholder={info.configured ? "留空则不修改" : "也可粘贴整串 KeyID:Secret"} className={`${field} mt-1`} />
          </label>
          <label className="block text-sm text-neutral-400">
            Secret
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" aria-label="Higgsfield Secret" placeholder={info.configured ? "留空则不修改" : ""} className={`${field} mt-1`} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => save(false)} disabled={pending} className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-40">
            保存
          </button>
          <button type="button" onClick={test} disabled={pending || !info.configured} className={btn}>
            测试连接（不产生费用）
          </button>
          <button type="button" onClick={async () => await askConfirm("清除本机保存的 Higgsfield 凭证？") && save(true)} disabled={pending || !info.configured} className={btn}>
            清除
          </button>
        </div>
        <div role="status" className="min-h-5 text-sm">
          {pending ? <span className="text-neutral-400">处理中…</span> : null}
          {!pending && status.ok ? <span className="text-emerald-300">{status.ok}</span> : null}
          {!pending && status.error ? <span className="text-rose-300">{status.error}</span> : null}
          {!pending && checks.length ? (
            <ul className="mt-2 space-y-1 text-xs text-neutral-300">
              {checks.map((c) => (
                <li key={c.label}>
                  {c.label}：{c.result}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
