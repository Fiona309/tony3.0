'use client';

import {
  CalendarDots,
  Flask,
  Palette,
  ShoppingBag,
  Star,
} from '@phosphor-icons/react';
import type { ArchiveDetailData } from './types';
import {
  DoodleIcon,
  MediaImage,
  NotebookCard,
  Polaroid,
  ScribbleUnderline,
  TapeLabel,
} from './ui';

const lengthLabels: Record<string, string> = {
  ear: '齐耳短发',
  shoulder: '齐肩发',
  chest: '齐胸中长发',
  waist: '齐腰长发',
  below_waist: '超长发',
};

const volumeLabels: Record<string, string> = {
  low: '发量偏少',
  medium: '发量适中',
  high: '发量较多',
};

const historyLabels: Record<string, string> = {
  natural: '自然发',
  dyed_no_bleach: '染过未漂',
  bleached_1_2: '漂过 1-2 次',
  bleached_3_plus: '漂过 3 次以上',
  dyed_black: '染过黑色',
  unknown: '不确定',
};

export function ArchiveReferenceView({
  archive,
  currentColor,
  difficulty,
  minutes,
}: {
  archive: ArchiveDetailData;
  currentColor: string;
  difficulty: number;
  minutes: number;
}) {
  const currentImage =
    archive.current_image_url ??
    archive.product_snapshot.usage.image_urls?.[0] ??
    '/video-mock/frames/step-2-2.jpg';
  const targetImage =
    archive.selected_preview_image_url ??
    archive.product_snapshot.usage.image_urls?.[1] ??
    '/video-mock/frames/step-3-2.jpg';

  return (
    <div className="px-4 pb-6 pt-4">
      <NotebookCard tone="lavender" className="overflow-hidden">
        <TapeLabel tone="lavender">目标发色</TapeLabel>
        <DoodleIcon tone="lavender" className="absolute left-[30%] top-5 rotate-12" />
        <div className="mt-3 grid grid-cols-[88px_1fr_22px_1fr] items-center gap-2">
          <div>
            <h1 className="whitespace-nowrap text-[27px] font-black leading-none tracking-[-.08em]">
              <ScribbleUnderline>{archive.profile_snapshot.target_color.display_name}</ScribbleUnderline>
            </h1>
            <p className="mt-5 text-[10px]">目标色接近度</p>
            <p className="numerals text-[34px] font-black leading-none">
              {archive.plan_snapshot.reachability_score}%
            </p>
            <DoodleIcon kind="heart" className="mt-2 rotate-12" size={22} />
          </div>
          <Polaroid src={currentImage} alt="当前发色" caption={`当前 · ${currentColor}`} className="w-full" />
          <span className="text-center text-2xl font-black text-pink-dark">→</span>
          <Polaroid src={targetImage} alt="目标发色" caption={`目标 · ${archive.profile_snapshot.target_color.display_name}`} className="w-full" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            lengthLabels[archive.profile_snapshot.hair_length] ?? archive.profile_snapshot.hair_length,
            volumeLabels[archive.profile_snapshot.hair_volume] ?? archive.profile_snapshot.hair_volume,
            archive.plan_snapshot.selected_route === 'dye' ? '染色' : '固色',
          ].map((item) => (
            <span key={item} className="rounded-full border border-[#8f7bd1] px-3 py-1 text-[10px] font-black">{item}</span>
          ))}
        </div>
      </NotebookCard>

      <NotebookCard tone="pink" className="mt-3">
        <TapeLabel tone="pink">已选商品</TapeLabel>
        <DoodleIcon kind="heart" className="absolute left-32 top-3 rotate-12" size={21} />
        <div className="mt-3 grid grid-cols-[112px_1fr_80px] items-center gap-3">
          <div className="relative h-[105px]">
            <div className="absolute inset-y-0 left-0 w-[70px] overflow-hidden rounded-[6px] border border-line bg-pink-soft">
              <MediaImage src={archive.product_snapshot.url} alt={archive.product_snapshot.product_name} className="object-cover" />
            </div>
            <Polaroid src={targetImage} alt="染后效果" caption="染后效果" className="absolute bottom-0 right-0 w-[60px]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-ink-3">{archive.product_snapshot.brand}</p>
            <h2 className="text-base font-black leading-tight">{archive.product_snapshot.product_name}</h2>
            <p className="mt-1 text-xs font-black text-pink-dark">{archive.product_snapshot.shade_name}</p>
            <p className="mt-2 text-[10px]">{archive.product_snapshot.usage.units_label}</p>
          </div>
          <div className="text-right">
            <span className="rounded-full border border-line px-2 py-1 text-[9px]">
              {archive.purchase_status === 'saved' ? '尚未购买' : '已准备'}
            </span>
            <p className="mt-2 text-[10px]">合计</p>
            <p className="numerals text-[31px] font-black leading-none">¥{archive.product_snapshot.price.total_price}</p>
            <p className="mt-2 text-[9px] underline decoration-[#8f7bd1] underline-offset-2">查看商品 →</p>
          </div>
        </div>
      </NotebookCard>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <NotebookCard tone="pink" className="text-center">
          <TapeLabel tone="pink" className="absolute -top-2 left-3">操作难度</TapeLabel>
          <DoodleIcon className="absolute right-3 top-2" size={21} />
          <div className="mt-3 flex justify-center gap-1">
            {Array.from({ length: 5 }, (_, index) => (
              <Star key={index} size={23} weight={index < difficulty ? 'fill' : 'regular'} className={index < difficulty ? 'text-pink-dark' : 'text-ink-3'} />
            ))}
          </div>
          <p className="mt-1 text-sm font-black text-pink-dark">{difficulty}/5 · 中等</p>
          <p className="mt-2 border-t border-dashed border-line pt-2 text-[10px] leading-4">需要分区涂抹，发根与发尾控制时间不同。</p>
        </NotebookCard>
        <NotebookCard tone="lavender" className="text-center">
          <TapeLabel tone="lavender" className="absolute -top-2 left-3">预计耗时</TapeLabel>
          <DoodleIcon kind="heart" className="absolute right-3 top-2" size={21} />
          <p className="numerals mt-5 text-[27px] font-black">约 {minutes} 分钟</p>
          <p className="mt-2 border-t border-dashed border-line pt-2 text-[10px] leading-4">
            准备 10 分钟 · 涂抹 40 分钟 · 等待 {archive.product_snapshot.usage.waiting_minutes} 分钟
          </p>
        </NotebookCard>
      </div>

      <div className="mt-4">
        <TapeLabel tone="mint">确认信息</TapeLabel>
        <div className="mt-2 grid grid-cols-2 overflow-hidden border border-line bg-white">
          {[
            [Palette, '当前底色', currentColor, 'yellow'],
            [Flask, '漂染历史', historyLabels[archive.profile_snapshot.dye_history] ?? archive.profile_snapshot.dye_history, 'lavender'],
            [CalendarDots, '预计维持', archive.product_snapshot.duration, 'mint'],
            [ShoppingBag, '购买状态', archive.purchase_status === 'saved' ? '尚未购买' : '已准备', 'pink'],
          ].map(([Icon, label, value, tone]) => {
            const InfoIcon = Icon as typeof Palette;
            const backgrounds: Record<string, string> = {
              yellow: 'bg-[#fff5cf]',
              lavender: 'bg-[#eee8ff]',
              mint: 'bg-[#e5f3e5]',
              pink: 'bg-[#ffe5ee]',
            };
            return (
              <div key={String(label)} className="flex items-center gap-3 border-b border-r border-line p-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-full ${backgrounds[String(tone)]}`}><InfoIcon size={20} weight="duotone" /></span>
                <div>
                  <p className="text-[9px] text-ink-3">{String(label)}</p>
                  <p className="mt-0.5 text-xs font-black">{String(value)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border border-[#9d8ed4] bg-[#f7f3ff] px-3 py-2 text-[10px]">
        <DoodleIcon tone="lavender" size={18} />
        商品到手后，可以从档案进入分步骤教程。
      </div>
      <p className="mt-2 flex items-center gap-2 text-[10px]">
        <DoodleIcon kind="heart" size={17} />
        还没购买也没关系，方案会一直保留。
      </p>
    </div>
  );
}
