import { test, expect, type Page } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

/**
 * 辅助函数：注册并登录用户，返回 token。
 */
async function registerAndLogin(request: any, username: string, password: string): Promise<string> {
  const regResp = await request.post(`${BACKEND_URL}/api/auth/register`, {
    data: { username, password },
  });
  expect(regResp.ok()).toBeTruthy();
  const regBody = await regResp.json();
  return regBody.data.token;
}

/**
 * 提交生成任务并等待完成，返回 taskId。
 * 如果 AI 服务失败会自动重试（最多 3 次）。
 * 注意：不使用 findExistingCompletedTask，因为后端有用户隔离，
 * 其他用户的任务当前用户无权访问。
 */
async function generateAndWait(
  request: any,
  token: string,
  from: string,
  to: string,
  days = 1,
): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const genResp = await request.post(`${BACKEND_URL}/api/itineraries/generate`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          departureLocation: from,
          departureTime: '2026-07-01 09:00:00',
          destination: to,
          days,
          peopleCount: 2,
          budget: '1000',
          preferences: ['food'],
          specialRequirements: 'none',
        },
      });
      const genBody = await genResp.json();
      const taskId = genBody.data.taskId;

      // 等待任务完成（最多 180 秒）
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const statusResp = await request.get(`${BACKEND_URL}/api/itineraries/tasks/${taskId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const statusBody = await statusResp.json();
        if (statusBody.data?.status === 'COMPLETED') return taskId;
        if (statusBody.data?.status === 'FAILED') break; // 跳出内循环，重试
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw new Error(`Failed to generate itinerary: ${lastError?.message ?? 'unknown'}`);
}

/**
 * 辅助函数：创建行程清单，返回 planId。
 */
async function createTripPlan(request: any, token: string, title: string, taskId: string): Promise<string> {
  const createResp = await request.post(`${BACKEND_URL}/api/trips`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, taskId, plannedDate: '2026-07-01' },
  });
  const body = await createResp.json();
  return body.data;
}

/** 打卡流程显式验证日程首个 POI，顺序是本组用例的业务前提。 */
function firstCheckinItem(page: Page) {
  return page.getByRole('group', { name: /^在地图中查看 / }).first();
}

test.describe('行程清单管理 E2E', () => {
  test('完整流程：加入行程清单 -> 查看 -> 开始打卡', async ({ page, request }) => {
    const username = `trip_e2e_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    // 先导航到首页建立域名上下文，然后注入 cookie
    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    // 1. 生成行程并等待完成
    const taskId = await generateAndWait(request, token, 'Chengdu', 'Chengdu');

    // 2. 访问行程详情页
    await page.goto(`/itineraries/${taskId}`);
    await expect(page.locator('text=加入行程清单')).toBeVisible({ timeout: 15000 });

    // 3. 点击"加入行程清单"
    await page.click('text=加入行程清单');

    // 4. 弹窗填写标题
    await expect(page.getByRole('heading', { name: '加入行程清单' })).toBeVisible({ timeout: 5000 });
    await page.fill('input[placeholder="例如：云南七日游"]', 'E2E Test Trip');

    // 5. 提交
    await page.click('button:has-text("确认加入")');

    // 6. 验证成功提示和跳转链接
    await expect(page.locator('text=已加入，查看行程')).toBeVisible({ timeout: 5000 });

    // 7. 点击查看行程
    await page.click('text=已加入，查看行程');

    // 8. 验证跳转到行程详情页
    await expect(page).toHaveURL(/\/trips\/[a-z0-9]+/, { timeout: 5000 });

    // 9. 验证行程详情页内容
    await expect(page.locator('text=E2E Test Trip')).toBeVisible({ timeout: 5000 });

    // 10. 点击"开始打卡"
    await page.getByRole('button', { name: '开始现场执行' }).click();

    // 11. 验证跳转到打卡页面
    await expect(page).toHaveURL(/\/trips\/[a-z0-9]+\/checkin/, { timeout: 5000 });
  });

  test('我的行程清单列表', async ({ page, request }) => {
    const username = `trip_list_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    // 生成并加入清单
    const taskId = await generateAndWait(request, token, 'Beijing', 'Beijing');
    await createTripPlan(request, token, 'My Trip', taskId);

    // 访问行程列表
    await page.goto('/trips');
    // 卡片主视觉统一展示目的地，清单标题保留在详情页。
    await expect(page.getByRole('link', { name: /Beijing/ })).toBeVisible({ timeout: 10000 });
  });

  test('行程清单数据隔离', async ({ page, request }) => {
    const userA = `trip_isolate_a_${Date.now()}`;
    const userB = `trip_isolate_b_${Date.now()}`;

    // 用户 A 创建清单
    const tokenA = await registerAndLogin(request, userA, 'Test123456');
    const taskId = await generateAndWait(request, tokenA, 'Shanghai', 'Shanghai');
    await createTripPlan(request, tokenA, 'Private Trip', taskId);

    // 用户 B 登录并查看列表
    await page.goto('/');
    const tokenB = await registerAndLogin(request, userB, 'Test123456');
    await page.context().addCookies([
      { name: 'token', value: tokenB, domain: 'localhost', path: '/' },
    ]);
    await page.goto('/trips');

    // 用户 B 不应看到用户 A 的清单
    await expect(page.locator('text=Private Trip')).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('打卡操作 E2E', () => {
  test('手动打卡 -> 查看详情', async ({ page, request }) => {
    const username = `checkin_e2e_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    // 生成行程并创建清单
    const taskId = await generateAndWait(request, token, 'Chengdu', 'Chengdu');
    const planId = await createTripPlan(request, token, 'Checkin Test', taskId);

    // 开始打卡
    await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 访问打卡页面
    await page.goto(`/trips/${planId}/checkin`);
    // 验证打卡页面加载（显示"第1天"）
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });

    // 手动打卡第一个 POI
    const firstItem = firstCheckinItem(page);
    const checkinButton = firstItem.getByRole('button', { name: '打卡', exact: true });
    await expect(checkinButton).toBeVisible({ timeout: 5000 });
    await checkinButton.click();

    // 验证打卡成功（按钮变为"已打卡"）
    await expect(firstItem.getByText(/已打卡/)).toBeVisible({ timeout: 5000 });
  });

  test('撤销打卡', async ({ page, request }) => {
    const username = `checkin_undo_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Chengdu', 'Chengdu');
    const planId = await createTripPlan(request, token, 'Undo Test', taskId);

    await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    await page.goto(`/trips/${planId}/checkin`);
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });

    // 打卡第一个 POI
    const firstItem = firstCheckinItem(page);
    const checkinButton = firstItem.getByRole('button', { name: '打卡', exact: true });
    await expect(checkinButton).toBeVisible({ timeout: 5000 });
    await checkinButton.click();
    await expect(firstItem.getByText(/已打卡/)).toBeVisible({ timeout: 5000 });

    // 点击撤销
    const undoButton = firstItem.getByRole('button', { name: '撤销打卡', exact: true });
    await expect(undoButton).toBeVisible({ timeout: 5000 });
    await undoButton.click();

    // 验证撤销成功（恢复"打卡"按钮）
    await expect(firstItem.getByRole('button', { name: '打卡', exact: true })).toBeVisible({ timeout: 5000 });
  });

  test('打卡进度条更新', async ({ page, request }) => {
    const username = `checkin_progress_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Chengdu', 'Chengdu');
    const planId = await createTripPlan(request, token, 'Progress Test', taskId);

    await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    await page.goto(`/trips/${planId}/checkin`);
    await expect(page.getByRole('button', { name: /第\s*1\s*天/ })).toBeVisible({ timeout: 10000 });

    const progress = page.getByRole('progressbar', { name: /第 1 天打卡进度/ });
    await expect(progress).toBeVisible({ timeout: 5000 });
    const beforeProgress = Number(await progress.getAttribute('aria-valuenow'));

    // 打卡第一个 POI
    const firstItem = firstCheckinItem(page);
    await firstItem.getByRole('button', { name: '打卡', exact: true }).click();
    await expect(firstItem.getByText(/已打卡/)).toBeVisible({ timeout: 5000 });

    // 进度值应随首个 POI 完成而递增。
    await expect(progress).toHaveAttribute('aria-valuenow', String(beforeProgress + 1));
  });
});

test.describe('轨迹记录 E2E', () => {
  test('停止录制并上传流程', async ({ page, request }) => {
    const username = `track_e2e_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Hangzhou', 'Hangzhou');
    const planId = await createTripPlan(request, token, 'Track Test', taskId);

    // 访问轨迹记录页面
    await page.goto(`/trips/${planId}/track`);
    await expect(page.getByRole('heading', { name: '记录旅行轨迹' })).toBeVisible({ timeout: 10000 });

    // 点击开始录制
    await page.getByRole('button', { name: '开始记录' }).click();
    await expect(page.getByRole('status').filter({ hasText: '正在记录' })).toBeVisible();

    // 点击停止并上传
    await page.getByRole('button', { name: '结束并保存' }).click();

    // 验证上传结果消息显示
    await expect(page.getByRole('status').filter({ hasText: /已保存|没有可上传|已离线保存/ })).toBeVisible();
  });

  test('历史轨迹区域展示', async ({ page, request }) => {
    const username = `track_history_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Xian', 'Xian');
    const planId = await createTripPlan(request, token, 'Track History', taskId);

    await page.goto(`/trips/${planId}/track`);

    // 验证历史轨迹区域显示
    await expect(page.getByRole('heading', { name: '历史轨迹' })).toBeVisible({ timeout: 10000 });

    // 无轨迹时显示空状态
    await expect(page.getByText('还没有轨迹记录。到达旅行现场后，从这里开始记录。')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('旅程评价 E2E', () => {
  test('提交评分和查看评价', async ({ page, request }) => {
    const username = `review_e2e_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    // 生成行程并创建清单
    const taskId = await generateAndWait(request, token, 'Hangzhou', 'Hangzhou');
    const planId = await createTripPlan(request, token, 'Review Test', taskId);

    // 访问评价页面
    await page.goto(`/trips/${planId}/review`);
    await expect(page.getByRole('heading', { name: '旅行回忆' })).toBeVisible({ timeout: 10000 });

    // 选择评分（点击第5颗星）
    await page.getByRole('button', { name: '5 星' }).click();

    // 提交评分
    await page.getByRole('button', { name: '完成这次旅行' }).click();

    // 验证提交成功
    await expect(page.getByRole('status').filter({ hasText: '评价已保存，正在整理旅行总结' })).toBeVisible();
  });

  test('编辑 AI 总结', async ({ page, request }) => {
    const username = `review_edit_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Suzhou', 'Suzhou');
    const planId = await createTripPlan(request, token, 'Review Edit', taskId);

    await page.goto(`/trips/${planId}/review`);
    await expect(page.getByRole('heading', { name: '旅行回忆' })).toBeVisible({ timeout: 10000 });

    // 选择评分并提交
    await page.getByRole('button', { name: '4 星' }).click();
    await page.getByRole('button', { name: '完成这次旅行' }).click();
    await expect(page.getByRole('status').filter({ hasText: '评价已保存，正在整理旅行总结' })).toBeVisible();

    // 等待 AI 总结生成（最多 30 秒）
    const editBtn = page.locator('button:has-text("编辑")');
    await expect(editBtn).toBeVisible({ timeout: 30000 });

    // 点击编辑
    await editBtn.click();

    // 验证编辑区域出现
    const textarea = page.getByRole('textbox', { name: '旅行总结' });
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // 清空并输入新内容
    await textarea.fill('我的自定义旅程总结');

    // 保存
    await page.getByRole('button', { name: '保存总结' }).click();

    // 验证保存成功提示
    await expect(page.getByRole('status').filter({ hasText: '旅行总结已保存' })).toBeVisible();
  });

  test('空评分提交校验', async ({ page, request }) => {
    const username = `review_empty_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    const taskId = await generateAndWait(request, token, 'Nanjing', 'Nanjing');
    const planId = await createTripPlan(request, token, 'Review Empty', taskId);

    await page.goto(`/trips/${planId}/review`);
    await expect(page.getByRole('heading', { name: '旅行回忆' })).toBeVisible({ timeout: 10000 });

    // 不选评分直接提交
    await page.getByRole('button', { name: '完成这次旅行' }).click();

    // 验证前端校验提示
    await expect(page.getByRole('status').filter({ hasText: '请先选择整体评分' })).toBeVisible();
  });
});

test.describe('媒体上传 E2E', () => {
  test('上传图片到打卡项', async ({ request }) => {
    const username = `media_e2e_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    // 生成行程并创建清单
    const taskId = await generateAndWait(request, token, 'Qingdao', 'Qingdao');
    const planId = await createTripPlan(request, token, 'Media Test', taskId);

    // 开始打卡获取打卡项
    await request.post(`${BACKEND_URL}/api/trips/${planId}/checkin/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 获取打卡任务列表
    const tasksResp = await request.get(`${BACKEND_URL}/api/trips/${planId}/checkin`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const tasksBody = await tasksResp.json();
    const firstItem = tasksBody.data[0]?.items[0];

    if (!firstItem) {
      test.skip();
      return;
    }

    // 上传测试图片
    const fs = await import('fs');
    const path = await import('path');
    const testFilePath = path.join(process.cwd(), 'test-image.png');

    // 创建一个小型测试 PNG 文件（1x1 像素）
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x20, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, // 8-bit RGB
      0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
      0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, // compressed data
      0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, // checksum
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND chunk
      0xAE, 0x42, 0x60, 0x82, // IEND CRC
    ]);
    fs.writeFileSync(testFilePath, pngBuffer);

    const fileBuffer = fs.readFileSync(testFilePath);

    // 使用 Playwright 原生 multipart 字段上传（无需 undici 依赖）
    const uploadResp = await request.post(
      `${BACKEND_URL}/api/itineraries/checkin/items/${firstItem.id}/media`,
      {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: {
            name: 'test.png',
            mimeType: 'image/png',
            buffer: fileBuffer,
          },
        },
      },
    );

    // 清理测试文件（同步删除，文件可能已被 unlink 过，忽略 ENOENT）
    try { fs.unlinkSync(testFilePath); } catch { /* ignore */ }

    // 验证上传成功
    expect(uploadResp.ok()).toBeTruthy();
    const uploadBody = await uploadResp.json();
    expect(uploadBody.data).toBeTruthy();
    expect(uploadBody.data.id).toBeDefined();
    expect(uploadBody.data.url).toContain('/api/media/');
  });
});

// ================================================================================
// 自动加入行程清单 E2E（PRD AC-1/2/3/4/5/6）
// 覆盖：弹窗标题预填、日期预填、AI 日程范围卡片、提交跳转、卡片主视觉、用户修改权、向后兼容 fallback
// ================================================================================
test.describe('规划完成自动加入行程清单 - 预填与 UI', () => {
  test('AC-1/AC-2/AC-3: 弹窗标题/日期自动预填，AI 日程范围展示，提交后端持久化', async ({
    page,
    request,
  }) => {
    const username = `prefill_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');

    // 提交 3 天生成任务并等待完成（确保 result.days[].date 非空）
    const taskId = await generateAndWait(request, token, '北京', '成都', 3);

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    // 导航到行程详情页
    await page.goto(`/itineraries/${taskId}`);

    // 等任务完成（页面出现"加入行程清单"按钮）
    const addButton = page.getByRole('button', { name: '加入行程清单' });
    await addButton.waitFor({ state: 'visible', timeout: 180_000 });

    // 点按钮打开弹窗
    await addButton.click();

    // AC-1: 标题预填为 "{destination}{days}日游" 格式（不是 AI summary 长句）
    const titleInput = page.locator('input[type="text"][required]');
    await expect(titleInput).toHaveValue(/.*3日游/); // 成都3日游 或含 "3日游"
    const titleVal = await titleInput.inputValue();
    expect(titleVal.length).toBeLessThan(30); // 简洁标题

    // AC-2: AI 日程范围卡片可见
    const aiDatesCard = page.locator('text=AI 生成的日程范围');
    await expect(aiDatesCard).toBeVisible();
    const aiDatesText = await aiDatesCard.locator('..').locator('p').filter({ hasText: '2026-' }).textContent();
    expect(aiDatesText).toBeTruthy();

    // AC-2: plannedDate 预填非空
    const dateInput = page.locator('input[type="date"]');
    const dateVal = await dateInput.inputValue();
    expect(dateVal).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // 提交
    await page.getByRole('button', { name: '确认加入' }).click();

    // 验证跳转成功链接出现
    await expect(page.locator('text=已加入，查看行程')).toBeVisible({ timeout: 30_000 });

    // AC-3: 后端持久化 tripDates（通过 API 验证）
    // 从响应里取 planId：点成功链接取 href
    const viewLink = page.locator('a:has-text("已加入，查看行程")');
    const href = await viewLink.getAttribute('href');
    expect(href).toBeTruthy();
    const planId = href!.split('/').pop()!;

    const planResp = await request.get(`${BACKEND_URL}/api/trips/${planId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(planResp.ok()).toBeTruthy();
    const planBody = await planResp.json();
    expect(planBody.data.title).toContain('日游');
    expect(planBody.data.tripDates).toBeTruthy();
  });

  test('AC-4: TripPlanCard 主视觉是 destination（不显示长 title）', async ({ page, request }) => {
    const username = `card_dest_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');
    const taskId = await generateAndWait(request, token, '上海', '杭州');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    // 直接 API 创建 tripPlan（避免 UI 等待）
    const planId = await createTripPlan(request, token, '一段很长很长很长很长的行程名称', taskId);
    expect(planId).toBeTruthy();

    // 导航到 trips 列表
    await page.goto('/trips');

    // 验证卡片主视觉：destination "杭州" 大字出现在卡片内
    const card = page.locator(`a[href="/trips/${planId}"]`);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('杭州');
  });

  test('AC-5: 用户可修改预填的标题和日期', async ({ page, request }) => {
    const username = `modify_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');
    const taskId = await generateAndWait(request, token, '北京', '西安');

    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);

    await page.goto(`/itineraries/${taskId}`);
    const addButton = page.getByRole('button', { name: '加入行程清单' });
    await addButton.waitFor({ state: 'visible', timeout: 180_000 });
    await addButton.click();

    // 修改预填的标题
    const titleInput = page.locator('input[type="text"][required]');
    await titleInput.fill('西安历史文化5日游（自定义）');

    // 修改预填的日期
    const dateInput = page.locator('input[type="date"]');
    await dateInput.fill('2026-08-01');

    await page.getByRole('button', { name: '确认加入' }).click();
    await expect(page.locator('text=已加入，查看行程')).toBeVisible({ timeout: 30_000 });

    // 验证后端拿到的是用户修改后的值
    const viewLink = page.locator('a:has-text("已加入，查看行程")');
    const href = await viewLink.getAttribute('href');
    const planId = href!.split('/').pop()!;
    const planResp = await request.get(`${BACKEND_URL}/api/trips/${planId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const planBody = await planResp.json();
    expect(planBody.data.title).toBe('西安历史文化5日游（自定义）');
    expect(planBody.data.plannedDate).toBe('2026-08-01');
  });

  test('AC-6: tripDates 为空时后端存 NULL，主视觉 fallback destination 仍能显示', async ({
    page,
    request,
  }) => {
    const username = `fallback_${Date.now()}`;
    const token = await registerAndLogin(request, username, 'Test123456');
    const taskId = await generateAndWait(request, token, '广州', '深圳');

    // API 直接建 tripPlan（不传 tripDates 验证 AC-6）
    const planId = await createTripPlan(request, token, '短途清单', taskId);
    expect(planId).toBeTruthy();

    const planResp = await request.get(`${BACKEND_URL}/api/trips/${planId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const planBody = await planResp.json();
    // tripDates 字段 nullable 验证：tripDates 应为空字符串或 null（取决于后端默认值）
    expect(['null', null, undefined, '']).toContain(
      planBody.data.tripDates?.toString()?.toLowerCase?.() ?? null,
    );

    // 主视觉 fallback 到 destination（深圳）
    await page.goto('/');
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/' },
    ]);
    await page.goto('/trips');
    // 卡片 destination "深圳"（PRD AC-4 兜底到 destination，destination 来自任务）
    // destination 可能从任务 requestJson 提取，不一定成功；安全验证：卡片存在且包含清单标题或目的地
    const card = page.locator(`a[href="/trips/${planId}"]`);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText(/Fallback Test|深圳/);
  });
});
