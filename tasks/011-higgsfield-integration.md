# TASK-011 — Higgsfield 接入层（画面生成平台）

## 决定（用户确认）
- 画面生成统一走 Higgsfield（多模型平台，不是模型）：一个 API 调用 Seedance 2.5 / 2.0、Kling 2.5–3.0 / O3 / Omni、Wan 3.0、MiniMax、Cinema Studio 4.0、Soul ID、Soul Cinema、GPT Image 2.5（Marketing Studio）、Grok Image 2.0 等。
- 接入层做成可替换（以后某模型可直连原厂）。
- 先用同样 2–3 个镜头（产品英雄镜头、人物情绪特写、运动镜头）在多个模型上对比，再按镜头类型固定模型。
- 上传产品照 / 角色照到 Higgsfield 需用户明确同意（与本地优先规则冲突）；结果下载回本机后调用 DELETE 立即删除远端数据。

## Higgsfield API 要点（docs.higgsfield.ai，2026-11 查阅）
- Base：`https://api.higgsfield.ai`；认证：`Authorization: Key <KEY_ID>:<KEY_SECRET>`（只能服务端调用；Console：console.higgsfield.ai 自助创建 Key ID + Secret）。
- 提交：`POST /<endpoint-id>`，如 `/bytedance/seedance-2.5/image-to-video`、`/higgsfield-ai/soul/v2/standard`；建议带 `Idempotency-Key`（UUID，超时重试用同一个）。返回 `{status:"queued", request_id, status_url, cancel_url}`。
- 状态：`GET /requests/{id}/status`，终态 `completed`（图像 `images[].url`，视频 `video.url`）/ `failed` / `nsfw` / `canceled`；失败与 nsfw 不收费。
- 估价：`POST /estimate/<endpoint-id>`（同参数）→ `{"usd":"0.094"}`。
- 上传：`POST /files/generate-upload-url {content_type}` → `{public_url, upload_url, upload_headers}`，PUT 文件到 upload_url，再把 public_url 传给模型（Seedance 等端点要求公网 URL，拒绝 asset://）。
- 保留：输出保留 7 天；可加 `Hf-Expires-After` 头（≥1 小时）；`DELETE /requests/{id}` 立即删除输入输出。
- 计费：预充值，余额一年过期；模型可用范围取决于账号（不可用时 404 / 423 / 503）。
- Seedance 2.5 image-to-video 参数：`image_url`（必填，首帧）、`end_image_url`（尾帧，可选）、`prompt`、`duration` 4–30（默认 5）、`resolution` 480p/720p/1080p（默认 720p）、`bitrate_mode` standard/high、`generate_audio`（默认 true，我们设 false，声音由声音工作台控制）。

## 范围（本任务）
1. 模型设置页新增「Higgsfield」卡片：Key ID + Secret（只存本机 SQLite，前端只显示末 4 位），测试连接（估价接口，不产生费用），检测常用端点可用性。
2. 服务端适配器 `src/lib/visual/higgsfield.ts`：submit / status 轮询 / estimate / upload / delete，错误转中文。
3. 不生成内容；后续 TASK-012 关键帧、TASK-013 镜头视频使用此适配器。

## 后续路线
- TASK-011b 资产锁定：产品参考包、Soul ID 角色训练。
- TASK-012 关键帧：每镜 2–4 张候选，用户选定。
- TASK-013 镜头视频：关键帧作首帧，720p 小样 → 1080p 终版，生成前估价。
- TASK-010b 配音：ElevenLabs eleven_v4 英文对白分轨。
- TASK-014 精修与质检：产品原图合成兜底、调色、颗粒、遮幅、质检、导出母版和 9:16。

## 验收标准
- 填入 Key 后测试连接成功；Key 不进 git、不出现在前端 HTML。
- `npm run lint`、`npm run build` 通过。

## 实测估价（2026-11，估价接口返回）
- Seedance 2.5 图生视频（16:9、无视频输入）：480p 约 $0.2056/秒，720p 约 $0.4622/秒，1080p 约 $1.1372/秒。
- Grok Image 2.0（2k、8 张参考图）：$0.16/张。
- GPT Image 2.5 Sunburst：按 token 计费（图像输出 $30 / 1M tokens 等），估价接口只返回计价说明，不返回金额。
- Soul V2：约 $0.004/张。
