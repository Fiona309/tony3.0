import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const out = '/tmp/tony-p0';
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.setDefaultTimeout(10_000);

const errors = [];
const layoutChecks = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`page: ${error.message}`));

async function checkLayout(name) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const passed = metrics.scrollWidth <= metrics.clientWidth + 1;
  layoutChecks.push({ name, passed, ...metrics });
  if (!passed) errors.push(`layout: ${name} 横向溢出 ${metrics.scrollWidth - metrics.clientWidth}px`);
}

const longPressPage = await context.newPage();
longPressPage.setDefaultTimeout(10_000);
await longPressPage.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
await longPressPage.getByRole('button', { name: '暂停视频' }).click();
const pausedVideo = longPressPage.getByRole('button', { name: /继续播放；长按画面识别发色/ });
if (await pausedVideo.count() === 0) {
  await longPressPage.getByRole('button', { name: '暂停视频' }).click();
}
await pausedVideo.dispatchEvent('pointerdown');
await longPressPage.waitForTimeout(650);
await pausedVideo.dispatchEvent('pointerup');
await longPressPage.getByText('识别到同款发色').waitFor();
await longPressPage.screenshot({ path: `${out}/00b-longpress.png` });
await longPressPage.close();

await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1_800);
await page.screenshot({ path: `${out}/00-douyin.png` });
await checkLayout('douyin-390');

await page.getByRole('button', { name: /染同款 · 海盐蓝/ }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/01-camera.png` });
await checkLayout('camera-390');

const demoButton = page.getByRole('button', { name: '使用演示照片' });
if (await demoButton.count()) {
  await demoButton.first().click();
} else {
  await page.getByRole('button', { name: '拍摄当前头发' }).click();
}
await page.getByRole('button', { name: /使用这张/ }).click();
await page.waitForTimeout(2_500);
await page.screenshot({ path: `${out}/02-confirm.png` });
await checkLayout('confirm-390');

await page.getByRole('button', { name: /确认，查看我的染发方案/ }).click();
await page.waitForTimeout(2_300);
await page.screenshot({ path: `${out}/03-result.png`, fullPage: true });
await checkLayout('result-390');

await page.getByRole('button', { name: /按固色方案选产品/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/04-products.png`, fullPage: true });
await checkLayout('products-390');

await page.getByRole('button', { name: /选好了，开始操作/ }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/05-operation.png` });
await checkLayout('operation-390');

await page.getByRole('button', { name: '设置闹钟' }).click();
await page.getByText('15:00').waitFor();
await page.getByRole('button', { name: '问 Tony' }).click();
await page.getByRole('button', { name: '关闭' }).click();

for (let index = 0; index < 5; index += 1) {
  await page.getByRole('button', { name: '这一步完成了' }).click();
  await page.waitForTimeout(120);
}
await page.getByRole('button', { name: '全部完成，看看成果' }).click();
await page.waitForTimeout(350);
await page.screenshot({ path: `${out}/06-achievement.png`, fullPage: true });
await checkLayout('achievement-390');

await page.setViewportSize({ width: 430, height: 932 });
await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1_600);
await page.screenshot({ path: `${out}/00-douyin-430.png` });
await checkLayout('douyin-430');

process.stdout.write(JSON.stringify({
  url: page.url(),
  errors,
  layoutChecks,
  screenshots: await fs.readdir(out),
}, null, 2));

await browser.close();
