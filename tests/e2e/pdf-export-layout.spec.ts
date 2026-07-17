import { expect, test } from '@playwright/test';
import { AMAP_MOCK_JS } from './lib/amap-mock';

const PLAN_ID = 'pdf-layout-plan';
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlJcAAAAASUVORK5CYII=',
  'base64',
);

const userFixture = {
  success: true,
  data: {
    userId: 901,
    username: 'PDF分页回归用户',
    wechatBound: false,
    createdAt: '2026-07-15T10:00:00',
  },
};

/** 构造足以跨越多个 A4 页面的确定性行程，不调用真实 AI 或地图服务。 */
function buildLongDayFixture() {
  const repeatedDescription = '沿着高原公路前往观景点，注意天气变化并预留休息时间。';
  return [{
    id: 'pdf-day-1',
    dayNumber: 1,
    itineraryDate: '2026-07-15',
    status: 'ACTIVE',
    totalPoi: 14,
    completedPoi: 2,
    theme: '雪山、草甸与高原公路',
    mealsJson: JSON.stringify([
      { type: '午餐', recommendation: '在沿途小镇选择牦牛肉汤锅，按当天开放情况灵活调整。', estimatedCost: '人均 80 元' },
      { type: '晚餐', recommendation: '返回住宿地后选择清淡餐食并及时补充水分。', estimatedCost: '人均 60 元' },
    ]),
    accommodationJson: JSON.stringify({
      name: '高原旅居客栈',
      address: '川西高原公路游客服务区附近',
      rating: '4.7',
    }),
    transportation: '全天以驾车为主，山路弯道较多，每两小时安排一次停车休息。',
    tip: '早晚温差大，请准备防风外套、防晒用品和充足饮用水。进入高海拔区域后避免剧烈运动。',
    items: Array.from({ length: 14 }, (_, index) => ({
      id: 9000 + index,
      poiName: `第 ${index + 1} 站 高原观景点`,
      poiAddress: `川西示范路线 ${index + 1} 号观景台附近`,
      poiLat: 30.5 + index * 0.01,
      poiLng: 101.5 + index * 0.01,
      displayLat: 30.5 + index * 0.01,
      displayLng: 101.5 + index * 0.01,
      source: 'MANUAL',
      status: index < 2 ? 'CHECKED_IN' : 'PENDING',
      media: [],
      period: index < 5 ? '上午' : index < 10 ? '下午' : '晚上',
      description: index === 3
        ? repeatedDescription.repeat(45)
        : repeatedDescription.repeat(3),
      estimatedVisitTime: '约 45 分钟',
      openingHours: '全天开放，以现场公告为准',
      admissionFee: '免费',
      estimatedCost: '约 30 元',
      rating: '4.6',
      transportToNext: index < 13
        ? JSON.stringify({ mode: 'DRIVE', durationMin: 35, description: '沿高原公路驾车前往' })
        : null,
    })),
  }];
}

async function mockOverview(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(AMAP_MOCK_JS);
  await page.context().addCookies([
    { name: 'token', value: 'pdf-layout-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(userFixture),
  }));
  await page.route(`**/api/trips/${PLAN_ID}/checkin`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: buildLongDayFixture() }),
  }));
  await page.route(`**/api/trips/${PLAN_ID}/track/points`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [] }),
  }));
  await page.route(`**/api/trips/${PLAN_ID}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: {
        id: PLAN_ID,
        title: '川西雪山长线旅行手册',
        destination: '川西高原',
        plannedDate: '2026-07-15 至 2026-07-18',
        status: 'PLANNED',
        taskVersions: [],
        checkinProgress: '2/14',
        createdAt: '2026-07-15T10:00:00',
      },
    }),
  }));
  await page.route('**/api/static-map?**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: ONE_PIXEL_PNG,
  }));
}

test.describe('PDF 旅行手册样式与分页', () => {
  test('长行程应导出固定 A4 多页 PDF，且页面无运行时异常', async ({ page }) => {
    await mockOverview(page);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`/trips/${PLAN_ID}/overview`);
    await expect(page.getByRole('heading', { name: '全局地图', exact: true })).toBeVisible();

    const initialScriptUrls = new Set(await page.evaluate(() => (
      performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => url.includes('/_next/static/chunks/') && url.endsWith('.js'))
    )));
    const deferredChunkPromise = page.waitForResponse((response) => (
      response.request().resourceType() === 'script'
      && response.url().includes('/_next/static/chunks/')
      && !initialScriptUrls.has(response.url())
    ));
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByRole('button', { name: '导出 PDF' }).click();
    const [download, deferredChunkResponse] = await Promise.all([
      downloadPromise,
      deferredChunkPromise,
    ]);

    expect(deferredChunkResponse.status()).toBeLessThan(400);
    expect(download.suggestedFilename()).toBe('川西雪山长线旅行手册_旅行手册.pdf');
    if (process.env.PDF_VISUAL_OUTPUT) {
      // 本地视觉验收按需保留产物；默认测试不写入版本资产。
      await download.saveAs(process.env.PDF_VISUAL_OUTPUT);
    }
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const pdfBuffer = Buffer.concat(chunks);
    const pdfSource = pdfBuffer.toString('latin1');

    expect(pdfBuffer.slice(0, 4).toString('ascii')).toBe('%PDF');
    expect(pdfBuffer.length).toBeGreaterThan(10_000);
    expect((pdfSource.match(/\/Type\s*\/Page\b/g) || []).length).toBeGreaterThanOrEqual(6);
    expect(pdfSource).toMatch(/\/MediaBox\s*\[0 0 595\./);
    expect(pageErrors).toEqual([]);
    await expect(page.getByRole('button', { name: '导出 PDF' })).toBeEnabled();
  });

  test('坐标延迟回填时应刷新任务后再生成含地图 PDF', async ({ page }) => {
    const planId = 'pdf-delayed-map-plan';
    let backfillCalls = 0;
    let coordinatesReady = false;
    let staticMapRequested = false;
    const buildTasks = () => [{
      id: 'pdf-delayed-day-1',
      dayNumber: 1,
      itineraryDate: '2026-07-16',
      status: 'ACTIVE',
      totalPoi: 2,
      completedPoi: 0,
      items: [0, 1].map((index) => ({
        id: 9800 + index,
        poiName: `延迟坐标地点 ${index + 1}`,
        poiAddress: '四川省阿坝藏族羌族自治州',
        poiLat: coordinatesReady ? 30.8 + index * 0.1 : null,
        poiLng: coordinatesReady ? 102.8 + index * 0.1 : null,
        displayLat: coordinatesReady ? 30.8 + index * 0.1 : null,
        displayLng: coordinatesReady ? 102.8 + index * 0.1 : null,
        status: 'PENDING',
        media: [],
        period: index === 0 ? '上午' : '下午',
        description: '用于验证导出动作等待坐标回填。',
      })),
    }];

    await page.addInitScript(AMAP_MOCK_JS);
    await page.context().addCookies([
      { name: 'token', value: 'pdf-delayed-map-fixture', domain: 'localhost', path: '/' },
    ]);
    await page.route('**/api/auth/me', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userFixture),
    }));
    await page.route(`**/api/trips/${planId}/checkin**`, async (route) => {
      if (route.request().url().includes('backfill-coordinates')) {
        backfillCalls += 1;
        // 页面首屏后台回填仍返回 0；用户明确导出时第二次尝试才准备好坐标。
        if (backfillCalls >= 2) coordinatesReady = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: coordinatesReady ? 2 : 0 }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: buildTasks() }),
      });
    });
    await page.route(`**/api/trips/${planId}/track/points`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    }));
    await page.route(`**/api/trips/${planId}`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { id: planId, title: '延迟地图导出', destination: '川西', status: 'PLANNED' },
      }),
    }));
    await page.route('**/api/static-map?**', (route) => {
      staticMapRequested = true;
      return route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG });
    });

    await page.goto(`/trips/${planId}/overview`);
    await expect.poll(() => backfillCalls).toBe(1);

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByRole('button', { name: '导出 PDF' }).click();
    const download = await downloadPromise;

    expect(backfillCalls).toBeGreaterThanOrEqual(2);
    expect(staticMapRequested).toBeTruthy();
    expect(download.suggestedFilename()).toBe('延迟地图导出_旅行手册.pdf');
    await expect(page.getByText('路线地图暂未生成')).toHaveCount(0);
  });
});
