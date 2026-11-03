# TASK-012b — CAD 产品渲染与受保护合成（产品零变形）

## 背景
TASK-012 用图像模型（GPT Image 2.5 Sunburst / Flare、Grok、Qwen、Soul Cinema）直接生成含产品的关键帧，逐张对照实拍后确认：所有模型都会改动产品几何（轮径比例、车架粗细、座椅 / 车筐结构，甚至多出一个轮子）。用户要求「AI 不能碰产品的像素」。

原则：**产品像素只来自真实来源（CAD 渲染或实拍），AI 只负责场景、阴影、光线融合。**

## 方案
1. 产品 3D 模型：工厂 STEP → GLB（带材质 / 贴花）。转换与上材质目前在开发机用 OCP + Blender 完成（KB002 平衡车已完成：50 个零件、白车架 / 黑叉把 / 棕座椅 / 橡胶轮胎、KRIDDO 贴花、号码牌全白）。
2. 产品页上传 GLB（`product_models` 表，`uploads/<projectId>/models/`），「测试渲染」用默认英雄机位验证 Blender 与材质。
3. 分镜页关键帧新增「CAD 保护合成」模式：
   - Blender（`scripts/blender/render_product.py`，Cycles CPU，透明背景 + 阴影捕捉地面 + 产品遮罩）按参数渲染：方位角、仰角、焦距、主光方向 / 高度 / 色温。
   - Flare 生成不含产品的空场景（提示词在原关键帧提示词基础上去掉产品、要求留空）。
   - 本机 sharp 合成：按「产品中心 x、底部 y、高度比例」放置产品与阴影。
   - 可选融合：合成图交给 Flare 只改阴影 / 色温 / 反光，然后用产品遮罩把合成图里的产品像素贴回。记录 AI 在产品区域试图改动的平均差异（aiDrift），作为提示。
   - 结果存为关键帧候选（model = `cad-composite`），中间文件在 `uploads/<projectId>/cad/<shotId>/`（product / mask / plate / composite / harmonized / final）。
4. Blender 查找顺序：`BLENDER_PATH` → `/Applications/Blender.app` → `~/Applications/Blender.app` → `/usr/bin/blender`。

## 不做
- 浏览器内 STEP 转换 / 自动上材质（需要 OCP，暂在开发机完成）。
- 视频阶段的 3D 跟踪合成（TASK-013/014）。
- 自动相机匹配（根据空场景估计机位），目前手动参数 + 分镜默认值。

## 验收
- 上传 KB002 GLB → 测试渲染成功显示。
- 选一个产品主体镜头用 CAD 模式生成：产品区域像素与 Blender 渲染逐像素一致（贴回），场景为北美真实生活环境。
- `npm run lint`、`npx tsc --noEmit`、`npm run build` 通过。

## 已知限制
- Cycles CPU 渲染每张约 1–3 分钟（M1 Pro）。
- 空场景的透视 / 光线与产品渲染参数只能靠人工对齐，之后可做「从空场景估计相机」。
- 融合步骤会上传合成图到 Higgsfield（用户已同意），用后删除远端数据。
