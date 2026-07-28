import { chromium } from 'playwright';
import fs from 'fs';

const STATE_FILE = './scripts/knowledge-base/browser-state.json';
const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
const context = await browser.newContext({
  storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'zh-CN', viewport: { width: 1280, height: 900 },
});
await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
const page = await context.newPage();

const keyword = '固色发膜';
const url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes&type=51`;
console.log('打开:', url);
try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch {}
await page.waitForTimeout(6000);
await page.screenshot({ path: './scripts/knowledge-base/search-debug.png' });

const links = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a')).map(a => a.href).filter(h => h.length > 10).slice(0, 30)
);
console.log('当前 URL:', page.url());
console.log('所有链接:');
links.forEach(l => console.log(' ', l.slice(0, 100)));
await browser.close();
