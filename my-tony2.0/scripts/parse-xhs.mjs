/**
 * 解析小红书图文笔记：提取标题、正文、图片
 * 用法：node scripts/parse-xhs.mjs <小红书链接>
 */
import { chromium } from 'playwright';
import fs from 'fs';

const OUTPUT_DIR = './scripts/knowledge-base';
const STATE_FILE = `${OUTPUT_DIR}/browser-state.json`;
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function parseXhsNote(url) {
  console.log('解析小红书笔记:', url);

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    viewport: { width: 1280, height: 900 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  const apiNoteData = [];

  // 拦截小红书笔记 API
  page.on('response', async (response) => {
    const u = response.url();
    if (u.includes('/api/sns/web/v1/feed') || u.includes('/api/sns/web/v3/note') ||
        u.includes('note/detail') || (u.includes('xhs') && u.includes('json'))) {
      try {
        const json = await response.json();
        const note = json?.data?.items?.[0]?.note_card || json?.data?.note_card || json?.data;
        if (note?.title || note?.desc) {
          console.log('📦 拦截到笔记 API');
          apiNoteData.push(note);
        }
      } catch {}
    }
  });

  // 打开链接
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {
    console.log('页面加载超时，继续...');
  }
  await page.waitForTimeout(5000);

  const finalUrl = page.url();
  console.log('最终 URL:', finalUrl);
  await page.screenshot({ path: `${OUTPUT_DIR}/xhs-note.png`, timeout: 5000 }).catch(() => {});

  // 检查是否有登录墙
  const loginWall = await page.$('text=登录后查看').catch(() => null)
    || await page.$('text=登录查看').catch(() => null);
  if (loginWall) {
    console.log('⚠️  需要登录才能查看');
  }

  // DOM 提取
  const noteInfo = await page.evaluate(() => {
    // 标题
    const title = document.querySelector('#detail-title, [class*="title"]')?.textContent?.trim();

    // 正文内容
    const desc = document.querySelector('#detail-desc, [class*="note-content"], [class*="desc"]')?.textContent?.trim()
      || document.querySelector('[class*="content"]')?.textContent?.trim();

    // 所有图片（过滤头像/icon等小图）
    const imgs = Array.from(document.querySelectorAll('img'))
      .filter(img => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        return (w > 100 || h > 100) && img.src && !img.src.includes('avatar') && !img.src.includes('icon');
      })
      .map(img => img.src)
      .filter(src => src.startsWith('http'))
      .slice(0, 20);

    // 标签
    const tags = Array.from(document.querySelectorAll('a[href*="hashtag"], [class*="tag"]'))
      .map(t => t.textContent.trim()).filter(t => t.length > 1 && t.length < 30).slice(0, 15);

    // 作者
    const author = document.querySelector('[class*="username"], [class*="nickname"], [class*="author"]')?.textContent?.trim();

    // 页面所有中文文字（备用）
    const allText = document.body.innerText;

    return { title, desc, imgs, tags, author, allText: allText.slice(0, 3000) };
  });

  console.log('\n=== 笔记内容 ===');
  console.log('作者:', noteInfo.author);
  console.log('标题:', noteInfo.title);
  console.log('正文:', noteInfo.desc?.slice(0, 500));
  console.log('图片数:', noteInfo.imgs.length);
  console.log('图片URLs:', noteInfo.imgs.slice(0, 3));
  console.log('标签:', noteInfo.tags);
  console.log('\n页面文字前800字:\n', noteInfo.allText.slice(0, 800));

  // 滚动到评论区，加载评论
  console.log('\n加载评论区...');
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(2000);

  const comments = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    // 小红书评论容器选择器
    const commentContainers = document.querySelectorAll(
      '[class*="comment-item"], [class*="CommentItem"], [class*="parent-comment"]'
    );

    commentContainers.forEach((el) => {
      const textEl = el.querySelector('[class*="content"], [class*="text"], span');
      const text = textEl?.textContent?.trim() || el.textContent?.trim();
      if (!text || text.length < 5 || seen.has(text)) return;
      const skip = ['回复', '展开', '收起', '查看更多评论', '作者'];
      if (skip.includes(text)) return;
      if (!/[一-龥]/.test(text)) return;

      const likeEl = el.querySelector('[class*="like"], [class*="digg"]');
      const likes = parseInt((likeEl?.textContent?.trim() || '0').replace(/[^0-9]/g, '')) || 0;
      const isPinned = el.textContent?.includes('置顶') || !!el.querySelector('[class*="pin"], [class*="top"]');
      const isAuthor = el.textContent?.includes('作者') || !!el.querySelector('[class*="author"]');

      seen.add(text);
      results.push({ text: text.slice(0, 300), likes, isPinned, isAuthor });
    });

    // 兜底：通用文字提取
    if (results.length === 0) {
      const skipWords = new Set(['回复', '展开', '收起', '查看更多评论', '作者', '关注']);
      document.querySelectorAll('span, p').forEach(el => {
        if (el.children.length > 0) return;
        const text = el.textContent?.trim();
        if (!text || text.length < 8 || text.length > 300) return;
        if (!(/[一-龥]/.test(text))) return;
        if (skipWords.has(text) || seen.has(text)) return;
        const cls = el.className?.toString() || '';
        if (cls.includes('comment') || cls.includes('content') || cls.includes('text')) {
          seen.add(text);
          results.push({ text, likes: 0, isPinned: false, isAuthor: false });
        }
      });
    }

    return results.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.isAuthor !== b.isAuthor) return a.isAuthor ? -1 : 1;
      return b.likes - a.likes;
    }).slice(0, 20);
  });

  console.log(`找到 ${comments.length} 条评论`);
  comments.slice(0, 5).forEach((c, i) => {
    const tags = [c.isPinned ? '📌置顶' : '', c.isAuthor ? '👤作者' : '', c.likes ? `👍${c.likes}` : ''].filter(Boolean).join(' ');
    console.log(`${i+1}. ${tags ? `[${tags}] ` : ''}${c.text.slice(0, 80)}`);
  });

  const result = {
    url: finalUrl,
    ...noteInfo,
    comments,
    apiData: apiNoteData,
    scrapedAt: new Date().toISOString(),
  };

  const outFile = `${OUTPUT_DIR}/xhs-parsed.json`;
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`\n✅ 结果保存到 ${outFile}`);

  await page.waitForTimeout(3000);
  await browser.close();
  return result;
}

const url = process.argv[2];
if (!url) { console.log('用法: node scripts/parse-xhs.mjs <小红书链接>'); process.exit(1); }
parseXhsNote(url).catch(console.error);
