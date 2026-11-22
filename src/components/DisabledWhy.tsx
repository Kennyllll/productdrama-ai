/** 灰按钮旁边的「为什么点不了」 */
export function DisabledWhy({ why, className = "" }: { why: string | null | false | undefined; className?: string }) {
  if (!why) return null;
  return <span className={`text-xs text-amber-200/90 ${className}`}>{why}</span>;
}
