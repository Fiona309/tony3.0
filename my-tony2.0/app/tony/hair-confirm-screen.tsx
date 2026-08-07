'use client';

/**
 * 屏1 · 确认头发
 *
 * 一件事：确认我看对了。所以整屏是一张四行清单，不放任何判断结论。
 *
 * 四个刻意的设计：
 *   1. 顶部并排两张卡：现在的发色 / 目标发色。用户是带着「我要染蓝色」从种草
 *      视频进来的，把"我现在什么样"和"我想要什么样"摆在一起，
 *      后面所有确认动作才有理由——否则"确认我的头发"就是没有动机的填表。
 *   2. 四行【就地展开】，不用弹层。弹层会盖住上面的对比卡，用户改度数时
 *      看不到自己的头发，等于把最重要的参照物藏起来了。
 *   3. 度数展开成 1-10 的横向色阶。度数是四项里误差最大的（实测同一张照片
 *      只改亮度，识别结果能从 1 度跳到 4 度），必须给可比对的参照；
 *      但默认收起，展开才铺,免得这一屏从"清单"变成"色卡页"。
 *   4. 漂染历史 × 度数的矛盾校验。度数识别本身不可靠，单独看没有容错；
 *      加上漂染历史交叉验证，就从"唯一依据"降级成"两个依据之一"。
 *      「染过黑发」单独标重点——黑色染膏会把底色永久压深，是最常见的误判来源。
 */

import { useState } from 'react';
import { CaretDown, WarningCircle, X } from '@phosphor-icons/react';

import { FlowProgress } from './flow-progress';
import type { HairColor, HairProfileData, HairProfileUpdate, MockVideo } from './types';
import { cx, MediaImage } from './ui';

/** 与后端 EDITABLE_OPTIONS.dye_history 的枚举一一对应 */
const NEVER_BLEACHED = 'natural';
/** 黑色染膏会把底色永久压深，是度数误判最常见的来源，单独标重点 */
const DYED_BLACK = 'dyed_black';

/** 一次漂浅约提亮 2 度，据此推出各漂染史下底色度数的合理区间 */
const PLAUSIBLE_LEVEL: Record<string, [number, number]> = {
  natural: [1, 6],
  bleached_1: [4, 8],
  bleached_2: [6, 10],
  bleached_3_plus: [7, 10],
  dyed_black: [1, 4],
};

/** 1~10 度的参考色。与色卡 hair-level-guide.jpg 同一套渐变，用于横向色阶 */
const LEVEL_SWATCH = [
  '#1C1614', '#2A211C', '#3B2C22', '#4E3728', '#66452C',
  '#7E5533', '#9E7040', '#B98F52', '#CBA76A', '#DFC38F',
];

const LEVEL_NAME = [
  '深黑色', '黑色', '原生黑棕', '深棕色', '棕色',
  '浅棕色', '金色', '浅金色', '白金色', '淡白金',
];

const LEVEL_TONE = [
  'black', 'black', 'dark_brown', 'dark_brown', 'brown',
  'light_brown', 'gold', 'light_gold', 'blonde', 'pale_blonde',
];

function currentColorOf(profile: HairProfileData): HairColor {
  return (
    profile.current_hair.color ??
    profile.current_hair.regions?.end.color ?? {
      tone: 'unknown',
      level: 0,
      saturation: 'medium',
      display_name: '待确认',
    }
  );
}

type Field = 'hair_length' | 'hair_volume' | 'dye_history';

function labelOf(profile: HairProfileData, field: Field, value: string) {
  return profile.editable_options[field]?.find((o) => o.value === value)?.label ?? value;
}

type Panel = 'level' | Field | null;

export function HairConfirmScreen({
  initialProfile,
  currentPhotoUrl,
  target,
  onBack,
  onConfirm,
}: {
  initialProfile: HairProfileData;
  currentPhotoUrl: string;
  target: MockVideo;
  onBack: () => void;
  onConfirm: (update: HairProfileUpdate) => Promise<void>;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [panel, setPanel] = useState<Panel>(null);
  const [guide, setGuide] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const color = currentColorOf(profile);
  const level = color.level || 0;

  const range = PLAUSIBLE_LEVEL[profile.dye_history];
  const conflict =
    range && level > 0 && (level < range[0] || level > range[1])
      ? profile.dye_history === NEVER_BLEACHED
        ? `你选了「从未漂过」，但照片看起来有 ${level} 度。天生发色很少超过 ${range[1]} 度，两个对不上，再确认一下？`
        : `你选了「${labelOf(profile, 'dye_history', profile.dye_history)}」，但照片看起来是 ${level} 度，两个对不上，再确认一下？`
      : '';

  const pickLevel = (lv: number) => {
    setProfile((p) => ({
      ...p,
      current_hair: {
        ...p.current_hair,
        region_mode: 'single',
        color: { ...color, level: lv, tone: LEVEL_TONE[lv - 1], display_name: `${lv} 度 ${LEVEL_NAME[lv - 1]}` },
      },
    }));
  };

  const submit = async () => {
    setSubmitting(true);
    setError('');
    const { confidence, ...cleaned } = color;
    void confidence;
    try {
      await onConfirm({
        target_color: profile.target_color,
        current_hair: { region_mode: 'single', color: cleaned },
        hair_length: profile.hair_length,
        hair_volume: profile.hair_volume,
        dye_history: profile.dye_history,
      } as HairProfileUpdate);
    } catch (e) {
      setError(e instanceof Error ? e.message : '确认失败，请重试');
      setSubmitting(false);
    }
  };

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  return (
    <main className="tony-app relative mx-auto flex min-h-0 flex-col overflow-hidden bg-cream text-ink md:my-5 md:rounded-[34px] md:border-2 md:border-ink">
      <header className="shrink-0 pt-[max(10px,env(safe-area-inset-top))]">
        <div className="flex items-center px-4">
          <button type="button" onClick={onBack} aria-label="返回"
            className="sketch-icon-button tap grid size-10 place-items-center bg-white">
            <X size={17} weight="bold" />
          </button>
          <h1 className="relative flex-1 text-center text-[19px] font-black tracking-[-.02em]">
            先确认一下你的头发
            {/* 手绘小装饰：标题右上角三道粉色斜线 */}
            <span aria-hidden className="pointer-events-none absolute -top-1 right-6 text-[15px] leading-none text-pink">✦</span>
          </h1>
          <span className="w-10" />
        </div>
        <FlowProgress stage="hair" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
        {/* 并排对比：把"我现在什么样"和"我想要什么样"摆在一起，
            后面所有确认动作才有理由 */}
        <div className="grid grid-cols-2 gap-3">
          <PhotoCard title="现在的发色" src={currentPhotoUrl} alt="你上传的照片" />
          <PhotoCard title="目标发色" src={target.cover_url ?? ''} alt={target.color_name}
            fallback={target.accent ?? '#8a8a8a'} />
        </div>

        <div className="mt-4 grid gap-3">
          <Accordion
            label="度数"
            value={level ? `${level}度` : '待确认'}
            open={panel === 'level'}
            onToggle={() => toggle('level')}
            help={<button type="button" onClick={(e) => { e.stopPropagation(); setGuide(true); }}
              className="tap ml-1.5 grid size-[19px] place-items-center rounded-full border border-ink/25 bg-cream text-[11px] font-black text-ink-2">?</button>}
          >
            <button type="button" onClick={() => setGuide(true)}
              className="tap text-[12px] text-ink-2 underline underline-offset-4">如何查看度数</button>
            <div className="mt-3 flex gap-1">
              {LEVEL_SWATCH.map((hex, i) => {
                const lv = i + 1;
                const on = lv === level;
                return (
                  <button key={lv} type="button" onClick={() => pickLevel(lv)}
                    aria-label={`${lv} 度 ${LEVEL_NAME[i]}`} aria-pressed={on}
                    className="tap flex flex-1 flex-col items-center gap-1.5">
                    <span className={cx('text-[11px] font-black tabular-nums',
                      on ? 'grid size-[19px] place-items-center rounded-full bg-pink text-white' : 'text-ink-3')}>
                      {lv}
                    </span>
                    <span className={cx('h-[46px] w-full rounded-[7px] border',
                      on ? 'border-[2px] border-pink' : 'border-ink/12')}
                      style={{ background: hex }} />
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-ink-3">
              <span>颜色越深 ←</span><span>度数</span><span>→ 颜色越浅</span>
            </div>
          </Accordion>

          <PickAccordion field="hair_length" label="发长" profile={profile} panel={panel}
            onToggle={toggle} onPick={(v) => setProfile((p) => ({ ...p, hair_length: v }))} />
          <PickAccordion field="hair_volume" label="发量" profile={profile} panel={panel}
            onToggle={toggle} onPick={(v) => setProfile((p) => ({ ...p, hair_volume: v }))} />
          <PickAccordion field="dye_history" label="漂染历史" profile={profile} panel={panel}
            onToggle={toggle} onPick={(v) => setProfile((p) => ({ ...p, dye_history: v }))}
            note="用来交叉核对度数，也影响上色是否均匀" />
        </div>

        {conflict ? (
          <p className="mt-3 flex gap-2 rounded-[16px] border border-[#e8c47a] bg-[#fff8e4] px-3.5 py-3 text-[12px] leading-[1.65] text-[#8a6413]">
            <WarningCircle size={16} weight="fill" className="mt-[2px] shrink-0" />
            <span>{conflict}</span>
          </p>
        ) : null}

        {error ? <p className="mt-3 text-center text-[12px] text-[#b4514a]">{error}</p> : null}
      </div>

      <div className="shrink-0 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={() => void submit()} disabled={submitting}
          className="tap w-full rounded-full border-[1.7px] border-ink bg-pink py-3.5 text-[16px] font-black text-white shadow-[2px_3px_0_rgba(61,55,51,.2)] disabled:opacity-60">
          {submitting ? '正在分析…' : `确认，看能不能直接染${target.color_name}`}
        </button>
      </div>

      {guide ? (
        <Overlay title="怎么看自己的头发是几度" onClose={() => setGuide(false)}>
          <p className="mb-3 text-[12px] leading-[1.7] text-ink-2">
            在自然光下把这张色卡靠近发根比对——发根是没被染过的原生发色，最能代表你的底色。
            发尾如果染过或漂过，会比发根浅，不要拿发尾比。
          </p>
          <img src="/hair-level-guide.jpg" alt="1-10 度发色对照色卡" className="w-full rounded-[16px] border border-line" />
        </Overlay>
      ) : null}
    </main>
  );
}

function PhotoCard({ title, src, alt, fallback }: { title: string; src: string; alt: string; fallback?: string }) {
  return (
    <div className="rounded-[20px] border border-ink/12 bg-white p-2.5">
      <p className="pb-2 text-center text-[13px] font-black text-ink-2">{title}</p>
      {/* relative 不能省：MediaImage 用 next/image 的 fill，
          没有定位父容器它会一路冒泡到最近的定位祖先铺满全屏 */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-[14px] bg-line"
        style={fallback && !src ? { background: fallback } : undefined}>
        {src ? <MediaImage src={src} alt={alt} className="object-cover object-top" /> : null}
      </div>
    </div>
  );
}

function Accordion({
  label, value, open, onToggle, help, children,
}: {
  label: string; value: string; open: boolean; onToggle: () => void;
  help?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-ink/12 bg-white">
      {/* help 是并列的兄弟节点，不能嵌进主按钮——button 套 button 是非法 HTML，
          React 会直接抛 hydration 错误 */}
      <div className="flex items-center pr-4">
        <button type="button" onClick={onToggle} aria-expanded={open}
          className="tap flex flex-1 items-center py-4 pl-4 text-left">
          <span className="text-[15px] font-black">{label}</span>
        </button>
        {help}
        <button type="button" onClick={onToggle} aria-hidden tabIndex={-1}
          className="tap flex items-center gap-2 py-4 pl-2">
          <span className="text-[15px] font-black text-ink-2">{value}</span>
          <CaretDown size={15} weight="bold"
            className={cx('shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open ? <div className="border-t border-line px-4 pb-4 pt-3">{children}</div> : null}
    </section>
  );
}

function PickAccordion({
  field, label, profile, panel, onToggle, onPick, note,
}: {
  field: Field; label: string; profile: HairProfileData; panel: Panel;
  onToggle: (p: Panel) => void; onPick: (v: string) => void; note?: string;
}) {
  const options = profile.editable_options[field] ?? [];
  return (
    <Accordion label={label} value={labelOf(profile, field, profile[field])}
      open={panel === field} onToggle={() => onToggle(field)}>
      {note ? <p className="mb-2.5 text-[11px] text-ink-3">{note}</p> : null}
      <div className="grid gap-2">
        {options.map((o) => {
          const on = o.value === profile[field];
          return (
            <button key={o.value} type="button" onClick={() => onPick(o.value)}
              className={cx('tap flex items-center gap-2.5 rounded-[13px] border px-3 py-2.5 text-left',
                on ? 'border-pink bg-pink/5' : 'border-line bg-white')}>
              <span className={cx('grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px]',
                on ? 'border-pink' : 'border-ink/25')}>
                {on ? <span className="size-[9px] rounded-full bg-pink" /> : null}
              </span>
              <span className="flex-1 text-[14px] font-bold">{o.label}</span>
              {/* 黑色染膏会把底色永久压深，是度数误判最常见的来源 */}
              {field === 'dye_history' && o.value === DYED_BLACK ? (
                <span className="flex items-center gap-1 rounded-[7px] bg-[#fdefc8] px-2 py-[3px] text-[10px] font-black text-[#8a6413]">
                  <WarningCircle size={11} weight="fill" />重点确认
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Accordion>
  );
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/35" onClick={onClose}>
      <div className="max-h-[76%] overflow-y-auto rounded-t-[24px] border-t-2 border-ink/15 bg-cream px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center">
          <p className="flex-1 text-[14px] font-black">{title}</p>
          <button type="button" onClick={onClose} aria-label="关闭"
            className="tap grid size-8 place-items-center rounded-full border border-ink/20 bg-white">
            <X size={14} weight="bold" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
