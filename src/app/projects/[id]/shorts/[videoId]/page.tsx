import fs from "node:fs";
import { notFound } from "next/navigation";
import { ShortStudio } from "@/components/shorts/ShortStudio";
import { hfPublicInfo } from "@/lib/higgsfield";
import { productRefFiles } from "@/app/short-actions";
import { getProductModel } from "@/lib/model-repo";
import { loadKit } from "@/lib/product-kit";
import { findLocalProject } from "@/lib/repo";
import { SHORT_TEMPLATES } from "@/lib/shorts";
import { finalPath, getJob, getShortVideo, listJobs, toJobView } from "@/lib/shorts-repo";
import { syncOf } from "@/lib/shorts-sync-state";
import { runningOf } from "@/lib/shorts-runs";
import { castOf, listFamilies } from "@/lib/families-repo";
import { listHooks } from "@/lib/hooks-repo";

export const dynamic = "force-dynamic";

export default async function ShortVideoPage({ params, searchParams }: { params: Promise<{ id: string; videoId: string }>; searchParams: Promise<{ shot?: string }> }) {
  const { id, videoId } = await params;
  const { shot } = await searchParams;
  const video = getShortVideo(videoId);
  if (!findLocalProject(id) || !video || video.projectId !== id) notFound();
  let finalAt: string | null = null;
  try {
    finalAt = fs.statSync(finalPath(video)).mtime.toISOString();
  } catch {
    finalAt = null;
  }
  return (
    <>
      <ShortStudio
          cast={(castOf(video.families, 1)?.members ?? []).map((m) => ({ id: m.id, name: m.name }))}
        initial={{ video, jobs: listJobs(videoId).map(toJobView), sync: syncOf(video), running: runningOf(videoId, (id) => getJob(id)?.status === "completed") }}
        templates={SHORT_TEMPLATES.map((t) => ({ id: t.id, label: t.label, look: t.look }))}
        hfReady={hfPublicInfo().configured}
        productPhotos={(await productRefFiles(id, video.colorId)).length}
        kit={loadKit(id)}
        hasBase={!!getProductModel(id)}
        families={listFamilies().map((f) => ({ id: f.id, name: f.name }))}
        hookLib={listHooks()}
        finalAt={finalAt}
        initialShot={shot && video.shots.some((s) => s.id === shot) ? shot : null}
      />
    </>
  );
}
