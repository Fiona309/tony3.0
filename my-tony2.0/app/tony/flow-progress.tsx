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

export function FlowProgress({ stage, dark = false }: { stage: FlowStage; dark?: boolean }) {
  const current = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className={cx('flex items-center gap-1 px-4 py-2', dark ? 'text-white' : 'text-ink')}>
      {STAGES.map((s, i) => {
        const done = i < current;
        const on = i === current;
        return (
          <div key={s.key} className="flex flex-1 items-center gap-1">
            <div className="flex flex-1 flex-col items-center gap-1">
              <span
                className={cx(
                  'block h-[3px] w-full rounded-full',
                  on ? 'bg-pink' : done ? (dark ? 'bg-white/55' : 'bg-ink/35') : dark ? 'bg-white/15' : 'bg-ink/12',
                )}
              />
              <span
                className={cx(
                  'text-[10px] leading-none',
                  on
                    ? dark ? 'font-black text-pink' : 'font-black text-pink-dark'
                    : dark ? 'text-white/45' : 'text-ink-3',
                )}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
