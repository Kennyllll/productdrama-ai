# ProductDrama AI（本地原型 · TASK-001）

产品电影级连续短剧制作工作台。当前阶段**只有可交互的本地前端与示例数据**，未接入任何 AI / 视频模型 API，不会产生付费网络调用。

## 环境要求

- Node.js 20 以上（已在 v24 验证）、npm
- macOS / Windows / Linux 均可

## 安装与启动

```bash
cd productdrama-ai
npm install        # 首次运行安装依赖
npm run dev        # 开发模式，浏览器打开 http://localhost:3000
```

停止：在运行 `npm run dev` 的终端按 `Ctrl + C`。

其他命令：

```bash
npm run lint       # 代码检查
npm run build      # 生产构建
npm run start      # 运行生产构建（需先 build）
```

## 页面

| 页面 | 路由 |
| --- | --- |
| 首页 | `/` |
| 项目中心 | `/dashboard` |
| 产品工作台 | `/projects/demo/product` |
| 创意工作台 | `/projects/demo/creative` |
| 选角工作台 | `/projects/demo/casting` |
| 剧本工作台 | `/projects/demo/script` |
| 分镜工作台 | `/projects/demo/storyboard` |
| 视频制作工作台 | `/projects/demo/video` |

目前只有示例项目 `demo`，其他项目 ID 显示 404 页面。

## 项目结构

```
src/
  app/                      页面（Next.js App Router）
    page.tsx                首页
    dashboard/              项目中心
    projects/[id]/          项目内 6 个工作台 + 顶部项目状态栏
  components/
    AppShell.tsx            统一侧边栏导航
    ProjectStatusBar.tsx    顶部项目状态
    ui.tsx                  通用 UI（卡片、标签、占位图、“后续实现”按钮）
    workbench/              各工作台的交互组件
  lib/
    types.ts                领域类型（项目、产品、提案、角色、剧本、镜头…）
    navigation.ts           工作流步骤与路由
    mock/demo.ts            示例数据（明确标注为示例）
PROJECT_BRIEF.md / AGENTS.md / docs/ / tasks/   交接文档
```

## 已实现（本地状态，刷新后恢复示例）

- 中文首页、项目中心、7 个页面统一导航与项目状态栏
- 产品：8 个多角度照片占位、Logo 占位、Product Bible 字段编辑与「待确认 / 已确认」切换
- 创意：三种主题入口（AI 推荐示例 / 主题库多选 / 自由创作），视觉风格与产品角色独立选择，三个示例提案可选择并修改梗概
- 选角：6 位示例角色（儿童、成人、动物、幻想角色、群演），新增 / 删除角色，四集出场勾选表，多人高复杂度提示；猫咪彩蛋卡片（每集 1 次、1–3 秒、非主角）
- 剧本：四集 × 场景 × 台词，台词可编辑，并提示受影响角色与后续集数
- 分镜：每集 7 个镜头（共 28 个，每集合计 45 秒），可编辑描述、时长、运镜、台词、产品出场，本地标记关键帧审核状态
- 电影语言（TASK-001b）：剧本节拍与情绪曲线；分镜景别 / 焦距 / 机位 / 构图 / 光线 / 转场 / 声音 / 连续性；全片视觉规范（2.39:1、24 fps 等）；电影语言检查（本地规则，非 AI）
- 参考影片风格库（TASK-001c）：13 部参考作品（电影 6 / 赛车电影 4 / 暴雪游戏 CG 3，可按类型筛选），含色板、光线、运镜、构图、建议画幅、产品拍法与英雄镜头示例，并标注产品保真与版权边界
- 本地持久化（TASK-002）：项目中心新建 / 删除本地项目；产品工作台上传产品照片（按角度）与 Logo，编辑并保存产品信息和 Product Bible，刷新后保留

## 本地数据

- 数据库：`data/productdrama.db`（SQLite，better-sqlite3）；上传文件：`uploads/<项目ID>/`。两者已在 `.gitignore` 中，不会提交。
- 清空全部本地数据：停止服务器后删除 `data/` 和 `uploads/` 目录。
- 上传限制：产品照片 PNG / JPG / WebP，单张 ≤ 20 MB，最多 20 张；Logo 另支持 SVG。按文件头校验类型。
- `npm run dev` / `npm start` 只监听 127.0.0.1，局域网内其他设备无法访问。

## 未实现（页面上按钮已禁用并标注「后续实现」）

- 创意 / 选角 / 剧本 / 分镜数据持久化（本地项目中这些页面仍显示示例）—— TASK-003 / 005
- 演员与猫咪参考照上传 —— TASK-004
- AI 识别产品、AI 推荐主题与提案、AI 生成剧本 —— TASK-003
- 关键帧生成、视频生成、配音、合成、质检、导出 —— TASK-006 / 007
- 所有图片均为本地占位框，不是生成结果
