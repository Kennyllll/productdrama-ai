import { redirect } from "next/navigation";

/** 摆放界面已并进 3D 页（set?mode=stage），旧链接跳过去 */
export default async function ShortStagePage({ params, searchParams }: { params: Promise<{ id: string; videoId: string }>; searchParams: Promise<{ shot?: string; fig?: string }> }) {
  const { id, videoId } = await params;
  const sp = await searchParams;
  const q = new URLSearchParams({ mode: "stage", ...(sp.shot ? { shot: sp.shot } : {}), ...(sp.fig ? { fig: sp.fig } : {}) });
  redirect(`/projects/${id}/shorts/${videoId}/set?${q}`);
}
