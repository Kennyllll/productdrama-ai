// 生产包是否过期：没有包、或者源码 / 配置比上次打包新，就要重新打包
import fs from "node:fs";
import path from "node:path";

const WATCH = ["src", "public", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs"];

export function newestMtime(p) {
  let st;
  try {
    st = fs.statSync(p);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.mtimeMs;
  let max = 0;
  for (const name of fs.readdirSync(p)) max = Math.max(max, newestMtime(path.join(p, name)));
  return max;
}

export function needsBuild(root, dist) {
  let built;
  try {
    built = fs.statSync(path.join(root, dist, "BUILD_ID")).mtimeMs;
  } catch {
    return true;
  }
  return WATCH.some((w) => newestMtime(path.join(root, w)) > built);
}
