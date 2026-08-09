'use client';

import { ArrowLeft, ArrowRight, Check, Info, Lightbulb, WarningCircle, X } from '@phosphor-icons/react';
import { useState } from 'react';
import { FlowProgress } from './flow-progress';
import {
  holdLabel,
  judgeRisks,
  layer1CanDye,
  layer2BiasRisk,
  minDyeableLevel,
  type ColorMatrix,
  type JudgeRisk,
  type VideoColor,
} from './hair-mirror-core';
import { MediaImage, cx } from './ui';

export type VerdictIntent = 'preview' | 'switch' | 'bleach';

const LEVEL_SWATCH = [
  '#15110f', '#241b17', '#38281f', '#503624', '#704a2c',
  '#936836', '#b38648', '#cda562', '#dfc384', '#efddb1',
];

const rgbCss = (value: [number, number, number]) =>
  `rgb(${value[0]},${value[1]},${value[2]})`;

/** 「什么颜色 · 多少度」。判断屏上只写度数，用户根本不知道 AI 把自己认成了什么颜色。 */
function colorLabel(name?: string, level?: number) {
  const parts = [name?.trim(), level && level > 0 ? `${level} 度` : ''].filter(Boolean);
  return parts.join(' · ') || '待确认';
}

/* ==================== 色素轴 · 什么颜色能盖住什么颜色 ====================
 *
 * 染发是【减色】：染膏只能往发丝里加色素，不能把已有的色素拿走。所以
 * 「能不能染」本质是两个问题——
 *   ① 底色够不够浅：染膏色素比底色浅，就压不住，颜色出不来；
 *   ② 底色残留什么色相：漂浅过程中头发会依次经过红→橙→橙黄→黄，
 *      这层残留会和染膏在发丝里做减色混合，按色轮互补决定偏到哪去。
 *
 * 下表就是理发师配色的基本盘：蓝压橙、紫压黄、绿压红、红压绿。
 * neutralizes = 这支染膏能中和掉的残留色（染出来更干净）
 * amplifies   = 遇到这种残留会被带偏（染出来发脏 / 变成另一个色）
 */
type Pigment = { pigment: string; neutralizes: string; amplifies: string; drift: string };

const PIGMENT_AXIS: { match: RegExp; value: Pigment }[] = [
  { match: /蓝|靛|海/, value: { pigment: '蓝色素', neutralizes: '橙色', amplifies: '黄色', drift: '偏绿' } },
  { match: /紫|薰衣草|藕/, value: { pigment: '紫色素', neutralizes: '黄色', amplifies: '橙红', drift: '偏红' } },
  { match: /绿|薄荷|抹茶|青/, value: { pigment: '绿色素', neutralizes: '红色', amplifies: '橙黄', drift: '偏黄绿' } },
  { match: /粉|玫瑰|莓/, value: { pigment: '品红色素', neutralizes: '绿色', amplifies: '橙黄', drift: '偏橘' } },
  { match: /红|酒|樱/, value: { pigment: '红色素', neutralizes: '绿色', amplifies: '橙色', drift: '偏砖红' } },
  { match: /灰|银|烟|雾/, value: { pigment: '灰蓝色素', neutralizes: '橙黄', amplifies: '红棕', drift: '偏棕' } },
  { match: /金|黄|蜜|奶|亚麻/, value: { pigment: '黄色素', neutralizes: '', amplifies: '橙红', drift: '偏橘黄' } },
  { match: /棕|栗|茶|咖|巧克力/, value: { pigment: '棕色素', neutralizes: '杂色', amplifies: '', drift: '偏深' } },
  { match: /黑/, value: { pigment: '黑色素', neutralizes: '所有残留色', amplifies: '', drift: '偏死黑' } },
];

const DEFAULT_PIGMENT: Pigment = { pigment: '染膏色素', neutralizes: '', amplifies: '', drift: '偏色' };

function pigmentOf(name: string): Pigment {
  return PIGMENT_AXIS.find((item) => item.match.test(name))?.value ?? DEFAULT_PIGMENT;
}

function biasLabel(kb: string, undertone?: string) {
  const p = pigmentOf(kb);
  // 只有残留色确实落在这支染膏"压不住"的那一边，才说得出具体偏哪。
  if (p.amplifies && undertone && new RegExp(`[${p.amplifies}]`).test(undertone)) return p.drift;
  return '偏色';
}

/** 「{目标色}能不能盖住{当前发色}」的专业解释。判断依据要写颜色关系，不是抽象的中和二字。 */
function coverageReason(
  targetName: string,
  currentName: string,
  level: number,
  min: number,
) {
  const p = pigmentOf(targetName);
  const lead = `${targetName}靠${p.pigment}显色，${p.pigment}只能压住比它更深的底色、拿不走已有的色素。`;
  const gap = level >= min
    ? `你现在是${currentName} ${level} 度，已经浅过${targetName}的显色门槛 ${min} 度，色素压得住，所以能直接盖上去。`
    : `你现在是${currentName} ${level} 度，比${targetName}的显色门槛 ${min} 度还深 ${min - level} 度，色素压不住，盖上去只会更暗。`;
  return lead + gap;
}

/** 「残留底色会不会把颜色带偏」的专业解释。用色轮互补讲，不用"颜色中和"四个字糊过去。 */
function neutralizeReason(targetName: string, undertoneName: string, level: number) {
  const p = pigmentOf(targetName);
  if (!undertoneName) {
    return `${p.pigment}和你当前底色没有明显的互补冲突，染后色相基本按色卡走。`;
  }
  const canNeutralize = p.neutralizes && new RegExp(`[${p.neutralizes}]`).test(undertoneName);
  if (canNeutralize) {
    return `头发漂到 ${level} 度会残留${undertoneName}，而${p.pigment}在色轮上正对${p.neutralizes}——两者互补，${p.pigment}刚好把${undertoneName}抵消掉，染出来的${targetName}会更干净。`;
  }
  return `头发漂到 ${level} 度会残留${undertoneName}，${p.pigment}压不住这层${undertoneName}，两个色素在发丝里叠加，成色会往${p.drift}走。`;
}

export function VerdictScreen({
  matrix,
  level,
  video,
  dyeHistory,
  currentTone,
  currentColorName,
  currentPhotoUrl,
  targetPhotoUrl,
  onBack,
  onGo,
  onPickColor,
}: {
  matrix: ColorMatrix;
  level: number;
  video: VideoColor;
  dyeHistory?: string;
  currentTone?: string;
  /** 用户在确认页最终确认的发色名。判断屏两处都要写「什么颜色 · 多少度」 */
  currentColorName?: string;
  currentPhotoUrl: string;
  targetPhotoUrl: string;
  onBack: () => void;
  onGo: (intent: VerdictIntent) => void;
  onPickColor: (videoId: string) => void | Promise<void>;
}) {
  const kb = video.kb_color ?? '';
  const can = layer1CanDye(matrix, kb, level).can;
  const currentName = currentColorName?.trim() || '当前发色';
  return (
    <Frame
      onBack={onBack}
      title={can ? '能不能染这个颜色？' : '你的染发方案'}
      subtitle={can ? '根据你的发色和目标色进行判断' : `基于你当前 ${level} 度底色的判断`}
      stageLabel={can ? undefined : '不能直染'}
    >
      {can ? (
        <CanDye
          matrix={matrix}
          level={level}
          video={video}
          dyeHistory={dyeHistory}
          currentTone={currentTone}
          currentName={currentName}
          currentPhotoUrl={currentPhotoUrl}
          targetPhotoUrl={targetPhotoUrl}
          onGo={onGo}
        />
      ) : (
        <CannotDye
          matrix={matrix}
          level={level}
          video={video}
          dyeHistory={dyeHistory}
          currentTone={currentTone}
          currentName={currentName}
          currentPhotoUrl={currentPhotoUrl}
          targetPhotoUrl={targetPhotoUrl}
          onGo={onGo}
          onPickColor={onPickColor}
        />
      )}
    </Frame>
  );
}

function CanDye({ matrix, level, video, dyeHistory, currentTone, currentName, currentPhotoUrl, targetPhotoUrl, onGo }: {
  matrix: ColorMatrix;
  level: number;
  video: VideoColor;
  dyeHistory?: string;
  currentTone?: string;
  currentName: string;
  currentPhotoUrl: string;
  targetPhotoUrl: string;
  onGo: (intent: VerdictIntent) => void;
}) {
  const kb = video.kb_color ?? '';
  const min = minDyeableLevel(matrix, kb) ?? level;
  const layer2 = layer2BiasRisk(matrix, kb, level, currentTone);
  const bias = biasLabel(kb, layer2.undertoneName);
  const conclusion = layer2.risky
    ? `可以染，但可能会${bias}`
    : `当前可以直接染${video.color_name}`;
  // 判断依据写「什么颜色能盖住什么颜色」，不写抽象的"颜色中和"。
  const coverReason = coverageReason(video.color_name, currentName, level, min);
  const neutralReason = layer2.transition?.why
    ?? neutralizeReason(video.color_name, layer2.undertoneName, level);
  const risks = dyeRisks(matrix, kb, level, dyeHistory, currentTone, video.color_name);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4">
        <section className="rounded-[22px] border border-[#9bc9a7] bg-[#f4fbf5] px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#8bc798] text-white">
              <Check size={24} weight="bold" />
            </span>
            <div>
              <h1 className="text-[23px] font-black leading-tight">{conclusion}</h1>
              <p className="mt-1.5 text-[12px] leading-[1.65] text-ink-2">
                这是基于你确认的底色色度和知识库颜色中和规则得出的判断。
              </p>
            </div>
          </div>
        </section>

        <section className="mt-3 grid grid-cols-[1fr_24px_1fr] items-center gap-2 rounded-[20px] border border-line bg-white p-3">
          <PhotoFact title="你的当前发色" src={currentPhotoUrl} label={colorLabel(currentName, level)} />
          <ArrowRight size={20} weight="bold" className="text-pink-dark" />
          <PhotoFact title="目标发色" src={targetPhotoUrl || video.cover_url || ''} label={colorLabel(video.color_name, min)} />
        </section>

        <section className="mt-4 rounded-[22px] border border-line bg-white px-4 py-4">
          <h2 className="flex items-center gap-2 text-[15px] font-black">
            <span className="text-pink-dark">☆</span> 判断依据
          </h2>
          <div className="mt-3 grid gap-2.5">
            <Evidence index="1" title={`${video.color_name}能盖住${currentName}`} body={coverReason} />
            <Evidence index="2" title="底色残留怎么影响成色" body={neutralReason} />
          </div>
        </section>

        <RiskSection risks={risks} />
      </div>
      <Footer>
        <button type="button" onClick={() => onGo('preview')} className="tap flex w-full items-center justify-center gap-2 rounded-full bg-pink py-3.5 text-[15px] font-black text-white">
          查看实拍效果 <ArrowRight size={18} weight="bold" />
        </button>
      </Footer>
    </div>
  );
}

function CannotDye({ matrix, level, video, dyeHistory, currentTone, currentName, currentPhotoUrl, targetPhotoUrl, onGo, onPickColor }: {
  matrix: ColorMatrix;
  level: number;
  video: VideoColor;
  dyeHistory?: string;
  currentTone?: string;
  currentName: string;
  currentPhotoUrl: string;
  targetPhotoUrl: string;
  onGo: (intent: VerdictIntent) => void;
  onPickColor: (videoId: string) => void | Promise<void>;
}) {
  const kb = video.kb_color ?? '';
  const min = minDyeableLevel(matrix, kb) ?? Math.min(10, level + 1);
  const gap = Math.max(1, min - level);
  const pigment = pigmentOf(video.color_name);
  const undertoneName = layer2BiasRisk(matrix, kb, level, currentTone).undertoneName;
  const risks = dyeRisks(matrix, kb, level, dyeHistory, currentTone, video.color_name);
  const alternatives = matrix.videos.filter((item) =>
    item.kb_color && item.video_id !== video.video_id && layer1CanDye(matrix, item.kb_color, level).can,
  );
  // 参考稿里 A 方案是【四个可选色圈】，不是一个替用户拿主意的按钮。
  // 原来点一下就跳走并静默选中 alternatives[0]，用户根本不知道自己染的是哪个色。
  const [pickIndex, setPickIndex] = useState(0);
  const picks = alternatives.slice(0, 4);
  const picked = picks[pickIndex] ?? picks[0];
  const chooseAlternative = async () => {
    if (!picked) return;
    await onPickColor(picked.video_id);
    onGo('switch');
  };
  const swatchOf = (item: VideoColor) => {
    const rgb = matrix.matrix[item.kb_color!]?.[String(level)]?.rgb;
    return rgb ? rgbCss(rgb) : item.accent ?? '#777';
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
      {/* 结论 */}
      <section className="rounded-[22px] border border-line bg-white px-4 py-4">
        <div className="flex items-start gap-3">
          <X size={27} weight="bold" className="mt-0.5 shrink-0 text-pink" />
          <div className="min-w-0">
            <h1 className="text-[19px] font-black leading-[1.35]">
              当前发色直染不出<span className="text-pink-dark">{video.color_name}</span>，需要先漂
            </h1>
            <p className="mt-1.5 text-[12px] leading-5 text-ink-2">
              你现在是 {level} 度底色，{video.color_name}至少需要 {min} 度才能明显显色。
            </p>
          </div>
        </div>
      </section>

      {/* 当前 vs 目标 */}
      <section className="mt-3 rounded-[22px] border border-line bg-white p-3.5">
        <div className="grid grid-cols-2 gap-3">
          <PhotoFact
            title="当前发色" hint="你的头发" src={currentPhotoUrl}
            label={colorLabel(currentName, level)}
          />
          <PhotoFact
            title="目标发色" hint="你想染的" src={targetPhotoUrl || video.cover_url || ''}
            label={`${video.color_name}（来自你收藏的视频）`}
          />
        </div>
      </section>

      {/* 色度差距 */}
      <section className="mt-3 rounded-[22px] border border-line bg-white px-3.5 py-4">
        <h2 className="text-center text-[14px] font-black">色度差距</h2>
        <div className="mt-3 flex gap-1.5">
          {LEVEL_SWATCH.map((color, index) => {
            const degree = index + 1;
            const isCurrent = degree === level;
            return (
              <div key={degree} className="min-w-0 flex-1 text-center">
                <span className="mb-1 block text-[9px] font-bold text-ink-2">{degree}</span>
                <span
                  className={cx('block aspect-square rounded-[6px] border-2',
                    isCurrent ? 'border-pink' : degree === min ? 'border-[#e5b94f]' : 'border-transparent')}
                  style={{ background: color }}
                />
                {/* 当前度数下方的粉色三角，参考图里用来把"我在这"钉死 */}
                <span className={cx('mt-0.5 block text-[8px] leading-none text-pink', isCurrent ? '' : 'opacity-0')} aria-hidden>▲</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[12.5px] font-black">
          当前 {level} 度 <span className="mx-2 text-ink-3">→</span>
          <span className="text-pink-dark">{video.color_name}门槛 {min} 度</span>
        </p>
        <p className="mt-2 text-center">
          <span className="inline-block rounded-full bg-pink-soft px-3.5 py-1 text-[11.5px] font-black text-pink-dark">还差 {gap} 度</span>
        </p>

        <div className="mt-4 border-t border-dashed border-line pt-3.5">
          <h3 className="text-[13.5px] font-black">为什么当前不能直接染？</h3>
          <ol className="mt-2.5 grid gap-2">
            {[
              `当前底色太深，${pigment.pigment}无法明显显现`,
              `直接覆盖容易接近黑色或显脏${undertoneName ? `，${undertoneName}残留还会把成色往${pigment.drift}带` : ''}`,
              `需要先把底色提高到至少 ${min} 度，再叠加${video.color_name}`,
            ].map((text, index) => (
              <li key={text} className="grid grid-cols-[22px_1fr] gap-2">
                <span className="grid size-[19px] place-items-center rounded-full border border-pink text-[10px] font-black text-pink-dark">{index + 1}</span>
                <span className="text-[11.5px] leading-[1.55] text-ink-2">{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 去理发店漂发 */}
      <section className="mt-3 rounded-[22px] border border-[#eccf8c] bg-[#fffaf0] px-4 py-4">
        <h2 className="flex items-center gap-1.5 text-[14px] font-black text-[#a97c1c]">
          <Lightbulb size={17} weight="fill" className="text-[#e0a92c]" /> 需要先去理发店漂发
        </h2>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="size-[38px] shrink-0 rounded-[9px] border border-ink/10" style={{ background: LEVEL_SWATCH[Math.max(0, level - 1)] }} />
          <ArrowRight size={15} weight="bold" className="shrink-0 text-pink" />
          <span className="size-[38px] shrink-0 rounded-[9px] border border-ink/10" style={{ background: LEVEL_SWATCH[Math.min(9, min - 1)] }} />
          <p className="min-w-0 flex-1 text-[11px] leading-[1.5] text-ink-2">
            需要把底色从 {level} 度漂到至少 {min} 度，才能更好显色
          </p>
        </div>
        <div className="mt-3 rounded-[15px] border border-[#c3dfc8] bg-white px-3 py-2.5">
          <span className="inline-block rounded-full bg-[#e6f3e8] px-2.5 py-[3px] text-[10px] font-black text-[#4e8a5b]">专业漂发更安全</span>
          <p className="mt-1.5 text-[11.5px] leading-[1.6]">
            请专业理发师将底色安全漂至 {min} 度及以上，再回来染{video.color_name}，效果更稳定。
          </p>
          <p className="mt-1 text-[10.5px] leading-4 text-ink-3">居家漂发风险较高，不推荐自行操作。</p>
        </div>
      </section>

      {/* 居家漂发风险 —— 参考图里的三宫格 */}
      <section className="mt-3 rounded-[22px] border border-[#efb7a7] bg-[#fff7f4] px-4 py-4">
        <h2 className="flex items-center justify-center gap-1.5 text-center text-[14px] font-black text-[#c9552f]">
          <WarningCircle size={17} weight="fill" /> 居家漂发超高风险，请谨慎！
        </h2>
        <div className="mt-3 grid grid-cols-3 divide-x divide-dashed divide-[#f0cfc4]">
          {[
            { title: '极易损伤发质', body: '头发干枯、断裂、分叉，难以修复' },
            { title: '容易漂花不均匀', body: '出现色坨、斑驳，后续染色更难控制' },
            { title: '可能刺激头皮', body: '引发红肿、过敏，严重时需就医处理' },
          ].map((item) => (
            <div key={item.title} className="px-2 text-center">
              <p className="text-[11.5px] font-black leading-4">{item.title}</p>
              <p className="mt-1 text-[10px] leading-[1.5] text-ink-2">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 风险清单（偏色 / 不均匀 / 掉色）*/}
      <RiskSection
        risks={
          risks.length
            ? risks
            : [{
                key: 'bleach',
                text: `漂到 ${min} 度才够显色 —— 还差 ${gap} 度`,
                action: '居家漂发容易断发、斑驳并刺激头皮，这一步建议去理发店做',
              }]
        }
      />

      <h2 className="mb-2.5 mt-5 text-center text-[14px] font-black">选择一种方案继续 <span className="text-pink">♥</span></h2>
      <div className="grid gap-2.5">
        {/* A 方案不再置灰。矩阵只录 3~9 度，天生黑发（1~2 度）此前一个可选色都
            列不出来，按钮永远是灰的、点了没反应——那是数据覆盖问题，不该让用户
            承担。layer1CanDye 现在会把越界度数夹到最近的已录度数。 */}
        <div className="rounded-[20px] border border-[#9aca9f] bg-[#f5fbf5] px-3.5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#7dbb87] font-black text-white">A</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-black">选择当前能染的颜色</p>
              <p className="mt-0.5 text-[10.5px] text-ink-2">不需要漂，选一个颜色直接查看试色效果。</p>
            </div>
            <button type="button" disabled={!picked} onClick={() => void chooseAlternative()}
              aria-label={picked ? `用${picked.color_name}查看试色效果` : '暂无可染颜色'}
              className="tap grid size-9 shrink-0 place-items-center rounded-full bg-[#7dbb87] disabled:opacity-40">
              <ArrowRight size={17} weight="bold" className="text-white" />
            </button>
          </div>
          {picks.length ? (
            <div className="mt-3 flex items-center gap-2.5">
              {picks.map((item, index) => (
                <button key={item.video_id} type="button" onClick={() => setPickIndex(index)}
                  aria-pressed={index === pickIndex} title={item.color_name}
                  className={cx('tap grid size-[38px] shrink-0 place-items-center rounded-full border-2',
                    index === pickIndex ? 'border-[#4e8a5b]' : 'border-transparent')}>
                  <span className="block size-[30px] rounded-full border border-ink/10" style={{ background: swatchOf(item) }} />
                </button>
              ))}
              <p className="min-w-0 flex-1 truncate text-right text-[11px] font-black text-[#4e8a5b]">
                已选 {picked?.color_name}
              </p>
            </div>
          ) : (
            <p className="mt-2.5 text-[10.5px] text-ink-3">知识库暂时没有适合 {level} 度底色的其他颜色。</p>
          )}
        </div>
        <button type="button" onClick={() => onGo('bleach')}
          className="tap flex items-center gap-3 rounded-[20px] border border-[#e8bd62] bg-[#fffaf0] px-3.5 py-3.5 text-left">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e8ad3f] font-black text-white">B</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-black">还是想染{video.color_name}</span>
            <span className="mt-0.5 block text-[10.5px] leading-[1.5] text-ink-2">
              需要先把底色从 {level} 度漂至少 {min} 度，查看漂浅后的效果与预期。
            </span>
          </span>
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#e8bd62] bg-white">
            <ArrowRight size={16} weight="bold" className="text-[#b6851f]" />
          </span>
        </button>
      </div>

      <p className="mt-4 text-center text-[10.5px] leading-4 text-ink-3">
        小贴士：最终效果会受底色、发质、护理习惯等多种因素影响，建议理性预期。
      </p>
    </div>
  );
}

/* ==================== 风险 ====================
 *
 * 原来这块叫「直染前需要知道」。但用户真正需要在这一屏看到的不是"知识"，
 * 是【会翻车的地方】——偏色、不均匀、掉色。所以标题、配色、措辞全部改成风险，
 * 每条都必须配一个能做的动作，说不出动作的风险等于吓唬人。
 *
 * judgeRisks 只在命中条件时才产出（偏色 / 布丁头），条数不稳定；
 * 这里补两条恒定成立的物理风险，保证永远有 3 条可看。
 */
function dyeRisks(
  matrix: ColorMatrix,
  kb: string,
  level: number,
  dyeHistory: string | undefined,
  currentTone: string | undefined,
  targetName: string,
): JudgeRisk[] {
  const out = [...judgeRisks(matrix, kb, level, dyeHistory, currentTone)];
  const has = (key: string) => out.some((r) => r.key === key);
  const p = pigmentOf(targetName);

  // 上色不均：家用染发没有分区夹，发丝各处停留时间天然不一样。
  if (!has('uneven')) {
    out.push({
      key: 'uneven-home',
      text: '可能会不均匀 —— 家里没法分区，发根发尾的停留时间对不齐',
      action: '把头发分成 4 区依次涂，先涂难上色的发根，最后一起冲',
    });
  }

  // 掉色：直接染的色素分子留不住，褪色时残留底色会先冒出来。
  if (!has('fade')) {
    out.push({
      key: 'fade',
      text: `会掉色，而且是往${p.drift}掉 —— 染膏色素先流失，底色残留会先冒出来`,
      action: '前 3 天别洗头，之后用低温水 + 护色洗发水，能多撑 1~2 周',
    });
  }

  return out.slice(0, 3);
}

function RiskSection({ risks }: { risks: JudgeRisk[] }) {
  return (
    <section className="mt-4 rounded-[22px] border border-[#efb7a7] bg-[#fff7f4] px-4 py-4">
      <h2 className="flex items-center gap-2 text-[15px] font-black">
        <WarningCircle size={19} weight="fill" className="text-pink-dark" />
        风险 —— 这几件事最容易翻车
      </h2>
      <div className="mt-2 divide-y divide-dashed divide-[#f0cfc4]">
        {risks.map((risk, index) => (
          <div key={risk.key} className="grid grid-cols-[28px_1fr] gap-2 py-2.5">
            <span className="grid size-6 place-items-center rounded-full bg-pink text-[11px] font-black text-white">{index + 1}</span>
            <div>
              <p className="text-[12px] font-black leading-5">{risk.text}</p>
              <p className="mt-0.5 text-[10.5px] leading-4 text-ink-2">→ {risk.action}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Evidence({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <div className="grid grid-cols-[28px_1fr] gap-2.5 rounded-[15px] bg-cream px-3 py-2.5">
      <span className="grid size-7 place-items-center rounded-full border border-pink text-[11px] font-black text-pink-dark">{index}</span>
      <div><p className="text-[12px] font-black">{title}</p><p className="mt-0.5 text-[10.5px] leading-4 text-ink-2">{body}</p></div>
    </div>
  );
}

function PhotoFact({ title, hint, src, label }: { title: string; hint?: string; src: string; label: string }) {
  return (
    <div className="text-center">
      <p className="mb-2 text-[11px] font-black">
        {title}
        {hint ? <span className="font-bold text-ink-3">（{hint}）</span> : null}
      </p>
      {/* relative 不能省：MediaImage 用 next/image 的 fill，父级不是定位元素时
          图片会相对视口铺满全屏，把下面的按钮整个盖住。 */}
      <div className="relative mx-auto aspect-square w-full max-w-[118px] overflow-hidden rounded-[16px] bg-cream">
        {src ? <MediaImage src={src} alt={title} className="object-cover" /> : null}
      </div>
      {/* 参考稿把说明做成圆角胶囊，和上面的标题拉开层级 */}
      <p className="mt-2 inline-block max-w-full truncate rounded-full bg-cream px-2.5 py-1 text-[9.5px] font-bold">{label}</p>
    </div>
  );
}

function Frame({ onBack, title, subtitle, stageLabel, children }: {
  onBack: () => void;
  title: string;
  subtitle: string;
  stageLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="tony-app relative mx-auto flex min-h-0 flex-col overflow-hidden bg-cream text-ink md:my-5 md:rounded-[34px] md:border-2 md:border-ink">
      <header className="shrink-0 border-b border-ink/15 pt-[max(10px,env(safe-area-inset-top))]">
        <div className="flex items-center px-3">
          <button type="button" onClick={onBack} aria-label="返回" className="sketch-icon-button tap grid size-9 place-items-center bg-white"><ArrowLeft size={17} weight="bold" /></button>
          <div className="flex-1 text-center"><p className="text-[15px] font-black">{title}</p><p className="mt-0.5 text-[9.5px] text-ink-3">{subtitle}</p></div>
          <span className="w-9" />
        </div>
        <FlowProgress stage="verdict" label={stageLabel} />
      </header>
      {children}
    </main>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="shrink-0 border-t border-ink/12 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">{children}</div>;
}

export function VerdictDetail({ matrix, level, video, dyeHistory, currentTone, currentColorName, onClose }: {
  matrix: ColorMatrix; level: number; video: VideoColor; dyeHistory?: string; currentTone?: string;
  currentColorName?: string; onClose: () => void;
}) {
  const kb = video.kb_color ?? '';
  const currentName = currentColorName?.trim() || '当前发色';
  const risks = dyeRisks(matrix, kb, level, dyeHistory, currentTone, video.color_name);
  const can = layer1CanDye(matrix, kb, level).can;
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/35" onClick={onClose}>
      <div className="max-h-[72%] overflow-y-auto rounded-t-[24px] bg-cream px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-4 text-ink" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2"><Info size={18} weight="bold" className="text-pink-dark" /><p className="flex-1 text-[15px] font-black">{video.color_name} · {can ? '当前可直接染' : '需要先漂浅'}</p><button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full border border-line"><X size={15} /></button></div>
        <p className="mt-3 text-[12px] leading-5 text-ink-2">你当前确认的底色为{colorLabel(currentName, level)}。保色期参考：{holdLabel(matrix, kb)}。</p>
        <div className="mt-3 space-y-2">{risks.map((risk) => <div key={risk.key} className="rounded-[14px] border border-[#e8c47a] bg-[#fff8e4] px-3 py-2.5"><p className="text-[12px] font-bold">{risk.text}</p><p className="mt-1 text-[11px] text-ink-2">→ {risk.action}</p></div>)}</div>
      </div>
    </div>
  );
}
