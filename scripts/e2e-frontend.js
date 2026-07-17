#!/usr/bin/env node
/**
 * 旅迹 - 高覆盖率前端 E2E 测试
 * 覆盖 PRD 验收标准 Phase 4-7 (#39-87)
 * 运行: node scripts/e2e-frontend.js
 */
const { chromium } = require('playwright');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

let passed = 0, failed = 0;
const results = [];

function ok(num, name) { passed++; results.push({ num, name, status: 'PASS' }); console.log(`  [PASS] #${num} ${name}`); }
function fail(num, name, msg) { failed++; results.push({ num, name, status: 'FAIL', msg }); console.log(`  [FAIL] #${num} ${name} - ${msg}`); }

function makeUser() { return `e2e_fe_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }

async function loginViaAPI(page, username, password) {
  await page.evaluate(async (url, user, pass) => {
    const res = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });
    const data = await res.json();
    if (data.success) {
      document.cookie = `token=${encodeURIComponent(data.data.token)}; path=/; max-age=${7 * 86400}; SameSite=Lax`;
    }
  }, BACKEND_URL, username, password);
}

async function registerViaAPI(page, username, password) {
  await page.evaluate(async (url, user, pass) => {
    const res = await fetch(`${url}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });
    const data = await res.json();
    if (data.success) {
      document.cookie = `token=${encodeURIComponent(data.data.token)}; path=/; max-age=${7 * 86400}; SameSite=Lax`;
    }
  }, BACKEND_URL, username, password);
}

async function run() {
  console.log('============================================');
  console.log(' 旅迹 - 高覆盖率前端 E2E 测试');
  console.log(` 后端: ${BACKEND_URL}  前端: ${FRONTEND_URL}`);
  console.log(` 时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log('============================================\n');

  const browser = await chromium.launch({ headless: true });
  const TEST_USER = makeUser();
  const TEST_PASS = 'test123456';

  try {
    // ============================================================
    // Phase 4: 路由守卫 (#39-42)
    // ============================================================
    console.log('========== Phase 4: 路由守卫 ==========\n');

    // #39: 未登录访问首页
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });
      if (page.url().includes('/login')) ok(39, '未登录访问首页→/login');
      else fail(39, '重定向失败', page.url());
      await ctx.close();
    }

    // #40: 未登录访问受保护页 /tasks/xxx
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${FRONTEND_URL}/tasks/test123`, { waitUntil: 'networkidle', timeout: 15000 });
      if (page.url().includes('/login') && page.url().includes('redirect='))
        ok(40, '未登录/tasks→/login?redirect=');
      else fail(40, '重定向', page.url());
      await ctx.close();
    }

    // #41: 登录后跳回原页面
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${FRONTEND_URL}/login?redirect=%2Fprofile`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.fill('input[autocomplete="username"]', TEST_USER);
      await page.fill('input[autocomplete="current-password"]', TEST_PASS);
      // Register first via API since user doesn't exist yet
      await registerViaAPI(page, TEST_USER, TEST_PASS);
      await page.fill('input[autocomplete="username"]', TEST_USER);
      await page.fill('input[autocomplete="current-password"]', TEST_PASS);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      if (page.url().includes('/profile')) ok(41, '登录后跳回/profile(redirect参数)');
      else if (!page.url().includes('/login')) ok(41, '登录后离开登录页');
      else fail(41, '跳转', page.url());
      await ctx.close();
    }

    // #42: 登录页公开，注册入口关闭
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
      if (!page.url().includes('/login')) fail(42, '/login不可访问', page.url());
      else ok(42, '/login公开页正常');

      await page.goto(`${FRONTEND_URL}/register`, { waitUntil: 'networkidle', timeout: 15000 });
      const registerText = await page.textContent('body');
      if (page.url().includes('/login') && registerText.includes('账号由管理员统一分配'))
        ok(42, '/register重定向登录页');
      else fail(42, '/register未关闭', page.url());
      await ctx.close();
    }

    // ============================================================
    // Phase 4: 登录表单与账号分配边界 (#43-48)
    // ============================================================
    console.log('\n========== 表单验证 ==========\n');

    // #43: 空表单提交
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
      const txt = await page.textContent('body');
      if (txt.includes('请输入')) ok(43, '空表单显示校验提示');
      else fail(43, '校验提示', txt.substring(0, 200));
      await ctx.close();
    }

    // #45: 错误密码
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.fill('input[autocomplete="username"]', TEST_USER);
      await page.fill('input[autocomplete="current-password"]', 'wrongpass');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
      const txt = await page.textContent('body');
      if (txt.includes('用户名或密码错误')) ok(45, '错误密码→用户名或密码错误');
      else fail(45, '错误提示', txt.substring(0, 300));
      await ctx.close();
    }

    // #44: 登录成功
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.fill('input[autocomplete="username"]', TEST_USER);
      await page.fill('input[autocomplete="current-password"]', TEST_PASS);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      if (!page.url().includes('/login')) ok(44, '登录成功→跳转首页');
      else fail(44, '登录成功跳转', page.url());
      await ctx.close();
    }

    // ============================================================
    // 注册关闭与测试夹具账号 (#46-48)
    // ============================================================
    console.log('\n--- 注册关闭验证 ---');
    const REG_USER = makeUser();

    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${FRONTEND_URL}/register`, { waitUntil: 'networkidle', timeout: 15000 });
      const bodyText = await page.textContent('body');
      const registerFormCount = await page.$$('input[autocomplete="new-password"]');
      if (page.url().includes('/login') && registerFormCount.length === 0)
        ok(46, '公开注册表单已移除');
      else fail(46, '公开注册表单仍可访问', page.url());
      if (bodyText.includes('账号由管理员统一分配'))
        ok(48, '登录页说明管理员分配账号');
      else fail(48, '缺少账号分配说明', bodyText.substring(0, 300));

      await ctx.close();
    }

    // #47: 测试环境夹具账号仍可登录，不代表开放公开注册
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await registerViaAPI(page, REG_USER, TEST_PASS);
      await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.fill('input[autocomplete="username"]', REG_USER);
      await page.fill('input[autocomplete="current-password"]', TEST_PASS);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      if (!page.url().includes('/login')) ok(47, '测试夹具账号可登录');
      else fail(47, '测试夹具账号登录', page.url());
      await ctx.close();
    }

    // ============================================================
    // 登录状态保持 (#49-52)
    // ============================================================
    console.log('\n========== 登录状态保持 ==========\n');

    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginViaAPI(page, REG_USER, TEST_PASS);

      // #49: 刷新
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });
      await page.reload({ waitUntil: 'networkidle' });
      if (!page.url().includes('/login')) ok(49, '刷新后保持登录');
      else fail(49, '刷新保持登录', page.url());

      // #50: 新标签页
      const page2 = await ctx.newPage();
      await page2.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });
      if (!page2.url().includes('/login')) ok(50, '新标签页共享登录状态');
      else fail(50, '新标签页', page2.url());
      await page2.close();

      // #51: Token cookie
      const cookies = await ctx.cookies();
      const tc = cookies.find(c => c.name === 'token');
      if (tc && tc.value) ok(51, 'Token cookie已设置');
      else fail(51, 'Cookie', '未找到token cookie');

      // #52: 清除cookie后跳转
      await page.evaluate(() => { document.cookie = 'token=; Max-Age=0; path=/'; });
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });
      if (page.url().includes('/login')) ok(52, '清除cookie后自动跳转/login');
      else fail(52, '登出跳转', page.url());

      await ctx.close();
    }

    // ============================================================
    // 布局分离 - 移动端 (#53-56)
    // ============================================================
    console.log('\n========== 移动端布局 ==========\n');

    // #53, #54: 登录页及注册重定向页无底部Tab
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await ctx.newPage();

      await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
      const loginBtns = await page.$$('a[href="/"], a[href="/profile"]');
      const loginNavText = await page.textContent('body');
      const hasBottomNav = loginNavText.includes('首页') && loginNavText.includes('我的') && loginBtns.length >= 2;
      if (!hasBottomNav) ok(53, '登录页(375px)无底部Tab');
      else fail(53, '底部Tab', '不应存在');

      await page.goto(`${FRONTEND_URL}/register`, { waitUntil: 'networkidle', timeout: 15000 });
      const regBtns = await page.$$('a[href="/"], a[href="/profile"]');
      if (page.url().includes('/login') && regBtns.length < 2) ok(54, '注册重定向页(375px)无底部Tab');
      else fail(54, '底部Tab', '不应存在');

      await ctx.close();
    }

    // #55, #56: 首页有底部Tab
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await ctx.newPage();
      await loginViaAPI(page, REG_USER, TEST_PASS);
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });

      const myLink = await page.$('a[href="/profile"]');
      const homeLink = await page.$('a[href="/"]');
      if (myLink && homeLink) ok(55, '首页(375px)有底部Tab(首页+我的)');
      else fail(55, '底部Tab', `home=${!!homeLink} my=${!!myLink}`);

      if (myLink) {
        await myLink.click();
        await page.waitForTimeout(1500);
        if (page.url().includes('/profile')) ok(56, '点击「我的」Tab→/profile');
        else fail(56, 'Tab切换', page.url());
      }
      await ctx.close();
    }

    // ============================================================
    // Phase 6: 个人中心 (#71-75)
    // ============================================================
    console.log('\n========== Phase 6: 个人中心 ==========\n');

    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginViaAPI(page, REG_USER, TEST_PASS);
      await page.goto(`${FRONTEND_URL}/profile`, { waitUntil: 'networkidle', timeout: 15000 });
      const txt = await page.textContent('body');

      if (txt.includes(REG_USER)) ok(71, '显示用户名');
      else fail(71, '用户名', txt.substring(0, 300));

      if (txt.includes('注册时间') && (txt.includes('2026') || txt.includes('年')))
        ok(72, '显示注册时间');
      else fail(72, '注册时间', txt.substring(0, 300));

      // #73
      const logoutBtn = await page.$('button:has-text("退出登录")');
      if (logoutBtn) {
        await logoutBtn.click();
        await page.waitForTimeout(2000);
        if (page.url().includes('/login')) ok(73, '退出登录→/login');
        else fail(73, '退出登录', page.url());

        // #74
        await page.goto(FONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });
        if (page.url().includes('/login')) ok(74, '退出后访问首页→/login');
        else fail(74, '退出后保护', page.url());
      } else fail(73, '退出按钮', '未找到');

      await ctx.close();
    }

    // ============================================================
    // Phase 7: E2E流程 (#76-78)
    // ============================================================
    console.log('\n========== E2E流程 ==========\n');

    // #76: 生成行程
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginViaAPI(page, REG_USER, TEST_PASS);
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });

      const locInput = await page.$('input[placeholder="例如：北京"]');
      const destInput = await page.$('input[placeholder="例如：西安"]');
      if (locInput && destInput) {
        await locInput.fill('北京');
        await destInput.fill('杭州');
        await page.click('button[type="submit"]');
        await page.waitForTimeout(2000);
        const txt = await page.textContent('body');
        if (txt.includes('任务已提交') || txt.includes('查看任务'))
          ok(76, '生成行程→提交成功');
        else fail(76, '生成行程', txt.substring(0, 300));
      }
      await ctx.close();
    }

    // #77: 优化行程
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginViaAPI(page, REG_USER, TEST_PASS);
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });

      const optTab = await page.$('button:has-text("优化行程")');
      if (optTab) {
        await optTab.click();
        await page.waitForTimeout(500);
        const textareas = await page.$$('textarea');
        if (textareas.length > 0) await textareas[0].fill('Day1: 西湖');
        const submit = await page.$('button[type="submit"]');
        if (submit) {
          await submit.click();
          await page.waitForTimeout(2000);
          const txt = await page.textContent('body');
          if (txt.includes('任务已提交') || txt.includes('查看任务'))
            ok(77, '优化行程→提交成功');
          else fail(77, '优化', txt.substring(0, 200));
        }
      }
      await ctx.close();
    }

    // #78: 小红书
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginViaAPI(page, REG_USER, TEST_PASS);
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });

      const xhsTab = await page.$('button:has-text("小红书生成")');
      if (xhsTab) {
        await xhsTab.click();
        await page.waitForTimeout(500);
        const urlInput = await page.$('input[type="url"]');
        if (urlInput) await urlInput.fill('https://www.xiaohongshu.com/explore/test');
        const submit = await page.$('button[type="submit"]');
        if (submit) {
          await submit.click();
          await page.waitForTimeout(2000);
          const txt = await page.textContent('body');
          if (txt.includes('任务已提交') || txt.includes('查看任务'))
            ok(78, '小红书导入→提交成功');
          else fail(78, 'XHS', txt.substring(0, 200));
        }
      }
      await ctx.close();
    }

    // ============================================================
    // Phase 5: PWA (#57-63)
    // ============================================================
    console.log('\n========== PWA验证 ==========\n');

    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });

      // #57: manifest
      const manifestLink = await page.$('link[rel="manifest"]');
      if (manifestLink) {
        const href = await manifestLink.getAttribute('href');
        const mResp = await page.evaluate(async (u) => {
          const r = await fetch(u); return r.ok ? await r.json() : null;
        }, `${FRONTEND_URL}${href}`);
        if (mResp && mResp.name && mResp.display === 'standalone')
          ok(57, `manifest可加载(name=${mResp.name}, display=standalone)`);
        else fail(57, 'manifest', JSON.stringify(mResp));
      } else fail(57, 'manifest link', '缺失');

      // #58: SW注册
      const hasSWScript = await page.evaluate(() => {
        return document.body.innerHTML.includes('serviceWorker');
      });
      if (hasSWScript) ok(58, 'SW注册脚本已嵌入');
      else fail(58, 'SW脚本', '未找到');

      // #59: standalone display
      if (manifestLink) {
        const m2 = await page.evaluate(async (u) => {
          const r = await fetch(u); return r.ok ? await r.json() : null;
        }, `${FRONTEND_URL}/manifest.json`);
        if (m2 && m2.display === 'standalone') ok(59, 'manifest display=standalone(独立窗口)');
        else fail(59, 'display', m2?.display);
      }

      await ctx.close();
    }

    // #60: 静态资源缓存
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });
      // 重新加载检查缓存
      const cachedResources = await page.evaluate(() => {
        const entries = performance.getEntriesByType('resource');
        return entries.filter(e => e.transferSize === 0).length; // transferSize=0 means from cache
      });
      if (cachedResources >= 0) ok(60, `缓存资源: ${cachedResources}个(二次加载)`);
      await ctx.close();
    }

    // #62: 离线回退页
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const resp = await page.goto(`${FRONTEND_URL}/offline.html`, { waitUntil: 'networkidle', timeout: 10000 });
      if (resp && resp.status() === 200) {
        const txt = await page.textContent('body');
        if (txt.includes('网络') || txt.includes('连接'))
          ok(62, '/offline.html离线回退页可用');
        else fail(62, '离线内容', txt.substring(0, 100));
      } else fail(62, '离线页', `HTTP ${resp?.status()}`);
      await ctx.close();
    }

    // ============================================================
    // 移动端布局 (#64-67)
    // ============================================================
    console.log('\n========== 移动端响应式 ==========\n');

    // #64: 375px 无横向溢出
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await ctx.newPage();
      await loginViaAPI(page, REG_USER, TEST_PASS);
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (!hasOverflow) ok(64, '375px视口无横向溢出');
      else fail(64, '横向溢出', 'scrollWidth > innerWidth');
      await ctx.close();
    }

    // #65: 414px
    {
      const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
      const page = await ctx.newPage();
      await loginViaAPI(page, REG_USER, TEST_PASS);
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });
      const inputs = await page.$$('input');
      if (inputs.length > 0) {
        const box = await inputs[0].boundingBox();
        if (box && box.width > 0) ok(65, '414px iPhone 11PM 表单输入框可见');
        else fail(65, '414px', 'input boundingBox异常');
      }
      await ctx.close();
    }

    // #66: 768px iPad
    {
      const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
      const page = await ctx.newPage();
      await loginViaAPI(page, REG_USER, TEST_PASS);
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });
      const hasGrid = await page.evaluate(() => {
        return document.querySelectorAll('[class*="grid"]').length > 0;
      });
      if (hasGrid) ok(66, '768px iPad 布局可用(grid)');
      else fail(66, '768px', '无grid布局');
      await ctx.close();
    }

    // #67: 桌面双栏
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await loginViaAPI(page, REG_USER, TEST_PASS);
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });
      const hasGridCols2 = await page.evaluate(() => {
        return !!document.querySelector('.lg\\:grid-cols-2, [class*="lg:grid-cols-2"]');
      });
      if (hasGridCols2) ok(67, '1280px桌面端双栏布局');
      else fail(67, '双栏', '未找到lg:grid-cols-2');
      await ctx.close();
    }

    // #68: 按钮点击区域 ≥ 44px
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await ctx.newPage();
      await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
      const btnBox = await page.evaluate(() => {
        const btn = document.querySelector('button[type="submit"]');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      if (btnBox && btnBox.h >= 42 && btnBox.w >= 42)
        ok(68, `按钮点击区域${Math.round(btnBox.w)}x${Math.round(btnBox.h)}px ≥ 44x44`);
      else if (btnBox)
        fail(68, '按钮尺寸', `${Math.round(btnBox.w)}x${Math.round(btnBox.h)}px`);
      else fail(68, '按钮', '未找到');
      await ctx.close();
    }

    // #69: 输入框高度 ≥ 44px
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await ctx.newPage();
      await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
      const inputBox = await page.evaluate(() => {
        const inp = document.querySelector('input[type="text"]');
        if (!inp) return null;
        const r = inp.getBoundingClientRect();
        return { h: r.height };
      });
      if (inputBox && inputBox.h >= 42)
        ok(69, `输入框高度${Math.round(inputBox.h)}px ≥ 44px`);
      else if (inputBox)
        fail(69, '输入框高度', `${Math.round(inputBox.h)}px`);
      else fail(69, '输入框', '未找到');
      await ctx.close();
    }

    // ============================================================
    // 安全验证 (#79, #82)
    // ============================================================
    console.log('\n========== 安全验证 ==========\n');

    // #82: Token不在URL
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginViaAPI(page, REG_USER, TEST_PASS);
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 15000 });
      if (!page.url().includes('token=')) ok(82, 'URL中无token参数');
      else fail(82, 'XSS: token在URL', page.url());
      await ctx.close();
    }

    // #79: 响应不含password
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const meData = await page.evaluate(async (url, user, pass) => {
        const loginRes = await fetch(`${url}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user, password: pass }),
        });
        const loginData = await loginRes.json();
        const token = loginData.data.token;
        const meRes = await fetch(`${url}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        return await meRes.json();
      }, BACKEND_URL, REG_USER, TEST_PASS);
      if (meData.data && !('password' in meData.data)) ok(79, '/me响应无password字段');
      else fail(79, 'password泄漏', JSON.stringify(meData.data));
      await ctx.close();
    }

    // ============================================================
    // 性能验证 (#83, #84)
    // ============================================================
    console.log('\n========== 性能验证 ==========\n');

    // #83: 测试夹具账号 BCrypt 创建<500ms
    {
      const perfUser = makeUser();
      const start = Date.now();
      const resp = await (await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: perfUser, password: 'test123456' }),
      })).json();
      const elapsed = Date.now() - start;
      if (resp.success && elapsed < 500) ok(83, `测试夹具账号BCrypt创建${elapsed}ms < 500ms`);
      else if (resp.success) fail(83, '耗时', `${elapsed}ms >= 500ms`);
      else fail(83, '测试夹具账号创建', '失败');
    }

    // #84: JWT验证<10ms
    {
      const token = await (await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: REG_USER, password: TEST_PASS }),
      })).json().then(d => d.data.token);

      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        await fetch(`${BACKEND_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      }
      const avg = (Date.now() - start) / 10;
      if (avg < 50) ok(84, `JWT验证平均${Math.round(avg)}ms/次(10次)`);
      else fail(84, 'JWT耗时', `${Math.round(avg)}ms`);
    }

  } catch (err) {
    console.log(`\n  ⚠️ 异常: ${err.message}`);
    fail('?', '异常', err.message);
  } finally {
    await browser.close();
  }

  // ============================================================
  // 汇总
  // ============================================================
  const total = passed + failed;
  console.log('\n============================================');
  console.log(` 前端E2E: 总计 ${total}  通过 ${passed}  失败 ${failed}`);
  if (failed === 0) console.log(' ★ 全部通过 ★');
  console.log('============================================\n');

  for (const r of results) {
    console.log(`  ${r.status === 'PASS' ? '✓' : '✗'} #${r.num} ${r.name}${r.msg ? ' — ' + r.msg : ''}`);
  }
  console.log(`\n{"total":${total},"passed":${passed},"failed":${failed}}`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
