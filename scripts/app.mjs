#!/usr/bin/env node
// 一键启动（生产模式）：装依赖 → 有改动才重新打包 → 启动 → 打开浏览器。
// 生产包放在 .next-app/，和开发模式的 .next/ 分开，互不打架。
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { needsBuild } from "./app-build-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const PORT = Number(process.env.PORT || 3000);
const HOST = "127.0.0.1";
const URL_ = `http://localhost:${PORT}/dashboard`;
const DIST = ".next-app";
const env = { ...process.env, PD_DIST: DIST, NEXT_TELEMETRY_DISABLED: "1" };
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const say = (s) => console.log(`\n▶ ${s}`);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`\n✗ 出错了：${cmd} ${args.join(" ")}。把上面的红字截图发给管理员。`);
    process.exit(r.status || 1);
  }
}

function portBusy(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: HOST });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* 打不开浏览器就让用户自己点链接 */
  }
}

if (await portBusy(PORT)) {
  say(`平台已经在运行，直接打开浏览器：${URL_}`);
  say("如果页面打不开：关掉之前那个黑色窗口，再双击启动。");
  openBrowser(URL_);
  process.exit(0);
}

if (!fs.existsSync("node_modules")) {
  say("第一次运行：安装依赖（约 1–3 分钟，只需一次）…");
  run(npm, ["install", "--no-audit", "--no-fund"]);
}

if (spawnSync(process.execPath, ["scripts/video/setup.mjs"], { stdio: "inherit", env }).status !== 0) say("Logo 锁定工具没装上，先跳过（下次启动会再试）。");

if (needsBuild(root, DIST)) {
  say("程序有更新：重新打包（约 1–2 分钟）…");
  run(npm, ["exec", "--", "next", "build"]);
} else say("程序没有改动，跳过打包。");

say(`启动中… 好了会自动打开浏览器：${URL_}`);
say("用完关掉这个窗口即可（或按 Ctrl + C）。不要在平台运行时关电脑盖子太久。");
const server = spawn(npm, ["exec", "--", "next", "start", "-H", HOST, "-p", String(PORT)], { stdio: "inherit", env, shell: process.platform === "win32" });
const t = setInterval(async () => {
  if (await portBusy(PORT)) {
    clearInterval(t);
    openBrowser(URL_);
  }
}, 500);
server.on("exit", (code) => {
  clearInterval(t);
  process.exit(code ?? 0);
});
