'use client';

import { ArrowLeft, ArrowRight, Check, Info, ShareFat, WarningCircle } from '@phosphor-icons/react';
import type { PlanVerdict } from './decision-screens';
import { fadeStages, holdLabel, minDyeableLevel, type ColorMatrix } from './hair-mirror-core';
import type { MockVideo, PlanResultData, RouteType } from './types';
import { MediaImage, cx } from './ui';

export function PlanResultScreen({
  plan,
  target,
  matrix,
  currentPhotoUrl,
  currentLevel,
  selectedRoute,
  selectedIntensity,
  previewProgress,
  previewNotice,
  verdict,
  onRouteChange,
  onIntensityChange,
  onBack,
  onProducts,
  onChangeColor,
}: {
  plan: PlanResultData;
  target: MockVideo;
  matrix: ColorMatrix | null;
  currentPhotoUrl: string;
  currentLevel: number;
  selectedRoute: RouteType;
  selectedIntensity: number;
  previewProgress: number;
  previewNotice: string;
  verdict?: PlanVerdict;
  onRouteChange: (route: RouteType) => void;
  onIntensityChange: (level: number) => void;
  onBack: () => void;
  onProducts: () => void;
  onChangeColor: () => void;
}) {
  const bleach = plan.generation_mode === 'post_bleach_ideal';
  const entry = matrix?.videos.find((item) => item.video_id === target.video_id);
  const kb = entry?.kb_color ?? '';
  // minDyeableLevel 是【门槛下限】，不是漂发目标。用户已经比门槛还浅时，
  // 写"漂到约 6 度"方向就是反的（8 度比 6 度浅，那是往回染黑）。
  // 底色只可能越漂越浅，所以漂后目标至少不低于当前度数。
  const minLevel = matrix && kb ? minDyeableLevel(matrix, kb) : null;
  const requiredLevel = Math.max(
    minLevel ?? target.target_color?.level ?? 8,
    currentLevel,
  );
  const stages = matrix && kb ? fadeStages(matrix, kb, bleach ? requiredLevel : currentLevel) : [];
  const hold = matrix && kb ? holdLabel(matrix, kb) : '';
  const texture = matrix && kb
    ? matrix.matrix[kb]?.[String(bleach ? requiredLevel : currentLevel)]?.swatch
      ?? matrix.variants?.[kb]?.find((item) => item.swatch)?.swatch
    : undefined;
  const expectedCount = bleach ? 3 : 4;
  const previews = plan.preview_images.slice(0, expectedCount);
  const summary = bleach
    ? requiredLevel > currentLevel
      ? `从 ${currentLevel} 度漂到约 ${requiredLevel} 度后，可以按理想底色模拟${target.color_name}。`
      : `按理想底色模拟${target.color_name}的效果，你当前 ${currentLevel} 度的底色不需要再漂浅。`
    : verdict?.biasRisky
      ? `可以染，但实际效果可能偏色。`
      : `可以染，效果会基于你的 ${currentLevel} 度真实底色。`;

  return (
    <main className="tony-app relative mx-auto flex min-h-0 flex-col overflow-hidden bg-cream text-ink md:my-5 md:rounded-[34px] md:border-2 md:border-ink">
      <header className="shrink-0 border-b border-ink/12 bg-cream px-3 pb-3 pt-[max(10px,env(safe-area-inset-top))]">
        <div className="flex items-center">
          <button type="button" onClick={onBack} aria-label="返回" className="sketch-icon-button tap grid size-9 place-items-center bg-white"><ArrowLeft size={17} weight="bold" /></button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[15px] font-black">{bleach ? `${target.color_name}漂后方案` : `${target.color_name}染发方案`}</p>
            <p className="mt-0.5 text-[9.5px] text-ink-3">{bleach ? '基于理想漂后底色生成' : '基于你的真实底色生成'}</p>
          </div>
          <button type="button" aria-label="分享" className="grid size-9 place-items-center"><ShareFat size={19} /></button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
        <section className="grid grid-cols-[1fr_28px_1fr] items-center gap-2 rounded-[22px] border border-line bg-white p-3">
          <HairPhoto title="当前发色" src={currentPhotoUrl} caption={`${currentLevel} 度`} />
          <ArrowRight size={21} weight="bold" className="text-pink-dark" />
          <HairPhoto title={bleach ? '漂后目标发色' : '目标发色'} src={target.target_frame_url || target.cover_url} caption={`${target.color_name}${bleach ? ` · 约 ${requiredLevel} 度底色` : ''}`} />
        </section>

        <section className={cx('mt-3 rounded-[22px] border px-4 py-3.5', bleach ? 'border-[#ebc164] bg-[#fffaf0]' : 'border-[#9bc9a7] bg-[#f4fbf5]')}>
          <div className="flex items-start gap-2.5">
            {bleach ? <WarningCircle size={25} weight="fill" className="shrink-0 text-[#d69c24]" /> : <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#87c392] text-white"><Check size={17} weight="bold" /></span>}
            <div>
              <h1 className="text-[18px] font-black leading-tight">{summary}</h1>
              <p className="mt-1 text-[10.5px] leading-4 text-ink-2">{plan.summary}</p>
            </div>
          </div>
        </section>

        {/* 只有确实要再漂浅时才警告。底色已经够浅还挂"不建议居家漂发"，
            用户会以为自己必须多做一步不该做的操作。 */}
        {bleach && requiredLevel > currentLevel ? (
          <section className="mt-3 rounded-[22px] border border-[#efb7a7] bg-[#fff8f5] px-4 py-3.5">
            <h2 className="text-[13px] font-black text-[#c95750]">强烈不建议居家漂发</h2>
            <p className="mt-1.5 text-[10.5px] leading-[1.6] text-ink-2">建议由专业理发师把底色安全漂到 {requiredLevel} 度左右。居家操作容易导致断发、斑驳、局部过度损伤或刺激头皮。</p>
          </section>
        ) : null}

        <section className="mt-3 rounded-[22px] border border-line bg-white px-3 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[14px] font-black">预期最终效果</h2>
            <span className="text-[9.5px] text-ink-3">{bleach ? '理想漂后模拟' : `按真实 ${currentLevel} 度底色`}</span>
          </div>
          {previews.length ? (
            <div className={cx('mt-3 grid gap-2', bleach ? 'grid-cols-3' : 'grid-cols-4')}>
              {previews.map((item) => (
                <button key={item.preview_level} type="button" onClick={() => onIntensityChange(item.preview_level)} className={cx('tap overflow-hidden rounded-[15px] border-2 bg-cream text-left', selectedIntensity === item.preview_level ? 'border-pink' : 'border-transparent')}>
                  {/* relative 不能省：MediaImage 是 next/image 的 fill */}
                  <div className="relative aspect-[3/4] overflow-hidden"><MediaImage src={item.url} alt={item.label} className="object-cover" /></div>
                  <p className="py-1.5 text-center text-[10px] font-black">{item.label}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-[18px] bg-cream px-4 py-5 text-center">
              <p className="text-[12px] font-black">正在生成{expectedCount}张真实效果图…</p>
              <div className="mx-auto mt-3 h-1.5 w-3/4 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-pink transition-all" style={{ width: `${Math.max(8, previewProgress)}%` }} /></div>
              <p className="mt-2 text-[10px] leading-4 text-ink-3">生成从照片上传时已经开始；这里不会用演示图替代。</p>
            </div>
          )}
          {previewNotice ? <p className="mt-2 text-[10px] leading-4 text-ink-3">{previewNotice}</p> : null}
        </section>

        <section className="mt-3 rounded-[22px] border border-line bg-white px-3 py-3.5">
          <div className="flex items-center justify-between gap-2"><h2 className="text-[14px] font-black">掉色概览</h2>{hold ? <span className="rounded-full bg-pink-soft px-2.5 py-1 text-[9.5px] font-bold text-pink-dark">预计维持 {hold}</span> : null}</div>
          {stages.length ? (
            <div className="mt-3 flex items-start gap-1.5">
              {stages.slice(0, 5).map((stage, index) => (
                <div key={`${stage.week}-${stage.name}`} className="min-w-0 flex-1 text-center">
                  <div className="relative mx-auto aspect-square w-full max-w-12 overflow-hidden rounded-full border border-ink/10" style={{ background: `rgb(${stage.rgb.join(',')})` }}>
                    {texture ? <MediaImage src={texture} alt="知识库发丝纹理" className="object-cover opacity-55 mix-blend-multiply" /> : null}
                  </div>
                  <p className="mt-1 text-[8.5px] font-black">{index === 0 ? '刚染完' : `第${stage.week}周`}</p>
                  <p className="truncate text-[8px] text-ink-3">{stage.name}</p>
                </div>
              ))}
            </div>
          ) : <p className="mt-2 text-[10px] text-ink-3">知识库暂未返回该颜色的掉色阶段。</p>}
          <p className="mt-2 flex items-start gap-1 text-[9px] leading-4 text-ink-3"><Info size={12} className="mt-0.5 shrink-0" />实际时间受洗发频率、水温和发质影响。</p>
        </section>

        <section className="mt-3 rounded-[20px] border border-line bg-white p-3">
          <p className="text-[11px] font-black">商品会按哪种前提推荐？</p>
          <p className="mt-1 text-[10px] leading-4 text-ink-2">{bleach ? `按“已经由理发师漂到约 ${requiredLevel} 度”的条件推荐目标色商品。` : `按你当前 ${currentLevel} 度真实底色与已确认颜色推荐。`}</p>
          <div className="mt-2 flex gap-2">
            {plan.route_cards.map((card) => <button key={card.route} type="button" onClick={() => onRouteChange(card.route)} className={cx('flex-1 rounded-[12px] border px-2 py-2 text-[10.5px] font-bold', selectedRoute === card.route ? 'border-pink bg-pink-soft text-pink-dark' : 'border-line')}>{card.title}</button>)}
          </div>
        </section>

        <button type="button" onClick={onProducts} className="tap mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-pink py-3.5 text-[15px] font-black text-white">保存方案并查看商品 <ArrowRight size={18} weight="bold" /></button>
        <button type="button" onClick={onChangeColor} className="tap mt-2 w-full rounded-full border border-pink py-3 text-[13px] font-black text-pink-dark">换一个颜色看看</button>
      </div>
    </main>
  );
}

function HairPhoto({ title, src, caption }: { title: string; src: string; caption: string }) {
  return <div className="text-center"><p className="mb-2 text-[11px] font-black">{title}</p><div className="relative aspect-[4/5] overflow-hidden rounded-[16px] bg-cream">{src ? <MediaImage src={src} alt={title} className="object-cover" /> : null}</div><p className="mt-1.5 truncate text-[9.5px] font-bold">{caption}</p></div>;
}
