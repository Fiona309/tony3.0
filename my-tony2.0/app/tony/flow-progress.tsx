'use client';

/**
 * 从种草到商品的阶段条。
 *
 * 刻意不写「第 3 步 / 共 4 步」：这不是线性表单，而是有分支、可回头的决策流程。
 * 数字进度条会产生两处故障：
 *   1. 用户换个颜色重新判断时，编号原地不动，看起来像卡住了
 *   2. 走到 4/4 以为结束了，商品页却又冒出来——这是流失最高的一处
 * 改成四个阶段名后，「怎么买」始终摆在那里，用户知道后面还有一段；
 * 换色时停在「能不能染」不动也是正确的表达，因为她确实还在这个阶段。
 */

import { cx } from './ui';

export type FlowStage = 'hair' | 'verdict' | 'mirror' | 'buy';

const STAGES: { key: FlowStage; label: string }[] = [
  { key: 'hair', label: '认识头发' },
  { key: 'verdict', label: '能不能染' },
  { key: 'mirror', label: '看效果' },
  { key: 'buy', label: '怎么买' },
];

export function FlowProgress({ stage, dark = false, label }: {
  stage: FlowStage;
  dark?: boolean;
  /**
   * 覆盖【当前阶段】的文案。判断出「不能直染」时，节点还叫「能不能染」就等于
   * 把已经得出的结论又藏回问句里——用户会以为判断还没做完。
   */
  label?: string;
}) {
  const current = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className={cx('flex items-start px-4 py-2', dark ? 'text-white' : 'text-ink')}>
      {STAGES.map((s, i) => {
        const done = i < current;
        const on = i === current;
        const passed = done || on;
        return (
          <div key={s.key} className="flex min-w-0 flex-1 flex-col items-center">
            {/* 圆点串在一条连接线上。连接线用左右两个半段拼，端点的半段留空，
                这样第一个点左边、最后一个点右边不会多出一截悬空的线。 */}
            <div className="flex h-3 w-full items-center">
              <span className={cx('h-[2px] flex-1 rounded-full', i === 0 ? 'bg-transparent' : passed ? 'bg-pink/45' : dark ? 'bg-white/15' : 'bg-ink/12')} />
              <span
                className={cx(
                  'mx-1 block shrink-0 rounded-full',
                  on ? 'size-[9px] bg-pink ring-4 ring-pink/20' : done ? 'size-[7px] bg-pink/55' : cx('size-[7px]', dark ? 'bg-white/25' : 'bg-ink/18'),
                )}
              />
              <span className={cx('h-[2px] flex-1 rounded-full', i === STAGES.length - 1 ? 'bg-transparent' : done ? 'bg-pink/45' : dark ? 'bg-white/15' : 'bg-ink/12')} />
            </div>
            <span
              className={cx(
                'mt-1 truncate text-[10px] leading-none',
                on
                  ? dark ? 'font-black text-pink' : 'font-black text-pink-dark'
                  : dark ? 'text-white/45' : 'text-ink-3',
              )}
            >
              {on && label ? label : s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
