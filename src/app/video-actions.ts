"use server";

import { listShotMedia } from "@/lib/media-repo";
import { listStems } from "@/lib/sound-repo";
import { listRenders, renderEpisode, RenderError, renderFull, type RenderInfo } from "@/lib/render";
import { findLocalProject } from "@/lib/repo";
import { getStoryboard } from "@/lib/storyboard-repo";
import type { EpisodeNumber, FormState } from "@/lib/types";

type RenderResult = FormState & { renders?: RenderInfo[] };

const failure = (e: unknown): RenderResult => ({ error: e instanceof RenderError ? e.message : "合成失败，请重试" });

export async function renderEpisodeAction(projectId: string, ep: number, subtitles: boolean): Promise<RenderResult> {
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目" };
  if (![1, 2, 3, 4].includes(ep)) return { error: "集数无效" };
  const board = getStoryboard(projectId);
  if (!board) return { error: "请先在分镜工作台生成分镜" };
  try {
    await renderEpisode(projectId, board, ep as EpisodeNumber, listShotMedia(projectId), listStems(projectId), subtitles === true);
    return { ok: `第 ${ep} 集已合成`, renders: listRenders(projectId) };
  } catch (e) {
    return failure(e);
  }
}

export async function renderFullAction(projectId: string): Promise<RenderResult> {
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目" };
  try {
    await renderFull(projectId);
    return { ok: "四集总片已合成", renders: listRenders(projectId) };
  } catch (e) {
    return failure(e);
  }
}
