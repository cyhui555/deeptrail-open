import type { CSSProperties, ReactNode } from 'react';
import { Brand } from '@/components/Brand';
import mobileScenery from '@/assets/travel-scenery-mobile.jpg';

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}

/** 认证页共用布局，桌面端用非对称分栏建立品牌感，移动端聚焦表单。 */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <main className="auth-shell">
      <div className="auth-atmosphere" aria-hidden="true" />
      <div className="auth-layout">
        <section className="auth-story" aria-label="旅迹品牌介绍">
          <Brand />
          <div className="max-w-lg">
            <p className="auth-eyebrow">从灵感到抵达</p>
            <h2 className="mt-5 text-5xl font-bold leading-[1.06] tracking-[-0.065em] text-gray-950 xl:text-6xl">
              把远方，
              <br />
              写进日程。
            </h2>
            <p className="mt-6 max-w-md text-base leading-7 text-gray-600">
              旅迹把计划、路线、现场行动和沿途回忆收进一次完整旅行。
            </p>
          </div>
          <p className="max-w-sm text-sm leading-6 text-gray-500">
            每一次出发，都从一份看得懂的计划开始。
          </p>
        </section>

        <section
          className="auth-panel glass-strong"
          // 手机端认证面板铺入同一张竖幅实景照片；资源 URL 由构建生成哈希，不能硬编码到 CSS。
          style={{ '--auth-mobile-scenery': `url("${mobileScenery.src}")` } as CSSProperties}
        >
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-[-0.045em] text-gray-950">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
          </div>
          {children}
          <div className="mt-7 text-sm text-gray-500">{footer}</div>
        </section>
      </div>
    </main>
  );
}
