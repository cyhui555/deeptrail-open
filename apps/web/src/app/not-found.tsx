import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <div className="glass-strong rounded-2xl px-6 py-10">
      <p className="text-sm font-semibold text-primary-700">404</p>
      <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-gray-900">这条路暂时走不通</h1>
      <p className="mt-2 text-sm leading-6 text-gray-500">页面可能已经移动，回到规划首页继续出发。</p>
      <Link href="/" className="button-primary mt-6 px-6">
        返回首页
      </Link>
      </div>
    </div>
  );
}
