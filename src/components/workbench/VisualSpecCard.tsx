"use client";

import { useState } from "react";
import { Card, MockBadge } from "@/components/ui";
import { demoVisualSpec } from "@/lib/mock/demo";
import type { VisualSpec } from "@/lib/types";

const aspectRatios: VisualSpec["aspectRatio"][] = ["2.39:1", "1.85:1", "16:9", "9:16"];
const fpsOptions: VisualSpec["fps"][] = [24, 25, 30];
const textFields: { key: "colorGrade" | "grain" | "lensPackage" | "depthOfField"; label: string }[] = [
  { key: "colorGrade", label: "调色" },
  { key: "grain", label: "颗粒" },
  { key: "lensPackage", label: "镜头组" },
  { key: "depthOfField", label: "景深" },
];

/** 不传 value 时为示例项目的本地状态；传入 value / onChange 时由父组件保存 */
export function VisualSpecCard({
  value,
  onChange,
  referenceNote = "（在创意工作台选择；当前为示例项目的选择）",
}: {
  value?: VisualSpec;
  onChange?: (spec: VisualSpec) => void;
  referenceNote?: string;
}) {
  const [local, setLocal] = useState<VisualSpec>(demoVisualSpec);
  const spec = value ?? local;
  const setSpec = onChange ?? setLocal;
  const input = "mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white";
  return (
    <Card title="全片视觉规范" aside={<MockBadge>所有镜头统一遵守</MockBadge>} className="mb-6">
      <p className="mb-3 text-sm text-neutral-300">
        风格参考：<span className="text-amber-200">{spec.filmReference}</span>
        <span className="ml-2 text-xs text-neutral-500">{referenceNote}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-xs text-neutral-400">
          画幅
          <select value={spec.aspectRatio} onChange={(e) => setSpec({ ...spec, aspectRatio: e.target.value as VisualSpec["aspectRatio"] })} className={input}>
            {aspectRatios.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-400">
          帧率
          <select value={spec.fps} onChange={(e) => setSpec({ ...spec, fps: Number(e.target.value) as VisualSpec["fps"] })} className={input}>
            {fpsOptions.map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </label>
        {textFields.map((f) => (
          <label key={f.key} className="text-xs text-neutral-400">
            {f.label}
            <input value={spec[f.key]} onChange={(e) => setSpec({ ...spec, [f.key]: e.target.value })} className={input} />
          </label>
        ))}
      </div>
      {spec.aspectRatio === "9:16" || spec.fps !== 24 ? (
        <p className="mt-3 text-xs text-amber-200">提示：电影感通常采用 24 fps 与宽银幕画幅（1.85:1 / 2.39:1）。电商竖版 9:16 裁切还没开放。</p>
      ) : null}
    </Card>
  );
}
