import { modelPrecision } from "@/lib/model-repo";
import { getBrainKey } from "@/lib/brain/kimi";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { SetShot } from "@/components/production/Set3D";
import { ShortSet, type StageProps } from "@/components/shorts/ShortSet";
import { Card } from "@/components/ui";
import { getProductModel, modelFor } from "@/lib/model-repo";
import { getRig } from "@/lib/product-rig-repo";
import { findLocalProject } from "@/lib/repo";
import { getShortVideo, listJobs, listShortVideos } from "@/lib/shorts-repo";
import { videoTheme } from "@/lib/shorts";
import { autoLayout } from "@/lib/shorts-set";
import { basisOf, shotChecks } from "@/lib/shorts-sync";
import { activeItems, findTheme, type SceneItem } from "@/lib/shorts-scenes";
import { ensureScenes, legacyShotScene, versionOf } from "@/lib/shorts-scenes-repo";
import type { ShotBinding } from "@/components/shorts/SceneEditor";
import { JobPill } from "@/components/shorts/JobPill";
import { castOf } from "@/lib/families-repo";
import { memberKind, roleOf, filmerId } from "@/lib/families";

export const dynamic = "force-dynamic";

export default async function ShortSetPage({ params, searchParams }: { params: Promise<{ id: string; videoId: string }>; searchParams: Promise<{ shot?: string; capture?: string; mode?: string; fig?: string; next?: string }> }) {
  const { id, videoId } = await params;
  const sp = await searchParams;
  const v = getShortVideo(videoId);
  if (!findLocalProject(id) || !v || v.projectId !== id) notFound();
  // 画面里用本视频选的颜色款；接触点跟形状走，存在白模 / 原模型上
  const base = getProductModel(id);
  const model = modelFor(id, v.colorId);
  const jobs = listJobs(videoId);
  // 开头标清楚是第几段：切镜后的第二段只拍产品，别让人以为 3D 没摆好
  const labelOf = (s: (typeof v.shots)[number], i: number) => (s.hook ? `#${i + 1} ${s.hook.partOf ? "开头·切镜后" : "开头"}` : `#${i + 1}`);
  const shots: SetShot[] = v.shots.map((s, i) => {
    const frame = jobs.find((j) => j.id === s.frameJobId);
    return {
      needsCapture: !s.compFile,
      locked: s.stage !== "draft" ? "构图已确认：要改机位先在工作台点“退回构图”" : undefined,
      code: s.id,
      label: labelOf(s, i),
      title: `${labelOf(s, i)} ${s.beat} · ${s.camera || "机位未写"} — ${s.description}`,
      original: autoLayout(s, i),
      edited: s.layout,
      refs: [
        ...(s.compFile ? [{ label: "已保存的 3D 构图", fileId: "", video: false, url: `/api/shorts/${v.id}?comp=${s.id}&t=${encodeURIComponent(s.compFile)}` }] : []),
        ...(frame ? [{ label: "首帧", fileId: "", video: false, url: `/api/shorts/${frame.id}` }] : []),
      ],
    };
  });
  // 车里自拍的第一段不用 3D：不放进 3D 页
  const carIds = new Set(v.shots.filter((s) => s.hook?.scene === "car").map((s) => s.id));
  const scenes = ensureScenes(id, listShortVideos(id));
  const sceneItems: Record<string, SceneItem[]> = {};
  const stage: Record<string, StageProps> = {};
  const brainReady = Boolean(getBrainKey());
  const bindings: ShotBinding[] = v.shots.map((s, i) => {
    const sh = s.scene ?? legacyShotScene(scenes, v.room, videoTheme(v).theme);
    const sc = scenes.find((x) => x.id === sh.id) ?? scenes[0];
    const ver = versionOf(sc, sh.v);
    sceneItems[s.id] = activeItems(ver.items, sh.theme);
    stage[s.id] = {
      locked: s.stage !== "draft" ? "构图已确认：要改人偶和产品位置，先回镜头点“退回构图”" : undefined,
      accepted: s.stage === "accepted",
      layout: s.layout ?? autoLayout(s, i),
      scene: { id: sc.id, name: sc.name, v: ver.v, theme: sh.theme, themeLabel: findTheme(sh.theme).label },
      items: ver.items,
      brainReady,
      productLen: base?.lengthCm ? base.lengthCm / 100 : 0.8,
      noProduct: /^\s*(无产品|没有产品|不出现产品)/.test(s.productNote ?? ""),
      sceneWarn: shotChecks({ ...s, layout: s.layout ?? autoLayout(s, i) }, basisOf(s, { name: sc.name, outdoor: sc.outdoor, sh })).find((x) => x.startsWith("场地是")),
      members: (castOf(v.families, s.family ?? 1)?.members ?? []).filter((m) => !!s.hook?.selfie || m.id !== filmerId(v, s)).map((m) => ({ id: m.id, name: m.name, kind: memberKind(m), h: m.heightCm / 100, role: m.role, label: `${m.name}（${roleOf(m.role).label}，${(m.heightCm / 100).toFixed(2)} 米）` })),
    };
    return { code: s.id, label: labelOf(s, i), scene: sh, family: s.family ?? 1, special: s.special ?? "", locked: shots[i].locked };
  });
  const filmers = Object.fromEntries(
    v.shots.map((s) => {
      const ms = castOf(v.families, s.family ?? 1)?.members ?? [];
      const id = filmerId(v, s);
      return [s.id, { value: s.filmer ?? "", video: v.filmer ?? "", h: ms.find((m) => m.id === id)?.heightCm, dflt: ms.find((m) => m.id === v.filmer)?.name ?? "不指定", options: ms.map((m) => ({ id: m.id, label: `${m.name}（${roleOf(m.role).label}，${(m.heightCm / 100).toFixed(2)} 米）` })) }];
    }),
  );
  return (
    <>
      <JobPill videoId={videoId} projectId={id} />
      {!model ? (
        <Card title="还没有产品 3D 模型">
          <p className="text-sm text-neutral-300">
            先到{" "}
            <Link href={`/projects/${id}/product`} className="text-amber-300 underline">
              产品页
            </Link>{" "}
            上传带材质的 GLB 模型；没有模型时地图里只用白色方块代替产品。
          </p>
        </Card>
      ) : null}
      {carIds.size && (!sp.shot || [...carIds].some((x) => x.startsWith(sp.shot!))) ? (
        <Card title="车里自拍">
          <p className="text-sm text-neutral-300">
            {v.shots.flatMap((s, i) => (carIds.has(s.id) ? [`#${i + 1}`] : [])).join("、")} 开头在车里自拍，不用 3D，三轮车不入镜，所以这里没有这一段。切镜后的第二段照案例只拍产品，没有人。
          </p>
        </Card>
      ) : null}
      {shots.length === 0 ? (
        <Card title="还没有分镜">
          <p className="text-sm text-neutral-300">先在工作台选创意、出分镜。</p>
        </Card>
      ) : (
        <ShortSet
          key={`${sp.shot ?? ""}:${sp.capture ?? ""}`}
          stage={stage}
          initialSel={sp.fig}
          projectId={id}
          videoId={videoId}
          shots={shots.filter((x) => !carIds.has(x.code))}
          bindings={bindings.filter((x) => !carIds.has(x.code))}
          operators={Object.fromEntries(v.shots.map((s) => [s.id, s.operator ?? ""]))}
          filmers={filmers}
          scenes={scenes}
          sceneItems={sceneItems}
          glbUrl={model ? `/api/models/${model.id}` : null}
          placeholderProduct={modelPrecision(model) !== "exact"}
          modelId={base?.id ?? null}
          rig={base ? getRig(base.id) : null}
          initialCode={sp.shot ?? v.shots.find((s) => s.stage !== "accepted")?.id ?? ""}
          autoCapture={sp.capture === "1"}
          nextCode={sp.capture === "1" && v.shots.some((s) => s.id === sp.next) ? sp.next : undefined}
          title={v.title}
        />
      )}
    </>
  );
}
