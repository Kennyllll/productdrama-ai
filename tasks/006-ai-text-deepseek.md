# TASK-006 — 接入文字模型（DeepSeek）：AI 提案与 AI 剧本

## 背景
用户选定先接 DeepSeek。成片面向海外，台词用英文；工作台界面保持中文，AI 剧本每句英文台词附中文翻译供审阅。模型接口需可替换（以后对比 Claude / GPT）。

## DeepSeek API（官方文档 api-docs.deepseek.com，2026-11 查阅）
- OpenAI 兼容：`POST https://api.deepseek.com/chat/completions`，Header `Authorization: Bearer <key>`
- 模型：`deepseek-flash`（默认，便宜）、`deepseek-v4-pro`；上下文 1M
- JSON 输出：`response_format: {"type":"json_object"}`，提示词里必须包含 "json" 字样并给出示例结构；合理设置 `max_tokens` 防截断
- 返回 `usage.prompt_tokens / completion_tokens`

## 范围
1. 模型设置页 `/settings`（侧边栏入口「模型设置」）
   - 提供商：DeepSeek（结构上支持 OpenAI 兼容的 baseUrl + model，可扩展）
   - API Key 输入：只保存在本机 SQLite `settings` 表（data/ 已 gitignore），页面只显示末 4 位；可清除
   - 模型选择：deepseek-flash / deepseek-v4-pro；「测试连接」按钮（发送极短请求）
2. 服务端适配器 `src/lib/ai/`：`chatJson({system, user, maxTokens})` → `{data, usage}`；超时 120s；错误转中文提示（401 Key 无效、402 余额不足、429 限流、网络错误）
3. 创意页：「AI 生成 3 个提案」按钮（未配置 Key 时禁用并链接设置页）
   - 输入：产品名 / 品类 / 卖点 / Product Bible、主题、自由描述、参考作品完整拆解、产品角色
   - 输出 3 个提案（direction / title / logline / 四集 arcs），标「AI 草稿」；先预览，确认后替换现有提案
4. 剧本页：「AI 写剧本」按钮
   - 按选定提案 + 产品 + 选角（名字、类型、档案）+ 参考作品写四集，每集 45 秒：节拍（钩子/冲突/转折/悬念，第4集收束，连续覆盖 0–45s）、场景、英文台词 + 中文翻译；台词少、画面叙事为主；产品推动剧情，不像口播
   - 儿童角色不做危险动作；不复制原作角色/台词
   - 先预览，确认后覆盖现有剧本；`LocalScriptLine` 新增 `translation` 字段（中文翻译），剧本页台词旁显示可编辑
   - 台词时长估算：英文按约 2.5 词/秒
5. 每次调用显示 token 用量；不自动重试。

## 不做
AI 分镜、关键帧、视频、配音。不上传产品图片给模型（只发文字资料）。

## 验收标准
- 未填 Key 时 AI 按钮禁用并提示；填 Key 后测试连接成功。
- AI 提案 / 剧本经 sanitize 后可编辑、保存，刷新保留。
- Key 不出现在 git、日志、前端 HTML（仅末 4 位）。
- `npm run lint`、`npm run build` 通过。
