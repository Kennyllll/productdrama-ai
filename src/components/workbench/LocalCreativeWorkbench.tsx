"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveCreativeAction } from "@/app/creative-actions";
import { Card, LaterButton, MockBadge, Tag } from "@/components/ui";
import { OptionGrid } from "@/components/workbench/CreativeWorkbench";
import { FilmStylePicker } from "@/components/workbench/FilmStylePicker";
import { SaveBar } from "@/components/workbench/SaveBar";
import { buildProposals } from "@/lib/creative";
import { filmStyles, productRoles, themeLibrary } from "@/lib/mock/demo";
import type { FormState, LocalCreative, LocalProposal } from "@/lib/types";

const field = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

export function LocalCreativeWorkbench({
  projectId,
  productName,
  initial,
  scriptProposalId,
}: {
  projectId: string;
  productName: string;
  initial: LocalCreative;
  scriptProposalId: string | null;
}) {
  const [c, setC] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  const change = (fn: (prev: LocalCreative) => LocalCreative) => {
    setC(fn);
    setDirty(true);
    setStatus({});
  };
  const update = (patch: Partial<LocalCreative>) => change((prev) => ({ ...prev, ...patch }));
  const updateProposal = (id: string, patch: Partial<LocalProposal>) =>
    change((prev) => ({ ...prev, proposals: prev.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const toggleTheme = (id: string) =>
    change((prev) => ({ ...prev, themeIds: prev.themeIds.includes(id) ? prev.themeIds.filter((t) => t !== id) : [...prev.themeIds, id] }));

  const generate = () => {
    if (c.proposals.length && !window.confirm("重新生成会覆盖现有 3 个提案草稿（包括你的修改），继续吗？")) return;
    update({ proposals: buildProposals(c, productName), selectedProposalId: null });
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveCreativeAction(projectId, c);
      setStatus(res);
      if (res.ok) setDirty(false);
    });

  const selected = c.proposals.find((p) => p.id === c.selectedProposalId);
  const scriptOutdated = scriptProposalId !== null && c.selectedProposalId !== null && scriptProposalId !== c.selectedProposalId;

  return (
    <div className="space-y-6">
      <Card title="1 · 故事主题" aside={<LaterButton>AI 推荐主题</LaterButton>}>
        <p className="mb-3 text-xs text-neutral-400">从主题库多选，可再补充自由描述。</p>
        <div className="flex flex-wrap gap-2">
          {themeLibrary.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={c.themeIds.includes(t.id)}
              onClick={() => toggleTheme(t.id)}
              title={t.description}
              className={`rounded-full border px-3 py-1 text-sm ${
                c.themeIds.includes(t.id) ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-white/15 hover:border-white/40"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          value={c.freeText}
          onChange={(e) => update({ freeText: e.target.value })}
          rows={3}
          maxLength={1000}
          aria-label="自由创作描述"
          placeholder="可选：用一句话描述你的故事想法，例如：一个怕黑的孩子，在产品灯光的陪伴下完成一次夜间探险……"
          className={`${field} mt-4`}
        />
      </Card>

      <Card title="2 · 电影视觉风格（参考作品：电影 / 赛车电影 / 游戏 CG）">
        <FilmStylePicker value={c.styleId} onChange={(id) => update({ styleId: id })} />
      </Card>
      <Card title="3 · 产品在剧情中的角色">
        <OptionGrid options={productRoles} value={c.roleId} onChange={(id) => update({ roleId: id })} name="product-role" />
      </Card>

      <Card
        title="4 · 三个故事提案"
        aside={
          <button type="button" onClick={generate} className="rounded-lg border border-amber-400/60 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-400/10">
            {c.proposals.length ? "按当前选择重新生成" : "生成 3 个提案草稿"}
          </button>
        }
      >
        <p className="mb-3 text-xs text-neutral-400">
          提案由本地模板根据上面的主题、参考作品、产品角色和产品名拼出，是写作起点，不是 AI 生成。请选定一个并改写成你的故事。
        </p>
        {!productName.trim() && (
          <p className="mb-3 text-xs text-amber-200">
            产品名称为空，提案会用「产品」代替。可先到<Link href={`/projects/${projectId}/product`} className="underline">产品工作台</Link>填写。
          </p>
        )}
        {c.proposals.length === 0 ? (
          <p className="text-sm text-neutral-500">还没有提案，点右上角生成。</p>
        ) : (
          <div role="radiogroup" aria-label="故事提案" className="grid gap-4 lg:grid-cols-3">
            {c.proposals.map((p) => {
              const active = p.id === c.selectedProposalId;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => update({ selectedProposalId: p.id })}
                  className={`rounded-xl border p-4 text-left transition ${active ? "border-amber-400 bg-amber-400/10" : "border-white/10 hover:border-white/30"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag>{p.direction}</Tag>
                    <MockBadge>模板草稿</MockBadge>
                    {active ? <Tag tone="amber">已选定</Tag> : null}
                  </div>
                  <p className="mt-2 font-medium text-white">{p.title || "（未命名）"}</p>
                  <p className="mt-2 text-sm text-neutral-300">{p.logline}</p>
                  <p className="mt-2 text-xs text-neutral-500">{p.episodeArcs.join(" → ")}</p>
                </button>
              );
            })}
          </div>
        )}
        {selected && (
          <div className="mt-5 space-y-3 rounded-lg bg-white/5 p-4">
            <div className="flex flex-wrap gap-1">
              {c.themeIds.map((id) => (
                <Tag key={id}>{themeLibrary.find((t) => t.id === id)?.label}</Tag>
              ))}
              <Tag tone="emerald">《{filmStyles.find((f) => f.id === c.styleId)?.film}》风格</Tag>
              <Tag tone="rose">产品：{productRoles.find((r) => r.id === c.roleId)?.label}</Tag>
            </div>
            <label className="block text-sm text-neutral-300">
              提案标题
              <input value={selected.title} maxLength={100} onChange={(e) => updateProposal(selected.id, { title: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="block text-sm text-neutral-300">
              故事梗概
              <textarea
                rows={3}
                maxLength={1000}
                value={selected.logline}
                onChange={(e) => updateProposal(selected.id, { logline: e.target.value })}
                className={`${field} mt-1`}
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-4">
              {selected.episodeArcs.map((arc, i) => (
                <label key={i} className="block text-xs text-amber-300">
                  第 {i + 1} 集 · 45 秒
                  <input
                    value={arc}
                    maxLength={60}
                    onChange={(e) => {
                      const arcs = [...selected.episodeArcs] as LocalProposal["episodeArcs"];
                      arcs[i] = e.target.value;
                      updateProposal(selected.id, { episodeArcs: arcs });
                    }}
                    className={`${field} mt-1 text-white`}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
        {scriptOutdated && (
          <p role="status" className="mt-4 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
            现有剧本是按另一个提案生成的，不会自动更新。可在剧本页按当前提案重新生成骨架。
          </p>
        )}
      </Card>

      <SaveBar
        dirty={dirty}
        pending={pending}
        status={status}
        onSave={save}
        extra={
          selected && !dirty ? (
            <Link href={`/projects/${projectId}/script`} className="ml-auto text-sm text-amber-200 underline">
              去剧本页 →
            </Link>
          ) : null
        }
      />
    </div>
  );
}
