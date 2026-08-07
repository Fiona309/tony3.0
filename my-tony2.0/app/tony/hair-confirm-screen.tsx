'use client';

/**
 * 屏1 · 确认头发
 *
 * 一件事：确认我看对了。所以整屏是一张四行清单，不放任何判断结论。
 *
 * 三个刻意的设计：
 *   1. 顶部挂目标色。用户是带着「我要染蓝色」从种草视频进来的，如果这一屏
 *      一个字都不提蓝色，"确认我的头发"就成了没有理由的填表，动机链是断的。
 *   2. 色卡收在度数右边的小问号后面。度数是四项里误差最大的（实测同一张照片
 *      只改亮度，识别结果能从 1 度跳到 4 度），需要辅助；但默认铺开会把这一屏
 *      从"清单"变成"色卡页"，喧宾夺主。
 *   3. 漂染历史 × 度数的矛盾校验。度数识别本身不可靠，单独看没有容错；
 *      加上漂染历史做交叉验证，就从"唯一依据"降级成"两个依据之一"。
 *      矛盾在这一屏当场提示，比事后补救便宜得多。
 */

import { useState } from 'react';
import { CaretDown, Question, X } from '@phosphor-icons/react';

import { FlowProgress } from './flow-progress';
import type { HairColor, HairProfileData, HairProfileUpdate, MockVideo } from './types';
import { cx, MediaImage } from './ui';

/** 与后端 EDITABLE_OPTIONS.dye_history 的枚举一一对应 */
const NEVER_BLEACHED = 'natural';

/** 一次漂浅约提亮 2 度，据此推出各漂染史下底色度数的合理区间 */
const PLAUSIBLE_LEVEL: Record<string, [number, number]> = {
  natural: [1, 6],
  bleached_1: [4, 8],
  bleached_2: [6, 10],
  bleached_3_plus: [7, 10],
  dyed_black: [1, 4],
};

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

function labelOf(profile: HairProfileData, field: 'hair_length' | 'hair_volume' | 'dye_history', value: string) {
  return profile.editable_options[field].find((o) => o.value === value)?.label ?? value;
}

type Sheet = 'level' | 'color' | 'hair_length' | 'dye_history' | null;

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
  const [sheet, setSheet] = useState<Sheet>(null);
  const [guide, setGuide] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const color = currentColorOf(profile);
  const level = color.level || 0;
  const colorOptions = profile.current_hair.color_options ?? [];

  const range = PLAUSIBLE_LEVEL[profile.dye_history];
  const conflict =
    range && level > 0 && (level < range[0] || level > range[1])
      ? profile.dye_history === NEVER_BLEACHED
        ? `你选了「从未漂过」，但照片看起来有 ${level} 度。天生发色很少超过 ${range[1]} 度，两个对不上，再确认一下？`
        : `你选了「${labelOf(profile, 'dye_history', profile.dye_history)}」，但照片看起来只有 ${level} 度，两个对不上，再确认一下？`
      : '';

  const setColor = (next: HairColor) => {
    setProfile((p) => ({
      ...p,
      current_hair: { ...p.current_hair, region_mode: 'single', color: next },
    }));
    setSheet(null);
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

  return (
    <main className="tony-app relative mx-auto flex min-h-0 flex-col overflow-hidden bg-cream text-ink md:my-5 md:rounded-[34px] md:border-2 md:border-ink">
      <header className="shrink-0 border-b border-ink/15 pt-[max(10px,env(safe-area-inset-top))]">
        <div className="flex items-center px-3">
          <button type="button" onClick={onBack} aria-label="返回"
            className="sketch-icon-button tap grid size-9 place-items-center bg-white">
            <X size={17} weight="bold" />
          </button>
          <p className="flex-1 text-center text-[13px] font-black">先确认一下你的头发</p>
          <span className="w-9" />
        </div>
        <FlowProgress stage="hair" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4">
        {/* 目标色角标：这一屏所有确认动作都是为了回答"能不能染它" */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-ink-3">你想染的</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-2.5 py-1">
            <span className="size-3 rounded-full border border-ink/15"
              style={{ background: target.accent ?? '#888' }} />
            <span className="text-[12px] font-black">{target.color_name}</span>
          </span>
        </div>

        {/* relative 不能省：MediaImage 用的是 next/image 的 fill，
            没有定位父容器它会一路冒泡到最近的定位祖先（整块 .tony-app）铺满全屏 */}
        {currentPhotoUrl ? (
          <div className="relative mt-3 h-[190px] overflow-hidden rounded-[20px] border border-line bg-line">
            <MediaImage src={currentPhotoUrl} alt="你上传的照片" className="object-cover object-top" />
          </div>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-[20px] border border-line bg-white">
          <Row label="发色" value={color.display_name} onClick={colorOptions.length ? () => setSheet('color') : undefined} />
          <Row
            label="度数"
            value={level ? `${level} 度` : '待确认'}
            onClick={() => setSheet('level')}
            hint={
              <button type="button" onClick={() => setGuide(true)}
                aria-label="如何判断我的头发是几度"
                className="tap grid size-[18px] place-items-center rounded-full border border-ink/25 bg-cream">
                <Question size={11} weight="bold" className="text-ink-2" />
              </button>
            }
          />
          <Row label="发长" value={labelOf(profile, 'hair_length', profile.hair_length)} onClick={() => setSheet('hair_length')} />
          <Row label="漂染历史" value={labelOf(profile, 'dye_history', profile.dye_history)} onClick={() => setSheet('dye_history')} last />
        </div>

        {conflict ? (
          <p className="mt-3 rounded-[14px] border border-[#e8c47a] bg-[#fff8e4] px-3 py-2.5 text-[12px] leading-[1.6] text-[#8a6413]">
            {conflict}
          </p>
        ) : (
          <p className="mt-3 text-center text-[11px] text-ink-3">识别受光线影响，点任意一行可以修改</p>
        )}

        {error ? <p className="mt-3 text-center text-[12px] text-[#b4514a]">{error}</p> : null}
      </div>

      <div className="shrink-0 border-t border-ink/12 px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={() => void submit()} disabled={submitting}
          className="tap w-full rounded-full bg-pink py-3.5 text-[15px] font-black text-white disabled:opacity-60">
          {submitting ? '正在分析…' : `确认，看能不能染${target.color_name}`}
        </button>
      </div>

      {/* 色卡：只在点问号后出现。度数是四项里误差最大的，需要它，但不该常驻 */}
      {guide ? (
        <Overlay title="怎么看自己的头发是几度" onClose={() => setGuide(false)}>
          <p className="mb-3 text-[12px] leading-[1.7] text-ink-2">
            在自然光下把这张色卡靠近发根比对——发根是没被染过的原生发色，最能代表你的底色。
            发尾如果染过或漂过，会比发根浅，不要拿发尾比。
          </p>
          <img src="/hair-level-guide.jpg" alt="1-10 度发色对照色卡" className="w-full rounded-[16px] border border-line" />
        </Overlay>
      ) : null}

      {sheet === 'level' ? (
        <Overlay title="选择你的底色度数" onClose={() => setSheet(null)}>
          <div className="grid grid-cols-2 gap-2">
            {LEVELS.map((o) => (
              <button key={o.level} type="button" onClick={() => setColor({ ...color, level: o.level, display_name: o.display_name, tone: o.tone })}
                className={cx('tap rounded-[14px] border px-3 py-2.5 text-left text-[13px] font-bold',
                  o.level === level ? 'border-pink bg-pink/10 text-pink-dark' : 'border-line bg-white')}>
                {o.display_name}
              </button>
            ))}
          </div>
        </Overlay>
      ) : null}

      {sheet === 'color' ? (
        <Overlay title="选择你的当前发色" onClose={() => setSheet(null)}>
          <div className="grid gap-2">
            {colorOptions.map((o, i) => (
              <button key={`${o.display_name}-${i}`} type="button" onClick={() => setColor(o)}
                className={cx('tap rounded-[14px] border px-3 py-2.5 text-left text-[13px] font-bold',
                  o.display_name === color.display_name ? 'border-pink bg-pink/10 text-pink-dark' : 'border-line bg-white')}>
                {o.display_name}
              </button>
            ))}
          </div>
        </Overlay>
      ) : null}

      {sheet === 'hair_length' || sheet === 'dye_history' ? (
        <Overlay title={sheet === 'hair_length' ? '选择你的发长' : '选择你的漂染历史'} onClose={() => setSheet(null)}>
          <div className="grid gap-2">
            {profile.editable_options[sheet].map((o) => (
              <button key={o.value} type="button"
                onClick={() => { setProfile((p) => ({ ...p, [sheet]: o.value })); setSheet(null); }}
                className={cx('tap rounded-[14px] border px-3 py-2.5 text-left text-[13px] font-bold',
                  o.value === profile[sheet] ? 'border-pink bg-pink/10 text-pink-dark' : 'border-line bg-white')}>
                {o.label}
              </button>
            ))}
          </div>
        </Overlay>
      ) : null}
    </main>
  );
}

const LEVELS = [
  { level: 1, tone: 'black', display_name: '1 度 深黑色' },
  { level: 2, tone: 'black', display_name: '2 度 黑色' },
  { level: 3, tone: 'dark_brown', display_name: '3 度 原生黑棕' },
  { level: 4, tone: 'dark_brown', display_name: '4 度 深棕色' },
  { level: 5, tone: 'brown', display_name: '5 度 棕色' },
  { level: 6, tone: 'light_brown', display_name: '6 度 浅棕色' },
  { level: 7, tone: 'gold', display_name: '7 度 金色' },
  { level: 8, tone: 'light_gold', display_name: '8 度 浅金色' },
  { level: 9, tone: 'blonde', display_name: '9 度 白金色' },
  { level: 10, tone: 'pale_blonde', display_name: '10 度 淡白金' },
];

/** hint 是并列的兄弟按钮，不能嵌在主按钮里——button 套 button 是非法 HTML，
 *  React 会直接抛 hydration 错误 */
function Row({
  label, value, onClick, hint, last,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  hint?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={cx('flex items-center gap-2 pr-4', last ? '' : 'border-b border-line')}>
      <button type="button" onClick={onClick} disabled={!onClick}
        className="tap flex flex-1 items-center gap-2 py-3.5 pl-4 text-left">
        <span className="w-[68px] shrink-0 text-[13px] text-ink-3">{label}</span>
        <span className="flex-1 text-[15px] font-black">{value}</span>
      </button>
      {hint}
      {onClick ? <CaretDown size={14} weight="bold" className="shrink-0 text-ink-3" /> : null}
    </div>
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
