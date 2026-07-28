import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const IS_MOCK = !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_api_key_here';

const client = IS_MOCK ? null : new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const BLEACH_LABELS: Record<number, string> = {
  0: '未漂过（原始发色）',
  1: '漂过1次',
  2: '漂过2次',
  3: '漂过3次或以上',
};

interface KbProduct {
  name: string;
  brand?: string;
  type?: string;
  mentions?: Array<{ source_url: string; evidence: string }>;
  taobao_price?: string | null;
  taobao_title?: string | null;
  taobao_url?: string | null;
  taobao_sale?: string | null;
}
interface KbItem { category: string; summary: string; content: string; evidence: string; source_url: string; }

function loadKnowledgeBase() {
  try {
    const dir = path.join(process.cwd(), 'scripts', 'knowledge-base');
    const products: KbProduct[] = fs.existsSync(path.join(dir, 'products.json'))
      ? JSON.parse(fs.readFileSync(path.join(dir, 'products.json'), 'utf-8')).products
      : [];
    const knowledge: KbItem[] = fs.existsSync(path.join(dir, 'knowledge.json'))
      ? JSON.parse(fs.readFileSync(path.join(dir, 'knowledge.json'), 'utf-8')).all_items
      : [];
    return { products, knowledge };
  } catch {
    return { products: [], knowledge: [] };
  }
}

function buildKbContext(products: KbProduct[], knowledge: KbItem[]) {
  const lines: string[] = [];
  if (products.length > 0) {
    lines.push('【真实产品参考数据库（来自小红书用户验证）】');
    lines.push('请优先从此列表中选择推荐产品，并基于这些产品的"真实用户评价"填充 pros/cons/reviews。');
    products.forEach((p) => {
      lines.push(`\n● ${p.name}（${p.type || '产品'}）`);
      if (p.taobao_price) lines.push(`  淘宝实时价: ${p.taobao_price}${p.taobao_sale ? ' / ' + p.taobao_sale : ''}`);
      if (p.mentions && p.mentions.length > 0) {
        lines.push(`  真实用户评价（${p.mentions.length} 条原话）：`);
        p.mentions.slice(0, 5).forEach((m) => {
          lines.push(`    · ${m.evidence}`);
        });
      }
    });
  }
  if (knowledge.length > 0) {
    lines.push('\n\n【相关染发知识（来自真实用户经验）】');
    // 按 category 分组，每类最多取 3 条
    const byCategory: Record<string, KbItem[]> = {};
    knowledge.forEach((k) => {
      if (!byCategory[k.category]) byCategory[k.category] = [];
      byCategory[k.category].push(k);
    });
    Object.entries(byCategory).forEach(([cat, items]) => {
      lines.push(`\n[${cat}]`);
      items.slice(0, 3).forEach((k) => {
        lines.push(`- ${k.summary}：${k.content}（原话："${k.evidence.slice(0, 80)}"）`);
      });
    });
  }
  return lines.join('\n');
}

const MOCK_DATA = {
  dyes: [
    {
      tier: '经济款', name: 'pure染发膏', product_type: '染膏', bottle_ml: 100, quantity: 1,
      quantity_reason: '因为我是齐肩短发，pure 染膏单管 100ml 足够覆盖全头，1 管刚好',
      price: '¥14', monthly_sales: '月销 5000+',
      pros: ['宿舍可用，无需漂发', '好看不掉黄', '越掉色越好看'],
      cons: ['色素较浅，深底色显色一般'],
      reviews: [{ quote: '14块染膏一管染全头染不匀都得骂自己染膏没买够', source_url: '' }],
      mixing: {
        components: [{ label: 'pure染膏', ml: 100 }, { label: '附赠双氧乳', ml: 100 }],
        ratio_display: '1:1',
        instructions: '染膏与附赠双氧乳 1:1 倒入塑料碗，用染发刷搅拌至顺滑无颗粒。',
        reference_quote: '14块染膏一管染全头染不匀都得骂自己染膏没买够',
        custom_notes: '我的齐肩短发用 1 管刚好。',
      },
    },
    {
      tier: '中端款', name: '玫丽盼染发膏', product_type: '染膏', bottle_ml: 100, quantity: 2,
      quantity_reason: '因为我是齐肩短发，玫丽盼单管只有 100ml 容量较小，需要 2 管才能确保全头均匀覆盖',
      price: '¥199', monthly_sales: '月销 3000+',
      pros: ['进口品质，约 200 元', '可带去发廊加工只收 120', '效果接近大发廊'],
      cons: ['单管 100ml 偏小'],
      reviews: [{ quote: '染发的买玫丽盼啊，买进口的也就200左右，然后去发廊加工120，跟大发廊1k多的没啥区别', source_url: '' }],
      mixing: {
        components: [{ label: '玫丽盼染膏', ml: 100 }, { label: '玫丽盼双氧乳', ml: 100 }],
        ratio_display: '1:1',
        instructions: '玫丽盼染膏与配套双氧乳按 1:1 调配。建议买正品配套双氧乳。',
        reference_quote: '玫丽盼染膏配套双氧乳是发廊操作方式',
        custom_notes: '想再省钱可以带去发廊只交 120 加工费。',
      },
    },
    {
      tier: '高端款', name: 'NV紫瓶固色发膜', product_type: '固色发膜', bottle_ml: 300, quantity: 1,
      quantity_reason: '因为是固色发膜（半永久），1 瓶 300ml 配合护发素稀释可以用很多次，齐肩短发 1 瓶足够',
      price: '¥89', monthly_sales: '月销 1万+',
      pros: ['植物固色不伤发', '吹干后顺滑淡粉色', '可调浓淡'],
      cons: ['仅适合浅底色（8 度以上）'],
      reviews: [
        { quote: '🔴nv：普通护发素=1:8 可以维持3-4次洗头，大概一周补一次颜色即可', source_url: '' },
        { quote: '🔵nv：普通护发素=1:10 只能维持1-2次洗头，大概一周要补2次颜色', source_url: '' },
      ],
      mixing: {
        components: [{ label: 'NV紫瓶发膜', ml: 25 }, { label: '普通护发素', ml: 200 }],
        ratio_display: '1:8',
        instructions: '发膜与护发素按 1:8 充分搅匀，干发涂抹分层，等 15 分钟后用紫瓶发膜兑温水泡发 5-8 分钟。',
        reference_quote: 'nv：普通护发素=1:8 偏深粉，1:10 显白但维持短',
        custom_notes: '我若想颜色深 → 用 1:8；若想显白且不在意维持 → 1:10。',
      },
    },
  ],
  care: [
    { type: '固色洗发水', name: '施华蔻 BC Color Freeze', timing: '染后48小时后开始使用', bottle_ml: 250, quantity: 1, quantity_reason: '可用约2个月', price: '¥159' },
    { type: '固色发膜', name: '卡洛美粉色固色发膜', timing: '每周使用1-2次', bottle_ml: 300, quantity: 1, quantity_reason: '可用2-3个月', price: '¥99' },
  ],
  steps: [
    { title: '准备工作', content: '• 准备旧衣服或染发披肩\n• 戴好一次性手套\n• 拿出梳子、发夹和计时器\n• 在发际线涂凡士林防染皮肤\n• 浴室操作并铺旧报纸防污染', tip: '凡士林一定要涂耳后和脖子。' },
    { title: '干发上色', content: '• 染前确保头发完全干燥\n• 干发让染料更好附着\n• 颜色饱和度更高、更均匀\n• 洗发后至少等 30 分钟再开始\n• 头发上不能有护发素或油', tip: '湿发会被水稀释染料浓度。' },
    { title: '头发分区上色', content: '• 头发分成前后左右 4 个区\n• 用发夹固定其他区域\n• 从后颈发根开始一缕一缕涂\n• 发尾先涂，发根最后\n• 每缕都要均匀涂满', tip: '发根温度高上色快，所以最后涂。' },
    { title: '停留 30-40 分钟', content: '• 计时器开始计时\n• 深底色或浅目标色停留 40 分钟\n• 一般情况停 30 分钟\n• 每 10 分钟检查一次颜色\n• 绝对不能超过 45 分钟', tip: '可以套保鲜膜让染料更稳定。' },
    { title: '冲洗收尾', content: '• 用温水（不要烫水）冲洗\n• 一直冲到水变清\n• 涂附赠的护发素\n• 停留 3-5 分钟\n• 最后用冷水彻底冲净', tip: '冷水让毛鳞片闭合锁色，染后 48 小时内不洗头。' },
  ],
  expectation: '我的深棕底色染后会比目标图略深略暖。暖色系接近度可达 90%；冷色系明显色差，建议先做局部测试。',
};

export async function POST(request: Request) {
  try {
    const { analysis, targetColorImage, bloggerTutorial, compareResult } = await request.json();
    const { length, color, bleach_count, target_color } = analysis;
    const bleachLabel = BLEACH_LABELS[bleach_count] ?? `漂过${bleach_count}次`;

    // 当 verdict=impossible 时，模拟"用户已按 pre_required_steps 完成漂发"后的教程
    const isSimulated = compareResult?.verdict === 'impossible'
      && Array.isArray(compareResult?.pre_required_steps)
      && compareResult.pre_required_steps.length > 0;
    const preSteps: Array<{action: string; where?: string; cost?: string; duration?: string}> =
      isSimulated ? compareResult.pre_required_steps : [];
    const simulatedPremise = isSimulated
      ? `假设我已经按以下方案完成了漂发：${preSteps.map(s => s.action).join('；')}。底色已达到 8 度浅金，可以正常上色。`
      : null;

    if (IS_MOCK) {
      await new Promise((r) => setTimeout(r, 2000));
      return Response.json(isSimulated ? { ...MOCK_DATA, simulated_premise: simulatedPremise } : MOCK_DATA);
    }

    const { products, knowledge } = loadKnowledgeBase();
    const kbContext = buildKbContext(products, knowledge);

    const simulationHeader = isSimulated ? `
【⚠️ 模拟场景说明】
用户当前发况（${color} / ${bleachLabel}）无法直接染目标色。但本次教程模拟"用户已按下列前置步骤完成漂发"后的染发方案：
${preSteps.map((s, i) => `${i + 1}. ${s.action}${s.where ? `（${s.where}）` : ''}${s.cost ? ` 费用 ${s.cost}` : ''}${s.duration ? ` 耗时 ${s.duration}` : ''}`).join('\n')}

**请基于"漂发完成后的浅金底色"生成教程，而不是基于用户当前的深底色。**
教程的 expectation 字段开头需明确写「假设我已经完成上述漂发，那么我可以...」
教程的 dyes/steps 都按已漂状态来推荐。

` : '';

    const response = await client!.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 10000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: targetColorImage.mediaType, data: targetColorImage.data },
            },
            {
              type: 'text',
              text: `你是一位经验丰富的专业发型师。

${kbContext}
${simulationHeader}
【用户头发信息】
- 发长：${length}
- 当前发色：${color}${isSimulated ? '（注意：本教程基于"漂发后"假设，不是这个当前色）' : ''}
- 漂染历史：${bleachLabel}${isSimulated ? '（注意：本教程假设已完成上述前置漂发）' : ''}
- 目标发色：${target_color}（见上方图片）
${bloggerTutorial ? `\n【参考博主教程】\n${bloggerTutorial}\n` : ''}${compareResult && !isSimulated ? `\n【已识别的关键差异】\n${(compareResult.diffs || []).map((d: {aspect: string; adjustment: string}) => `- ${d.aspect}：${d.adjustment}`).join('\n')}\n` : ''}

请基于"真实产品数据库"和"染发知识"为用户生成定制化的染发指南。**重点是染膏推荐的真实评价 + 调配指南的具体数字**——这两块是用户的核心痛点。

必须严格按以下 JSON 格式输出（不要任何其他文字）：

{
  "dyes": [
    {
      "tier": "经济款|中端款|高端款",
      "name": "品牌+具体产品名（优先从产品数据库挑选）",
      "product_type": "染膏|固色发膜（明确该产品的染色方式）",
      "bottle_ml": 单瓶毫升数,
      "quantity": 建议买几支,
      "quantity_reason": "为什么买这么多支：明确写'因为我是XXX发长，单支XXml不够覆盖全头，所以需要X支'（40字内）",
      "price": "从产品数据库的 taobao_price 直接复制，例如 '¥89'。如果产品在数据库里没找到，填 null",
      "monthly_sales": "从产品数据库的 taobao_sale 复制，没有填 null",
      "pros": ["优点1（基于真实评价）", "优点2"],
      "cons": ["缺点1（如真实评价中有负面反馈则必须列出）"],
      "reviews": [
        {"quote": "用户原话片段（30-100字，从产品数据库的 evidence 里抽取）", "source_url": "评价来源 URL"}
      ],
      "mixing": {
        "components": [
          {"label": "产品全名（如卡洛美固色发膜）", "ml": 用量毫升数},
          {"label": "另一组分（如双氧乳或护发素）", "ml": 毫升数}
        ],
        "ratio_display": "比例字符串，如 '1:1' 或 '1:8'",
        "instructions": "如何调配的完整操作（80字内，基于该产品的真实使用方式）",
        "reference_quote": "从知识库找一条提到该产品调配比例的真实经验原话",
        "custom_notes": "针对用户头发情况的特别说明（如：我若想颜色深→1:8；若想显白→1:10）（60字内）"
      }
    }
  ],
  "care": [
    {"type": "固色洗发水", "name": "...", "timing": "...", "bottle_ml": 容量, "quantity": 数量, "quantity_reason": "...", "price": "¥XX或null"},
    {"type": "固色发膜", "name": "...", "timing": "...", "bottle_ml": 容量, "quantity": 数量, "quantity_reason": "...", "price": "¥XX或null"}
  ],
  "steps": [
    {"title": "准备工作", "content": "用 • 开头的分点列表（每行一个动作或物品，5-7 条）", "tip": "..."},
    {"title": "干发上色还是湿发", "content": "用 • 分点列表说清楚干/湿的选择和原因（5-6 条）", "tip": "..."},
    {"title": "头发分区上色", "content": "用 • 分点列表写清楚分几区、从哪开始、上色顺序、每缕用量（6-7 条，新手最易翻车的环节，写细一点）", "tip": "..."},
    {"title": "停留 X 分钟", "content": "title 里带具体分钟数。content 用 • 分点写停留时长依据、每隔多久检查、何时必须停（5-6 条）", "tip": "..."},
    {"title": "冲洗收尾", "content": "用 • 分点写水温、冲洗顺序、护发素用法、收尾建议（5-6 条）", "tip": "..."}
  ],
  "expectation": "效果预期说明（80字内）"
}

【硬性规则】
1. dyes 里的 pros/cons/reviews 必须来自真实产品数据库的 evidence 原话，不允许虚构
2. **每个 dye 的 price 必须从产品数据库的 taobao_price 字段直接复制（例如 '¥89'）。不允许编造价格，没有的填 null**
3. 如果某个产品在数据库中有负面评价（如"bela 一点用没有"），必须放进 cons
4. reviews 至少 1-2 条带 source_url，体现"真实用户怎么说"
5. **每个 dye 必须有自己的 mixing 字段**——每个产品调配方式不同：染膏类用 1:1 双氧乳；固色发膜类用 1:8 或 1:10 护发素稀释；具体比例从知识库的真实原话提取
6. dyes 列表中至少包含 2 种 product_type（如 1 个染膏 + 1 个固色发膜），让用户有不同方法可选
7. **quantity_reason 必须自然句式**：明确写「因为我是XXX发长，单支XXml不够覆盖全头，所以需要X支」之类的完整解释，不要简略写成「单管够用」
8. 不要在 reviews 里放虚构的赞美话，宁可少不要假
9. **所有用户面向的文字一律用"我"作为第一人称**，绝不用"你"
10. **JSON 严格要求**：所有字符串中的英文双引号必须用 \\" 转义；不要在字符串内换行（要么删掉换行，要么用空格代替）；不要在 JSON 末尾留多余逗号`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[tutorial] no JSON block in response. Length:', text.length, 'Last 300:', text.slice(-300));
      return Response.json({ error: '生成失败' }, { status: 500 });
    }
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (simulatedPremise) parsed.simulated_premise = simulatedPremise;
      return Response.json(parsed);
    } catch (parseErr) {
      console.error('[tutorial] JSON parse failed, attempting repair:', (parseErr as Error).message);
      // 修复尝试：用 LLM 输出有时会含未转义 \n / 多余逗号
      let repaired = jsonMatch[0]
        // 把字符串内裸换行转成 \n
        .replace(/("(?:[^"\\]|\\.)*?)\n([^"]*?")/g, '$1\\n$2')
        // 移除尾部多余逗号
        .replace(/,(\s*[}\]])/g, '$1');
      // 处理截断：缺右括号
      const opens = (repaired.match(/\{/g) || []).length;
      const closes = (repaired.match(/\}/g) || []).length;
      if (opens > closes) repaired += '}'.repeat(opens - closes);
      try {
        const parsed = JSON.parse(repaired);
        if (simulatedPremise) parsed.simulated_premise = simulatedPremise;
        return Response.json(parsed);
      } catch (e2) {
        console.error('[tutorial] repair also failed:', (e2 as Error).message);
        console.error('[tutorial] last 200 chars of response:', text.slice(-200));
        return Response.json({ error: 'AI 输出格式异常，请重试' }, { status: 500 });
      }
    }
  } catch (e) {
    console.error('[tutorial error]', e);
    return Response.json({ error: '生成教程失败，请重试' }, { status: 500 });
  }
}
