/**
 * 小红书登录态保存（自动检测）
 * 用法: node scripts/login-xhs.mjs
 *
 * 流程：打开 XHS 主页 → 弹出登录二维码 → 扫码 → 脚本检测到 web_session cookie → 自动保存 → 退出
 * 不覆盖已有的淘宝登录态（Playwright storageState 自动合并多域 cookies）
 */
import { chromium } from 'playwright';
import fs from 'fs';

const STATE_FILE = './scripts/knowledge-base/browser-state.json';

const browser = await chromium.launch({
  headless: false,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
});

const context = await browser.newContext({
  // 沿用已有的 state（含淘宝 cookie）— XHS 登完后会合并保存
  storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'zh-CN',
  viewport: { width: 1280, height: 900 },
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});

// 关键：清除小红书域的所有旧 cookie（防止旧 web_session 误判登录态）
// 保留淘宝等其他域 cookies
const allCookies = await context.cookies();
const nonXhs = allCookies.filter(c => !c.domain.includes('xiaohongshu.com'));
await context.clearCookies();
if (nonXhs.length) await context.addCookies(nonXhs);
console.log(`🧹 清除 ${allCookies.length - nonXhs.length} 个旧小红书 cookie，保留 ${nonXhs.length} 个其他域 cookie`);

const page = await context.newPage();
await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'domcontentloaded' });

console.log('\n🔑 请在浏览器中扫码登录小红书');
console.log('   登录成功后脚本会自动检测并保存登录态，无需回到终端\n');

// 轮询：每 2s 检查一次 web_session cookie
const TOTAL_SEC = 300;  // 5 分钟超时
const INTERVAL_MS = 2000;
let saved = false;

for (let i = 0; i < TOTAL_SEC / 2; i++) {
  await page.waitForTimeout(INTERVAL_MS);
  const cookies = await context.cookies();
  // 关键：web_session 只有登录后才会被设置（访客没有）
  const sessionCookie = cookies.find(c =>
    c.domain.includes('xiaohongshu.com') &&
    c.name === 'web_session' &&
    c.value && c.value.length > 10
  );
  if (sessionCookie) {
    await context.storageState({ path: STATE_FILE });
    console.log(`✅ 检测到真实登录态（web_session=${sessionCookie.value.slice(0, 20)}...）`);
    console.log(`   已保存到 ${STATE_FILE}`);
    console.log('   小红书 + 淘宝登录态都在同一份文件，下次解析笔记直接生效。');
    saved = true;
    break;
  }
  if (i % 5 === 0 && i > 0) console.log(`   等待扫码... (${i * 2}/${TOTAL_SEC}秒)`);
}

if (!saved) console.log('⏰ 超时未检测到登录，请重试');
await browser.close();
process.exit(0);
