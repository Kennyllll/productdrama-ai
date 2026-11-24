import assert from "node:assert/strict";
import test from "node:test";
import { guessGlbOrigin } from "./glb-origin";

function glb(json: object): Buffer {
  let s = JSON.stringify(json);
  while (s.length % 4) s += " ";
  const body = Buffer.from(s, "utf8");
  const head = Buffer.alloc(20);
  head.write("glTF", 0, "ascii");
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + body.length, 8);
  head.writeUInt32LE(body.length, 12);
  head.write("JSON", 16, "ascii");
  return Buffer.concat([head, body]);
}
const meshes = (n: number) => Array.from({ length: n }, () => ({ primitives: [{}] }));

test("CAD exports count as factory", () => {
  assert.equal(guessGlbOrigin(glb({ asset: { generator: "Open CASCADE Technology 8.0" }, meshes: meshes(4) })), "factory");
  assert.equal(guessGlbOrigin(glb({ asset: { generator: "Khronos glTF Blender I/O v4.2" }, meshes: meshes(51), images: [{}] })), "factory");
});

test("single textured mesh or AI generator counts as ai", () => {
  assert.equal(guessGlbOrigin(glb({ asset: { generator: "Khronos glTF Blender I/O v4.3" }, meshes: meshes(1), images: [{}, {}, {}] })), "ai");
  assert.equal(guessGlbOrigin(glb({ asset: { generator: "tripo3d" }, meshes: meshes(8) })), "ai");
});

test("unclear files and non-GLB return null", () => {
  assert.equal(guessGlbOrigin(glb({ asset: { generator: "Khronos glTF Blender I/O" }, meshes: meshes(1) })), null);
  assert.equal(guessGlbOrigin(Buffer.from("not a glb file at all")), null);
});
