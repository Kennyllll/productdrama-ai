import fs from "node:fs";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/db";

/**
 * 文件存储层：照片、模型、视频、构图截图都按「存储编号」读写，编号 = 相对 uploads/ 的路径，
 * 如 `<projectId>/models/<id>.glb`。现在落在本机 uploads/；上 Hub 时换成 Supabase Storage，只改这个文件。
 */
export type StorageKey = string;

const SAFE = /^[A-Za-z0-9._\-\u4e00-\u9fff]+$/;

export function storageKey(...parts: string[]): StorageKey {
  for (const p of parts) if (!SAFE.test(p) || p === "." || p === "..") throw new Error(`存储编号不合法：${p}`);
  return parts.join("/");
}

/** 旧代码里算出来的本机路径 → 存储编号（只接受 uploads/ 里面的路径） */
export function keyFromPath(file: string): StorageKey {
  const rel = path.relative(UPLOAD_DIR, path.resolve(file));
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("文件不在存储目录里");
  return storageKey(...rel.split(path.sep));
}

/** 本机路径：只给还要直接读文件的地方用（ffmpeg、按字节范围发视频）；上 Hub 后改成下载到临时目录 */
export function localPath(key: StorageKey): string {
  return path.join(UPLOAD_DIR, ...key.split("/"));
}

export function putFile(key: StorageKey, bytes: Buffer): void {
  const f = localPath(key);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, bytes);
}

export function readFile(key: StorageKey): Buffer {
  return fs.readFileSync(localPath(key));
}

export function hasFile(key: StorageKey): boolean {
  return fs.existsSync(localPath(key));
}

export function copyFile(from: StorageKey, to: StorageKey): void {
  putFile(to, readFile(from));
}

export function removeFile(key: StorageKey): void {
  fs.rmSync(localPath(key), { force: true });
}

/** 删掉某个编号前缀下的所有文件（项目、视频、颜色款的整个目录） */
export function removePrefix(prefix: StorageKey): void {
  fs.rmSync(localPath(prefix), { recursive: true, force: true });
}
