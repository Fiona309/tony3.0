import { chromium } from 'playwright';
import fs from 'fs';

const STATE_FILE = './scripts/knowledge-base/browser-state.json';
const OUTPUT_DIR = './scripts/knowledge-base';

async function main() {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({
    storageState: STATE_FILE,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  await page.goto('https://www.douyin.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUTPUT_DIR}/douyin-homepage.png` });

  // 找所有 input 元素
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(el => ({
      type: el.type,
      placeholder: el.placeholder,
      class: el.className?.toString().slice(0, 80),
      visible: el.offsetWidth > 0 && el.offsetHeight > 0,
      rect: { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width) }
    }));
  });
  console.log('页面 input 元素:');
  inputs.forEach(i => console.log(JSON.stringify(i)));

  await browser.close();
}
main().catch(console.error);
