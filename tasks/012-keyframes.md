# TASK-012 — 关键帧（Higgsfield 图像模型）

## 背景
分镜已结构化（景别、焦距、机位、构图、光线、产品出现方式、角色、参考作品）。本任务为每个镜头生成关键帧候选，用户选定后作为 TASK-013 视频首帧。用户已同意把产品照 / 角色照上传到 Higgsfield（用后 DELETE 远端数据）。

## 候选模型（docs.higgsfield.ai，2026-11 查阅）
1. **GPT Image 2.5 Sunburst**（`marketing-studio/image/sunburst`，编辑精度最好）
   - `prompt`（必填，≤5000 字）、`image_urls`（≤16 张参考图，需 enhance_prompt=false）、`quality` low/medium/high/xhigh/max（默认 high）、`resolution` 1k/2k/4k（默认 2k）、`aspect_ratio` auto/1:1/3:2/2:3/4:3/3:4/16:9/9:16/**21:9**、`moderation` auto/low、`enhance_prompt`（默认 false）。
   - 同系列 Flare：`marketing-studio/image/flare`（更快）。
2. **Grok Image 2.0**（`xai/grok-imagine-image-2.0`）
   - `prompt`、`image_urls`（≤10）、`quality` low/medium、`resolution` 1k/2k、`aspect_ratio` 无 21:9（最宽 2:1 / 16:9）。
3. Soul V2（`higgsfield-ai/soul/v2/standard`，约 $0.004/张，文生图，适合风格小样）。

默认：GPT Image 2.5 Sunburst，21:9、2k、high；对比测试时同镜头加跑 Grok Image 2.0。

## 范围
1. 分镜页（或新「关键帧」区域）每个镜头：
   - 「生成关键帧」：选择模型、候选数量（1–4），生成前调用估价接口显示预估费用，确认后提交。
   - 提示词由分镜自动生成（英文为主）：画面描述、景别 / 焦距 / 机位 / 构图 / 光线、参考作品的光线与色彩（只借鉴视觉，不复制原作）、角色外形、产品出现方式与保真要求（几何、颜色、Logo 不变）、画幅。可在生成前编辑。
   - 参考图：产品多角度照片 + Logo（产品为主体 / 背景时）、本镜出场角色参考照、彩蛋参考照（彩蛋镜头）。上限按模型。
2. 生成流程：上传参考图（presigned URL）→ submit → 轮询 → 下载结果到 `uploads/<projectId>/keyframes/` → DELETE 远端请求数据。
3. 候选管理：每镜多张候选，选定 1 张为关键帧（作为视频页素材 / TASK-013 首帧），可删除；记录模型、提示词、费用、时间（SQLite `keyframes` 表）。
4. 费用记录：每次生成的预估与实际（估价值）累计显示。
5. 审核：关键帧状态 待审 / 通过 / 需修改；产品与 Logo 需人工确认。

## 不做
视频生成（TASK-013）、产品原图合成兜底（TASK-014）。

## 验收标准
- 测试项目选 2–3 个镜头（产品英雄镜头、人物情绪特写、运动镜头）各生成候选，下载到本机并可选定；远端数据已删除。
- `npm run lint`、`npm run build` 通过。

## 实现备注（代码现状）
- 参考图来源：产品照 / Logo = `listAssets(projectId)`（kind product_photo / logo）+ `assetPath(asset)`（src/lib/repo.ts）；角色参考照 = `listPhotos("character", charId)` → `findPhoto(id)` + `photoPath(rec)`（src/lib/cast-repo.ts）；彩蛋 = `getProjectEggId` / `listPhotos("egg", eggId)`。
- Higgsfield 适配器：src/lib/higgsfield.ts（estimate / submit / waitFor / uploadFile / deleteRequest）。
- 分镜页关键帧位置：src/components/workbench/LocalStoryboardWorkbench.tsx 镜头详情卡里 `<PlaceholderFrame label={\`关键帧 · 镜头 ...（未生成）\`} />` 和 `<LaterButton>生成关键帧</LaterButton>`（约 344–346 行）；LaterButton 也从 ui 导入。
- 视频页已有每镜素材（shot_media，src/lib/media-repo.ts setShotMedia）：选定关键帧时可同时写入 shot_media，合成时自动使用。
- 文件服务：src/lib/file-response.ts（Range）。上传目录约定 uploads/<projectId>/keyframes/。
