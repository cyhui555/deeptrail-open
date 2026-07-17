'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Map, ShieldCheck, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';
import { Brand } from '@/components/Brand';
import { FeedbackProvider } from '@/components/FeedbackProvider';
import { useAuth } from '@/contexts/AuthContext';

const tabs: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/', label: '规划', icon: Compass },
  { href: '/trips', label: '行程', icon: Map },
  { href: '/profile', label: '我的', icon: UserRound },
];

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const visibleTabs = user?.role === 'ADMIN'
    ? [...tabs, { href: '/admin/users', label: '管理', icon: ShieldCheck }]
    : tabs;

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <AuthGuard>
      <FeedbackProvider>
      {/* 固定纸张底图让滚动内容始终能被玻璃层采样，蓝色只承担交互反馈。 */}
      <div aria-hidden="true" className="app-atmosphere fixed inset-0 z-0 pointer-events-none" />

      <div className="relative z-10 min-h-[100dvh] lg:p-5">
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-[90rem] gap-4 lg:min-h-[calc(100dvh-2.5rem)]">
          <aside role="banner" aria-label="旅迹应用导航" className="glass sticky top-5 hidden h-[calc(100dvh-2.5rem)] w-44 shrink-0 flex-col rounded-2xl px-3 py-5 lg:flex">
            <Link href="/" aria-label="返回旅迹首页" className="rounded-xl px-2">
              <Brand compact />
            </Link>

            <nav aria-label="主要导航" className="mt-10 flex flex-col gap-2">
              {visibleTabs.map((tab) => {
                const active = isActive(tab.href);
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={active ? 'page' : undefined}
                    className={`app-dock-link flex items-center gap-3 px-3 py-2.5 text-sm font-semibold ${
                      active ? 'app-dock-link--active' : 'text-gray-600 hover:bg-white/40 hover:text-primary-800'
                    }`}
                  >
                    <Icon aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" strokeWidth={active ? 2.1 : 1.7} />
                    <span>{tab.label}</span>
                  </Link>
                );
              })}
            </nav>

            <p className="mt-auto px-3 text-xs leading-5 text-gray-500">
              把计划与沿途记忆，收进同一条轨迹。
            </p>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="app-mobile-header glass sticky top-0 z-40 border-x-0 border-t-0 border-b border-white/70 lg:hidden">
              <div className="mx-auto flex h-14 w-full items-center justify-between px-4 sm:h-16 sm:px-6">
                <Link href="/" aria-label="返回旅迹首页" className="rounded-xl">
                  <Brand compact />
                </Link>
                <span className="hidden text-sm text-gray-500 sm:inline">
                  把下一段路，安排得更从容
                </span>
              </div>
            </header>

            <main className="app-mobile-main page-enter mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8 lg:pb-8">
              {children}
            </main>
          </div>
        </div>

        <nav
          aria-label="主要导航"
          className="app-bottom-nav pointer-events-none fixed inset-x-0 z-40 px-3 lg:hidden"
          style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div
            className="app-bottom-nav__panel glass-strong pointer-events-auto mx-auto grid max-w-md gap-1 rounded-2xl p-1.5"
            style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
          >
            {visibleTabs.map((tab) => {
              const active = isActive(tab.href);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`app-dock-link flex h-full flex-col items-center justify-center gap-0.5 px-4 ${
                    active ? 'app-dock-link--active' : 'text-gray-500 hover:text-primary-700'
                  }`}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={active ? 2.2 : 1.7} />
                  <span className="text-[11px] font-semibold">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
      </FeedbackProvider>
    </AuthGuard>
  );
}
