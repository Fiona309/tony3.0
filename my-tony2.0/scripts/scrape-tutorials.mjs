/**
 * 拦截抖音和小红书的 API 请求，直接从 JSON 响应拿视频/笔记数据
 */
import { chromium } from 'playwright';
import fs from 'fs';

const OUTPUT_DIR = './scripts/knowledge-base';
const STATE_FILE = `${OUTPUT_DIR}/browser-state.json`;
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function interceptDouyin(browser) {
  console.log('\n=== 拦截抖音 API ===');
  const context = await browser.newContext({
    storageState: STATE_FILE,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  const captured = [];

  // 拦截所有 API 响应
  page.on('response', async (response) => {
    const url = response.url();
    // 抖音搜索 API 通常包含 search 或 aweme
    if ((url.includes('/search/') || url.includes('aweme') || url.includes('/feed/')) &&
        response.headers()['content-type']?.includes('json')) {
      try {
        const json = await response.json();
        // 提取视频列表
        const videos = json?.data || json?.aweme_list || json?.item_list || [];
        if (Array.isArray(videos) && videos.length > 0) {
          console.log(`拦截到 API: ${url.slice(0, 80)}, 数据条数: ${videos.length}`);
          videos.slice(0, 10).forEach(v => {
            const desc = v?.desc || v?.title || v?.share_info?.share_desc || '';
            const author = v?.author?.nickname || '';
            const likes = v?.statistics?.digg_count || 0;
            if (desc) captured.push({ desc, author, likes, url: `https://www.douyin.com/video/${v?.aweme_id}` });
          });
        }
      } catch {}
    }
  });

  try {
    await page.goto('https://www.douyin.com/search/染发教程?type=video', {
      waitUntil: 'domcontentloaded', timeout: 20000,
    });
    // 等待 API 数据加载
    await page.waitForTimeout(8000);
    // 滚动触发更多加载
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(3000);

    await page.screenshot({ path: `${OUTPUT_DIR}/douyin-intercept.png` });
  } catch (e) {
    console.log('抖音导航出错:', e.message.slice(0, 80));
  }

  console.log(`抖音共拦截到 ${captured.length} 个视频`);
  await context.close();
  return { platform: 'douyin', items: captured };
}

async function interceptXhs(browser) {
  console.log('\n=== 拦截小红书 API ===');
  const context = await browser.newContext({
    storageState: STATE_FILE,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  const captured = [];

  page.on('response', async (response) => {
    const url = response.url();
    if ((url.includes('api') || url.includes('search') || url.includes('feed')) &&
        response.headers()['content-type']?.includes('json')) {
      try {
        const json = await response.json();
        // 小红书笔记数据结构
        const notes = json?.data?.items || json?.items || json?.notes || [];
        if (Array.isArray(notes) && notes.length > 0) {
          console.log(`拦截到 API: ${url.slice(0, 80)}, 数据条数: ${notes.length}`);
          notes.slice(0, 10).forEach(n => {
            const title = n?.note_card?.title || n?.display_title || n?.title || '';
            const desc = n?.note_card?.desc || n?.desc || '';
            const author = n?.note_card?.user?.nickname || n?.user?.nickname || '';
            if (title || desc) captured.push({ title, desc, author, id: n?.id });
          });
        }
      } catch {}
    }
  });

  try {
    await page.goto('https://www.xiaohongshu.com/search_result?keyword=染发教程自己染', {
      waitUntil: 'domcontentloaded', timeout: 20000,
    });
    await page.waitForTimeout(8000);
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUTPUT_DIR}/xhs-intercept.png` });
  } catch (e) {
    console.log('小红书导航出错:', e.message.slice(0, 80));
  }

  console.log(`小红书共拦截到 ${captured.length} 条笔记`);
  await context.close();
  return { platform: 'xiaohongshu', items: captured };
}

async function main() {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const results = {};
  results.douyin = await interceptDouyin(browser);
  results.xiaohongshu = await interceptXhs(browser);
  await browser.close();

  const outputFile = `${OUTPUT_DIR}/scrape-results.json`;
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf-8');
  console.log('\n=== 完成 ===');
  console.log(`抖音: ${results.douyin.items.length} 条`);
  console.log(`小红书: ${results.xiaohongshu.items.length} 条`);
  if (results.douyin.items.length > 0) {
    console.log('\n抖音样本:');
    results.douyin.items.slice(0, 3).forEach(v => console.log(' -', v.desc.slice(0, 60)));
  }
}

main().catch(console.error);
