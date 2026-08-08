'use client';

import { ArrowLeft, ArrowRight, Check, Info, WarningCircle, X } from '@phosphor-icons/react';
import { FlowProgress } from './flow-progress';
import {
  holdLabel,
  judgeRisks,
  layer1CanDye,
  layer2BiasRisk,
  minDyeableLevel,
  type ColorMatrix,
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

function biasLabel(kb: string, undertone?: string) {
  if (kb.includes('蓝') && /黄|橙|暖/.test(undertone ?? '')) return '偏绿';
  if (kb.includes('紫') && /黄|橙|暖/.test(undertone ?? '')) return '偏红';
  if (kb.includes('粉') && /黄|橙|暖/.test(undertone ?? '')) return '偏橘';
  return '偏色';
}

export function VerdictScreen({
  matrix,
  level,
  video,
  dyeHistory,
  currentTone,
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
  currentPhotoUrl: string;
  targetPhotoUrl: string;
  onBack: () => void;
  onGo: (intent: VerdictIntent) => void;
  onPickColor: (videoId: string) => void | Promise<void>;
}) {
  const kb = video.kb_color ?? '';
  const can = layer1CanDye(matrix, kb, level).can;
  return (
    <Frame onBack={onBack}>
      {can ? (
        <CanDye
          matrix={matrix}
          level={level}
          video={video}
          dyeHistory={dyeHistory}
          currentTone={currentTone}
          currentPhotoUrl={currentPhotoUrl}
          targetPhotoUrl={targetPhotoUrl}
          onGo={onGo}
        />
      ) : (
        <CannotDye
          matrix={matrix}
          level={level}
          video={video}
          currentPhotoUrl={currentPhotoUrl}
          targetPhotoUrl={targetPhotoUrl}
          onGo={onGo}
          onPickColor={onPickColor}
        />
      )}
    </Frame>
  );
}

function CanDye({ matrix, level, video, dyeHistory, currentTone, currentPhotoUrl, targetPhotoUrl, onGo }: {
  matrix: ColorMatrix;
  level: number;
  video: VideoColor;
  dyeHistory?: string;
  currentTone?: string;
  currentPhotoUrl: string;
  targetPhotoUrl: string;
  onGo: (intent: VerdictIntent) => void;
}) {
  const kb = video.kb_color ?? '';
  const min = minDyeableLevel(matrix, kb);
  const layer2 = layer2BiasRisk(matrix, kb, level, currentTone);
  const risks = judgeRisks(matrix, kb, level, dyeHistory, currentTone);
  const bias = biasLabel(kb, layer2.undertoneName);
  const conclusion = layer2.risky
    ? `可以染，但可能会${bias}`
    : `当前可以直接染${video.color_name}`;
  const degreeReason = `你现在是 ${level} 度，${video.color_name}从 ${min ?? level} 度起可以显色。`;
  const neutralReason = layer2.transition?.why
    ?? `${layer2.undertoneName ? `当前底色残留${layer2.undertoneName}` : '当前底色色相'}，会影响染后色的纯净度。`;

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
          <PhotoFact title="你的当前发色" src={currentPhotoUrl} label={`${level} 度`} />
          <ArrowRight size={20} weight="bold" className="text-pink-dark" />
          <PhotoFact title="目标发色" src={targetPhotoUrl || video.cover_url || ''} label={video.color_name} />
        </section>

        <section className="mt-4 rounded-[22px] border border-line bg-white px-4 py-4">
          <h2 className="flex items-center gap-2 text-[15px] font-black">
            <span className="text-pink-dark">☆</span> 判断依据
          </h2>
          <div className="mt-3 grid gap-2.5">
            <Evidence index="1" title="度数满足" body={degreeReason} />
            <Evidence index="2" title="颜色中和" body={neutralReason} />
          </div>
        </section>

        <section className="mt-4 rounded-[22px] border border-[#eccf8c] bg-[#fffaf0] px-4 py-4">
          <h2 className="text-[15px] font-black">直染前需要知道</h2>
          <div className="mt-2 divide-y divide-dashed divide-[#e6d6b3]">
            {(risks.length ? risks : [{ key: 'operation', text: '上色结果会受发质和涂抹均匀度影响', action: '严格按商品说明控制分区和停留时间' }]).slice(0, 3).map((risk, index) => (
              <div key={risk.key} className="grid grid-cols-[28px_1fr] gap-2 py-2.5">
                <span className="grid size-6 place-items-center rounded-full bg-pink-soft text-[11px] font-black text-pink-dark">{index + 1}</span>
                <div>
                  <p className="text-[12px] font-black leading-5">{risk.text}</p>
                  <p className="mt-0.5 text-[10.5px] leading-4 text-ink-2">→ {risk.action}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <Footer>
        <button type="button" onClick={() => onGo('preview')} className="tap flex w-full items-center justify-center gap-2 rounded-full bg-pink py-3.5 text-[15px] font-black text-white">
          查看实拍效果 <ArrowRight size={18} weight="bold" />
        </button>
      </Footer>
    </div>
  );
}

function CannotDye({ matrix, level, video, currentPhotoUrl, targetPhotoUrl, onGo, onPickColor }: {
  matrix: ColorMatrix;
  level: number;
  video: VideoColor;
  currentPhotoUrl: string;
  targetPhotoUrl: string;
  onGo: (intent: VerdictIntent) => void;
  onPickColor: (videoId: string) => void | Promise<void>;
}) {
  const kb = video.kb_color ?? '';
  const min = minDyeableLevel(matrix, kb) ?? Math.min(10, level + 1);
  const gap = Math.max(1, min - level);
  const alternatives = matrix.videos.filter((item) =>
    item.kb_color && item.video_id !== video.video_id && layer1CanDye(matrix, item.kb_color, level).can,
  );
  const chooseAlternative = async () => {
    if (!alternatives[0]) return;
    await onPickColor(alternatives[0].video_id);
    onGo('switch');
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4">
      <section className="rounded-[22px] border border-[#efb7a7] bg-[#fff8f5] px-4 py-4">
        <div className="flex items-start gap-3">
          <X size={30} weight="bold" className="mt-0.5 shrink-0 text-pink-dark" />
          <div>
            <h1 className="text-[21px] font-black leading-tight">当前发色直染不出{video.color_name}，需要先漂</h1>
            <p className="mt-1.5 text-[12px] leading-5 text-ink-2">你现在是 {level} 度，至少要到 {min} 度才能明显显色。</p>
          </div>
        </div>
      </section>

      <section className="mt-3 grid grid-cols-[1fr_26px_1fr] items-center gap-2 rounded-[22px] border border-line bg-white p-3">
        <PhotoFact title="当前发色" src={currentPhotoUrl} label={`${level} 度`} />
        <ArrowRight size={22} weight="bold" className="text-pink-dark" />
        <PhotoFact title="目标发色" src={targetPhotoUrl || video.cover_url || ''} label={video.color_name} />
      </section>

      <section className="mt-3 rounded-[22px] border border-line bg-white px-3 py-3.5">
        <h2 className="text-center text-[14px] font-black">色度差距</h2>
        <div className="mt-3 flex gap-[3px]">
          {LEVEL_SWATCH.map((color, index) => {
            const degree = index + 1;
            return (
              <div key={degree} className="min-w-0 flex-1 text-center">
                <span className={cx('block aspect-square rounded-[6px] border-2', degree === level ? 'border-pink' : degree === min ? 'border-[#e5b94f]' : 'border-transparent')} style={{ background: color }} />
                <span className="mt-1 block text-[8px] font-bold">{degree}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[12px] font-black">当前 {level} 度 <span className="mx-2">→</span> {video.color_name}门槛 {min} 度</p>
        <p className="mt-1 text-center text-[11px] font-bold text-pink-dark">还差 {gap} 度</p>
      </section>

      <section className="mt-3 rounded-[22px] border border-[#edc879] bg-[#fffaf0] px-4 py-3.5">
        <h2 className="flex items-center gap-2 text-[14px] font-black"><WarningCircle size={18} weight="fill" className="text-[#d59b25]" /> 为什么现在不能直接染？</h2>
        <ol className="mt-2 space-y-1.5 text-[11px] leading-[1.55] text-ink-2">
          <li>1. 当前底色太深，目标色素无法明显显现。</li>
          <li>2. 直接覆盖容易接近黑色、显脏或不均匀。</li>
          <li>3. 居家漂发容易断发、斑驳并刺激头皮，建议去理发店。</li>
        </ol>
      </section>

      <h2 className="mb-2 mt-5 text-center text-[14px] font-black">选择一种方案继续</h2>
      <div className="grid gap-2.5">
        <button type="button" disabled={!alternatives.length} onClick={() => void chooseAlternative()} className="tap flex items-center gap-3 rounded-[20px] border border-[#9aca9f] bg-[#f5fbf5] px-3.5 py-3 text-left disabled:opacity-45">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#7dbb87] font-black text-white">A</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-black">试试看现在能染的颜色</span>
            <span className="mt-0.5 block text-[10.5px] text-ink-2">不需要漂，直接进入实拍试色。</span>
            <span className="mt-2 flex gap-1.5">
              {alternatives.slice(0, 5).map((item) => {
                const rgb = matrix.matrix[item.kb_color!]?.[String(level)]?.rgb;
                return <span key={item.video_id} className="size-5 rounded-full border border-ink/10" style={{ background: rgb ? rgbCss(rgb) : item.accent ?? '#777' }} />;
              })}
            </span>
          </span>
          <ArrowRight size={19} weight="bold" />
        </button>
        <button type="button" onClick={() => onGo('bleach')} className="tap flex items-center gap-3 rounded-[20px] border border-[#e8bd62] bg-[#fffaf0] px-3.5 py-3 text-left">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e8ad3f] font-black text-white">B</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-black">还是想染{video.color_name}</span>
            <span className="mt-0.5 block text-[10.5px] leading-4 text-ink-2">跳过实拍，直接查看漂到 {min} 度后的理想方案。</span>
          </span>
          <ArrowRight size={19} weight="bold" />
        </button>
      </div>
    </div>
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

function PhotoFact({ title, src, label }: { title: string; src: string; label: string }) {
  return (
    <div className="text-center">
      <p className="mb-2 text-[11px] font-black">{title}</p>
      <div className="mx-auto aspect-square w-full max-w-[118px] overflow-hidden rounded-[16px] bg-cream">
        {src ? <MediaImage src={src} alt={title} className="object-cover" /> : null}
      </div>
      <p className="mt-1.5 text-[10px] font-bold">{label}</p>
    </div>
  );
}

function Frame({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <main className="tony-app relative mx-auto flex min-h-0 flex-col overflow-hidden bg-cream text-ink md:my-5 md:rounded-[34px] md:border-2 md:border-ink">
      <header className="shrink-0 border-b border-ink/15 pt-[max(10px,env(safe-area-inset-top))]">
        <div className="flex items-center px-3">
          <button type="button" onClick={onBack} aria-label="返回" className="sketch-icon-button tap grid size-9 place-items-center bg-white"><ArrowLeft size={17} weight="bold" /></button>
          <div className="flex-1 text-center"><p className="text-[15px] font-black">能不能染这个颜色？</p><p className="mt-0.5 text-[9.5px] text-ink-3">根据你的发色和目标色进行判断</p></div>
          <span className="w-9" />
        </div>
        <FlowProgress stage="verdict" />
      </header>
      {children}
    </main>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="shrink-0 border-t border-ink/12 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">{children}</div>;
}

export function VerdictDetail({ matrix, level, video, dyeHistory, currentTone, onClose }: {
  matrix: ColorMatrix; level: number; video: VideoColor; dyeHistory?: string; currentTone?: string; onClose: () => void;
}) {
  const kb = video.kb_color ?? '';
  const risks = judgeRisks(matrix, kb, level, dyeHistory, currentTone);
  const can = layer1CanDye(matrix, kb, level).can;
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/35" onClick={onClose}>
      <div className="max-h-[72%] overflow-y-auto rounded-t-[24px] bg-cream px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-4 text-ink" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2"><Info size={18} weight="bold" className="text-pink-dark" /><p className="flex-1 text-[15px] font-black">{video.color_name} · {can ? '当前可直接染' : '需要先漂浅'}</p><button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full border border-line"><X size={15} /></button></div>
        <p className="mt-3 text-[12px] leading-5 text-ink-2">你当前确认的底色为 {level} 度。保色期参考：{holdLabel(matrix, kb)}。</p>
        <div className="mt-3 space-y-2">{risks.map((risk) => <div key={risk.key} className="rounded-[14px] border border-[#e8c47a] bg-[#fff8e4] px-3 py-2.5"><p className="text-[12px] font-bold">{risk.text}</p><p className="mt-1 text-[11px] text-ink-2">→ {risk.action}</p></div>)}</div>
      </div>
    </div>
  );
}
