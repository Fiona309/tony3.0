'use client';

import {
  ArrowRight,
  Camera,
  Clock,
  FolderOpen,
  Play,
  ShieldCheck,
  ShoppingBag,
  Sparkle,
} from '@phosphor-icons/react';
import type { ArchiveSummary, FlowDraft, MockVideo } from './types';
import {
  AppFrame,
  ErrorState,
  MediaImage,
  PrimaryButton,
  SecondaryButton,
  Skeleton,
} from './ui';

export function LandingScreen({
  video,
  loading,
  error,
  onRetry,
  onBack,
  onStart,
}: {
  video: MockVideo | undefined;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onBack: () => void;
  onStart: (video: MockVideo) => void;
}) {
  if (loading) {
    return (
      <AppFrame>
        <div className="px-5 py-7">
          <Skeleton className="h-[48dvh]" />
          <Skeleton className="mt-6 h-16" />
        </div>
      </AppFrame>
    );
  }
  if (error || !video) {
    return (
      <AppFrame title="做自己的 Tony">
        <ErrorState message={error || '目标发色暂时不可用'} onRetry={onRetry} />
      </AppFrame>
    );
  }
  return (
    <AppFrame
      title="做自己的 Tony"
      eyebrow="染同款分析"
      onBack={onBack}
      className="flex min-h-0 flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1"
    >
      <div className="flex h-full min-h-0 flex-col px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-4">
        {/* 图文区：占屏幕约一半 */}
        <section className="grid shrink-0 basis-1/2 grid-cols-[auto_1fr] items-center gap-3">
          {/* 高度驱动宽度：栏宽随 9:16 自适应，避免溢出压住右侧文案 */}
          <div className="sketch-photo relative aspect-[9/16] h-[88%] max-h-full overflow-hidden bg-line">
            <MediaImage
              src={video.target_frame_url || video.cover_url}
              alt={`${video.color_name}博主正脸与目标发色`}
              className="object-cover object-top"
              priority
            />
            <span className="absolute inset-x-2 bottom-2 rounded-full bg-black/55 px-2 py-1 text-center text-[11px] font-black text-white backdrop-blur">
              目标发色
            </span>
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-[14px] font-black text-pink-dark">想染博主同款发色</p>
            <h1 className="mt-1.5 text-[25px] font-black leading-[1.15] tracking-[-.045em]">
              自己染又害怕翻车？
            </h1>
            <p className="mt-2.5 text-[17px] font-black leading-[1.35]">
              AI Tony 手把手教你居家染发
            </p>
          </div>
        </section>

        {/* 白卡片：文字放大填满卡片 */}
        <section className="mt-4 flex min-h-0 flex-1 flex-col justify-evenly rounded-[24px] border border-line bg-white px-5 py-4 shadow-soft">
          <p className="text-[17px] font-black leading-[1.4]">
            拍一张你当前发色的照片，我来帮你判断：
          </p>
          <ol className="grid gap-3">
            {[
              '我染这个发色翻车风险有多大',
              '我应该买什么染发产品',
              '染发过程怎么操作',
            ].map((item, index) => (
              <li key={item} className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-pink text-[15px] font-black">
                  {index + 1}
                </span>
                <span className="text-[16px] font-bold leading-[1.35]">{item}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="shrink-0 pt-3">
          <PrimaryButton
            onClick={() => onStart(video)}
            icon={<Camera size={20} weight="fill" />}
          >
            打开摄像头拍照片
          </PrimaryButton>
        </div>
      </div>
    </AppFrame>
  );
}

export function ReturnHomeScreen({
  draft,
  archives,
  loading,
  onResumeDraft,
  onOpenArchive,
  onArchives,
  onDiscover,
  onStart,
}: {
  draft: FlowDraft | null;
  archives: ArchiveSummary[];
  loading: boolean;
  onResumeDraft: () => void;
  onOpenArchive: (id: string) => void;
  onArchives: () => void;
  onDiscover: () => void;
  onStart: () => void;
}) {
  const active =
    archives.find((item) => item.status === 'in_progress') ??
    archives.find((item) => item.purchase_status !== 'saved' && item.status !== 'completed');

  const title = draft
    ? `继续上次的${draft.video.color_alias ?? draft.video.color_name}分析`
    : active?.status === 'in_progress'
      ? `${active.target_color_name}染发 · 第 ${active.current_step_no ?? 1}/${active.total_steps ?? 5} 步`
      : active
        ? '商品准备好了吗？'
        : '分析一个喜欢的发色';
  const description = draft
    ? '照片和已经确认的信息都还在，可以直接继续。'
    : active?.status === 'in_progress'
      ? '你的教程进度已经保存，从当前步骤继续即可。'
      : active
        ? `你的${active.target_color_name}染发方案正在等待开始。`
        : '看看能不能染成，以及需要准备什么。';
  const action = draft
    ? onResumeDraft
    : active
      ? () => onOpenArchive(active.archive_id)
      : onStart;
  const actionLabel = draft
    ? '继续分析'
    : active?.status === 'in_progress'
      ? `继续第 ${active.current_step_no ?? 1} 步`
      : active
        ? '查看准备清单'
        : '开始分析';

  return (
    <AppFrame title="做自己的 Tony" eyebrow="欢迎回来">
      <div className="px-5 pb-9 pt-8">
        <p className="text-[11px] font-black text-orange-dark">你的专属染发助手</p>
        <h1 className="mt-2 max-w-[10ch] text-[38px] font-black leading-[.96] tracking-[-.055em]">
          今天想从哪里继续？
        </h1>
        {loading ? (
          <Skeleton className="mt-7 h-56" />
        ) : (
          <section className="mt-7 border border-[#d5ae55] bg-[#fff6d9] p-5">
            <span className="grid size-12 place-items-center rounded-[48%] border border-ink bg-white">
              {active?.status === 'in_progress' ? <Play size={22} weight="fill" /> : <Clock size={22} weight="fill" />}
            </span>
            <h2 className="mt-5 text-2xl font-black leading-tight">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-2">{description}</p>
            <div className="mt-5">
              <PrimaryButton onClick={action}>{actionLabel}</PrimaryButton>
            </div>
            {draft ? (
              <button type="button" onClick={onStart} className="mt-3 w-full text-xs font-bold text-ink-3">
                重新开始
              </button>
            ) : null}
          </section>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onDiscover} className="sketch-card tap border bg-[#eaf6e9] p-4 text-left">
            <Sparkle size={22} weight="fill" />
            <p className="mt-4 text-sm font-black">发色灵感</p>
            <p className="mt-1 text-xs text-ink-3">浏览视频中的目标色</p>
          </button>
          <button type="button" onClick={onArchives} className="sketch-card tap border bg-[#f7f3ff] p-4 text-left">
            <FolderOpen size={22} weight="fill" />
            <p className="mt-4 text-sm font-black">我的档案</p>
            <p className="mt-1 text-xs text-ink-3">查看方案与教程进度</p>
          </button>
        </div>

        {!active && !draft ? (
          <div className="mt-5">
            <SecondaryButton onClick={onDiscover} icon={<ArrowRight size={17} weight="bold" />}>
              浏览发色灵感
            </SecondaryButton>
          </div>
        ) : null}
      </div>
    </AppFrame>
  );
}
