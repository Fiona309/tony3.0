/**
 * 解析抖音单个视频：提取描述、评论、字幕
 * 用法：node scripts/parse-video.mjs <抖音视频链接>
 */
import { chromium } from 'playwright';
import fs from 'fs';

const OUTPUT_DIR = './scripts/knowledge-base';
const STATE_FILE = `${OUTPUT_DIR}/browser-state.json`;
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function parseDouyinVideo(url) {
  console.log('解析视频:', url);

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

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
  const subtitles = [];
  const apiData = [];  // 直接保存 API 原始数据
  // 拦截字幕 API
  page.on('response', async (response) => {
    const u = response.url();
    if (u.includes('subtitle') || u.includes('caption') || u.includes('srt')) {
      try {
        const text = await response.text();
        if (text.length > 50) {
          console.log('📝 拦截到字幕数据:', u.slice(0, 80));
          subtitles.push({ url: u, data: text });
        }
      } catch {}
    }
    // 也拦截视频详情 API
    if (u.includes('/aweme/v1/web/aweme/detail') || u.includes('/aweme/detail')) {
      try {
        const json = await response.json();
        const aweme = json?.aweme_detail;
        if (aweme) {
          console.log('📦 拦截到视频详情 API');
          apiData.push({
            desc: aweme.desc,
            author: aweme.author?.nickname,
            createTime: aweme.create_time,
            statistics: aweme.statistics,
            subtitleInfos: aweme.video?.subtitle_infos || [],
            tags: (aweme.text_extra || []).map(t => t.hashtag_name).filter(Boolean),
          });
          const subs = aweme?.video?.subtitle_infos || aweme?.subtitle_infos || [];
          if (subs.length > 0) {
            console.log(`发现 ${subs.length} 条字幕轨道`);
            subtitles.push({ type: 'subtitle_info', data: subs });
          }
        }
      } catch {}
    }
  });

  // 打开视频页：domcontentloaded 能触发 API 拦截，超时则忽略继续
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {
    console.log('页面加载超时，继续等待 API 响应...');
  }
  await page.waitForTimeout(5000);

  // 检查验证码
  const captcha = await page.$('text=请完成下列验证').catch(() => null);
  if (captcha) {
    console.log('⚠️  出现验证码，请手动滑动...');
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(1000);
      const still = await page.$('text=请完成下列验证').catch(() => null);
      if (!still) { console.log('✅ 验证码通过'); break; }
    }
    await page.waitForTimeout(3000);
  }

  // 截图（可选，超时不阻断）
  await page.screenshot({ path: `${OUTPUT_DIR}/video-page.png`, timeout: 5000 }).catch(() => {});

  // 提取视频描述和标签
  const videoInfo = await page.evaluate(() => {
    const selectors = {
      desc: ['[data-e2e="video-desc"]', '[class*="desc-text"]', '[class*="video-desc"]',
             '[class*="DUXRichText"]', 'h1', '[class*="title"]'],
      author: ['[data-e2e="video-author-name"]', '[class*="nickname"]', '[class*="author-name"]'],
    };

    const find = (sels) => {
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      return '';
    };

    const desc = find(selectors.desc);
    const author = find(selectors.author);
    const tags = Array.from(document.querySelectorAll('a[href*="hashtag"], [class*="tag"]'))
      .map(t => t.textContent.trim()).filter(t => t.startsWith('#') || t.length < 20).slice(0, 15);

    return { desc, author, tags };
  });

  console.log('\n=== 视频信息 ===');
  console.log('作者:', videoInfo.author);
  console.log('描述:', videoInfo.desc?.slice(0, 200));
  console.log('标签:', videoInfo.tags.join(' '));

  // 滚动到评论区，加载评论
  console.log('\n加载评论区...');
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(2000);

  const comments = await page.evaluate(() => {
    const results = [];
    // 找所有包含中文且有实质内容的段落/span，跳过纯标签
    const skipWords = ['作者回复过', '回复', '展开', '收起', '查看更多', '热评'];
    document.querySelectorAll('span, p, div').forEach(el => {
      // 只取直接文字节点（不含子元素），避免重复
      if (el.children.length > 2) return;
      const text = el.textContent?.trim();
      if (!text || text.length < 8 || text.length > 300) return;
      if (!/[一-龥]/.test(text)) return;
      if (skipWords.some(w => text === w)) return;
      const cls = el.className?.toString() || '';
      // 匹配评论相关的 class
      if (cls.includes('comment') || cls.includes('Comment') || cls.includes('review') || cls.includes('content')) {
        results.push(text);
      }
    });
    // 去重
    return [...new Set(results)].slice(0, 30).map(text => ({ text }));
  });

  console.log(`\n找到 ${comments.length} 条评论`);
  comments.slice(0, 5).forEach((c, i) => console.log(`${i+1}. ${c.text}`));

  // 整理输出
  const result = {
    url,
    author: videoInfo.author || apiData[0]?.author,
    description: videoInfo.desc || apiData[0]?.desc,
    tags: videoInfo.tags.length ? videoInfo.tags : (apiData[0]?.tags || []),
    comments,
    subtitles,
    apiData,
    scrapedAt: new Date().toISOString(),
  };

  const outFile = `${OUTPUT_DIR}/video-parsed.json`;
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`\n✅ 结果已保存到 ${outFile}`);

  await page.waitForTimeout(3000);
  await browser.close();
  return result;
}

const url = process.argv[2];
if (!url) {
  console.log('用法: node scripts/parse-video.mjs <抖音视频链接>');
  console.log('支持: https://www.douyin.com/video/xxx 或 https://v.douyin.com/xxx');
  process.exit(1);
}

parseDouyinVideo(url).catch(console.error);
