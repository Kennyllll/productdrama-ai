import Link from "next/link";

/** 按钮旁：没填 Key 时写「先到设置填 XX Key」，点了直接跳到那一栏 */
export function NeedKey({ name, anchor }: { name: string; anchor: string }) {
  return (
    <Link href={`/settings#${anchor}`} className="self-center text-xs text-amber-300 underline underline-offset-4 hover:text-amber-200">
      先到设置填 {name} Key →
    </Link>
  );
}
