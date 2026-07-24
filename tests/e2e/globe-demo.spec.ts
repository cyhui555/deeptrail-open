import { test, expect, type Page } from '@playwright/test';

const LANDMARK_PHOTO_STUB = `
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="64">
    <rect width="96" height="64" fill="#17333f"/>
    <path d="M0 52 28 25l18 15 17-21 33 33Z" fill="#78a9c4"/>
  </svg>
`;

async function openGlobeDemo(page: Page, failedPhotoFragment?: string) {
  await page.route('**/api/telemetry/web-vitals', (route) => route.fulfill({
    status: 204,
    body: '',
  }));
  await page.route('https://upload.wikimedia.org/**', (route) => {
    if (failedPhotoFragment && route.request().url().includes(failedPhotoFragment)) {
      return route.abort();
    }
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: LANDMARK_PHOTO_STUB,
    });
  });

  const response = await page.goto('/globe-demo');
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/globe-demo$/);
  await expect(page.getByRole('heading', {
    level: 1,
    name: '把一次旅行，放回地球上',
  })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('正在绘制地球与路线')).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText('3D 地球暂时无法显示')).toHaveCount(0);
}

test.describe('3D 旅行地球 Demo', () => {
  test.describe.configure({ timeout: 60_000 });

  test('匿名访问后可以选择目的地并控制自动旋转', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await openGlobeDemo(page);

    await page.getByRole('button', { name: '暂停旋转' }).click();
    await expect(page.getByRole('button', { name: '继续旋转' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const destination = page.getByRole('button', { name: /伊斯坦布尔/ });
    await destination.click();
    await expect(destination).toHaveAttribute('aria-current', 'location');
    await expect(page.getByText('在两片大陆之间换乘，旧城与渡轮接住下一程。')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('可以切换到著名景点并查看完整景点介绍', async ({ page }) => {
    await openGlobeDemo(page);

    const landmarkLayer = page.getByRole('button', { name: '著名景点' });
    await landmarkLayer.click();
    await expect(landmarkLayer).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '继续旋转' })).toBeVisible();

    const landmarkList = page.getByLabel('著名景点列表');
    await expect(landmarkList.getByRole('button')).toHaveCount(5);
    await expect(landmarkList.locator('img')).toHaveCount(5);

    const selectedDetail = page.locator('[aria-live="polite"]');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByRole('button', { name: '自动旋转已关闭' })).toBeDisabled();

    const potala = landmarkList.getByRole('button', { name: /布达拉宫/ });
    await potala.click();
    await expect(potala).toHaveAttribute('aria-current', 'location');

    const introduction = selectedDetail.getByLabel('布达拉宫景点介绍');
    await expect(introduction).toContainText('布达拉宫沿拉萨红山山势层层展开');
    await expect(introduction).toContainText('红宫与白宫、高原宫堡建筑、拉萨河谷景观');
    const landmarkPhoto = selectedDetail.getByRole('img', {
      name: '沿拉萨红山山势展开的布达拉宫建筑群',
    });
    await expect(landmarkPhoto).toBeVisible();
    await expect(landmarkPhoto).toHaveAttribute(
      'src',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Potala.jpg/960px-Potala.jpg',
    );
    await expect.poll(
      () => landmarkPhoto.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    ).toBe(true);
    await expect(
      introduction.getByRole('link', { name: /查看布达拉宫资料来源/ })
    ).toHaveAttribute('href', 'https://whc.unesco.org/en/list/707');
    const photoCredit = introduction.getByLabel('布达拉宫图片授权信息');
    await expect(
      photoCredit.getByRole('link', { name: /图片原始文件页/ })
    ).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Potala.jpg');
    await expect(
      photoCredit.getByRole('link', { name: /图片许可CC BY 2.5/ })
    ).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/2.5');
    await expect(
      selectedDetail.getByText('世界文化遗产', { exact: true })
    ).toBeVisible();
    await expect(page.getByRole('img', {
      name: /当前著名景点为布达拉宫/,
    })).toBeVisible();

    const canvasBox = await page.locator('canvas').boundingBox();
    if (!canvasBox) throw new Error('地球画布不存在');
    await page.mouse.move(
      canvasBox.x + canvasBox.width * 0.5,
      canvasBox.y + canvasBox.height * 0.5,
    );
    await expect(page.getByText(
      '布达拉宫，拉萨，中国，世界文化遗产。坐落于拉萨红山之上，是西藏宫堡式建筑群的重要代表。',
      { exact: true },
    )).toBeVisible();
  });

  test('景点图片加载失败时保留卡片选择与完整介绍', async ({ page }) => {
    await openGlobeDemo(page, 'Hagia_Sophia_Mars_2013.jpg');
    await page.getByRole('button', { name: '著名景点' }).click();

    const hagiaSophia = page.getByRole('button', { name: /圣索菲亚大教堂景点介绍/ });
    await hagiaSophia.click();
    await expect(hagiaSophia).toHaveAttribute('aria-current', 'location');
    await expect(page.getByRole('img', {
      name: '圣索菲亚大教堂实景图暂时无法显示',
    })).toBeVisible();
    await expect(page.getByLabel('圣索菲亚大教堂景点介绍', { exact: true })).toContainText(
      '建于 6 世纪的巨大穹顶',
    );
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    test(`${viewport.width}px 视口没有页面级横向溢出`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openGlobeDemo(page);
      await page.getByRole('button', { name: '著名景点' }).click();

      const metrics = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const title = document.querySelector('h1');
        if (!canvas || !title) throw new Error('地球画布或页面标题不存在');

        const titleStyle = getComputedStyle(title);
        const titleLineHeight = Number.parseFloat(titleStyle.lineHeight);
        return {
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          canvasWidth: canvas.getBoundingClientRect().width,
          titleLines: title.getBoundingClientRect().height / titleLineHeight,
        };
      });

      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
      expect(metrics.canvasWidth).toBeGreaterThan(viewport.width * 0.8);
      expect(metrics.titleLines).toBeLessThanOrEqual(2.05);
    });
  }

  test('减少动态效果时默认关闭自动旋转且地点选择仍可用', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openGlobeDemo(page);

    await expect(page.getByRole('button', { name: '自动旋转已关闭' })).toBeDisabled();
    const destination = page.getByRole('button', { name: /雷克雅未克/ });
    await destination.click();
    await expect(destination).toHaveAttribute('aria-current', 'location');
    await expect(page.getByText('沿北大西洋向北，风、熔岩与地热改变地表的颜色。')).toBeVisible();
  });
});
