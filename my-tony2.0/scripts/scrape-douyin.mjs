/**
 * 抖音爬虫 - 有头模式，遇到验证码等用户手动解，之后自动提取
 */
import { chromium } from 'playwright';
import fs from 'fs';

const OUTPUT_DIR = './scripts/knowledge-base';
const STATE_FILE = `${OUTPUT_DIR}/browser-state.json`;
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function scrapeDouyin(keyword = '染发教程') {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    storageState: STATE_FILE,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    viewport: { width: 1280, height: 800 },
  });

  // 隐藏 webdriver 标志
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  const results = [];

  // 先打开首页，让 token 初始化
  console.log('打开抖音首页，初始化 session...');
  await page.goto('https://www.douyin.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // 找到搜索框，像真人一样输入关键词
  console.log(`搜索: ${keyword}`);
  const searchBox = await page.waitForSelector('input[placeholder*="搜索"], input[data-e2e*="search"], input[class*="search"]', { timeout: 10000 });
  await searchBox.click();
  await page.waitForTimeout(500);
  await searchBox.fill(keyword);
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  // 切换到视频 tab
  const videoTab = await page.$('text=视频').catch(() => null);
  if (videoTab) { await videoTab.click(); await page.waitForTimeout(2000); }
  console.log('已进入搜索结果页');

  // 检查是否有验证码，等用户解掉
  const checkCaptcha = async () => {
    const captcha = await page.$('text=请完成下列验证').catch(() => null)
      || await page.$('[class*="captcha"]').catch(() => null)
      || await page.$('[class*="verify"]').catch(() => null);
    return !!captcha;
  };

  let hasCaptcha = await checkCaptcha();
  if (hasCaptcha) {
    console.log('\n⚠️  检测到验证码！请在浏览器里手动滑动完成验证...');
    // 等验证码消失（最多等2分钟）
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(1000);
      hasCaptcha = await checkCaptcha();
      if (!hasCaptcha) {
        console.log('✅ 验证码已通过！');
        break;
      }
      if (i % 10 === 0) console.log(`等待验证码...（${i}秒）`);
    }
  }

  // 等视频卡片真正渲染出来（不是 skeleton 占位符）
  console.log('等待视频内容渲染...');
  try {
    // 等到页面出现包含中文的文字（说明卡片内容加载完了）
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      // 页面中文字数超过100字，且包含非导航的内容
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5 && /[一-龥]/.test(l));
      return lines.length > 10;
    }, { timeout: 20000 });
    console.log('✅ 视频内容已渲染');
  } catch {
    console.log('内容等待超时，继续尝试...');
  }

  await page.waitForTimeout(2000);

  // 滚动加载更多
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: `${OUTPUT_DIR}/douyin-final.png` });
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('页面文字前500字:\n', bodyText.slice(0, 500));

  // 提取视频数据
  const videos = await page.evaluate(() => {
    const items = [];
    // 尝试多种抖音视频卡片选择器
    const selectors = [
      '[data-e2e="search-video-card"]',
      '[data-e2e="video-card"]',
      '[class*="DUXContainer"]',
      '[class*="video-card"]',
      '[class*="search-card"]',
      'li[class*="NyFlex"]',
      '[class*="card-container"]',
    ];

    let cards = [];
    for (const sel of selectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        console.log('使用选择器:', sel, '找到', found.length, '个');
        cards = found;
        break;
      }
    }

    // 如果还是找不到，尝试找所有包含链接的卡片
    if (cards.length === 0) {
      cards = document.querySelectorAll('a[href*="/video/"]');
    }

    cards.forEach((card, i) => {
      if (i >= 20) return;
      const el = card.closest?.('li, article, [class*="card"]') || card;
      const title = el.querySelector?.('[class*="title"], h3, p')?.textContent?.trim()
        || card.textContent?.trim();
      const link = card.href || card.querySelector?.('a')?.href;
      if (title && title.length > 3) {
        items.push({ title: title.slice(0, 100), link: link?.slice(0, 100) });
      }
    });
    return items;
  });

  console.log(`\n找到 ${videos.length} 个视频`);
  videos.forEach((v, i) => console.log(`${i + 1}. ${v.title}`));

  // 同时 dump 页面文字（作为备用）
  const pageText = await page.evaluate(() => document.body.innerText);
  const lines = pageText.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 8 && /[一-龥]/.test(l))
    .slice(0, 50);

  console.log('\n页面中文文字:');
  lines.forEach(l => console.log(' >', l));

  const output = { keyword, videos, pageText: lines };
  fs.writeFileSync(`${OUTPUT_DIR}/douyin-results.json`, JSON.stringify(output, null, 2));
  console.log(`\n✅ 结果保存到 ${OUTPUT_DIR}/douyin-results.json`);

  // 保持浏览器开着5秒让你看结果
  await page.waitForTimeout(5000);
  await browser.close();
  return output;
}

scrapeDouyin().catch(console.error);
