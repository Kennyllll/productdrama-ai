// 从产品资料「尺寸」那一栏读出车长（厘米）：「长 67 × 宽 45 × 高 60 cm」「670×450×600mm」「67cm」都能读
export function parseLengthCm(text: string): number | null {
  const s = text.replace(/[，,]/g, " ").replace(/[＊*xX×]/g, "×");
  const mm = /mm|毫米/i.test(s) && !/cm|厘米/i.test(s);
  const unit = (n: number) => (mm ? n / 10 : /(^|[^c])m\b|米/.test(s) && !/cm|厘米|mm|毫米/i.test(s) ? n * 100 : n);
  const ok = (n: number) => (n > 5 && n < 1000 ? Math.round(n * 10) / 10 : null);
  const labeled = s.match(/长[^\d]{0,4}(\d+(?:\.\d+)?)/);
  if (labeled) return ok(unit(Number(labeled[1])));
  const nums = [...s.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter((n) => n > 0);
  if (!nums.length) return null;
  // 没写「长」：车长一般是最大的那个
  return ok(unit(Math.max(...nums)));
}
