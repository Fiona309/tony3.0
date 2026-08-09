'use client';

import {
  ArrowRight,
  Clock,
  GearSix,
  HouseLine,
  PaintBrush,
  ShoppingBagOpen,
  Star,
  UserCircle,
  VideoCamera,
} from '@phosphor-icons/react';
import type { ArchiveSummary, HairProfileData, PrimaryProduct } from './types';
import { AppFrame, MediaImage, PrimaryButton, cx } from './ui';
import type { ReactNode } from 'react';

export type MainTab = 'analysis' | 'shop' | 'tutorial' | 'me';

const tabs = [
  { id: 'analysis', label: '发色分析', Icon: PaintBrush },
  { id: 'shop', label: '选购商品', Icon: ShoppingBagOpen },
  { id: 'tutorial', label: '操作教程', Icon: HouseLine },
  { id: 'me', label: '我的', Icon: UserCircle },
] as const;

export function MainTabBar({
  active,
  onChange,
  dark = false,
}: {
  active: MainTab;
  onChange: (tab: MainTab) => void;
  dark?: boolean;
}) {
  return (
    <nav
      className={cx(
        'absolute inset-x-0 bottom-0 z-[60] grid h-[68px] w-full grid-cols-4 border-t px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl',
        dark ? 'border-white/15 bg-black/70 text-white' : 'border-ink/15 bg-cream/95 text-ink',
      )}
      aria-label="主导航"
    >
      {tabs.map(({ id, label, Icon }) => {
        const selected = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cx(
              'tap flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-bold',
              selected ? 'text-pink-dark' : dark ? 'text-white/60' : 'text-ink-3',
            )}
          >
            <Icon size={22} weight={selected ? 'fill' : 'regular'} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function AgentShell({
  children,
  active,
  onChange,
}: {
  children: ReactNode;
  active: MainTab;
  onChange: (tab: MainTab) => void;
}) {
  return (
    // 用 flex 列：内容区 flex-1 + 底部 tab 栏 shrink-0。
    // 主导航是唯一固定在底部的控件；页面里的操作按钮全部随内容滚动。
    <div className="tony-agent-shell relative mx-auto flex w-full max-w-[430px] flex-col transform-gpu overflow-hidden md:my-5 md:rounded-[34px] md:border-2 md:border-ink [&_.tony-app]:m-0 [&_.tony-app]:h-full [&_.tony-app]:w-full [&_.tony-app]:border-0">
      <div className="relative min-h-0 flex-1">{children}</div>
      <div className="shrink-0 [&>nav]:static">
        <MainTabBar active={active} onChange={onChange} />
      </div>
    </div>
  );
}

function OperationOverview({ product }: { product: PrimaryProduct }) {
  const usage = product.usage;
  const waitingMinutes = usage.waiting_minutes ?? 30;
  const difficulty = usage.difficulty ?? Math.max(1, Math.min(5, Math.ceil((waitingMinutes + 35) / 20)));
  const totalMinutes = waitingMinutes + 35;
  const steps = usage.key_steps?.slice(0, 5) ?? ['皮试准备', '头发分区', '均匀涂抹', '等待显色', '冲洗护理'];
  const instructionImage = usage.image_urls?.[0];

  return (
    <section className="rounded-[28px] border border-line bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-ink-3">{product.brand}</p>
          <h2 className="mt-1 text-xl font-black">{product.product_name}</h2>
          <p className="mt-1 text-sm font-bold text-orange-dark">{product.shade_name}</p>
        </div>
        <span className="rounded-full bg-orange-soft px-3 py-1 text-xs font-black text-orange-dark">
          约 {totalMinutes} 分钟
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-[18px] bg-cream p-3">
          <p className="text-[10px] text-ink-3">染发难度</p>
          <div className="mt-1 flex gap-0.5" aria-label={`难度 ${difficulty} 星`}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Star key={value} size={16} weight={value <= difficulty ? 'fill' : 'regular'} className={value <= difficulty ? 'text-orange' : 'text-line'} />
            ))}
          </div>
        </div>
        <div className="rounded-[18px] bg-cream p-3">
          <p className="text-[10px] text-ink-3">上色方式</p>
          <p className="mt-1 text-sm font-black">
            {usage.hair_state === 'wet' ? '湿发上色' : usage.hair_state === 'dry_or_wet' ? '干湿发均可' : '干发上色'}
          </p>
        </div>
        <div className="col-span-2 rounded-[18px] bg-sage/30 p-3">
          <p className="text-[10px] text-ink-3">预计维持</p>
          <p className="mt-1 text-sm font-black">{product.duration}</p>
        </div>
      </div>
      {instructionImage ? (
        <div className="relative mt-4 aspect-[16/10] overflow-hidden rounded-[20px] bg-line">
          <MediaImage src={instructionImage} alt={`${product.product_name}操作图示`} className="object-contain" />
        </div>
      ) : (
        <p className="mt-4 rounded-[18px] bg-sky/25 p-3 text-xs leading-5 text-ink-2">
          {usage.short_instruction || '知识库暂无操作图示，已回退为文字操作说明。'}
        </p>
      )}
      <ol className="mt-4 grid gap-2">
        {steps.map((step, index) => (
          <li key={`${step}-${index}`} className="flex items-center gap-3 rounded-[16px] border border-line bg-cream/60 px-3 py-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-pink text-xs font-black">{index + 1}</span>
            <span className="text-sm font-bold">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TutorialHubScreen({
  product,
  archives,
  onOpenArchive,
  onShop,
}: {
  product: PrimaryProduct | null;
  archives: ArchiveSummary[];
  onOpenArchive: (archiveId: string) => void;
  onShop: () => void;
}) {
  return (
    <AppFrame title="操作教程" eyebrow="买到后再开始">
      <div className="px-5 pb-24 pt-5">
        <div className="rounded-[24px] border border-orange/30 bg-orange-soft/45 p-4">
          <p className="flex items-center gap-2 text-sm font-black"><Clock size={19} weight="fill" />商品预计约 2 天到货</p>
          <p className="mt-2 text-xs leading-5 text-ink-2">现在先保存方案。收到商品、准备开始时，再从这里进入逐步操作教程。</p>
        </div>
        {product ? <div className="mt-5"><OperationOverview product={product} /></div> : null}
        {archives.length ? (
          <section className="mt-7">
            <h2 className="text-lg font-black">已保存的染发方案</h2>
            <div className="mt-3 grid gap-3">
              {archives.map((archive) => (
                <button key={archive.archive_id} type="button" onClick={() => onOpenArchive(archive.archive_id)} className="tap flex items-center gap-3 rounded-[22px] border border-line bg-white p-4 text-left shadow-soft">
                  <span className="size-10 rounded-full border border-white shadow" style={{ background: archive.target_color_name.includes('红') ? '#a84c50' : '#79688d' }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black">{archive.target_color_name}</span>
                    <span className="mt-1 block truncate text-xs text-ink-3">{archive.product_name} · {archive.shade_name}</span>
                  </span>
                  <ArrowRight size={18} weight="bold" />
                </button>
              ))}
            </div>
          </section>
        ) : !product ? (
          <div className="mt-20 text-center">
            <Clock className="mx-auto text-ink-3" size={42} />
            <h2 className="mt-4 text-xl font-black">还没有待操作的商品</h2>
            <p className="mt-2 text-sm text-ink-3">先完成发色分析并选择商品。</p>
            <PrimaryButton className="mt-6" onClick={onShop}>去选购商品</PrimaryButton>
          </div>
        ) : null}
      </div>
    </AppFrame>
  );
}

export function ShopHubScreen({
  product,
  onAnalyze,
}: {
  product: PrimaryProduct | null;
  onAnalyze: () => void;
}) {
  return (
    <AppFrame title="选购商品" eyebrow="按你的底色与预算推荐">
      <div className="px-5 pb-24 pt-5">
        {product ? (
          <>
            <OperationOverview product={product} />
            {product.purchase_url ? (
              <a
                href={product.purchase_url}
                target="_blank"
                rel="noreferrer"
                className="tap mt-5 flex min-h-14 items-center justify-center gap-2 rounded-[18px] bg-ink px-4 text-sm font-black text-white"
              >
                查看已选商品 <ArrowRight size={18} weight="bold" />
              </a>
            ) : (
              <p className="mt-5 rounded-[18px] bg-ink/10 px-4 py-4 text-center text-sm font-black text-ink-3">
                商品来自知识库，抖音购买链接待补
              </p>
            )}
          </>
        ) : (
          <div className="mt-20 text-center">
            <ShoppingBagOpen className="mx-auto text-ink-3" size={46} />
            <h1 className="mt-5 text-2xl font-black">先分析，再精准选购</h1>
            <p className="mx-auto mt-3 max-w-[280px] text-sm leading-6 text-ink-3">
              商品推荐需要结合你的当前底色、目标发色、发长与预算，不会只按热门程度排序。
            </p>
            <PrimaryButton className="mt-7" onClick={onAnalyze}>开始发色分析</PrimaryButton>
          </div>
        )}
      </div>
    </AppFrame>
  );
}

export function MyScreen({
  profile,
  archives,
  onOpenArchive,
  onTransitionVideos,
}: {
  profile: HairProfileData | null;
  archives: ArchiveSummary[];
  onOpenArchive: (archiveId: string) => void;
  onTransitionVideos: () => void;
}) {
  const collection = archives.length ? archives : [
    { archive_id: 'demo-1', target_color_name: '冷茶棕', product_name: '染发记录', shade_name: '冷茶棕' },
    { archive_id: 'demo-2', target_color_name: '灰粉色', product_name: '染发记录', shade_name: '灰粉色' },
  ];
  return (
    <AppFrame title="我的" eyebrow="个人档案">
      <div className="px-5 pb-24 pt-5">
        <section className="rounded-[30px] border border-line bg-white p-5 shadow-card">
          <div className="flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-full bg-pink/65"><UserCircle size={42} weight="fill" /></span>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black">Fiona</h1>
              <p className="mt-1 text-xs text-ink-3">@fiona_tony · 做自己的 Tony</p>
            </div>
            <button type="button" className="tap grid size-10 place-items-center rounded-full border border-line" aria-label="设置"><GearSix size={20} /></button>
          </div>
          <div className="mt-5 grid grid-cols-3 divide-x divide-line text-center">
            <div><p className="text-xl font-black">{archives.length}</p><p className="text-[10px] text-ink-3">染发档案</p></div>
            <div><p className="text-xl font-black">9</p><p className="text-[10px] text-ink-3">发色灵感</p></div>
            <div><p className="text-xl font-black">{profile ? 1 : 0}</p><p className="text-[10px] text-ink-3">发质档案</p></div>
          </div>
        </section>
        <button
          type="button"
          onClick={onTransitionVideos}
          className="tap mt-5 flex w-full items-center gap-4 rounded-[24px] bg-ink p-4 text-left text-white shadow-card"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-[17px] bg-pink text-white">
            <VideoCamera size={24} weight="fill" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-black">我的转场视频</span>
            <span className="mt-1 block text-[11px] text-white/55">
              跟拍模板、预览并保存到手机
            </span>
          </span>
          <ArrowRight size={18} weight="bold" />
        </button>
        <section className="mt-7">
          <div className="flex items-end justify-between"><h2 className="text-xl font-black">我的发色收集</h2><span className="text-xs text-ink-3">我染过的颜色</span></div>
          <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-3 [scrollbar-width:none]">
            {collection.map((item, index) => (
              <button key={item.archive_id} type="button" onClick={() => !item.archive_id.startsWith('demo-') && onOpenArchive(item.archive_id)} className="tap w-36 shrink-0 snap-start overflow-hidden rounded-[22px] border border-line bg-white text-left shadow-soft">
                <div className="h-24" style={{ background: index % 2 ? 'linear-gradient(135deg,#a98794,#5d3e4d)' : 'linear-gradient(135deg,#b59a87,#5e493e)' }} />
                <div className="p-3"><p className="text-sm font-black">{item.target_color_name}</p><p className="mt-1 truncate text-[10px] text-ink-3">{item.product_name}</p></div>
              </button>
            ))}
          </div>
        </section>
        <section className="mt-5 rounded-[24px] border border-line bg-white">
          {['我的收藏', '发质与过敏档案', '收货与提醒设置'].map((label) => (
            <button key={label} type="button" className="tap flex min-h-14 w-full items-center border-b border-line px-4 text-left last:border-0">
              <span className="flex-1 text-sm font-bold">{label}</span><ArrowRight size={17} />
            </button>
          ))}
        </section>
      </div>
    </AppFrame>
  );
}
