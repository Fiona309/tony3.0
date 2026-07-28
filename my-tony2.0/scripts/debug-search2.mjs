/**
 * 调试：检查登录状态 + 测试搜索API拦截
 */
import { chromium } from 'playwright';
import fs from 'fs';

const STATE_FILE = './scripts/knowledge-base/browser-state.json';
const OUTPUT_DIR = './scripts/knowledge-base';

const browser = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
const context = await browser.newContext({
  storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'zh-CN', viewport: { width: 1280, height: 900 },
});
await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

const page = await context.newPage();

// 拦截所有 XHS API 响应
const capturedApis = [];
page.on('response', async (res) => {
  const u = res.url();
  if (u.includes('xiaohongshu.com/api') || u.includes('xhs') && u.includes('/api')) {
    try {
      const json = await res.json();
      capturedApis.push({ url: u.slice(0, 100), keys: Object.keys(json?.data || {}).join(',') });
      // 搜索笔记 API
      if (u.includes('search') || u.includes('feed')) {
        console.log('🔍 API:', u.slice(0, 120));
        console.log('   data keys:', JSON.stringify(Object.keys(json?.data || {})));
        fs.writeFileSync(`${OUTPUT_DIR}/search-api-response.json`, JSON.stringify(json, null, 2));
      }
    } catch {}
  }
});

// 先去主页，确认是否已登录
console.log('打开 XHS 主页...');
try { await page.goto('https://www.xiaohongshu.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch {}
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUTPUT_DIR}/homepage.png` });
console.log('主页 URL:', page.url());

// 检查是否有登录态
const isLoggedIn = await page.evaluate(() => {
  return !document.querySelector('[class*="login"], [class*="Login"]') &&
    (!!document.querySelector('[class*="avatar"], [class*="user"]') ||
     document.cookie.includes('web_session'));
});
console.log('疑似已登录:', isLoggedIn);

// 尝试点击搜索框并输入关键词
console.log('\n尝试搜索...');
const searchInput = await page.$('input[placeholder*="搜索"], input[type="search"], [class*="search-input"] input').catch(() => null);
if (searchInput) {
  console.log('找到搜索框，输入关键词...');
  await searchInput.click();
  await page.waitForTimeout(500);
  await searchInput.fill('固色发膜');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUTPUT_DIR}/after-search.png` });
  console.log('搜索后 URL:', page.url());

  // 再次尝试找笔记链接
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a')).map(a => a.href).filter(h => h.includes('/explore') || h.includes('xsec_token')).slice(0, 10)
  );
  console.log('搜索后链接:', links);
} else {
  console.log('未找到搜索框，页面可能需要登录');
  const allInputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, placeholder: i.placeholder, class: i.className?.slice(0,60) }))
  );
  console.log('所有 input:', JSON.stringify(allInputs, null, 2));
}

console.log('\n捕获到的 API:', capturedApis.slice(0, 10));
await page.waitForTimeout(3000);
await browser.close();
