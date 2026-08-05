'use client';

/**
 * 屏1 · 结论屏 —— 先给答案，再给证据。
 *
 * 用户上传照片就是在提问「我能染吗」，所以这一屏只回答这个问题，
 * 并给出明确的下一步。此前把结论做成试色画面上的一行小字，等于
 * 让用户先看证据、自己找答案，顺序是反的。
 */

import { ArrowRight, Check, PencilSimple, WarningCircle, X } from '@phosphor-icons/react';

import {
  decide,
  groupVideos,
  type ColorMatrix,
  type VideoColor,
} from './hair-mirror-core';
import { cx } from './ui';

export type VerdictIntent = 'preview' | 'switch' | 'bleach';

export function VerdictScreen({
  matrix,
  level,
  video,
  photoUrl,
  onLevelChange,
  onBack,
  onGo,
}: {
  matrix: ColorMatrix;
  level: number;
  /** 用户种草进来的那个视频色 */
  video: VideoColor;
  photoUrl?: string;
  onLevelChange: (level: number) => void;
  onBack: () => void;
  /** 带着明确意图进试色屏：看效果 / 换个能染的 / 看漂完的效果 */
  onGo: (intent: VerdictIntent) => void;
}) {
  const kb = video.kb_color ?? '';
  const d = decide(matrix, kb, level);
  const groups = groupVideos(matrix, level);
  const others = groups.ok.filter((v) => v.video_id !== video.video_id);

  const tone = !d.can ? 'bad' : d.q === 'biased' ? 'warn' : 'ok';
  const title = !d.can
    ? `你现在染不了${video.color_name}`
    : d.q === 'biased'
      ? `能染，但这个底色容易偏色`
      : `你可以染${video.color_name}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-cream text-ink">
      <header className="flex shrink-0 items-center gap-2 px-3 pb-2.5 pt-[max(12px,env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} aria-label="返回"
          className="sketch-icon-button tap grid size-9 place-items-center bg-white">
          <ArrowRight size={18} weight="bold" className="rotate-180" />
        </button>
        <p className="flex-1 truncate text-center text-sm font-black">分析结果</p>
        <span className="w-9" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        {/* 你的情况 */}
        <div className="flex items-center gap-3 rounded-[18px] border border-line bg-white p-3">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="size-14 shrink-0 rounded-[12px] object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-3">你的底色</p>
            <p className="text-[15px] font-black">
              <span className="numerals">{level}</span> 度
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-ink-3">你想染</p>
            <p className="text-[15px] font-black">{video.color_name}</p>
          </div>
        </div>

        {/* 底色是判断的地基，光线会让识别偏 2~3 度，所以必须让用户能随时改 */}
        <div className="mt-2 flex items-center gap-2">
          <PencilSimple size={13} weight="bold" className="text-ink-3" />
          <p className="text-[11px] text-ink-3">底色识别受光线影响，可能偏 2~3 度，点下方数字修正</p>
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {[3, 4, 5, 6, 7, 8, 9].map((lv) => (
            <button key={lv} type="button" onClick={() => onLevelChange(lv)} aria-pressed={lv === level}
              className={cx('flex-1 rounded-[10px] border py-1.5 text-[13px] font-bold',
                lv === level ? 'border-pink bg-pink text-white' : 'border-line bg-white text-ink-2')}>
              {lv}
            </button>
          ))}
        </div>

        {/* 结论 */}
        <div className={cx('mt-4 rounded-[20px] border-2 p-4',
          tone === 'ok' ? 'border-[#8bc79c] bg-[#eef7f0]'
          : tone === 'bad' ? 'border-[#e0a9a3] bg-[#fbeeed]'
          : 'border-[#e8c47a] bg-[#fff8e4]')}>
          <div className="flex items-center gap-1.5">
            {tone === 'ok' ? <Check size={18} weight="bold" className="text-[#3f8a56]" />
              : tone === 'bad' ? <X size={18} weight="bold" className="text-[#b4514a]" />
              : <WarningCircle size={18} weight="bold" className="text-[#b4801f]" />}
            <h2 className="text-[18px] font-black leading-tight">{title}</h2>
          </div>
          <p className="mt-2 text-[12px] leading-[1.7] text-ink-2">{d.why}</p>
          {d.entry?.smoothed ? (
            <p className="mt-1.5 text-[11px] leading-[1.6] text-ink-3">
              该结论由相邻度数推断得出，非官方效果图原始标注。
            </p>
          ) : null}
        </div>

        {/* 下一步：能染就一个主动作；不能染就给两条明确的出口 */}
        <p className="mb-2 mt-5 text-[12px] font-bold text-ink-3">接下来你可以</p>

        {d.can ? (
          <ActionCard
            title="看看染在我头上什么样"
            desc={d.q === 'biased' ? '包含偏色效果，先看清楚再决定' : '实时预览，可以随时换颜色'}
            onClick={() => onGo('preview')}
          />
        ) : (
          <div className="space-y-2.5">
            {others.length > 0 ? (
              <ActionCard
                title="换一个现在就能染的"
                desc={`有 ${others.length} 个颜色适合你的底色 · ${others.map((v) => v.color_name).join('、')}`}
                onClick={() => onGo('switch')}
              />
            ) : null}
            <ActionCard
              title={`就想染${video.color_name}？那要先漂浅底色`}
              desc="看看漂 1 次、漂 2 次分别是什么效果"
              onClick={() => onGo('bleach')}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ActionCard({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="tap flex w-full items-center gap-3 rounded-[18px] border-2 border-ink/15 bg-white p-4 text-left">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-black leading-tight">{title}</p>
        <p className="mt-1 text-[11px] leading-[1.6] text-ink-3">{desc}</p>
      </div>
      <ArrowRight size={18} weight="bold" className="shrink-0 text-ink-3" />
    </button>
  );
}
