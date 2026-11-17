"use client";

import { askConfirm } from "@/components/ConfirmHost";
import Link from "next/link";
import { useState, useTransition } from "react";
import { aiProposalsAction, aiStoryCoreAction } from "@/app/ai-actions";
import { saveCreativeAction } from "@/app/creative-actions";
import { Card, LaterButton, MockBadge, Tag } from "@/components/ui";
import { OptionGrid } from "@/components/workbench/CreativeWorkbench";
import { AiButton, UsageNote } from "@/components/workbench/AiButton";
import { FilmStylePicker } from "@/components/workbench/FilmStylePicker";
import { SaveBar } from "@/components/workbench/SaveBar";
import type { AiUsage } from "@/lib/ai/models";
import { buildProposals, STORY_CORE_FIELDS } from "@/lib/creative";
import { filmStyles, productRoles, themeLibrary } from "@/lib/mock/demo";
import type { FormState, LocalCreative, LocalProposal } from "@/lib/types";

const field = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

export function LocalCreativeWorkbench({
  projectId,
  productName,
  initial,
  scriptProposalId,
  aiReady,
}: {
  projectId: string;
  productName: string;
  initial: LocalCreative;
  scriptProposalId: string | null;
  aiReady: boolean;
}) {
  const [c, setC] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const [ai, setAi] = useState<{ proposals: LocalProposal[]; usage: AiUsage } | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiPending, startAi] = useTransition();
  const [coreError, setCoreError] = useState("");
  const [coreUsage, setCoreUsage] = useState<AiUsage | null>(null);
  const [corePending, startCore] = useTransition();

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

  const generate = async () => {
    if (c.proposals.length && !await askConfirm("重新生成会覆盖现有 3 个提案草稿（包括你的修改），继续吗？")) return;
    update({ proposals: buildProposals(c, productName), selectedProposalId: null });
  };

  const runAi = () => {
    setAiError("");
    setAi(null);
    startAi(async () => {
      const res = await aiProposalsAction(projectId, { themeIds: c.themeIds, freeText: c.freeText, styleId: c.styleId, roleId: c.roleId, storyCore: c.storyCore });
      if (res.error || !res.result) setAiError(res.error ?? "AI 没有返回提案");
      else setAi({ proposals: res.result, usage: res.usage ?? { promptTokens: 0, completionTokens: 0 } });
    });
  };

  const runCore = async () => {
    if (STORY_CORE_FIELDS.some((f) => c.storyCore[f.key].trim()) && !await askConfirm("AI 提炼会覆盖现有故事内核（包括你的修改），继续吗？")) return;
    setCoreError("");
    startCore(async () => {
      const res = await aiStoryCoreAction(projectId, { themeIds: c.themeIds, freeText: c.freeText, styleId: c.styleId, roleId: c.roleId });
      if (res.error || !res.result) setCoreError(res.error ?? "AI 没有返回故事内核");
      else update({ storyCore: res.result });
      setCoreUsage(res.usage ?? null);
    });
  };

  const acceptAi = async () => {
    if (!ai) return;
    if (c.proposals.length && !await askConfirm("用 AI 提案替换现有提案（包括你的修改），继续吗？")) return;
    update({ proposals: ai.proposals, selectedProposalId: null });
    setAi(null);
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
        title="4 · 故事内核（共情的来源）"
        aside={
          <AiButton ready={aiReady} pending={corePending} onClick={runCore}>
            AI 提炼故事内核
          </AiButton>
        }
      >
        <p className="mb-3 text-xs text-neutral-400">
          观众共情的是人，不是产品。先想清楚主角是谁、想要什么、会失去什么；提案、剧本和分镜都会围绕它来写。可以让 AI 先提炼，再改成你的版本。
        </p>
        {corePending ? <p className="mb-3 text-sm text-amber-200">DeepSeek 正在提炼故事内核，通常需要 30–120 秒…</p> : null}
        {coreError ? <p className="mb-3 text-sm text-rose-300">{coreError}</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {STORY_CORE_FIELDS.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="text-neutral-300">{f.label}</span>
              <textarea
                rows={2}
                maxLength={500}
                value={c.storyCore[f.key]}
                placeholder={f.placeholder}
                aria-label={f.label}
                onChange={(e) => update({ storyCore: { ...c.storyCore, [f.key]: e.target.value } })}
                className={`${field} mt-1`}
              />
            </label>
          ))}
        </div>
        {c.storyCore.styleNote ? (
          <p className="mt-3 rounded-lg border border-sky-400/30 bg-sky-400/5 p-3 text-xs text-sky-100">参考作品建议（AI）：{c.storyCore.styleNote}</p>
        ) : null}
        {coreUsage ? (
          <div className="mt-2">
            <UsageNote usage={coreUsage} />
          </div>
        ) : null}
      </Card>

      <Card
        title="5 · 三个故事提案"
        aside={
          <div className="flex flex-wrap justify-end gap-2">
            <AiButton ready={aiReady} pending={aiPending} onClick={runAi}>
              AI 生成 3 个提案
            </AiButton>
            <button type="button" onClick={generate} className="rounded-lg border border-amber-400/60 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-400/10">
              {c.proposals.length ? "按模板重新生成" : "生成 3 个模板草稿"}
            </button>
          </div>
        }
      >
        <p className="mb-3 text-xs text-neutral-400">
          「模板草稿」由本地规则拼出；「AI 生成」由 DeepSeek 根据产品资料、主题、参考作品和产品角色撰写，先预览，确认后才替换。请选定一个并改写成你的故事。
        </p>
        {aiPending ? <p className="mb-3 text-sm text-amber-200">DeepSeek 正在写提案，通常需要 30–90 秒…</p> : null}
        {aiError ? <p className="mb-3 text-sm text-rose-300">{aiError}</p> : null}
        {ai ? (
          <div className="mb-4 rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-emerald-200">AI 提案预览（尚未替换）</span>
              <div className="flex gap-2">
                <button type="button" onClick={acceptAi} className="rounded-md bg-emerald-400 px-3 py-1 text-sm font-medium text-black hover:bg-emerald-300">
                  用这些提案替换
                </button>
                <button type="button" onClick={() => setAi(null)} className="rounded-md border border-white/15 px-3 py-1 text-sm text-neutral-300 hover:bg-white/10">
                  放弃
                </button>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {ai.proposals.map((p) => (
                <div key={p.id} className="rounded-lg border border-white/10 p-3 text-sm">
                  <Tag>{p.direction}</Tag>
                  <p className="mt-2 font-medium text-white">{p.title}</p>
                  <p className="mt-1 text-neutral-300">{p.logline}</p>
                  <ol className="mt-2 list-inside list-decimal space-y-0.5 text-xs text-neutral-400">
                    {p.episodeArcs.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            <div className="mt-2">
              <UsageNote usage={ai.usage} />
            </div>
          </div>
        ) : null}
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
                    {p.source === "ai" ? <Tag tone="emerald">AI 草稿</Tag> : <MockBadge>模板草稿</MockBadge>}
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
                    maxLength={120}
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
