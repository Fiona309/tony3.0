import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomBytes } from 'crypto';

const execFileP = promisify(execFile);

export const maxDuration = 300; // 5 分钟
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('video') as File | null;
    if (!file) return Response.json({ error: '缺少视频文件' }, { status: 400 });
    if (file.size > 200 * 1024 * 1024) return Response.json({ error: '视频过大（>200MB）' }, { status: 400 });

    const id = randomBytes(6).toString('hex');
    const dir = path.join(process.cwd(), 'public', 'video-uploads', id);
    fs.mkdirSync(dir, { recursive: true });

    // 保存上传的视频
    const ext = path.extname(file.name).toLowerCase() || '.mp4';
    const videoPath = path.join(dir, `video${ext}`);
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(videoPath, buf);

    // 跑解析脚本（子进程继承父进程 env vars）
    const scriptPath = path.join(process.cwd(), 'scripts', 'process-video.mjs');
    const relVideo = path.relative(process.cwd(), videoPath);

    try {
      const { stdout } = await execFileP('node', [scriptPath, relVideo], {
        cwd: process.cwd(),
        maxBuffer: 50 * 1024 * 1024,
        env: { ...process.env },
      });
      console.log('[process-video]', stdout.slice(-500));
    } catch (e) {
      const err = e as { stderr?: string; message: string };
      console.error('[process-video stderr]', err.stderr || err.message);
      return Response.json({ error: '视频处理失败：' + (err.stderr?.slice(-200) || err.message) }, { status: 500 });
    }

    // 读取生成的 analysis JSON
    const baseName = path.basename(videoPath, path.extname(videoPath));
    const analysisPath = path.join(dir, `${baseName}-analysis.json`);
    if (!fs.existsSync(analysisPath)) {
      return Response.json({ error: '解析结果未生成' }, { status: 500 });
    }
    const data = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));

    // 把所有 frame 路径改成 public 可访问的 URL
    type StepWithFrames = { frames?: { path: string; time: number }[] };
    (data.action_steps as StepWithFrames[]).forEach((s) => {
      if (s.frames) {
        s.frames.forEach((f) => {
          f.path = `/video-uploads/${id}/frames/${path.basename(f.path)}`;
        });
      }
    });
    data.upload_id = id;

    return Response.json(data);
  } catch (e) {
    const err = e as Error;
    console.error('[process-video error]', err);
    return Response.json({ error: err.message || '未知错误' }, { status: 500 });
  }
}
