import Link from "next/link";

export default function NotFound() {
  return (
    <main className="p-10">
      <h1 className="text-xl font-semibold text-white">页面不存在</h1>
      <p className="mt-2 text-sm text-neutral-400">当前原型只包含示例项目 demo。</p>
      <Link href="/dashboard" className="mt-4 inline-block text-amber-300 underline">
        返回项目中心
      </Link>
    </main>
  );
}
