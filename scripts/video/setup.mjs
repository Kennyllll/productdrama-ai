#!/usr/bin/env node
// 安装 Logo 锁定用的 Python 环境（部署 / 第一次启动时跑一次）。设了 PD_VIDEO_PYTHON 就用那个，不装。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const win = process.platform === "win32";
const dir = path.join(os.homedir(), ".productdrama", "video-python");
const py = path.join(dir, win ? "Scripts" : "bin", win ? "python.exe" : "python");
const req = path.join(path.dirname(fileURLToPath(import.meta.url)), "requirements.txt");
const ok = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit" }).status === 0;

if (process.env.PD_VIDEO_PYTHON) process.exit(0);
if (fs.existsSync(py) && spawnSync(py, ["-c", "import cv2, numpy"]).status === 0) process.exit(0);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dir), { recursive: true });
if (!(win ? ["py", "python"] : ["python3", "python"]).some((p) => ok(p, ["-m", "venv", dir]))) {
  console.error("✗ 没找到 Python 3：Logo 锁定先不能用（其他功能不受影响）。装好 Python 3.10+ 后再启动一次。");
  process.exit(1);
}
if (!ok(py, ["-m", "pip", "install", "-q", "--only-binary=:all:", "-r", req])) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.error("✗ Logo 锁定工具没装上（检查网络后再启动一次）。其他功能不受影响。");
  process.exit(1);
}
console.log("✓ Logo 锁定工具已装好");
