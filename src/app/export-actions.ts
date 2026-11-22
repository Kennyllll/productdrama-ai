"use server";

import { listExportVersions, type ExportVersion } from "@/lib/export-versions-repo";

/** 导出区的历史版本（只读） */
export async function listExportVersionsAction(videoId: string): Promise<ExportVersion[]> {
  return listExportVersions(videoId);
}
