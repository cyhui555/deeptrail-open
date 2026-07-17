import type { Metadata, Viewport } from 'next';
import { Noto_Sans_SC } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { ScenicBackdrop } from '@/components/ScenicBackdrop';
import { WebVitalsReporter } from '@/components/WebVitalsReporter';
import './globals.css';

const notoSansSc = Noto_Sans_SC({
  weight: 'variable',
  display: 'swap',
  preload: false,
  variable: '--font-app',
  fallback: ['PingFang SC', 'Microsoft YaHei', 'sans-serif'],
});

export const metadata: Metadata = {
  applicationName: '旅迹',
  title: {
    default: '旅迹',
    template: '%s | 旅迹',
  },
  description: '把旅行规划、行程、签到和轨迹收在一处。',
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#2b6595',
};

/**
 * 生产环境注册 PWA；开发环境主动清理历史 Worker 与静态缓存。
 *
 * Next.js 开发态的 chunk URL 稳定，若被 cache-first 的 Worker 接管，热更新和普通刷新都会继续命中旧组件。
 */
const serviceWorkerBootstrap = process.env.NODE_ENV === 'production'
  ? `if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const hadController = Boolean(navigator.serviceWorker.controller);
        let reloading = false;
        if (hadController) {
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloading) return;
            reloading = true;
            window.location.reload();
          });
        }
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => registration.update())
          // PWA 是渐进增强；注册或更新失败不能产生未处理异常并阻断普通 Web 使用。
          .catch(() => undefined);
      });
    }`
  : `void (async () => {
      if (!('serviceWorker' in navigator)) return;
      if (new URLSearchParams(window.location.search).has('__pwa_test')) return;
      const registrations = await navigator.serviceWorker.getRegistrations();
      const cacheNames = 'caches' in window ? await caches.keys() : [];
      const staleCacheNames = cacheNames.filter((name) =>
        name.startsWith('travel-traces') || name.startsWith('travel-planner-')
      );
      const hadStaleState = registrations.length > 0
        || staleCacheNames.length > 0
        || Boolean(navigator.serviceWorker.controller);
      await Promise.all([
        ...registrations.map((registration) => registration.unregister()),
        ...staleCacheNames.map((name) => caches.delete(name)),
      ]);
      const reloadKey = 'deeptrail-dev-sw-cleanup';
      if (hadStaleState && sessionStorage.getItem(reloadKey) !== 'done') {
        sessionStorage.setItem(reloadKey, 'done');
        window.location.reload();
      } else if (!hadStaleState) {
        sessionStorage.removeItem(reloadKey);
      }
    })()
      // 开发态清理同样属于渐进增强；浏览器存储 API 异常不能形成未处理 Promise。
      .catch(() => undefined);`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <script dangerouslySetInnerHTML={{
          __html: serviceWorkerBootstrap,
        }} />
      </head>
      <body className={`${notoSansSc.variable} min-h-[100dvh] bg-surface-subtle`}>
        <WebVitalsReporter />
        <ScenicBackdrop />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
