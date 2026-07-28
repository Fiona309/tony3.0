import Anthropic from '@anthropic-ai/sdk';

const IS_MOCK = !process.env.ANTHROPIC_API_KEY;
const client = IS_MOCK ? null : new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { transcript, step, currentStepIndex, totalSteps, hasSelectedDye, currentStepTitle } = await req.json();
    if (!transcript) return Response.json({ action: 'none' });
    if (IS_MOCK) return Response.json({ action: 'none' });

    const stepDesc: Record<string, string> = {
      input: '上传照片和博主参考',
      feasibility: '看 AI 判断我能不能染',
      product: '在 3 个染膏中选一个',
      mixing: '看选定染膏的调配比例',
      operation: `跟着 6 步染发，当前第 ${currentStepIndex + 1}/${totalSteps} 步「${currentStepTitle || ''}」`,
    };

    const response = await client!.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `你是染发应用的语音助手。用户正在「${stepDesc[step] || step}」时刻说出了一句话，请理解 TA 真正想干什么，输出 JSON 动作。

用户原话：「${transcript}」

可用动作：
- next : 下一步（包括"做完了/搞定了/染好了/弄完了/已经XX了/可以下一步了"等含义；操作页时也包括"继续/接下来"）
- prev : 上一步（包括"没弄好/还没好/慢点/我没跟上/不对/回去/再看看/还没"等）
- jump_step : 跳到操作步骤的第 N 步（"第三步/跳到第五步"），需要 step_num 参数
- start_timer : 设倒计时（"X 分钟后提醒/帮我定个闹钟/30 分钟到了叫我/给我倒计时"），需要 seconds 参数。如用户没说具体时间但提到闹钟，根据当前 step 标题里的时间推断（如"停留 30 分钟" → 1800）
- accept_timer : 用户回应"好/可以/嗯"接受刚才的闹钟询问（仅在 operation step 有意义）
- decline_timer : 用户拒绝设闹钟（"不用/不要"）
- cancel_timer : 取消已设的倒计时
- stop_tts : 停止当前朗读（用户说"别说了/安静/停一下/别念了/暂停朗读"等）
- play_tts : 朗读/重新朗读当前步骤（用户说"读一下/朗读/给我读/念一下/开始朗读"等）
- close_voice : 关闭语音助手
- none : 没听明白或闲聊

规则：
- 优先识别意图，而不是匹配字面词。"我染好了，可以下一步了" = next，"再看看" = prev
- 倒计时秒数：30 分钟 = 1800，5 分钟 = 300
- 用户没明确表达意图时返回 none
- 输出 JSON：{"action": "...", "params": {...可选}, "response": "10 字以内反馈语，用第一人称'好的'开头"}

只输出 JSON，不要其他文字。`
      }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return Response.json({ action: 'none' });
    return Response.json(JSON.parse(match[0]));
  } catch (e) {
    console.error('[voice-intent]', e);
    return Response.json({ action: 'none' });
  }
}
