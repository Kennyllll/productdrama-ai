#!/usr/bin/env node
// 安装工厂 3D / 2D 图纸（STEP、DXF）转换用的 Python 环境（部署 / 第一次启动时跑一次）。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const win = process.platform === "win32";
const dir = path.join(os.homedir(), ".productdrama", "cad-python");
const py = path.join(dir, win ? "Scripts" : "bin", win ? "python.exe" : "python");
const ok = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit" }).status === 0;

if (fs.existsSync(py) && spawnSync(py, ["-c", "import OCP, ezdxf"]).status === 0) process.exit(0);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dir), { recursive: true });
if (!(win ? ["py", "python"] : ["python3", "python"]).some((p) => ok(p, ["-m", "venv", dir]))) {
  console.error("✗ 没找到 Python 3：工厂 3D 文件转换先不能用（其他功能不受影响）。装好 Python 3.10+ 后再启动一次。");
  process.exit(1);
}
if (!ok(py, ["-m", "pip", "install", "-q", "--only-binary=:all:", "cadquery-ocp", "ezdxf"])) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.error("✗ 工厂 3D 文件转换工具没装上（检查网络后再启动一次）。其他功能不受影响。");
  process.exit(1);
}
console.log("✓ 工厂 3D 文件转换工具已装好");
