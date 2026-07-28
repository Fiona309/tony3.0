/**
 * 构建染发知识库 V2：
 *   小红书搜索 → 解析笔记（含高赞评论）→ Claude 提取知识 → 淘宝补价格 → 落盘
 *
 * 用法：node scripts/build-knowledge-base.mjs
 * 输出：
 *   scripts/knowledge-base/products.json   产品 + 淘宝价格 + 提及证据
 *   scripts/knowledge-base/knowledge.json  按类别组织的染发知识（底色匹配/避坑/价格情报/...）
 *   scripts/knowledge-base/raw-notes.json  原始抓取数据（调试用）
 */
import { chromium } from 'playwright';
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const OUTPUT_DIR = './scripts/knowledge-base';
const STATE_FILE = `${OUTPUT_DIR}/browser-state.json`;
const PRODUCTS_FILE = `${OUTPUT_DIR}/products.json`;
const KNOWLEDGE_FILE = `${OUTPUT_DIR}/knowledge.json`;
const RAW_FILE = `${OUTPUT_DIR}/raw-notes.json`;

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── 搜索关键词 ────────────────────────────────────────────────
const KEYWORDS = [
  // 产品类
  '固色发膜 推荐',
  '固色洗发水 测评',
  '染发膏 测评 价格',
  '染发膏 平价 推荐',
  // 教程类
  '在家染发 步骤教程',
  '深色底 染浅色',
  '染发避坑',
  '黑发上色 DIY',
];

const MAX_PER_SEARCH = 6;
const TARGET_NOTES = 30;
const COMMENTS_PER_NOTE = 20;     // 每篇笔记取前 20 条高赞评论
const NOTES_PER_LLM_BATCH = 10;   // 每批喂 Claude 10 篇

// ── Anthropic 客户端 ──────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, baseURL: ANTHROPIC_BASE_URL });

// ── 搜索小红书（API 拦截）─────────────────────────────────────
async function searchXhs(page, keyword) {
  console.log(`  搜索: "${keyword}"`);
  const noteIds = [];

  const handler = async (response) => {
    const u = response.url();
    if ((u.includes('search') || u.includes('feed')) &&
        (u.includes('xiaohongshu') || u.includes('xhslink'))) {
      try {
        const json = await response.json();
        const items = json?.data?.items || json?.data?.notes || json?.data?.feeds || [];
        if (items.length > 0) {
          items.forEach(item => {
            const id = item?.id || item?.note_card?.note_id || item?.note?.id || item?.noteId;
            const token = item?.xsec_token || item?.note_card?.xsec_token || item?.token || '';
            if (id && !noteIds.find(n => n.id === id)) noteIds.push({ id, token });
          });
        }
      } catch {}
    }
  };
  page.on('response', handler);

  const searchUrl = `https://www.xiaohongshu.com/search_result/?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed&type=51`;
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {}
  await page.waitForTimeout(6000);

  page.off('response', handler);

  const urls = noteIds.slice(0, MAX_PER_SEARCH).map(({ id, token }) =>
    `https://www.xiaohongshu.com/explore/${id}?xsec_token=${token}&xsec_source=pc_search`
  );
  console.log(`  → ${urls.length} 条笔记`);
  return urls;
}

// ── 解析单篇笔记（含高赞评论排序）─────────────────────────────
async function parseNote(context, url) {
  const page = await context.newPage();
  try {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch {}
    await page.waitForTimeout(4000);

    // 多次滚动加载更多评论
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(1200);
    }

    const info = await page.evaluate((COMMENTS_LIMIT) => {
      const title = document.querySelector('#detail-title, [class*="title"]')?.textContent?.trim() || '';
      const desc = (
        document.querySelector('#detail-desc, [class*="note-content"], [class*="desc"]')?.textContent?.trim() ||
        document.querySelector('[class*="content"]')?.textContent?.trim() ||
        ''
      ).slice(0, 4000);

      const tags = Array.from(document.querySelectorAll('a[href*="hashtag"], [class*="tag"]'))
        .map(t => t.textContent.trim()).filter(t => t.length > 1 && t.length < 30).slice(0, 12);

      const author = document.querySelector('[class*="username"], [class*="nickname"]')?.textContent?.trim() || '';

      // 评论：抓全部然后按点赞排序
      const seen = new Set();
      const comments = [];
      document.querySelectorAll('[class*="comment-item"], [class*="parent-comment"]').forEach(el => {
        const text = el.querySelector('[class*="content"], span')?.textContent?.trim();
        if (!text || text.length < 5 || seen.has(text)) return;
        if (!(/[一-鿿]/.test(text))) return;
        seen.add(text);
        const likes = parseInt((el.querySelector('[class*="like"]')?.textContent || '0').replace(/\D/g, '')) || 0;
        comments.push({ text: text.slice(0, 250), likes });
      });
      comments.sort((a, b) => b.likes - a.likes);

      return { title, desc, tags, author, comments: comments.slice(0, COMMENTS_LIMIT) };
    }, COMMENTS_PER_NOTE);

    return { url, ...info };
  } finally {
    await page.close();
  }
}

// ── Claude 提取：开放式知识 + 产品名 ──────────────────────────
async function extractKnowledgeBatch(notes) {
  const notesText = notes.map((n, i) => `
=== 笔记 ${i + 1} ===
URL: ${n.url}
作者: ${n.author}
标题: ${n.title}
正文: ${n.desc}
标签: ${n.tags?.join(' ')}
评论（按点赞排序）:
${n.comments?.map(c => `  · [${c.likes}赞] ${c.text}`).join('\n') || '  （无）'}
`).join('\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: `你是资深染发研究员。请从以下小红书笔记中，提取所有对"想自己染发的用户"有价值的实用知识。

${notesText}

请输出 JSON（不要任何其他文字）：

{
  "products_mentioned": [
    {
      "name": "产品全名（如卡洛美固色发膜）",
      "brand": "品牌",
      "type": "固色发膜|固色洗发水|染膏|护发素|喷雾|其他",
      "source_url": "笔记URL",
      "evidence": "原文或评论中提到该产品的原话（直接引用）"
    }
  ],
  "knowledge_items": [
    {
      "category": "底色匹配|价格情报|避坑警告|操作技巧|产品对比|用户真实反馈|维护周期",
      "summary": "20字以内的核心要点",
      "content": "100字以内的具体说明",
      "evidence": "原文或评论里的直接引用（关键，要原话）",
      "source_url": "笔记URL"
    }
  ]
}

严格规则：
1. evidence 必须是笔记/评论里的真实片段，不允许改写、不允许编造
2. 评论里高赞 = 最真实的用户反馈，价格信息和避坑经验通常藏在评论里，重点挖
3. 如果原文没说价格/容量，products_mentioned 里就不要包含价格容量字段（避免编造）
4. 一篇产品测评笔记应该产出多条不同 category 的 knowledge_items
5. category 必须严格使用上述 7 个之一
6. 只提取有实质内容的条目，吐槽帖/无信息量的笔记可以不产出 knowledge_items`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude 返回格式错误');
  return JSON.parse(match[0]);
}

// ── 淘宝富化：抓首个商品的价格 + 标题 + 链接 ──────────────────
async function fetchTaobaoInfo(browser, productName) {
  const searchUrl = `https://s.taobao.com/search?q=${encodeURIComponent(productName)}&sort=sale-desc`;
  const ctx = await browser.newContext({
    storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    viewport: { width: 1280, height: 800 },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await ctx.newPage();
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      // 找第一个商品卡片
      const cards = document.querySelectorAll('[class*="item"], [class*="Card"], a[href*="detail"]');
      for (const card of cards) {
        const priceEl = card.querySelector('[class*="priceInt"], [class*="price-int"], [class*="Price_priceInt"], [class*="realPrice"], [class*="price"]');
        const priceText = priceEl?.textContent?.trim().replace(/[^\d.]/g, '');
        if (!priceText || !parseFloat(priceText)) continue;
        const titleEl = card.querySelector('[class*="title"], [class*="Title"]');
        const title = titleEl?.textContent?.trim().slice(0, 80);
        const link = card.querySelector('a[href*="detail"], a[href*="item.taobao"]');
        const url = link?.href || '';
        const saleEl = card.querySelector('[class*="sale"], [class*="Sale"], [class*="deal"]');
        const sale = saleEl?.textContent?.trim().slice(0, 30);
        if (title) return { price: priceText, title, url, sale };
      }
      return null;
    });

    return result
      ? { name: productName, price: `¥${result.price}`, title: result.title, url: result.url || searchUrl, sale: result.sale || null }
      : { name: productName, price: null, title: null, url: searchUrl, sale: null };
  } catch {
    return { name: productName, price: null, title: null, url: searchUrl, sale: null };
  } finally {
    await ctx.close();
  }
}

// ── 主流程 ────────────────────────────────────────────────────
async function main() {
  console.log('🚀 知识库构建 V2\n');

  const SKIP_CRAWL = process.env.SKIP_CRAWL === '1';
  let parsedNotes = [];

  if (SKIP_CRAWL && fs.existsSync(RAW_FILE)) {
    parsedNotes = JSON.parse(fs.readFileSync(RAW_FILE, 'utf-8'));
    console.log(`⏭️  SKIP_CRAWL=1，直接复用 raw-notes.json（${parsedNotes.length} 篇）\n`);
  }

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  if (!SKIP_CRAWL) {
    const context = await browser.newContext({
      storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      viewport: { width: 1280, height: 900 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // ── Step 1: 搜索收集笔记链接 ──────────────────────────────
    const searchPage = await context.newPage();
    const urlSet = new Set();

    console.log('═══ 关键词搜索 ═══');
    for (const kw of KEYWORDS) {
      const urls = await searchXhs(searchPage, kw);
      urls.forEach(u => urlSet.add(u));
      await new Promise(r => setTimeout(r, 2000));
    }
    await searchPage.close();

    const allUrls = Array.from(urlSet).slice(0, TARGET_NOTES);
    console.log(`\n📋 去重后共 ${urlSet.size} 条，取前 ${allUrls.length} 篇解析\n`);

    // ── Step 2: 逐篇解析 ──────────────────────────────────────
    for (let i = 0; i < allUrls.length; i++) {
      const url = allUrls[i];
      console.log(`[${i + 1}/${allUrls.length}] ${url.slice(0, 70)}...`);
      try {
        const note = await parseNote(context, url);
        parsedNotes.push(note);
        console.log(`  ✓ ${note.title?.slice(0, 35) || '(无标题)'} | ${note.comments?.length || 0}条评论`);
      } catch (e) {
        console.log(`  ✗ ${e.message}`);
      }
      if (i < allUrls.length - 1) await new Promise(r => setTimeout(r, 1800));
    }

    fs.writeFileSync(RAW_FILE, JSON.stringify(parsedNotes, null, 2));
    console.log(`\n✅ 解析 ${parsedNotes.length} 篇，原始数据已存 raw-notes.json`);
  }

  // 过滤掉空笔记
  const validNotes = parsedNotes.filter(n => (n.title && n.title.length > 0) || (n.desc && n.desc.length > 50));
  console.log(`📑 有效笔记: ${validNotes.length} / ${parsedNotes.length}`);

  if (!ANTHROPIC_API_KEY) {
    console.log('⚠️  未设置 ANTHROPIC_API_KEY，跳过提取步骤');
    await browser.close();
    return;
  }

  // ── Step 3: 分批送 Claude 提取 ────────────────────────────
  console.log(`\n📤 分批送 Claude 提取（每批 ${NOTES_PER_LLM_BATCH} 篇）...`);
  const allProducts = [];
  const allKnowledge = [];
  for (let i = 0; i < validNotes.length; i += NOTES_PER_LLM_BATCH) {
    const batch = validNotes.slice(i, i + NOTES_PER_LLM_BATCH);
    console.log(`  批次 ${Math.floor(i / NOTES_PER_LLM_BATCH) + 1}: 笔记 ${i + 1}-${i + batch.length}`);
    try {
      const out = await extractKnowledgeBatch(batch);
      allProducts.push(...(out.products_mentioned || []));
      allKnowledge.push(...(out.knowledge_items || []));
      console.log(`    ✓ 提取产品 ${out.products_mentioned?.length || 0}，知识 ${out.knowledge_items?.length || 0}`);
    } catch (e) {
      console.log(`    ✗ 提取失败: ${e.message}`);
    }
  }
  console.log(`\n📦 合计：产品 ${allProducts.length}，知识条目 ${allKnowledge.length}`);

  // ── Step 4: 产品合并（按 name 聚合 evidence）+ 淘宝富化 ──
  const productMap = new Map();
  for (const p of allProducts) {
    const key = p.name;
    if (!productMap.has(key)) {
      productMap.set(key, {
        name: p.name,
        brand: p.brand,
        type: p.type,
        mentions: [{ source_url: p.source_url, evidence: p.evidence }],
      });
    } else {
      productMap.get(key).mentions.push({ source_url: p.source_url, evidence: p.evidence });
    }
  }
  const mergedProducts = Array.from(productMap.values());
  console.log(`\n🛒 去重后 ${mergedProducts.length} 个唯一产品，开始抓淘宝价格...`);

  // 并发抓淘宝（控制并发数避免被限速）
  const CONCURRENCY = 3;
  const enriched = [];
  for (let i = 0; i < mergedProducts.length; i += CONCURRENCY) {
    const chunk = mergedProducts.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(p => fetchTaobaoInfo(browser, p.name)));
    chunk.forEach((p, idx) => {
      enriched.push({
        ...p,
        taobao_price: results[idx].price,
        taobao_title: results[idx].title,
        taobao_url: results[idx].url,
        taobao_sale: results[idx].sale,
      });
      const r = results[idx];
      console.log(`  ${p.name}: ${r.price || '价格未抓到'} ${r.sale ? '| ' + r.sale : ''}`);
    });
  }

  await browser.close();

  // ── Step 5: 落盘 ──────────────────────────────────────────
  const productsOut = {
    products: enriched,
    updatedAt: new Date().toISOString(),
  };
  // 按 category 分组知识
  const byCategory = {};
  for (const k of allKnowledge) {
    if (!byCategory[k.category]) byCategory[k.category] = [];
    byCategory[k.category].push(k);
  }
  const knowledgeOut = {
    by_category: byCategory,
    all_items: allKnowledge,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(productsOut, null, 2));
  fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(knowledgeOut, null, 2));

  console.log('\n🎉 完成！');
  console.log(`   产品库：${enriched.length} 条 → ${PRODUCTS_FILE}`);
  console.log(`   知识库：${allKnowledge.length} 条 → ${KNOWLEDGE_FILE}`);
  console.log('\n── 各类知识分布 ──');
  Object.entries(byCategory).forEach(([cat, items]) => {
    console.log(`   ${cat}: ${items.length} 条`);
  });
  console.log('\n── 产品价格抽样（前 5）──');
  enriched.slice(0, 5).forEach(p => {
    console.log(`   ${p.name} | ${p.taobao_price || '无价'} | ${p.taobao_title?.slice(0, 50) || ''}`);
  });
}

main().catch(console.error);
