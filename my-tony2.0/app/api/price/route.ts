import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(process.cwd(), 'scripts/knowledge-base/browser-state.json');

async function fetchPrice(
  browser: import('playwright').Browser,
  name: string,
): Promise<{ name: string; price: string | null; url: string }> {
  const searchUrl = `https://s.taobao.com/search?q=${encodeURIComponent(name)}&sort=sale-desc`;
  const context = await browser.newContext({
    storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    const price = await page.evaluate(() => {
      // 尝试多种淘宝价格选择器
      const selectors = [
        '[class*="priceInt"]',
        '[class*="price-int"]',
        '[class*="Price_priceInt"]',
        '[class*="realPrice"]',
        '[class*="price"]',
      ];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const text = el.textContent?.trim().replace(/[^\d.]/g, '');
          if (text && parseFloat(text) > 0) return text;
        }
      }
      return null;
    });

    return { name, price: price ? `¥${price}` : null, url: searchUrl };
  } catch {
    return { name, price: null, url: searchUrl };
  } finally {
    await context.close();
  }
}

export async function POST(request: Request) {
  const { products } = await request.json() as { products: string[] };
  if (!products?.length) return Response.json({ results: [] });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  try {
    // 并行抓取所有产品价格
    const results = await Promise.all(products.map((name) => fetchPrice(browser, name)));
    return Response.json({ results });
  } catch (e) {
    console.error('[price error]', e);
    return Response.json({ results: products.map((name) => ({ name, price: null })) });
  } finally {
    await browser.close();
  }
}
