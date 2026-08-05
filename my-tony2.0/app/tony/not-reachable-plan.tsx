'use client';

import { ArrowRight, Heart, Lightbulb, Warning } from '@phosphor-icons/react';
import type { PlanResultData } from './types';
import {
  AppFrame,
  BottomBar,
  DoodleIcon,
  MediaImage,
  NotebookCard,
  PrimaryButton,
  ScribbleUnderline,
  SecondaryButton,
} from './ui';

export function NotReachablePlan({
  plan,
  verdict,
  onBack,
  onDemoPreview,
  demoLoading = false,
  demoError = '',
  allowDemoPreview = true,
}: {
  plan: PlanResultData;
  /** 结论屏算好的三层结果。有它就以它为准，不再自行估算 */
  verdict?: { level: number; minLevel: number | null; colorName: string };
  onBack: () => void;
  onDemoPreview?: () => void;
  demoLoading?: boolean;
  demoError?: string;
  allowDemoPreview?: boolean;
}) {
  const currentLevel = verdict?.level ?? plan.color_rule?.current_level ?? 3;
  /* 要漂到几度，直接取知识库里该色系的最低可染度数。
     此前写死 max(8, 当前度数+4)，与知识库无关——蓝色其实 6 度起就能染，
     却会告诉 6 度用户"要漂到 10 度"。 */
  const requiredLevel = verdict?.minLevel ?? Math.max(8, currentLevel + 4);
  const colorName = verdict?.colorName ?? '目标色';
  return (
    <AppFrame title="你的染发方案" eyebrow="分析完成" onBack={onBack} progress={{ current: 4, total: 4, label: '查看结果' }}>
      <div className="px-4 pb-5 pt-5">
        <div className="relative pr-24">
          <p className="text-xs font-black tracking-[.15em] text-pink-dark">先回答最重要的问题</p>
          <h1 className="mt-3 text-[31px] font-black leading-none tracking-[-.045em]">
            <ScribbleUnderline>现在还不能直接染</ScribbleUnderline>
          </h1>
          <p className="mt-3 text-sm text-ink-2">不是永远不能染。{colorName}最低需要 {requiredLevel} 度底色，你现在是 {currentLevel} 度。</p>
          <div className="absolute right-1 top-0 grid size-20 rotate-3 place-items-center rounded-[28%_46%_35%_42%] border-2 border-ink bg-[#ffc7b3] text-[42px] font-black shadow-[3px_4px_0_#f1a4b8]">!</div>
          <DoodleIcon className="absolute -right-1 -top-3" tone="mint" size={26} />
        </div>

        <NotebookCard tone="lavender" className="mt-5">
          <div className="grid grid-cols-[1fr_30px_1fr_1.05fr] items-center gap-2 text-center">
            <div>
              <p className="text-[10px] font-bold">当前底色</p>
              <p className="text-base font-black text-pink-dark">{currentLevel}度深棕</p>
              <div className="mx-auto mt-2 size-[72px] rounded-[17px] border-2 border-white bg-[linear-gradient(145deg,#664536,#241d1a)] shadow-[0_0_0_1px_#8f7bd1]" />
              <p className="mt-1 text-[9px]">较深，色素多</p>
            </div>
            <ArrowRight size={27} weight="bold" className="text-[#8f7bd1]" />
            <div>
              <p className="text-[10px] font-bold">需要漂至</p>
              <p className="text-base font-black text-pink-dark">{requiredLevel} 度</p>
              <div className="mx-auto mt-2 size-[72px] rounded-[17px] border-2 border-white bg-[linear-gradient(145deg,#dbaa59,#f9dfa6)] shadow-[0_0_0_1px_#8f7bd1]" />
              <p className="mt-1 text-[9px]">更浅，色素少</p>
            </div>
            <div>
              <div className="sketch-photo relative mx-auto aspect-[3/4] w-[76px] overflow-hidden bg-[#765064]">
                {plan.preview_images[0]?.url ? <MediaImage src={plan.preview_images[0].url} alt="目标发色" className="object-cover" /> : null}
                <Heart className="absolute -bottom-1 -right-1 text-pink-dark" size={22} weight="fill" />
              </div>
              <p className="mt-1 text-[10px] font-black">再染目标色</p>
            </div>
          </div>
        </NotebookCard>

        <NotebookCard tone="yellow" className="mt-3">
          <h2 className="flex items-center gap-2 text-base font-black text-[#c78300]">为什么现在不能染？ <Lightbulb size={20} weight="fill" /></h2>
          <div className="mt-2 divide-y divide-dashed divide-[#d8c7a8]">
            {['深色底直接染，目标色不显色，容易发黑发脏', '居家漂发容易漂花、断发或刺激头皮', '发根与发尾底色不同，自己很难控制均匀度'].map((reason) => (
              <div key={reason} className="flex gap-2 py-2 text-[10px] font-bold leading-4">
                <Warning size={19} weight="fill" className="shrink-0 text-[#d39a14]" />
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </NotebookCard>

        <NotebookCard tone="mint" className="mt-3">
          <div className="flex items-start gap-3">
            <div className="grid size-14 shrink-0 place-items-center rounded-[18px] border border-ink bg-sage/60 text-2xl">✂</div>
            <div>
              <h2 className="text-base font-black">建议先去理发店</h2>
              <p className="mt-1 text-xs leading-5">请专业理发师将底色安全漂至 {requiredLevel} 度以上，再回来重新拍照分析。</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {['保存目标色', `理发店漂至 ${requiredLevel} 度以上`, '回来重新分析'].map((item, index) => (
              <div key={item} className="rounded-[12px] border border-[#8f7bd1]/45 bg-white p-2 text-center">
                <span className="mx-auto grid size-5 place-items-center rounded-full bg-[#8f7bd1] text-[9px] font-black text-white">{index + 1}</span>
                <p className="mt-1 text-[9px] font-black leading-4">{item}</p>
              </div>
            ))}
          </div>
        </NotebookCard>

        {allowDemoPreview && onDemoPreview ? (
          <NotebookCard tone="pink" className="mt-3">
            <h2 className="text-base font-black">想先看看目标色效果？</h2>
            <p className="mt-1 text-xs leading-5 text-ink-2">
              可以用当前照片，按演示用的浅金底色生成效果图。这个结果只用于展示目标色，不代表你当前真实适合居家染。
            </p>
            {demoError ? (
              <p className="mt-2 rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold leading-4 text-red-600">
                {demoError}
              </p>
            ) : null}
          </NotebookCard>
        ) : null}
      </div>
      <BottomBar>
        <div className={allowDemoPreview && onDemoPreview ? 'grid grid-cols-[.85fr_1.45fr] gap-2' : 'grid grid-cols-[.9fr_1.35fr] gap-2'}>
          <SecondaryButton onClick={onBack}>
            <span className="whitespace-nowrap text-[13px]">保存目标色</span>
          </SecondaryButton>
          <PrimaryButton
            onClick={allowDemoPreview && onDemoPreview ? onDemoPreview : onBack}
            disabled={demoLoading}
          >
            <span className="whitespace-nowrap text-[11px]">
              {allowDemoPreview && onDemoPreview
                ? demoLoading
                  ? '正在生成演示方案…'
                  : '用演示底色生成效果看看'
                : '我已漂到足够度数，重新分析'}
            </span>
          </PrimaryButton>
        </div>
      </BottomBar>
    </AppFrame>
  );
}
