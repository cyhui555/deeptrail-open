import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * 注入最小认证替身，让质量边界测试只验证浏览器行为，不依赖真实用户或外部服务。
 */
async function mockAuthenticatedSession(page: Page): Promise<void> {
  await page.context().addCookies([
    { name: 'token', value: 'm13-local-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      message: 'ok',
      data: {
        userId: 13,
        username: 'M13 质量验收用户',
        wechatBound: false,
        createdAt: '2026-07-16T08:00:00',
      },
    }),
  }));
}

function fulfillApi(route: Route, data: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'ok', data }),
  });
}

test('SSE 连接失败后回退轮询并呈现最终任务状态', async ({ page }) => {
  const taskId = 'm13-sse-fallback-task';
  let statusRequestCount = 0;
  let eventRequestCount = 0;

  await mockAuthenticatedSession(page);
  await page.route(`**/api/itineraries/tasks/${taskId}/events`, async (route) => {
    eventRequestCount += 1;
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'local SSE unavailable' });
  });
  await page.route(`**/api/itineraries/tasks/${taskId}/node-revisions`, (route) => (
    fulfillApi(route, [])
  ));
  await page.route(`**/api/itineraries/tasks/${taskId}`, (route) => {
    statusRequestCount += 1;
    // Next.js 开发模式会重复挂载 Effect；只有真实发起过 SSE 且随后再次查询时才返回终态，
    // 防止重复首查被误判成“回退轮询”。
    const completed = eventRequestCount > 0 && statusRequestCount >= 3;
    return fulfillApi(route, {
      taskId,
      type: 'GENERATE',
      status: completed ? 'COMPLETED' : 'PENDING',
      submittedAt: '2026-07-16T08:00:00',
      completedAt: completed ? '2026-07-16T08:00:03' : undefined,
      summary: 'SSE 回退验收任务',
      result: completed ? { summary: '回退轮询已取得最终结果', days: [] } : undefined,
    });
  });

  await page.goto(`/itineraries/${taskId}`);

  await expect(page.getByRole('heading', { name: 'SSE 回退验收任务' })).toBeVisible();
  await expect(page.getByText('已完成', { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(eventRequestCount).toBeGreaterThanOrEqual(1);
  expect(statusRequestCount).toBeGreaterThanOrEqual(2);
});

test('增量分页合并下一页并按行程 ID 去重', async ({ page }) => {
  const requestedPages: number[] = [];

  await mockAuthenticatedSession(page);
  await page.route('**/api/trips?*', (route) => {
    const pageNumber = Number(new URL(route.request().url()).searchParams.get('page'));
    requestedPages.push(pageNumber);
    const records = pageNumber === 1
      ? [
        {
          id: 'm13-trip-a', title: '边界行程 A', status: 'PLANNED',
          checkinProgress: '0/2', totalPoi: 2, completedPoi: 0,
        },
        {
          id: 'm13-trip-b', title: '边界行程 B', status: 'ONGOING',
          checkinProgress: '1/2', totalPoi: 2, completedPoi: 1,
        },
      ]
      : [
        {
          id: 'm13-trip-b', title: '边界行程 B', status: 'ONGOING',
          checkinProgress: '1/2', totalPoi: 2, completedPoi: 1,
        },
        {
          id: 'm13-trip-c', title: '边界行程 C', status: 'COMPLETED',
          checkinProgress: '2/2', totalPoi: 2, completedPoi: 2,
        },
      ];

    return fulfillApi(route, {
      records,
      total: 3,
      page: pageNumber,
      size: 20,
      totalPages: 2,
    });
  });

  await page.goto('/trips');
  await expect(page.getByText('边界行程 A', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '加载更多行程' }).click();

  await expect(page.getByText('边界行程 C', { exact: true })).toBeVisible();
  await expect(page.getByText('边界行程 B', { exact: true })).toHaveCount(1);
  expect(requestedPages).toEqual([1, 2]);
});

test('RUM 与 PWA 缓存均不保留认证页查询隐私', async ({ page }) => {
  await page.addInitScript(() => {
    const payloads: string[] = [];
    (window as typeof window & { __m13RumPayloads?: string[] }).__m13RumPayloads = payloads;
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: (url: string | URL, data?: BodyInit | null) => {
        if (String(url).includes('/api/telemetry/web-vitals') && data instanceof Blob) {
          void data.text().then((payload) => payloads.push(payload));
        }
        return true;
      },
    });
  });

  const privateDestination = 'private-lake-m13';
  const privateToken = 'private-token-m13';
  await page.goto(`/login?destination=${privateDestination}&token=${privateToken}&__pwa_test=1`);

  // 开发环境会主动注销 PWA，边界测试显式注册 Worker，避免开发 chunk 被长期 cache-first 缓存。
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
  });

  await expect.poll(() => page.evaluate(async () => Boolean(
    (await navigator.serviceWorker.ready).active,
  ))).toBe(true);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & { __m13RumPayloads?: string[] }).__m13RumPayloads?.length ?? 0
  ))).toBeGreaterThan(0);

  const payload = await page.evaluate(() => {
    const raw = (window as typeof window & { __m13RumPayloads?: string[] }).__m13RumPayloads?.[0];
    return raw ? JSON.parse(raw) as Record<string, unknown> : null;
  });
  expect(payload).not.toBeNull();
  expect(Object.keys(payload!).sort()).toEqual(['name', 'pageGroup', 'rating', 'value']);
  expect(payload?.pageGroup).toBe('auth');
  expect(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']).toContain(payload?.name);
  expect(JSON.stringify(payload)).not.toContain(privateDestination);
  expect(JSON.stringify(payload)).not.toContain(privateToken);

  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const cacheName of await caches.keys()) {
      const requests = await (await caches.open(cacheName)).keys();
      urls.push(...requests.map((request) => request.url));
    }
    return urls;
  });
  expect(cachedUrls.some((url) => new URL(url).pathname === '/offline.html')).toBe(true);
  expect(cachedUrls.some((url) => new URL(url).pathname.startsWith('/api/'))).toBe(false);
  expect(cachedUrls.some((url) => new URL(url).pathname === '/login')).toBe(false);
  expect(cachedUrls.join('\n')).not.toContain(privateDestination);
  expect(cachedUrls.join('\n')).not.toContain(privateToken);
});

test('开发态会清理遗留 Service Worker 与静态构建缓存', async ({ page }) => {
  await page.goto('/login?__pwa_test=1');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const cache = await caches.open('travel-traces-static-v3');
    await cache.put(
      '/_next/static/chunks/stale-dev.js',
      new Response('stale development chunk', { headers: { 'Content-Type': 'text/javascript' } }),
    );
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  // 去掉测试开关后，根布局应注销旧 Worker、清缓存并自动重载到不受控制的页面。
  await page.goto('/login');
  await expect.poll(() => page.evaluate(async () => ({
    controlled: Boolean(navigator.serviceWorker.controller),
    registrations: (await navigator.serviceWorker.getRegistrations()).length,
    travelCaches: (await caches.keys()).filter((name) => (
      name.startsWith('travel-traces') || name.startsWith('travel-planner-')
    )).length,
  }))).toEqual({ controlled: false, registrations: 0, travelCaches: 0 });
});

test('开发态 Service Worker 存储 API 异常不会产生未处理错误', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, 'getRegistrations', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Internal error.')),
    });
  });

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '登录旅迹' })).toBeVisible();
  await expect.poll(() => pageErrors).toEqual([]);
});

test('PWA 缓存配额耗尽时静态资源仍回退网络', async ({ page, context }) => {
  const failedStaticRequests: string[] = [];
  page.on('requestfailed', (request) => {
    if (request.url().includes('/_next/static/')) {
      failedStaticRequests.push(`${request.url()}: ${request.failure()?.errorText}`);
    }
  });

  await page.goto('/login?__pwa_test=1');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const session = await context.newCDPSession(page);
  const origin = new URL(page.url()).origin;
  await session.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: 1024 });

  try {
    const result = await page.evaluate(async () => {
      await caches.delete('travel-traces-static-v5');
      const scriptUrl = Array.from(document.scripts)
        .map((script) => script.src)
        .find((url) => url.includes('/_next/static/'));
      if (!scriptUrl) throw new Error('未找到 Next.js 静态脚本');

      const response = await fetch(`${scriptUrl}?quota_fallback_test=${Date.now()}`, {
        cache: 'reload',
      });
      return { ok: response.ok, status: response.status };
    });

    expect(result).toEqual({ ok: true, status: 200 });
    expect(failedStaticRequests).toEqual([]);
    await expect(page.locator('h1')).toHaveCount(1);
  } finally {
    // 清除当前临时浏览器上下文的配额覆盖，避免影响同进程中的后续用例。
    await session.send('Storage.overrideQuotaForOrigin', { origin });
  }
});
