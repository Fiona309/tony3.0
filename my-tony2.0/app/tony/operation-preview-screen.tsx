'use client';

import {
  ArrowRight,
  Clock,
  Drop,
  Hand,
  Heart,
  PaintBrush,
  Sparkle,
  Star,
  TShirt,
  Warning,
} from '@phosphor-icons/react';
import type { MockVideo, PrimaryProduct } from './types';
import {
  AppFrame,
  BottomBar,
  DoodleIcon,
  MediaImage,
  NotebookCard,
  PrimaryButton,
  ScribbleUnderline,
  SecondaryButton,
  TapeLabel,
} from './ui';

const fallbackSteps = ['准备与分区', '分区涂抹', '补涂发根', '等待与冲洗'];
const stepIcons = [Sparkle, PaintBrush, Drop, Clock];
const stepTimes = ['10 分钟', '25 分钟', '15 分钟', '30 分钟'];

export function OperationPreviewScreen({
  product,
  target,
  onBack,
  onChangeProduct,
  onSave,
}: {
  product: PrimaryProduct;
  target: MockVideo;
  onBack: () => void;
  onChangeProduct: () => void;
  onSave: () => void;
}) {
  const difficulty = Math.min(5, Math.max(1, product.usage.difficulty ?? 3));
  const waitingMinutes = product.usage.waiting_minutes ?? 30;
  const totalMinutes = Math.max(55, waitingMinutes + 50);
  const steps = (product.usage.key_steps?.length
    ? product.usage.key_steps
    : fallbackSteps
  ).slice(0, 4);

  return (
    <AppFrame title="操作预览" eyebrow="购买前确认" onBack={onBack}>
      <div className="px-4 pb-5 pt-4">
        <div className="relative text-center">
          <DoodleIcon className="absolute right-2 top-0 rotate-12" tone="lavender" size={28} />
          <h1 className="text-[27px] font-black tracking-[-.04em]">
            <ScribbleUnderline>操作预览</ScribbleUnderline>
          </h1>
          <p className="mt-1 text-xs text-ink-2">先看看难度和耗时，再决定要不要保存</p>
        </div>

        <NotebookCard tone="lavender" className="mt-4 bg-white">
          <div className="grid grid-cols-[100px_1fr_76px] items-center gap-3">
            <div className="relative h-[100px]">
              <div className="absolute inset-y-0 left-0 w-[66px] overflow-hidden rounded-[8px] border border-ink/45 bg-pink-soft">
                <MediaImage src={product.url} alt={product.product_name} className="object-cover" />
              </div>
              <div className="sketch-photo absolute bottom-0 right-0 h-[82px] w-[58px] overflow-hidden bg-line">
                <MediaImage src={target.target_frame_url} alt="染后效果参考" className="object-cover" />
              </div>
              <span className="absolute left-[58px] top-0 h-3 w-9 -rotate-6 bg-[#f8d98a]/85" />
            </div>
            <div className="min-w-0">
              <div className="flex gap-1">
                <span className="sketch-sticker">已选商品</span>
                <span className="rounded-full border border-[#8f7bd1] px-2 py-0.5 text-[9px] font-black text-[#6d5aaf]">染色方案</span>
              </div>
              <p className="mt-2 truncate text-[10px] font-bold text-ink-3">{product.brand}</p>
              <h2 className="text-sm font-black leading-tight">{product.product_name}</h2>
              <p className="mt-1 text-xs font-black text-pink-dark">{product.shade_name}</p>
              <p className="mt-1 text-[10px]">{product.usage.units_label}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold">合计</p>
              <p className="numerals text-[32px] font-black leading-none">¥{product.price.total_price}</p>
              {product.purchase_url ? (
                <a href={product.purchase_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 border-b-2 border-[#8f7bd1] text-[10px] font-black">
                  查看商品 <ArrowRight size={11} weight="bold" />
                </a>
              ) : (
                <p className="mt-3 text-[10px] font-black text-ink-3">抖音链接待补</p>
              )}
            </div>
          </div>
        </NotebookCard>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <section className="relative border border-pink bg-[#fff8f9] p-3 text-center">
            <DoodleIcon className="absolute left-2 top-2 -rotate-12" size={23} />
            <h2 className="text-sm font-black">操作难度</h2>
            <div className="mt-2 flex justify-center gap-1">
              {Array.from({ length: 5 }, (_, index) => (
                <Star key={index} size={22} weight={index < difficulty ? 'fill' : 'regular'} className={index < difficulty ? 'text-pink-dark' : 'text-ink-3'} />
              ))}
            </div>
            <p className="mt-1 text-xs font-black text-pink-dark">{difficulty}/5 · 中等</p>
            <p className="mt-2 border-t border-dashed border-line pt-2 text-[10px] leading-4">需要分区涂抹，发根与发尾控制时间不同。</p>
          </section>
          <section className="relative border border-[#8f7bd1] bg-[#fbf9ff] p-3 text-center">
            <DoodleIcon kind="heart" className="absolute right-2 top-2 rotate-12" size={22} />
            <h2 className="text-sm font-black">预计耗时</h2>
            <p className="numerals mt-4 text-[26px] font-black leading-none">约 {totalMinutes} 分钟</p>
            <p className="mt-3 border-t border-dashed border-line pt-2 text-[10px] leading-4">
              准备 10 分钟 · 涂抹 40 分钟 · 等待 {product.usage.waiting_minutes} 分钟
            </p>
          </section>
        </div>

        <section className="mt-3 border border-[#6ea77b] bg-[#fbfff9] p-3">
          <TapeLabel tone="mint" className="text-sm">操作步骤预览</TapeLabel>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {steps.map((step, index) => {
              const Icon = stepIcons[index] ?? Sparkle;
              return (
                <div key={`${step}-${index}`} className="relative text-center">
                  {index < steps.length - 1 ? <span className="absolute left-[66%] top-6 w-[70%] border-t border-dashed border-pink" /> : null}
                  <span className="relative mx-auto grid size-11 place-items-center rounded-full border border-ink bg-cream"><Icon size={23} weight="duotone" /></span>
                  <span className="relative -mt-1 inline-block rounded-full bg-pink px-2 text-[9px] font-black text-white">0{index + 1}</span>
                  <p className="mt-1 line-clamp-2 text-[10px] font-black leading-4">{step}</p>
                  <p className="text-[9px] text-pink-dark">· {stepTimes[index]}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 flex items-center gap-1 text-[9px]"><Star size={12} weight="fill" className="text-pink-dark" /> 正式开始后会分步播放视频，并支持语音提问。</p>
        </section>

        <section className="mt-3 border border-[#8f7bd1] bg-[#fbf9ff] p-3">
          <TapeLabel tone="lavender" className="text-sm">需要提前准备</TapeLabel>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[[Hand, '一次性手套'], [TShirt, '染发围布'], [Sparkle, '发夹 × 4'], [PaintBrush, '染发刷'], [Drop, '塑料碗'], [Heart, '旧毛巾']].map(([Icon, label]) => {
              const ToolIcon = Icon as typeof Hand;
              return <div key={String(label)} className="flex items-center gap-1.5 rounded-[9px] border border-line bg-white px-2 py-2"><ToolIcon size={17} weight="duotone" /><span className="text-[9px] font-bold">{String(label)}</span></div>;
            })}
          </div>
        </section>

        <div className="mt-3 flex items-center gap-2 rounded-[12px] border border-[#e5aa28] bg-[#fff9df] px-3 py-2 text-[10px] font-bold">
          <Warning className="shrink-0 text-[#cc8e00]" size={17} weight="fill" />
          请同时阅读商品说明并完成过敏测试。
        </div>
      </div>
      <BottomBar>
        <div className="grid grid-cols-[.72fr_1.45fr] gap-2">
          <SecondaryButton onClick={onChangeProduct}><span className="whitespace-nowrap">换个方案</span></SecondaryButton>
          <PrimaryButton onClick={onSave}><span className="whitespace-nowrap">保存到个人档案</span></PrimaryButton>
        </div>
      </BottomBar>
    </AppFrame>
  );
}
