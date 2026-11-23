import Link from "next/link";

export default function NotFound() {
  return (
    <main className="p-10">
      <h1 className="text-xl font-semibold text-white">找不到这个页面</h1>
      <p className="mt-2 text-sm text-neutral-400">可能已经删除，或者链接打错了。</p>
      <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black">
        回项目中心
      </Link>
    </main>
  );
}
