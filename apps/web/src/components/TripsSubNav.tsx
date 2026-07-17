'use client';

import Link from 'next/link';
import { Images, MapPinCheck, Route } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type RouteKey = 'list' | 'checkin' | 'track' | 'overview' | 'review';
type StageKey = 'plan' | 'live' | 'memory';

interface TripsSubNavProps {
  planId: string;
  active: RouteKey;
}

const tabs: { key: StageKey; label: string; hrefSuffix: string; icon: LucideIcon }[] = [
  { key: 'plan', label: '行程', hrefSuffix: '', icon: Route },
  { key: 'live', label: '现场', hrefSuffix: '/checkin', icon: MapPinCheck },
  { key: 'memory', label: '回忆', hrefSuffix: '/review', icon: Images },
];

const routeStage: Record<RouteKey, StageKey> = {
  list: 'plan',
  overview: 'plan',
  checkin: 'live',
  track: 'live',
  review: 'memory',
};

/**
 * 行程子页面导航条。
 *
 * <p>将原有五个平铺入口收敛为“行程、现场、回忆”三个旅行阶段。
 * 现有路由继续保留，概览归入行程，轨迹归入现场，避免破坏书签和测试契约。
 */
export function TripsSubNav({ planId, active }: TripsSubNavProps) {
  const activeStage = routeStage[active];
  return (
    <nav className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-gray-100/75 p-1" aria-label="旅行阶段">
      {tabs.map((tab) => {
        const isActive = activeStage === tab.key;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.key}
            href={`/trips/${planId}${tab.hrefSuffix}`}
            aria-current={isActive ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-white text-primary-800 shadow-sm'
                : 'text-gray-500 hover:bg-white/50 hover:text-primary-700'
            }`}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
