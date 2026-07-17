import { expect, test, type Page } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

async function loginWithCookie(page: Page): Promise<void> {
  await page.goto('/');
  const username = `bug005_${Date.now()}`;
  const regResp = await page.context().request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username, password: 'Test123456' },
  });
  const regBody = await regResp.json();
  const token = regBody.data.token;
  await page.context().addCookies([
    { name: 'token', value: token, domain: 'localhost', path: '/' },
  ]);
}

async function fillFirstStep(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: '出发地' }).fill('Shanghai');
  await page.getByRole('textbox', { name: '出发时间' }).fill('2026-07-01T09:00');
  await page.getByRole('textbox', { name: '目的地' }).fill('Hangzhou');
}

async function expectSecondStep(page: Page): Promise<void> {
  await expect(page.getByRole('spinbutton', { name: '天数' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: '人数' })).toBeVisible();
}

async function fillSecondStep(page: Page): Promise<void> {
  await page.getByRole('spinbutton', { name: '天数' }).fill('3');
  await page.getByRole('spinbutton', { name: '人数' }).fill('2');
}

async function expectNoSubmitDialog(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: '确认提交行程规划？' })).toBeHidden();
}

async function expectThirdStep(page: Page): Promise<void> {
  await expect(page.getByText('旅行偏好（可多选）', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始生成行程' })).toBeVisible();
}

test('BUG-005: step1 Enter should advance to step2', async ({ page }) => {
  await loginWithCookie(page);
  await page.goto('/');

  await fillFirstStep(page);

  // 第一步按 Enter 应只前进，不得提前提交。
  await page.getByRole('textbox', { name: '出发地' }).press('Enter');

  await expectSecondStep(page);
  await expectNoSubmitDialog(page);
});

test('BUG-005: step2 Enter should advance to step3, no submit dialog', async ({ page }) => {
  await loginWithCookie(page);
  await page.goto('/');

  // 填写第一步并进入第二步。
  await fillFirstStep(page);

  await page.getByRole('button', { name: '下一步' }).click();
  await expectSecondStep(page);

  await fillSecondStep(page);

  // 第二步按 Enter 应进入个性化步骤。
  await page.getByRole('spinbutton', { name: '天数' }).press('Enter');

  await expectThirdStep(page);
  await expectNoSubmitDialog(page);
});

test('BUG-005: step2 click next button should advance to step3, no dialog', async ({ page }) => {
  await loginWithCookie(page);
  await page.goto('/');

  await fillFirstStep(page);

  await page.getByRole('button', { name: '下一步' }).click();
  await expectSecondStep(page);

  await fillSecondStep(page);

  // 第二步点击“下一步”也应只进入个性化步骤。
  await page.getByRole('button', { name: '下一步' }).click();

  await expectThirdStep(page);
  await expectNoSubmitDialog(page);
});

test('BUG-005: step3 click should still show submit dialog', async ({ page }) => {
  await loginWithCookie(page);
  await page.goto('/');

  await fillFirstStep(page);
  await page.getByRole('button', { name: '下一步' }).click();
  await expectSecondStep(page);

  await fillSecondStep(page);
  await page.getByRole('button', { name: '下一步' }).click();
  await expectThirdStep(page);

  // 第三步提交必须显示确认框。
  await page.getByRole('button', { name: '开始生成行程' }).click();
  await expect(page.getByRole('heading', { name: '确认提交行程规划？' })).toBeVisible();
});
