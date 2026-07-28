import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const IS_MOCK = !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_api_key_here';
const client = IS_MOCK ? null : new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

export interface CompareResult {
  // === 可行性判断（核心） ===
  verdict: 'possible' | 'partial' | 'impossible';
  one_line: string;             // 大字结论，例如 "我能染！但有限制"
  approach_match: number;       // 0-100 预期接近度
  limitations: string[];        // 主要限制（融入了对比信息）
  budget_min: number;           // 预算下限（元）
  budget_max: number;
  time_hours: number;           // 总耗时
  when_can_do: string;          // "现在" or "漂完发后 1-2 周"
  pre_required_steps?: Array<{
    action: string;             // "去理发店漂到 8 度"
    where?: string;             // "专业理发店"
    cost?: string;              // "¥300-800"
    duration?: string;          // "1-2 周"
  }>;

  // === 博主对比（仅当有 bloggerTutorial 时） ===
  blogger_profile?: {
    color: string;
    bleach_count: string;
    length: string;
    notes: string;
  };
  diffs?: Array<{
    aspect: string;
    blogger: string;
    user: string;
    impact: 'high' | 'medium' | 'low';
    adjustment: string;
  }>;
  summary?: string;
}

interface KbItem { category: string; summary: string; content: string; evidence: string; source_url: string; }
function loadFeasibilityKnowledge(): string {
  try {
    const file = path.join(process.cwd(), 'scripts', 'knowledge-base', 'knowledge.json');
    if (!fs.existsSync(file)) return '';
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const items: KbItem[] = data.all_items || [];
    // 优先收集和"可行性判断"相关的类目
    const relevant = items.filter(k => ['底色匹配', '价格情报', '维护周期', '避坑警告'].includes(k.category));
    if (relevant.length === 0) return '';
    const lines = ['【相关可行性判断知识（来自真实小红书）】'];
    relevant.slice(0, 12).forEach(k => {
      lines.push(`- [${k.category}] ${k.summary}：${k.content}`);
    });
    return lines.join('\n');
  } catch {
    return '';
  }
}

const MOCK_POSSIBLE: CompareResult = {
  verdict: 'possible',
  one_line: '我能染！但要接受深底色带来的色差',
  approach_match: 80,
  limitations: [
    '我的深棕底色直接上，颜色会偏暖偏深',
    '冷调（如灰、蓝）发挥受限',
  ],
  budget_min: 80,
  budget_max: 200,
  time_hours: 1.5,
  when_can_do: '现在就能做',
  blogger_profile: {
    color: '漂过的白金底色',
    bleach_count: '漂过3次',
    length: '中长发',
    notes: '博主用 NV 紫瓶发膜与护发素 1:8 调配，干发涂抹分层，泡水法上色',
  },
  diffs: [
    { aspect: '底色深浅', blogger: '白金底', user: '深棕', impact: 'high',
      adjustment: '我无法达到博主那种通透浅色，会偏暖偏深' },
    { aspect: '漂染历史', blogger: '漂过3次', user: '未漂', impact: 'high',
      adjustment: '若想完全像博主，需先去理发店漂发' },
  ],
  summary: '可以参考博主的配方比例和涂抹技巧，但颜色饱和度和明亮度会因底色差异而不同。',
};

const MOCK_IMPOSSIBLE: CompareResult = {
  verdict: 'impossible',
  one_line: '暂时不行，我需要先漂发',
  approach_match: 20,
  limitations: [
    '我的黑发未漂过，色素难渗透',
    '直接上目标色不上色，会几乎看不见效果',
  ],
  budget_min: 0,
  budget_max: 0,
  time_hours: 0,
  when_can_do: '漂发完成 1-2 周后',
  pre_required_steps: [
    { action: '去理发店漂到 8 度', where: '专业理发店（不建议自己漂）', cost: '¥300-800', duration: '1-2 小时' },
    { action: '等待发质恢复', where: '在家正常洗护', cost: '¥0', duration: '1-2 周' },
  ],
};

export async function POST(request: Request) {
  try {
    const { analysis, bloggerTutorial } = await request.json();
    const { length, color, bleach_count, target_color } = analysis;
    const bleachLabel: Record<number, string> = {
      0: '未漂过', 1: '漂过1次', 2: '漂过2次', 3: '漂过3次或以上',
    };

    if (IS_MOCK) {
      await new Promise((r) => setTimeout(r, 1500));
      // mock 时根据底色简单判断
      const isBlackUnbleached = bleach_count === 0 && /黑|deep|dark/i.test(color || '');
      const wantsLightColor = /蓝|blue|绿|green|紫|purple|粉|pink|金|blonde|白金|白|浅|奶/i.test(target_color || '');
      if (isBlackUnbleached && wantsLightColor) return Response.json(MOCK_IMPOSSIBLE);
      return Response.json(MOCK_POSSIBLE);
    }

    const kbContext = loadFeasibilityKnowledge();
    const hasBlogger = bloggerTutorial && bloggerTutorial.trim().length > 0;

    const response = await client!.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `你是专业发型师。请基于用户的头发情况和真实小红书经验，判断 TA 能否染成目标发色。

${kbContext}

【用户头发信息】
- 发长：${length}
- 当前发色：${color}
- 漂染历史：${bleachLabel[bleach_count] ?? `漂过${bleach_count}次`}
- 目标发色：${target_color}
${hasBlogger ? `\n【博主参考教程】\n${bloggerTutorial.slice(0, 3000)}\n` : ''}

输出 JSON（不要其他文字）：

{
  "verdict": "possible|partial|impossible",
  "one_line": "一句话主结论（20字内，第一人称'我'，例如'我能染！但颜色会偏暖'或'暂时不行，我需要先漂发'）",
  "approach_match": 0-100 的数字（预期接近度，impossible 时填 ≤30，partial 60-80，possible ≥80）,
  "limitations": [
    "限制 1（30字内，第一人称'我'，说清楚为什么有这个限制）",
    "限制 2"
  ],
  "budget_min": 一支染膏单价 × 数量 的下限（元）,
  "budget_max": 一支染膏单价 × 数量 的上限（元）,
  "time_hours": 染发总耗时（数字，单位小时）,
  "when_can_do": "现在就能做" 或 "漂发完成 X 周后",
  "pre_required_steps": [
    {"action": "去理发店漂到 X 度", "where": "...", "cost": "¥X-X", "duration": "X 周"}
  ]
  ${hasBlogger ? `,
  "blogger_profile": {
    "color": "博主的底色",
    "bleach_count": "博主漂染情况",
    "length": "博主发长",
    "notes": "博主的核心做法（50字内）"
  },
  "diffs": [
    {"aspect": "维度", "blogger": "博主情况(15字)", "user": "我的情况(15字)", "impact": "high|medium|low", "adjustment": "针对我的调整建议(50字)"}
  ],
  "summary": "博主对比的一句话总结（60字内）"` : ''}
}

【硬性规则】
1. 判定逻辑（核心：暗底色染浅色/冷色必须先漂；染深暖色可直染）：
   - **黑发/棕发未漂 + 想染粉色/蓝色/浅紫色/绿色/奶色/白金/浅黄 等冷色或浅色 → 必然 impossible**，必须先漂到 8 度
   - **黑发/棕发未漂 + 想染红色/酒红/巧克力/深棕/暖棕等深暖色 → possible**（暖色色素分子大可覆盖深底，但饱和度会受底色影响）
   - 未漂深棕 + 想染浅暖色（如奶茶、蜜糖）→ partial，建议局部测试
   - 漂过 1 次以上 + 想染浅色/冷色 → 通常 possible
2. impossible 时必须填 pre_required_steps，告诉用户先做什么
3. partial/possible 时 pre_required_steps 不填或填空数组
4. 文案全部用第一人称"我"，绝不用"你"
5. limitations 要具体（"我没漂过、博主漂过3次 → 接近度只有 ~50%"），不要泛泛
6. budget 只算【染膏本身】的钱：一支染膏单价 × 用户发长所需数量。**绝对不包含漂发、固色护理、双氧乳、发廊服务**。市面染膏单价大致 ¥15-200，齐肩短发通常 1 支，长发 2 支。所以 budget 一般在 ¥30-400 区间。impossible 时填 0。
7. 如果有 bloggerTutorial，必须填 blogger_profile + diffs + summary
8. one_line 第一个字符是 ✅ 或 ⚠️ 或 ❌ 表情`
      }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: '分析失败' }, { status: 500 });
    return Response.json(JSON.parse(jsonMatch[0]));
  } catch (e) {
    console.error('[compare/feasibility error]', e);
    return Response.json({ error: '分析失败，请重试' }, { status: 500 });
  }
}
