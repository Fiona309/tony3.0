/**
 * 运行方式：node scripts/login.mjs
 * 浏览器会弹出来，手动扫码登录小红书和抖音。
 * 登录完成后，在 Claude 对话框里告诉 AI，AI 会创建标记文件让脚本继续。
 */
import { chromium } from 'playwright';
import fs from 'fs';

const OUTPUT_DIR = './scripts/knowledge-base';
const STATE_FILE = `${OUTPUT_DIR}/browser-state.json`;
const FLAG_XHS = `${OUTPUT_DIR}/xhs-done.flag`;
const FLAG_DOUYIN = `${OUTPUT_DIR}/douyin-done.flag`;

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 删除旧的标记文件
[FLAG_XHS, FLAG_DOUYIN].forEach(f => { try { fs.unlinkSync(f); } catch {} });

function waitForFlag(flagFile, label) {
  return new Promise((resolve) => {
    console.log(`⏳ 等待${label}登录完成... (Claude 会在你告知后创建标记文件)`);
    const interval = setInterval(() => {
      if (fs.existsSync(flagFile)) {
        clearInterval(interval);
        fs.unlinkSync(flagFile);
        console.log(`✅ ${label}登录确认`);
        resolve();
      }
    }, 1000);
  });
}

async function main() {
  console.log('启动浏览器...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  // === 登录小红书 ===
  console.log('\n--- 第一步：登录小红书 ---');
  await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded' });
  await waitForFlag(FLAG_XHS, '小红书');

  // === 登录抖音 ===
  console.log('\n--- 第二步：登录抖音 ---');
  // 抖音有时第一次连接失败，重试几次
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto('https://www.douyin.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      break;
    } catch (e) {
      console.log(`抖音连接失败(第${i+1}次)，重试...`, e.message.slice(0, 60));
      await page.waitForTimeout(2000);
    }
  }
  await waitForFlag(FLAG_DOUYIN, '抖音');

  // 保存 cookie
  await context.storageState({ path: STATE_FILE });
  console.log(`\n✅ 登录状态已保存到 ${STATE_FILE}`);
  console.log('现在可以运行爬虫了：node scripts/scrape-tutorials.mjs');

  await browser.close();
}

main().catch(console.error);
