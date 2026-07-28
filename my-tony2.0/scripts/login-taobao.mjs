/**
 * 打开淘宝，自动轮询检测登录态。检测到登录后立刻保存 cookies 并退出。
 * 用法: node scripts/login-taobao.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';

const STATE_FILE = './scripts/knowledge-base/browser-state.json';

const browser = await chromium.launch({
  headless: false,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
});

const context = await browser.newContext({
  storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'zh-CN',
  viewport: { width: 1280, height: 900 },
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});

const page = await context.newPage();
await page.goto('https://login.taobao.com', { waitUntil: 'domcontentloaded' });

console.log('\n🔑 请在浏览器中登录淘宝（扫码或账号密码均可）');
console.log('   登录成功后脚本会自动检测并保存登录态\n');

// 轮询最多 5 分钟，每 2 秒检查一次
const TOTAL_SEC = 300;
const INTERVAL_MS = 2000;
let saved = false;

for (let i = 0; i < TOTAL_SEC / 2; i++) {
  await page.waitForTimeout(INTERVAL_MS);
  const cookies = await context.cookies();
  // 淘宝登录关键 cookie：cookie2, _tb_token_, unb, sg, _m_h5_tk
  const loginCookies = cookies.filter(c =>
    ['cookie2', '_tb_token_', 'unb', 'sg', '_m_h5_tk'].includes(c.name) && c.value
  );
  if (loginCookies.length >= 2) {
    await context.storageState({ path: STATE_FILE });
    console.log(`✅ 检测到登录态（关键cookie: ${loginCookies.map(c => c.name).join(', ')}）`);
    console.log(`   已保存到 ${STATE_FILE}`);
    saved = true;
    break;
  }
  if (i % 5 === 0 && i > 0) console.log(`   等待中... (${i * 2}/${TOTAL_SEC}秒)`);
}

if (!saved) console.log('⏰ 超时未检测到登录，请重试');
await browser.close();
process.exit(0);
