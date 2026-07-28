import { chromium } from 'playwright';
import fs from 'fs';

const URL = process.argv[2] || 'https://glcpatti.com/';
const OUT = 'design-extractor';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(`${OUT}/screenshots`)) fs.mkdirSync(`${OUT}/screenshots`, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  recordVideo: { dir: `${OUT}/screenshots`, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();

console.log(`🌐 打开 ${URL}`);
try { await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 }); }
catch { await page.goto(URL, { waitUntil: 'domcontentloaded' }); }
await page.waitForTimeout(4000);

console.log('🎨 提取 CSS...');
const cssData = await page.evaluate(() => {
  const rootStyles = getComputedStyle(document.documentElement);
  const vars = {};
  for (const prop of rootStyles) {
    if (prop.startsWith('--')) vars[prop] = rootStyles.getPropertyValue(prop).trim();
  }

  const bodyStyles = getComputedStyle(document.body);
  const bodyComputed = {
    background: bodyStyles.backgroundColor,
    color: bodyStyles.color,
    fontFamily: bodyStyles.fontFamily,
    fontSize: bodyStyles.fontSize,
    lineHeight: bodyStyles.lineHeight,
  };

  const fontUsage = {};
  document.querySelectorAll('h1, h2, h3, h4, p, button, a, span').forEach(el => {
    const cs = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    if (!fontUsage[tag]) fontUsage[tag] = [];
    if (fontUsage[tag].length < 3) {
      fontUsage[tag].push({
        font: cs.fontFamily.slice(0, 100),
        size: cs.fontSize,
        weight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        textTransform: cs.textTransform,
        color: cs.color,
      });
    }
  });

  const colorFreq = {};
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    [cs.backgroundColor, cs.color, cs.borderColor].forEach(c => {
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'rgb(0, 0, 0)') {
        colorFreq[c] = (colorFreq[c] || 0) + 1;
      }
    });
  });
  const topColors = Object.entries(colorFreq).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([color, count]) => ({ color, count }));

  // 检测动画相关
  const animatedElements = [];
  document.querySelectorAll('*').forEach(el => {
    if (animatedElements.length >= 30) return;
    const cs = getComputedStyle(el);
    if (cs.animationName !== 'none' || cs.transitionProperty !== 'all' && cs.transitionDuration !== '0s') {
      animatedElements.push({
        tag: el.tagName.toLowerCase(),
        cls: el.className.toString().slice(0, 60),
        animation: cs.animation.slice(0, 80),
        transition: cs.transition.slice(0, 80),
        transform: cs.transform.slice(0, 60),
      });
    }
  });

  return { vars, bodyComputed, fontUsage, topColors, animatedElements };
});
fs.writeFileSync(`${OUT}/raw.json`, JSON.stringify(cssData, null, 2));
console.log(`   ✓ raw.json (${Object.keys(cssData.vars).length} vars, ${cssData.topColors.length} colors, ${cssData.animatedElements.length} animated)`);

console.log('📸 截图 + 滚动录屏...');
await page.screenshot({ path: `${OUT}/screenshots/01-hero.png` });

// 缓慢滚动让动效出现
const totalHeight = await page.evaluate(() => document.body.scrollHeight);
console.log(`   总高度: ${totalHeight}px`);
const steps = 8;
for (let i = 1; i <= steps; i++) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), Math.floor(totalHeight * i / steps));
  await page.waitForTimeout(1500);
  if (i % 2 === 0) await page.screenshot({ path: `${OUT}/screenshots/0${1+i/2}-scroll.png` });
}
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/screenshots/99-fullpage.png`, fullPage: true });

await ctx.close();
await browser.close();
console.log('🎉 完成');
