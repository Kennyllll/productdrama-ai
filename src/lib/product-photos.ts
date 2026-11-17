/** 产品参考照：先角度照，再补上没放进角度格子的产品照（细节照） */
export function productPhotos<T extends { kind: string; originalName: string }>(assets: T[]): T[] {
  const white = assets.filter((a) => a.kind === "white_photo");
  const inGrid = new Set(white.map((a) => a.originalName));
  return [...white, ...assets.filter((a) => a.kind === "product_photo" && !inGrid.has(a.originalName))];
}
