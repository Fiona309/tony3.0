import { chromium } from 'playwright';
import fs from 'fs';

const STATE_FILE = './scripts/knowledge-base/browser-state.json';

async function main() {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    storageState: STATE_FILE,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  const apiCalls = [];

  page.on('response', async (response) => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (ct.includes('json')) {
      try {
        const text = await response.text();
        apiCalls.push({ url: url.slice(0, 120), size: text.length, preview: text.slice(0, 100) });
      } catch {}
    }
  });

  await page.goto('https://www.douyin.com/search/染发教程?type=video', {
    waitUntil: 'domcontentloaded', timeout: 20000,
  }).catch(() => {});
  await page.waitForTimeout(10000);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(3000);

  await browser.close();

  console.log(`共捕获 ${apiCalls.length} 个 JSON 接口:`);
  apiCalls.forEach(a => console.log(`[${a.size}字节] ${a.url}`));
  fs.writeFileSync('./scripts/knowledge-base/api-calls.json', JSON.stringify(apiCalls, null, 2));
}

main().catch(console.error);
