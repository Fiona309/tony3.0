/**
 * 调试v2：等页面完全渲染后再提取内容
 */
import { chromium } from 'playwright';
import fs from 'fs';

const OUTPUT_DIR = './scripts/knowledge-base';
const STATE_FILE = `${OUTPUT_DIR}/browser-state.json`;

async function scrape(browser, url, name, waitSelector) {
  const context = await browser.newContext({
    storageState: STATE_FILE,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  try {
    console.log(`\n打开: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {
      console.log('networkidle timeout，继续等待...');
    });

    // 模拟人类行为：移动鼠标、滚动
    await page.mouse.move(600, 400);
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(3000);

    if (waitSelector) {
      await page.waitForSelector(waitSelector, { timeout: 15000 }).catch(() => console.log('目标选择器未出现'));
    }

    await page.screenshot({ path: `${OUTPUT_DIR}/${name}-v2.png`, fullPage: false });

    const text = await page.evaluate(() => document.body.innerText.slice(0, 5000));
    const html = await page.evaluate(() => document.body.innerHTML.slice(0, 8000));

    fs.writeFileSync(`${OUTPUT_DIR}/${name}-v2.txt`, text, 'utf-8');
    fs.writeFileSync(`${OUTPUT_DIR}/${name}-v2.html`, html, 'utf-8');

    console.log(`${name} 页面文本前300字:\n`, text.slice(0, 300));
    console.log(`HTML 前200字:`, html.slice(0, 200));
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  await scrape(browser, 'https://www.douyin.com/search/染发教程?type=video', 'douyin', null);
  await scrape(browser, 'https://www.xiaohongshu.com/search_result?keyword=染发教程自己染', 'xhs', null);
  await browser.close();
  console.log('\n完成');
}

main().catch(console.error);
