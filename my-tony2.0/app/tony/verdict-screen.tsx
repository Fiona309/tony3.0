'use client';

/**
 * 屏2 · 判断屏。能染走 A 版，不能染走 B 版，是同一个组件的两个分支。
 *
 * 这一屏只讲【数】——度数、门槛、差距、风险、保色期。效果图一概不放：
 * 屏2 放了效果图，屏3「看看染在我头上」这个 CTA 就没有动机了，而且静态图
 * 和实时渲染必然对不上，用户会问哪个是真的。屏2 讲道理，屏3 看效果。
 *
 * A 版刻意不放色度尺：尺子回答的是"差多少"，那是 B 版用户的障碍；
 * 对能染的用户，"你富余 2 度"没有任何行动意义，为了和 B 版对称而加是错的
 * ——对称本身不是价值。踩线过门槛的风险由风险清单用一句话表达就够了。
 */

import { ArrowRight, Check, Info, X } from '@phosphor-icons/react';

import { FlowProgress } from './flow-progress';
import {
  fadeStages,
  holdLabel,
  judgeRisks,
  layer1CanDye,
  minDyeableLevel,
  type ColorMatrix,
  type VideoColor,
} from './hair-mirror-core';
import { cx } from './ui';

export type VerdictIntent = 'preview' | 'switch' | 'bleach';

const rgbCss = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

export function VerdictScreen({
  matrix,
  level,
  video,
  dyeHistory,
  currentTone,
  onBack,
  onGo,
  onPickColor,
}: {
  matrix: ColorMatrix;
  level: number;
  video: VideoColor;
  dyeHistory?: string;
  currentTone?: string;
  onBack: () => void;
  onGo: (intent: VerdictIntent) => void;
  /** B 版里点一个能染的替代色 —— 换色是横向重新判断，不是前进 */
  onPickColor: (videoId: string) => void;
}) {
  const kb = video.kb_color ?? '';
  const can = layer1CanDye(matrix, kb, level).can;

  return can ? (
    <CanDye
      matrix={matrix} level={level} video={video}
      dyeHistory={dyeHistory} currentTone={currentTone}
      onBack={onBack} onGo={onGo}
    />
  ) : (
    <CannotDye
      matrix={matrix} level={level} video={video}
      onBack={onBack} onGo={onGo} onPickColor={onPickColor}
    />
  );
}

/* ============================ A 版 · 能染 ============================ */

function CanDye({
  matrix, level, video, dyeHistory, currentTone, onBack, onGo,
}: {
  matrix: ColorMatrix; level: number; video: VideoColor;
  dyeHistory?: string; currentTone?: string;
  onBack: () => void; onGo: (i: VerdictIntent) => void;
}) {
  const kb = video.kb_color ?? '';
  const risks = judgeRisks(matrix, kb, level, dyeHistory, currentTone);
  const stages = fadeStages(matrix, kb, level);
  const hold = holdLabel(matrix, kb);

  return (
    <Frame stage="verdict" onBack={onBack} title="你的染发方案">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4">
        <div className="flex items-center gap-1.5">
          <Check size={20} weight="bold" className="text-[#3f8a56]" />
          <h1 className="text-[22px] font-black leading-tight">你可以染{video.color_name}</h1>
        </div>
        <p className="mt-1.5 text-[12px] leading-[1.7] text-ink-2">
          你的 <span className="numerals font-black">{level}</span> 度底色可以直接上色，不用先漂。
        </p>

        {risks.length > 0 ? (
          <section className="mt-5">
            <h2 className="text-[13px] font-black">你要注意的</h2>
            <div className="mt-2 space-y-2">
              {risks.map((r) => (
                <div key={r.key} className="rounded-[16px] border border-[#e8c47a] bg-[#fff8e4] px-3.5 py-3">
                  <p className="text-[12.5px] font-bold leading-[1.6] text-[#7a5a12]">{r.text}</p>
                  <p className="mt-1.5 text-[11.5px] leading-[1.6] text-[#8a6b28]">→ {r.action}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {stages.length > 0 ? (
          <section className="mt-5">
            <h2 className="text-[13px] font-black">掉色过程概览</h2>
            {/* 保色期在色带上方：先回答"能撑多久"，再看"掉成什么样" */}
            <p className="mt-1 text-[12px] text-ink-2">
              {video.color_name}大概能保持 <span className="font-black">{hold}</span>
              <span className="ml-1 text-[10.5px] text-ink-3">（行业参考值）</span>
            </p>
            <div className="mt-2.5 flex gap-1.5">
              {stages.map((s) => (
                <div key={s.week} className="flex-1">
                  <div className={cx('h-11 rounded-[10px] border', s.within ? 'border-ink/20' : 'border-ink/10')}
                    style={{ background: rgbCss(s.rgb) }} />
                  <p className="mt-1.5 text-center text-[10px] text-ink-3">第 {s.week} 周</p>
                  <p className="text-center text-[10.5px] font-bold leading-tight">{s.name}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <Footer>
        <button type="button" onClick={() => onGo('preview')}
          className="tap flex w-full items-center justify-center gap-1.5 rounded-full bg-pink py-3.5 text-[15px] font-black text-white">
          看看染在我头上 <ArrowRight size={16} weight="bold" />
        </button>
      </Footer>
    </Frame>
  );
}

/* ============================ B 版 · 不能染 ============================ */

function CannotDye({
  matrix, level, video, onBack, onGo, onPickColor,
}: {
  matrix: ColorMatrix; level: number; video: VideoColor;
  onBack: () => void; onGo: (i: VerdictIntent) => void; onPickColor: (id: string) => void;
}) {
  const kb = video.kb_color ?? '';
  const min = minDyeableLevel(matrix, kb);
  const gap = min !== null ? min - level : null;

  // 替代色一律用【真实呈色】而不是色卡色：色卡是印刷/渲染的理想效果，
  // 鲜艳色系饱和度普遍是真实染后色的两倍，拿它当色球会骗到用户。
  const alts = matrix.videos.filter(
    (v) => v.kb_color && v.video_id !== video.video_id && layer1CanDye(matrix, v.kb_color, level).can,
  );

  return (
    <Frame stage="verdict" onBack={onBack} title="你的染发方案">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4">
        <div className="flex items-center gap-1.5">
          <X size={20} weight="bold" className="text-[#b4514a]" />
          <h1 className="text-[22px] font-black leading-tight">现在还不适合染{video.color_name}</h1>
        </div>
        <p className="mt-1.5 text-[12px] leading-[1.7] text-ink-2">
          不是永远不能染，是当前底色还不够浅。
        </p>

        {/* 色度尺：B 版的核心。"还差 3 度"是一个距离概念，必须可视化 */}
        <section className="mt-4 rounded-[18px] border border-line bg-white p-3.5">
          <div className="flex gap-[3px]">
            {LEVEL_SWATCH.map((c, i) => {
              const lv = i + 1;
              return (
                <div key={lv} className="flex-1">
                  <div className={cx('h-9 rounded-[6px] border-2',
                    lv === level ? 'border-ink' : lv === min ? 'border-pink' : 'border-transparent')}
                    style={{ background: c }} />
                  <p className={cx('mt-1 text-center text-[9.5px]',
                    lv === level || lv === min ? 'font-black' : 'text-ink-3')}>{lv}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="font-bold">你现在 <span className="numerals">{level}</span> 度</span>
            {min !== null ? (
              <span className="font-bold text-pink-dark">
                {video.color_name}要 <span className="numerals">{min}</span> 度
              </span>
            ) : null}
          </div>
          {gap !== null && gap > 0 ? (
            <p className="mt-2 rounded-[10px] bg-cream py-1.5 text-center text-[13px] font-black">
              还差 <span className="numerals text-pink-dark">{gap}</span> 度
            </p>
          ) : null}
        </section>

        <section className="mt-4">
          <h2 className="text-[13px] font-black">为什么现在不建议直接染</h2>
          <ul className="mt-2 space-y-1.5 text-[12px] leading-[1.7] text-ink-2">
            <li>· 底色太深，{video.color_name}盖不上去，容易发黑发脏</li>
            <li>· 居家漂发有断发和刺激头皮的风险，漂到位不容易</li>
          </ul>
        </section>

        {/* 换色是【横向重新判断】，所以留在这个区块里，不做成底部的前进按钮 */}
        {alts.length > 0 ? (
          <section className="mt-5 rounded-[18px] border border-line bg-white p-3.5">
            <h2 className="text-[13px] font-black">现在就能直接染的</h2>
            <div className="mt-3 flex gap-3">
              {alts.map((v) => {
                const rgb = matrix.matrix[v.kb_color!]?.[String(level)]?.rgb;
                return (
                  <button key={v.video_id} type="button" onClick={() => onPickColor(v.video_id)}
                    className="tap flex-1 text-center">
                    <span className="mx-auto block size-14 rounded-full border border-ink/15"
                      style={{ background: rgb ? rgbCss(rgb) : v.accent ?? '#888' }} />
                    <span className="mt-1.5 block truncate text-[11.5px] font-bold">{v.color_name}</span>
                    <span className="block text-[10px] text-ink-3">保色 {holdLabel(matrix, v.kb_color!)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      <Footer>
        <button type="button" onClick={() => onGo('bleach')}
          className="tap flex w-full items-center justify-center gap-1.5 rounded-full bg-pink py-3.5 text-[15px] font-black text-white">
          仍想要{video.color_name}，看漂浅效果 <ArrowRight size={16} weight="bold" />
        </button>
      </Footer>
    </Frame>
  );
}

/* 1~9 度的发色示意。仅用于色度尺的位置感，不参与任何判断计算 */
const LEVEL_SWATCH = [
  '#1c1613', '#2b211b', '#3f2e23', '#573c29', '#7a5334',
  '#a3763f', '#c39a55', '#dcbb7d', '#ecd9ae',
];

function Frame({ stage, title, onBack, children }: {
  stage: 'verdict'; title: string; onBack: () => void; children: React.ReactNode;
}) {
  return (
    <main className="tony-app relative mx-auto flex min-h-0 flex-col overflow-hidden bg-cream text-ink md:my-5 md:rounded-[34px] md:border-2 md:border-ink">
      <header className="shrink-0 border-b border-ink/15 pt-[max(10px,env(safe-area-inset-top))]">
        <div className="flex items-center px-3">
          <button type="button" onClick={onBack} aria-label="返回"
            className="sketch-icon-button tap grid size-9 place-items-center bg-white">
            <ArrowRight size={17} weight="bold" className="rotate-180" />
          </button>
          <p className="flex-1 text-center text-[13px] font-black">{title}</p>
          <span className="w-9" />
        </div>
        <FlowProgress stage={stage} />
      </header>
      {children}
    </main>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 border-t border-ink/12 px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
      {children}
    </div>
  );
}

/** 试色屏顶部 ⓘ 展开的完整判断，内容与屏2A 一致，避免两处各说各话 */
export function VerdictDetail({
  matrix, level, video, dyeHistory, currentTone, onClose,
}: {
  matrix: ColorMatrix; level: number; video: VideoColor;
  dyeHistory?: string; currentTone?: string; onClose: () => void;
}) {
  const kb = video.kb_color ?? '';
  const risks = judgeRisks(matrix, kb, level, dyeHistory, currentTone);
  const stages = fadeStages(matrix, kb, level);
  const can = layer1CanDye(matrix, kb, level).can;

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/45" onClick={onClose}>
      <div className="max-h-[80%] overflow-y-auto rounded-t-[24px] bg-cream px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-4 text-ink"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-1.5">
          {can ? <Check size={17} weight="bold" className="text-[#3f8a56]" />
            : <Info size={17} weight="bold" className="text-[#b4801f]" />}
          <p className="flex-1 text-[15px] font-black">
            {video.color_name} · {can ? '能直接染' : '需要先漂浅'}
          </p>
          <button type="button" onClick={onClose} aria-label="关闭"
            className="tap grid size-8 place-items-center rounded-full border border-ink/20 bg-white">
            <X size={14} weight="bold" />
          </button>
        </div>

        {risks.map((r) => (
          <div key={r.key} className="mb-2 rounded-[14px] border border-[#e8c47a] bg-[#fff8e4] px-3 py-2.5">
            <p className="text-[12px] font-bold leading-[1.6] text-[#7a5a12]">{r.text}</p>
            <p className="mt-1 text-[11px] leading-[1.6] text-[#8a6b28]">→ {r.action}</p>
          </div>
        ))}

        {stages.length > 0 ? (
          <>
            <p className="mt-3 text-[12px] font-bold">
              大概能保持 {holdLabel(matrix, kb)}
              <span className="ml-1 text-[10px] font-normal text-ink-3">（行业参考值）</span>
            </p>
            <div className="mt-2 flex gap-1.5">
              {stages.map((s) => (
                <div key={s.week} className="flex-1">
                  <div className="h-9 rounded-[8px] border border-ink/15" style={{ background: rgbCss(s.rgb) }} />
                  <p className="mt-1 text-center text-[9.5px] text-ink-3">第 {s.week} 周</p>
                  <p className="text-center text-[10px] font-bold leading-tight">{s.name}</p>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
