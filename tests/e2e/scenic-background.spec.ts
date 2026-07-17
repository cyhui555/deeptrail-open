import { test, expect } from '@playwright/test';

test.describe('全站实景风景背景', () => {
  test('认证页声明横竖响应式背景且不进入无障碍树', async ({ page }) => {
    await page.goto('/login');

    const backdrop = page.locator('.scenic-backdrop');
    await expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    await expect(backdrop.locator('img')).toHaveAttribute('alt', '');
    await expect(backdrop.locator('source[media="(max-width: 480px)"]')).toHaveAttribute(
      'srcset',
      /\/_next\/static\/media\/travel-scenery-mobile\.[\w-]+\.jpg/,
    );
    await expect(backdrop.locator('img')).toHaveAttribute(
      'src',
      /\/_next\/static\/media\/travel-scenery-desktop\.[\w-]+\.jpg/,
    );

    const decoded = await backdrop.locator('img').evaluate(async (image) => {
      const element = image as HTMLImageElement;
      await element.decode();
      return element.complete && element.naturalWidth > 0;
    });
    expect(decoded).toBeTruthy();
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    test(`${viewport.width}px 手机视口加载竖幅构图且没有横向溢出`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/login');

      const presentation = await page.evaluate(async () => {
        const image = document.querySelector<HTMLImageElement>('.scenic-backdrop img');
        const authPanel = document.querySelector<HTMLElement>('.auth-panel');
        if (!image || !authPanel) throw new Error('风景背景或认证面板不存在');
        await image.decode();
        return {
          currentSrc: decodeURIComponent(image.currentSrc),
          naturalWidth: image.naturalWidth,
          panelBackground: getComputedStyle(authPanel).backgroundImage,
        };
      });
      expect(presentation.currentSrc).toMatch(/travel-scenery-mobile\.[\w-]+\.jpg/);
      expect(presentation.naturalWidth).toBeGreaterThan(0);
      expect(presentation.panelBackground).toMatch(/travel-scenery-mobile\.[\w-]+\.jpg/);

      const metrics = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
    });
  }
});
