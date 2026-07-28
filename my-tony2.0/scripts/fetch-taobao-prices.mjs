/**
 * 读 products.json，去淘宝抓价格 + 标题 + 销量，更新回 products.json
 * 用法: node scripts/fetch-taobao-prices.mjs
 * 前提: 先跑 scripts/login-taobao.mjs 登录淘宝
 */
import { chromium } from 'playwright';
import fs from 'fs';

const STATE_FILE = './scripts/knowledge-base/browser-state.json';
const PRODUCTS_FILE = './scripts/knowledge-base/products.json';
const CONCURRENCY = 2;

if (!fs.existsSync(STATE_FILE)) {
  console.error('❌ 没找到登录态文件，请先跑: node scripts/login-taobao.mjs');
  process.exit(1);
}

async function fetchTaobaoInfo(browser, productName) {
  const searchUrl = `https://s.taobao.com/search?q=${encodeURIComponent(productName)}&sort=sale-desc`;
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    viewport: { width: 1280, height: 800 },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await ctx.newPage();
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(4000);

    const result = await page.evaluate(() => {
      // 找第一个真实商品卡片：内部要既有"价格数字"又有"标题"
      const cards = document.querySelectorAll('a[href*="item.taobao"], a[href*="detail"], [class*="item"]');
      for (const card of cards) {
        // 抓价格（取所有可能的数字）
        const allText = card.textContent || '';
        const priceMatch = allText.match(/(?:¥|￥)?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|$)/);
        const priceEl = card.querySelector('[class*="priceInt" i], [class*="price-int" i], [class*="realPrice" i]');
        const priceFromEl = priceEl?.textContent?.trim().replace(/[^\d.]/g, '');
        const price = priceFromEl || priceMatch?.[1];
        if (!price || !parseFloat(price) || parseFloat(price) > 99999) continue;

        // 抓标题
        const titleSelectors = ['[class*="title" i] span', '[class*="title" i]', 'img[alt]'];
        let title = '';
        for (const sel of titleSelectors) {
          const el = card.querySelector(sel);
          title = (el?.textContent?.trim() || el?.getAttribute('alt') || '').slice(0, 100);
          if (title.length > 5) break;
        }
        if (!title) continue;

        // 抓销量/付款人数
        const saleMatch = allText.match(/(\d+(?:\.\d+)?[万w+]?)\s*(?:人付款|人收货|月销|销量)/);
        const sale = saleMatch?.[0] || null;

        // 抓链接
        const href = (card.tagName === 'A' ? card.href : card.querySelector('a')?.href) || '';
        return { price, title, sale, url: href };
      }
      return null;
    });

    return result
      ? {
          name: productName,
          taobao_price: `¥${result.price}`,
          taobao_title: result.title,
          taobao_url: result.url || searchUrl,
          taobao_sale: result.sale,
        }
      : { name: productName, taobao_price: null, taobao_title: null, taobao_url: searchUrl, taobao_sale: null };
  } catch (e) {
    return { name: productName, taobao_price: null, taobao_title: null, taobao_url: searchUrl, taobao_sale: null, error: e.message };
  } finally {
    await ctx.close();
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
  const products = data.products;
  console.log(`📦 ${products.length} 个产品待查价\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  let hit = 0;
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const chunk = products.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(p => fetchTaobaoInfo(browser, p.name)));
    chunk.forEach((p, idx) => {
      const r = results[idx];
      p.taobao_price = r.taobao_price;
      p.taobao_title = r.taobao_title;
      p.taobao_url = r.taobao_url;
      p.taobao_sale = r.taobao_sale;
      if (r.taobao_price) hit++;
      console.log(`  [${i + idx + 1}/${products.length}] ${p.name}`);
      console.log(`        ${r.taobao_price || '❌ 无价'} | ${r.taobao_title?.slice(0, 50) || ''}`);
      if (r.taobao_sale) console.log(`        销量: ${r.taobao_sale}`);
    });
  }

  await browser.close();

  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2));
  console.log(`\n✅ 完成：${hit}/${products.length} 个产品抓到价格`);
}

main().catch(console.error);
