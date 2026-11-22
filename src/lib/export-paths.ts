import path from "node:path";
import { videoDir } from "@/lib/shorts-repo";

/** 不完整的预览片：正文没齐时导出看效果用，不覆盖正式成片 */
export const previewPath = (v: { projectId: string; id: string }) => path.join(videoDir(v.projectId, v.id), "preview.mp4");
