import Anthropic from '@anthropic-ai/sdk';

const IS_MOCK = !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_api_key_here';
const client = IS_MOCK ? null : new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

export async function POST(request: Request) {
  try {
    const { currentHairImage, targetColorImage } = await request.json();

    if (IS_MOCK) {
      await new Promise((r) => setTimeout(r, 1500));
      return Response.json({
        length: '齐肩短发',
        color: '深棕色',
        bleach_count: 0,
        color_note: '（演示模式）头发整体呈深棕色，发根颜色较深，未经漂染',
        target_color: '蓝紫色渐变',
        target_color_note: '偏冷色调的蓝紫渐变，发梢较浅',
      });
    }

    const response = await client!.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '下面是两张图片：第一张是用户现在的头发，第二张是用户想要染的目标发色。',
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: currentHairImage.mediaType,
                data: currentHairImage.data,
              },
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: targetColorImage.mediaType,
                data: targetColorImage.data,
              },
            },
            {
              type: 'text',
              text: `你是一位专业发型师。请逐张仔细分析这两张图片。

**第一张图分析（用户当前头发）：**
1. 发长（齐耳短发/齐肩短发/齐胸中长发/齐腰长发/超长发）
2. 当前发色（精确描述，如"自然黑"、"深棕色"、"浅棕色"、"黄色"等）
3. 漂染历史（0=未漂过，1=漂过约1次，2=漂过约2次，3=漂过3次或以上）

**第二张图分析（目标发色）—— 这是最易出错的部分，请逐步判断：**

第一步：先描述你**实际看到**的颜色。看头发的主色调像哪种？避免被光线、背景、阴影干扰。

第二步：按色系归类（必选其一）：
- **冷色系**：蓝色 / 海蓝 / 蓝紫 / 紫色 / 薄荷绿 / 抹茶绿 / 灰色 / 烟灰 / 雾霾蓝
- **暖色系**：红色 / 酒红 / 玫瑰红 / 橘色 / 焦糖 / 巧克力 / 棕色 / 暖棕
- **中性/浅色**：奶茶 / 奶杏 / 白金 / 浅金 / 亚麻
- **粉色系**：粉色 / 蜜桃粉 / 玫瑰粉

第三步：给一个**8 字以内**的精确名称。常见的具体颜色名供参考（如果匹配请直接用）：
- 薄荷绿、抹茶绿、深绿、墨绿
- 海蓝、雾霾蓝、藏青蓝、克莱因蓝
- 蓝紫、薰衣草紫、深紫、葡萄紫
- 玫瑰粉、蜜桃粉、芭比粉、樱花粉
- 海王红、酒红、车厘子红、玫红
- 奶茶棕、巧克力棕、栗子棕、可可棕
- 奶杏色、亚麻金、白金、香槟金

第四步：判断是否有渐变。**只有当颜色明显从深到浅或两种色调过渡时才标渐变。** 单一色绝不要写"渐变"。

【常见误判警告】
- 薄荷绿/抹茶绿 经常被误判为蓝紫色——请仔细看，绿色不是蓝色
- 单一冷色（如纯薄荷绿）不要描述为渐变
- 不要把图片背景颜色当成发色

请严格按以下JSON格式回复，不要包含任何其他文字：
{
  "length": "齐肩短发",
  "color": "深棕色",
  "bleach_count": 0,
  "color_note": "头发整体呈深棕色，发根颜色较深",
  "target_color": "薄荷绿",
  "target_color_note": "冷色系绿色，整体单色，无明显渐变"
}`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: '无法解析分析结果' }, { status: 500 });
    }

    return Response.json(JSON.parse(jsonMatch[0]));
  } catch (e) {
    console.error('[analyze error]', e);
    return Response.json({ error: '分析失败，请重试' }, { status: 500 });
  }
}
