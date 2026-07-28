/**
 * 视频处理：抽音频 → ASR 转文字 → Claude 聚合教程步骤 → 步骤中点抽关键帧
 * 用法: node --env-file=.env.local scripts/process-video.mjs samples/your-video.mp4
 * 输出:
 *   samples/video-analysis.json   { transcript, steps: [{step, content, start, end, frame_path}] }
 *   samples/frames/step-N.jpg     每个步骤一张关键帧
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import ffmpegPath from 'ffmpeg-static';
import Anthropic from '@anthropic-ai/sdk';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const videoPath = process.argv[2];
if (!videoPath || !fs.existsSync(videoPath)) {
  console.error('❌ 请提供视频路径: node scripts/process-video.mjs samples/xxx.mp4');
  process.exit(1);
}

const baseDir = path.dirname(videoPath);
const baseName = path.basename(videoPath, path.extname(videoPath));
const framesDir = path.join(baseDir, 'frames');
const audioPath = path.join(baseDir, `${baseName}.mp3`);
const outputPath = path.join(baseDir, `${baseName}-analysis.json`);

if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.openai-next.com';
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, baseURL: ANTHROPIC_BASE_URL });

// ── Step 1: 抽音频 ────────────────────────────────────────────
async function extractAudio() {
  console.log('🎵 抽取音频...');
  await execFileP(ffmpegPath, [
    '-i', videoPath,
    '-vn',                  // 不要视频
    '-ar', '16000',         // 16kHz 采样率（whisper 推荐）
    '-ac', '1',             // 单声道
    '-b:a', '64k',
    '-y',                   // 覆盖
    audioPath,
  ]);
  const size = (fs.statSync(audioPath).size / 1024).toFixed(0);
  console.log(`   ✓ ${audioPath} (${size}KB)`);
}

// ── Step 2: Whisper 转文字（带时间戳）─────────────────────────
async function transcribe() {
  console.log('📝 调用 Whisper ASR（带时间戳）...');
  const form = new FormData();
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  form.append('language', 'zh');
  const audioBuffer = fs.readFileSync(audioPath);
  form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), `${baseName}.mp3`);

  const res = await fetch(`${ANTHROPIC_BASE_URL}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANTHROPIC_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper 失败: ${res.status} ${await res.text()}`);
  const data = await res.json();
  console.log(`   ✓ 时长 ${data.duration}s，${data.segments?.length || 0} 段`);
  return data;
}

// ── Step 3: Claude 把碎句聚合成「背景知识 + 操作步骤」───────
async function aggregateSteps(segments, duration) {
  console.log('🧠 Claude 拆分背景知识 vs 操作步骤...');
  const segmentsText = segments.map(s =>
    `[${s.start.toFixed(1)}-${s.end.toFixed(1)}s] ${s.text}`
  ).join('\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `你是染发教程编辑。下面是一个染发视频的 ASR 逐句转录（带时间戳）。请把内容**严格**拆分为两类：

【A 类：背景知识 background_knowledge】
博主分享的「经验、染色路线、各色褪色规律、产品对比、品牌科普」等信息性内容。用户看一遍知道即可，**不需要立刻执行任何动作**。
例：「漂三遍到九度后，紫色掉得最快、粉色可维持三次洗头、橘色能维持半个月」——这是经验分享，不是操作。
👉 这类只保留文字，不会被抽关键帧。

【B 类：操作步骤 action_steps】
用户在自己染发当下，需要按顺序**亲手执行**的动作。必须能拆解到下面 4 个 category 之一：
  • 调色 mix     ── 混合染膏/护发素/稀释剂的具体比例和方式
  • 选品 product ── 选什么染膏、固色发膜、护具、工具
  • 涂抹 apply   ── 分区方法、涂抹方向、用量控制、漏色检查、衔接处理
  • 冲洗护理 rinse ── 停留时长、冲洗方法、固色洗发水使用、护发
👉 每个 action_step 会被抽一帧作为配图。
👉 如果同一 category 有多个细节（如「分区」和「检查衔接」），拆成两个 step。

视频总时长: ${duration}秒

ASR 内容：
${segmentsText}

输出 JSON（不要其他文字）：
{
  "title": "视频主题（20字内）",
  "summary": "整体内容概述（50字内）",
  "background_knowledge": [
    {
      "topic": "知识主题（如：浅发色免补漂换色路线）",
      "content": "知识点说明（200字内，保留博主关键信息：颜色名、维持时长、调配比例等）",
      "start": 起始秒数,
      "end": 结束秒数
    }
  ],
  "action_steps": [
    {
      "step": 1,
      "category": "调色|选品|涂抹|冲洗护理",
      "title": "操作标题（10字内，要像指令）",
      "content": "具体怎么做（80字内，必须是动作描述）",
      "start": 起始秒数,
      "end": 结束秒数,
      "tip": "关键提示（30字内，可选）"
    }
  ]
}

严格规则：
1. 经验分享/染色路线/褪色规律 → 放 background_knowledge，不要混进 action_steps
2. 具体可执行的动作 → 放 action_steps，不要放进 background_knowledge
3. 每个 action_step.title 应该像指令（如「分区涂抹」「调配深浅」），不要是描述句
4. 时间段必须严格落在 ASR 时间范围内，前后不重叠
5. action_steps 数量看视频内容定，一般 3-6 步（操作部分通常只占视频后半段）`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude 返回格式错误');
  const data = JSON.parse(match[0]);
  console.log(`   ✓ 背景知识 ${data.background_knowledge?.length || 0} 条 | 操作步骤 ${data.action_steps?.length || 0} 步`);
  return data;
}

// ── Step 4: 每步抽多张候选 → Claude Vision 选优 ─────────────
async function extractFrames(steps) {
  console.log(`🖼️  抽取关键帧（${steps.length} 步，Vision 选优）...`);
  for (const s of steps) {
    const duration = s.end - s.start;
    // 候选数：每 1.5 秒一张，最少 4 张，避免太密重复
    const candidateCount = Math.max(4, Math.ceil(duration / 1.5));
    // 最终选几张：步骤越长选越多
    const targetCount = duration > 10 ? 4 : duration > 5 ? 3 : 2;

    // 1. 抽候选帧
    const candidates = [];
    for (let i = 0; i < candidateCount; i++) {
      const t = s.start + (duration * (i + 0.5) / candidateCount);
      const candPath = path.join(framesDir, `_cand-${s.step}-${i}.jpg`);
      await execFileP(ffmpegPath, [
        '-ss', String(t), '-i', videoPath,
        '-frames:v', '1', '-q:v', '2', '-vf', 'scale=640:-1',
        '-y', candPath,
      ]);
      candidates.push({ path: candPath, time: t });
    }

    // 2. 调 Vision 选优
    const imageContents = candidates.map(c => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: fs.readFileSync(c.path).toString('base64'),
      },
    }));

    let selected;
    try {
      const response = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            ...imageContents,
            {
              type: 'text',
              text: `上面是染发教程视频步骤「${s.title}」（分类: ${s.category}）的 ${candidates.length} 张候选帧，按时间顺序（索引 0 到 ${candidates.length - 1}）。

步骤内容：${s.content}

请从中挑出 **${targetCount} 张** 最能体现这一步【连续动作演变】的图片：
✅ 优先：有实际操作（手在动、工具/产品在使用、头发有明显变化）
❌ 跳过：博主纯对镜讲解（只是张嘴说话、没动作）
❌ 跳过：连续重复的相似画面（多张相同姿势只留一张）
❌ 跳过：手或物体严重遮挡关键内容
✅ 选出的帧按时间顺序排列，组合起来要像「连环画」展示完整动作流

只输出 JSON：{"selected": [按时间顺序排列的帧索引数组]}
例：{"selected": [1, 3, 5]}`
            }
          ]
        }]
      });
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const match = text.match(/\{[\s\S]*\}/);
      selected = match ? JSON.parse(match[0]).selected : null;
    } catch (e) {
      console.log(`     ⚠️  Vision 选优失败 (${e.message})，退化均匀采样`);
      selected = null;
    }

    // 兜底：Vision 没返回有效结果时，均匀采样
    if (!selected || !Array.isArray(selected) || selected.length === 0) {
      selected = Array.from({ length: targetCount }, (_, i) =>
        Math.floor(candidates.length * (i + 0.5) / targetCount)
      );
    }

    // 3. 重命名选中、清理候选
    const finalFrames = [];
    selected.sort((a, b) => a - b).forEach((idx, i) => {
      const cand = candidates[idx];
      if (!cand || !fs.existsSync(cand.path)) return;
      const finalPath = path.join(framesDir, `step-${s.step}-${i + 1}.jpg`);
      fs.renameSync(cand.path, finalPath);
      finalFrames.push({
        path: path.relative(process.cwd(), finalPath),
        time: parseFloat(cand.time.toFixed(2)),
      });
    });
    candidates.forEach(c => { if (fs.existsSync(c.path)) fs.unlinkSync(c.path); });

    s.frames = finalFrames;
    console.log(`   ✓ 步骤${s.step} [${s.category}] 候选${candidates.length}→选${finalFrames.length}: ${finalFrames.map(f => f.time + 's').join(' / ')}`);
  }
}

// ── 主流程 ────────────────────────────────────────────────────
async function main() {
  console.log(`🎬 处理视频: ${videoPath}\n`);

  await extractAudio();
  const asr = await transcribe();
  const aggregated = await aggregateSteps(asr.segments, asr.duration);
  await extractFrames(aggregated.action_steps || []);

  const output = {
    video_path: videoPath,
    duration: asr.duration,
    title: aggregated.title,
    summary: aggregated.summary,
    raw_transcript: asr.text,
    asr_segments: asr.segments.map(s => ({ start: s.start, end: s.end, text: s.text })),
    background_knowledge: aggregated.background_knowledge || [],
    action_steps: aggregated.action_steps || [],
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n🎉 完成！`);
  console.log(`   ${outputPath}`);
  console.log(`   关键帧目录: ${framesDir}\n`);

  if (output.background_knowledge.length > 0) {
    console.log(`── 背景知识（${output.background_knowledge.length}条，不抽帧）──`);
    output.background_knowledge.forEach(k => {
      console.log(`  📚 [${k.start.toFixed(0)}-${k.end.toFixed(0)}s] ${k.topic}`);
    });
  }
  if (output.action_steps.length > 0) {
    console.log(`\n── 操作步骤（${output.action_steps.length}步，含关键帧）──`);
    output.action_steps.forEach(s => {
      console.log(`  🔧 [${s.start.toFixed(0)}-${s.end.toFixed(0)}s] [${s.category}] ${s.title}: ${s.content.slice(0, 40)}...`);
    });
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
