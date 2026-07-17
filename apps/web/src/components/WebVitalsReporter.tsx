'use client';

import { useReportWebVitals } from 'next/web-vitals';

const supportedMetrics = new Set(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']);

function getPageGroup(pathname: string): string {
  if (pathname === '/') return 'home';
  if (pathname === '/trips') return 'trips';
  if (/^\/trips\/[^/]+\/checkin$/.test(pathname)) return 'trip-live';
  if (/^\/trips\/[^/]+\/track$/.test(pathname)) return 'trip-track';
  if (/^\/trips\/[^/]+\/review$/.test(pathname)) return 'trip-memory';
  if (/^\/trips\/[^/]+\/overview$/.test(pathname)) return 'trip-overview';
  if (/^\/trips\/[^/]+$/.test(pathname)) return 'trip-detail';
  if (/^\/itineraries\/[^/]+$/.test(pathname)) return 'task-detail';
  if (pathname === '/login') return 'auth';
  if (pathname === '/profile') return 'profile';
  return 'other';
}

/**
 * 将 Core Web Vitals 作为低优先级同源遥测发送。
 * 仅上报有限页面分组和数值，不包含 URL 参数、用户标识、目的地或表单内容。
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (!supportedMetrics.has(metric.name)) return;
    const payload = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      pageGroup: getPageGroup(window.location.pathname),
    });
    const endpoint = '/api/telemetry/web-vitals';
    const blob = new Blob([payload], { type: 'application/json' });
    if (navigator.sendBeacon?.(endpoint, blob)) return;
    void fetch(endpoint, {
      method: 'POST',
      body: payload,
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => undefined);
  });

  return null;
}
