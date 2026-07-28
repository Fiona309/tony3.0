import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { url: rawInput } = await request.json();
    if (!rawInput?.trim()) return Response.json({ error: '缺少 url 参数' }, { status: 400 });

    // 从粘贴文字中提取 URL（用户可能粘贴整段分享文字）
    const urlMatch = rawInput.match(/https?:\/\/[^\s一-鿿【】「」（）\n]+/);
    const url = urlMatch ? urlMatch[0].replace(/[）】\)]+$/, '') : rawInput.trim();

    const isXhs = url.includes('xiaohongshu.com') || url.includes('xhslink.com');
    const isDouyin = url.includes('douyin.com');

    if (!isXhs && !isDouyin) {
      return Response.json({ error: '仅支持小红书或抖音链接' }, { status: 400 });
    }

    const rootDir = process.cwd();
    const script = isXhs ? 'scripts/parse-xhs.mjs' : 'scripts/parse-video.mjs';
    const outFile = isXhs
      ? 'scripts/knowledge-base/xhs-parsed.json'
      : 'scripts/knowledge-base/video-parsed.json';

    await execAsync(`node ${script} "${url}"`, {
      cwd: rootDir,
      timeout: 90000,
    });

    const raw = JSON.parse(fs.readFileSync(path.join(rootDir, outFile), 'utf-8'));

    const title = raw.title || raw.description || '';
    const desc = raw.desc || raw.description || '';
    const author = raw.author || '';
    const tags: string[] = raw.tags || [];
    const images: string[] = raw.imgs || [];
    const comments: Array<{ text: string; likes: number; isPinned: boolean; isAuthor: boolean }> =
      raw.comments || [];

    // Format into a text block for the AI prompt
    const lines: string[] = [];
    if (author) lines.push(`作者：${author}`);
    if (title) lines.push(`标题：${title}`);
    if (desc) lines.push(`\n正文：\n${desc.slice(0, 2000)}`);
    if (tags.length) lines.push(`\n标签：${tags.join(' ')}`);
    if (comments.length) {
      lines.push('\n高赞评论：');
      comments.slice(0, 8).forEach((c, i) => {
        const badge = [c.isPinned ? '📌置顶' : '', c.isAuthor ? '👤作者' : '', c.likes ? `👍${c.likes}` : '']
          .filter(Boolean).join(' ');
        lines.push(`${i + 1}. ${badge ? `[${badge}] ` : ''}${c.text.slice(0, 150)}`);
      });
    }
    const formatted = lines.join('\n');

    return Response.json({
      platform: isXhs ? 'xiaohongshu' : 'douyin',
      title,
      desc,
      author,
      tags,
      images,
      comments,
      formatted, // ready-to-use text for the AI prompt
    });
  } catch (e: unknown) {
    console.error('[parse-url error]', e);
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `解析失败：${msg.slice(0, 200)}` }, { status: 500 });
  }
}
