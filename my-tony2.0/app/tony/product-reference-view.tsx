'use client';

import {
  ArrowRight,
  Check,
  Clock,
  Scales,
  WarningCircle,
} from '@phosphor-icons/react';
import type {
  Budget,
  MockVideo,
  PrimaryProduct,
  ProductRecommendationData,
  RouteType,
} from './types';
import {
  DoodleIcon,
  LoadingGirl,
  MediaImage,
  NotebookCard,
  Polaroid,
  PrimaryButton,
  ScribbleUnderline,
  StatusNotice,
  TapeLabel,
  cx,
} from './ui';

export const PRODUCT_BUDGET_MIN = 10;
export const PRODUCT_BUDGET_MAX = 200;
export const PRODUCT_BUDGET_PRESETS = [
  { label: '¥20–40', min_price: 20, max_price: 40 },
  { label: '¥40–80', min_price: 40, max_price: 80 },
  { label: '¥80–150', min_price: 80, max_price: 150 },
] as const;

export function ProductReferenceView({
  target,
  route,
  budget,
  recommendation,
  products,
  selectedSku,
  loading,
  error,
  onBudgetChange,
  onRecommend,
  onSelect,
  onDetail,
}: {
  target: MockVideo;
  route: RouteType;
  budget: Budget;
  recommendation: ProductRecommendationData | null;
  products: PrimaryProduct[];
  selectedSku: string | null;
  loading: boolean;
  error: string;
  onBudgetChange: (budget: Budget) => void;
  onRecommend: () => void;
  onSelect: (sku: string) => void;
  onDetail: (product: PrimaryProduct) => void;
}) {
  const updateMin = (value: number) =>
    onBudgetChange({
      min_price: Math.max(
        PRODUCT_BUDGET_MIN,
        Math.min(value, budget.max_price - 10),
      ),
      max_price: budget.max_price,
    });
  const updateMax = (value: number) =>
    onBudgetChange({
      min_price: budget.min_price,
      max_price: Math.min(
        PRODUCT_BUDGET_MAX,
        Math.max(value, budget.min_price + 10),
      ),
    });
  const primary = recommendation?.primary_product ?? null;
  const otherProducts = products
    .filter((product) => product.sku_id !== primary?.sku_id)
    .slice(0, 2);
  const hasRisk =
    recommendation?.risk_level === 'medium' ||
    recommendation?.color_rule?.result_quality === 'biased';

  return (
    <div className="px-4 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <span className="rounded-[12px] border border-[#8f7bd1] bg-[#f7f3ff] px-3 py-1 text-xs font-black text-[#6654a0]">
          {target.color_alias ?? target.color_name} · {route === 'dye' ? '染色' : '固色'}
        </span>
        <DoodleIcon tone="lavender" size={23} />
      </div>

      <NotebookCard tone="pink" className="mt-3 bg-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black">预算范围</p>
            <p className="numerals mt-1 text-[25px] font-black">
              ¥{budget.min_price}-¥{budget.max_price}
            </p>
          </div>
          <button
            type="button"
            onClick={onRecommend}
            disabled={loading}
            className="tap mt-1 min-h-11 rounded-[48%_52%_46%_54%] border-2 border-ink bg-pink px-4 text-xs font-black disabled:opacity-45"
          >
            {loading ? '匹配中…' : '按此预算推荐'}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[
            ...PRODUCT_BUDGET_PRESETS,
            {
              label: '自定义',
              min_price: budget.min_price,
              max_price: budget.max_price,
            },
          ].map(({ label, min_price, max_price }) => {
            const active =
              label !== '自定义' &&
              budget.min_price === min_price &&
              budget.max_price === max_price;
            return (
              <button
                key={String(label)}
                type="button"
                onClick={() => {
                  if (label !== '自定义') {
                    onBudgetChange({ min_price, max_price });
                  }
                }}
                className={cx(
                  'tap rounded-[10px] border px-1 py-2 text-[10px] font-black',
                  active ? 'border-pink bg-pink-soft text-pink-dark' : 'border-line bg-cream',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="relative mt-5 h-7">
          <div className="sketch-budget-track absolute inset-x-0 top-2.5 h-2" />
          <div
            className="sketch-budget-fill absolute top-2.5 h-2"
            style={{
              left: `${((budget.min_price - PRODUCT_BUDGET_MIN) / (PRODUCT_BUDGET_MAX - PRODUCT_BUDGET_MIN)) * 100}%`,
              right: `${100 - ((budget.max_price - PRODUCT_BUDGET_MIN) / (PRODUCT_BUDGET_MAX - PRODUCT_BUDGET_MIN)) * 100}%`,
            }}
          />
          <input aria-label="最低预算" type="range" min={PRODUCT_BUDGET_MIN} max={PRODUCT_BUDGET_MAX} step={10} value={budget.min_price} onChange={(event) => updateMin(Number(event.target.value))} className="tony-dual-range absolute inset-x-0 top-0 w-full" />
          <input aria-label="最高预算" type="range" min={PRODUCT_BUDGET_MIN} max={PRODUCT_BUDGET_MAX} step={10} value={budget.max_price} onChange={(event) => updateMax(Number(event.target.value))} className="tony-dual-range absolute inset-x-0 top-0 w-full" />
        </div>
        <div className="flex justify-between text-[9px] text-ink-3"><span>¥10</span><span>¥200</span></div>
      </NotebookCard>

      {error ? <div className="mt-3"><StatusNotice tone="danger" title="推荐没有完成">{error}</StatusNotice></div> : null}

      {loading ? (
        <div className="py-9">
          <LoadingGirl size={105} label="正在匹配底色、用量和商品资料" />
        </div>
      ) : null}

      {!loading && recommendation?.status === 'no_match' ? (
        <NotebookCard tone="yellow" className="mt-4 text-center">
          <WarningCircle className="mx-auto text-[#cc8b00]" size={32} weight="duotone" />
          <h2 className="mt-2 text-xl font-black">预算内暂时没有合适商品</h2>
          <p className="mt-2 text-xs leading-5">{recommendation.message}</p>
        </NotebookCard>
      ) : null}

      {!loading && primary ? (
        <>
          {hasRisk ? (
            <div className="mt-3 flex items-center gap-3 border border-pink bg-[#fff1f5] px-3 py-3">
              <WarningCircle size={24} weight="fill" className="shrink-0 text-pink-dark" />
              <div>
                <p className="text-xs font-black">需要先接受偏色风险</p>
                <p className="mt-0.5 text-[10px] leading-4">
                  {recommendation.risk_summary ?? primary.possible_risk}
                </p>
              </div>
              <DoodleIcon className="ml-auto shrink-0" tone="pink" size={22} />
            </div>
          ) : null}

          <div className="mt-5">
            <TapeLabel tone="mint">结合底色与用量</TapeLabel>
            <div className="mt-2 flex items-center justify-between">
              <h2 className="text-[25px] font-black">
                <ScribbleUnderline>最推荐这一款</ScribbleUnderline>
              </h2>
              <DoodleIcon kind="heart" size={28} />
            </div>
          </div>

          <article className="mt-3 border-[1.7px] border-[#dbaa24] bg-[#fffdf5] p-3">
            <div className="grid grid-cols-[118px_1fr_80px] items-center gap-3">
              <div className="relative grid grid-cols-[70px_48px] items-end">
                <div className="relative h-[118px] overflow-hidden rounded-[6px] border border-line bg-pink-soft">
                  <MediaImage src={primary.url} alt={primary.product_name} className="object-cover" />
                </div>
                <Polaroid src={target.target_frame_url} alt="染后效果" caption="染后效果" className="-ml-3 w-[62px]" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap gap-1">
                  {primary.badge ? <span className="sketch-sticker">{primary.badge}</span> : null}
                  <span className="rounded-full bg-sage/60 px-2 py-0.5 text-[9px] font-black text-good">主推荐</span>
                </div>
                <p className="mt-2 text-[10px] text-ink-3">{primary.brand}</p>
                <h3 className="text-sm font-black leading-tight">{primary.product_name}</h3>
                <p className="mt-1 text-xs font-black text-pink-dark">{primary.shade_name}</p>
              </div>
              <div className="text-right">
                <span className="grid size-7 place-items-center rounded-full bg-pink text-white"><Check size={15} weight="bold" /></span>
                <p className="mt-2 text-[10px]">合计</p>
                <p className="numerals text-[30px] font-black leading-none">¥{primary.price.total_price}</p>
                <p className="mt-2 text-[9px]">单价 ¥{primary.price.unit_price}</p>
                {primary.purchase_url ? (
                  <a
                    href={primary.purchase_url}
                    target="_blank"
                    rel="noreferrer"
                    className="tap mt-2 inline-flex min-h-8 items-center gap-1 rounded-full bg-ink px-3 text-[10px] font-black text-white"
                  >
                    去下单 <ArrowRight size={11} weight="bold" />
                  </a>
                ) : (
                  <span className="mt-2 inline-flex min-h-8 items-center rounded-full bg-ink/10 px-3 text-[10px] font-black text-ink-3">
                    抖音链接待补
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-y border-dashed border-pink/55 bg-[#fff1f5] px-3 py-2">
              <span className="text-xs font-black">这次需要购买</span>
              <span className="flex items-baseline gap-1 text-pink-dark">
                <strong className="numerals text-[36px] font-black leading-none">
                  {primary.usage.units_needed}
                </strong>
                <span className="text-base font-black">盒</span>
              </span>
              <span className="max-w-[84px] text-right text-[9px] leading-4 text-ink-3">
                按当前发长计算
              </span>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_1fr_72px] gap-3 border-t border-dashed border-line pt-3">
              <div>
                <TapeLabel tone="mint" className="!px-2 !py-0.5 text-[9px]">优点</TapeLabel>
                <p className="mt-1.5 text-[9px] leading-4">✓ {primary.suitable_reason}</p>
              </div>
              <div>
                <TapeLabel tone="pink" className="!px-2 !py-0.5 text-[9px]">缺点</TapeLabel>
                <p className="mt-1.5 text-[9px] leading-4">− {primary.possible_risk}</p>
              </div>
              <div className="border-l border-line pl-2 text-center">
                <Clock className="mx-auto" size={18} />
                <p className="mt-1 text-[9px]">预计维持</p>
                <p className="mt-1 text-xs font-black">{primary.duration}</p>
              </div>
            </div>
          </article>

          {otherProducts.length ? (
            <div className="mt-5">
              <TapeLabel tone="lavender">其他预算内选择</TapeLabel>
              <p className="ml-3 inline text-[10px] text-ink-3">价格、效果和风险各有取舍</p>
              <div className="mt-3 grid gap-2.5">
                {otherProducts.map((product) => (
                  <article
                    key={product.sku_id}
                    className={cx(
                      'tap grid grid-cols-[84px_1fr_82px] items-center gap-3 border-[1.5px] bg-white p-3 text-left',
                      selectedSku === product.sku_id ? 'border-pink' : 'border-ink/60',
                    )}
                  >
                    <div className="relative h-[88px] overflow-hidden rounded-[7px] bg-line">
                      <MediaImage src={product.url} alt={product.product_name} className="object-cover" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-black">{product.product_name}</h3>
                      <div className="mt-1 flex items-baseline gap-1 text-pink-dark">
                        <span className="text-[9px] font-black">购买</span>
                        <strong className="numerals text-[25px] font-black leading-none">
                          {product.usage.units_needed}
                        </strong>
                        <span className="text-[11px] font-black">盒</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[9px] leading-4 text-good">✓ {product.suitable_reason}</p>
                      <button
                        type="button"
                        onClick={() => onDetail(product)}
                        className="mt-1 inline-flex items-center gap-1 text-[9px] font-black underline decoration-[#8f7bd1] underline-offset-2"
                      >
                        查看商品 <ArrowRight size={10} />
                      </button>
                    </div>
                    <div className="text-right">
                      <button type="button" onClick={() => onSelect(product.sku_id)} className="tap ml-auto block" aria-label={`选择${product.product_name}`}>
                        <span className={cx('block size-6 rounded-full border-2', selectedSku === product.sku_id ? 'border-pink bg-pink' : 'border-line')} />
                      </button>
                      <p className="mt-2 text-[9px]">合计</p>
                      <p className="numerals text-[27px] font-black leading-none">¥{product.price.total_price}</p>
                      <p className="mt-1 text-[9px]">单价 ¥{product.price.unit_price}</p>
                      {product.purchase_url ? (
                        <a
                          href={product.purchase_url}
                          target="_blank"
                          rel="noreferrer"
                          className="tap mt-2 inline-flex min-h-8 items-center gap-1 rounded-full bg-ink px-3 text-[10px] font-black text-white"
                        >
                          去下单 <ArrowRight size={10} weight="bold" />
                        </a>
                      ) : (
                        <span className="mt-2 inline-flex min-h-8 items-center rounded-full bg-ink/10 px-3 text-[10px] font-black text-ink-3">
                          链接待补
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex items-center gap-2 border border-[#9d8ed4] bg-[#f7f3ff] px-3 py-2 text-[9px]">
            <DoodleIcon tone="lavender" size={18} />
            总价已按建议购买数量计算，外部商品页价格可能变化。
          </div>
        </>
      ) : null}

      {!recommendation && !loading ? (
        <PrimaryButton className="mt-5" onClick={onRecommend} icon={<Scales size={17} weight="bold" />}>
          按此预算推荐
        </PrimaryButton>
      ) : null}
    </div>
  );
}
