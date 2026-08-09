'use client';

import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowLeft,
  BellRinging,
  Camera,
  CaretRight,
  CaretUp,
  Check,
  CheckCircle,
  FolderOpen,
  ListBullets,
  Microphone,
  Pause,
  Play,
  Record,
  Repeat,
  ShareNetwork,
  SpeakerHigh,
  SpinnerGap,
  Star,
  Timer,
  VideoCamera,
  Warning,
} from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { API_MODE } from './api';
import { ArchiveReferenceView } from './archive-reference-view';
import type {
  AfterVideoTaskData,
  ArchiveDetailData,
  ArchiveSummary,
  CompletionRecord,
  HairProfileData,
  MockVideo,
  PlanResultData,
  PrimaryProduct,
  PurchaseStatus,
  StepEndTTS,
  TutorialAction,
  TutorialSessionData,
  TutorialStep,
} from './types';
import {
  AppFrame,
  BottomBar,
  ErrorState,
  DoodleIcon,
  LoadingGirl,
  MascotNote,
  MediaImage,
  NotebookCard,
  PageIntro,
  PrimaryButton,
  ScribbleUnderline,
  SecondaryButton,
  Sheet,
  Skeleton,
  StatusNotice,
  TapeLabel,
  cx,
} from './ui';

const lengthLabels: Record<string, string> = {
  ear: '齐耳短发',
  shoulder: '齐肩发',
  chest: '齐胸中长发',
  waist: '齐腰长发',
  below_waist: '腰部以下超长发',
};

const volumeLabels: Record<string, string> = {
  low: '少',
  medium: '适中',
  high: '多',
};

const historyLabels: Record<string, string> = {
  natural: '无漂染史的自然发',
  dyed_no_bleach: '染过未漂过',
  bleached_1_2: '漂过 1-2 次',
  bleached_3_plus: '漂过 3 次以上',
  dyed_black: '染过黑色',
  unknown: '不确定',
};

function formatDate(date: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  } catch {
    return date;
  }
}

function currentColorName(profile: HairProfileData) {
  return (
    profile.current_hair.color?.display_name ??
    profile.current_hair.regions?.end.color.display_name ??
    '待确认'
  );
}

function isFinishUtterance(text: string) {
  const normalized = text.replace(/\s+/g, '').toLowerCase();
  if (!normalized) return false;
  const finishWords = ['结束了', '结束染发', '完成染发', '染完了', '做完了', '完成了', '好了'];
  const questionMarks = ['吗', '么', '?', '？', '怎么', '为什么', '怎么办'];
  if (questionMarks.some((word) => normalized.includes(word)) && !normalized.includes('结束了')) {
    return false;
  }
  return finishWords.some((word) => normalized.includes(word));
}

export function ArchiveConfirmScreen({
  profile,
  plan,
  product,
  purchaseStatus,
  currentPhotoUrl,
  target,
  saving,
  error,
  onBack,
  onSave,
}: {
  profile: HairProfileData;
  plan: PlanResultData;
  product: PrimaryProduct;
  purchaseStatus: PurchaseStatus;
  currentPhotoUrl: string;
  target: MockVideo;
  saving: boolean;
  error: string;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <AppFrame title="确认并保存方案" eyebrow="保存到个人档案" onBack={onBack}>
      <PageIntro
        eyebrow="商品到手后再开始"
        title="先把这份方案安全保存"
        description="保存后不会自动进入教程。等你真正准备染发时，再从个人档案开始。"
      />
      <div className="px-5 pb-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[24px] border border-line bg-line shadow-soft">
            <MediaImage
              src={currentPhotoUrl}
              alt="当前头发"
              className="object-cover"
            />
            <span className="absolute bottom-3 left-3 rounded-full bg-ink/70 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-md">
              {currentColorName(profile)}
            </span>
          </div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-[24px] border border-line bg-line shadow-soft">
            <MediaImage
              src={target.target_frame_url}
              alt={`${profile.target_color.display_name}目标发色`}
              className="object-cover"
            />
            <span className="absolute bottom-3 left-3 rounded-full bg-orange px-2.5 py-1 text-[10px] font-bold text-white">
              {profile.target_color.display_name}
            </span>
          </div>
        </div>

        <section className="mt-4 overflow-hidden rounded-[24px] border border-line bg-white shadow-soft">
          <div className="divide-y divide-line">
            {[
              {
                label: '选择方案',
                value:
                  plan.route_cards.find(
                    (card) => card.route === product.product_type,
                  )?.title ?? (product.product_type === 'dye' ? '染色' : '固色'),
              },
              {
                label: '选中商品',
                value: `${product.brand} ${product.product_name} · ${product.shade_name}`,
              },
              {
                label: '建议数量',
                value: product.usage.units_label,
              },
              {
                label: '价格快照',
                value: `¥${product.price.unit_price}/盒 · 共 ¥${product.price.total_price}`,
              },
              {
                label: '准备状态',
                value:
                  purchaseStatus === 'saved'
                    ? '尚未购买'
                    : purchaseStatus === 'simulated'
                      ? '演示：模拟已购买'
                      : '已购买',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="grid grid-cols-[88px_1fr] gap-4 px-4 py-3.5"
              >
                <p className="text-xs font-bold text-ink-3">{item.label}</p>
                <p className="text-right text-xs font-black leading-5">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-[24px] border border-orange/25 bg-orange-soft/32 p-4">
          <div className="flex items-center gap-2">
            <Warning size={18} weight="fill" className="text-orange-dark" />
            <p className="text-sm font-black">保存前再看一眼风险</p>
          </div>
          <div className="mt-3 space-y-3">
            {plan.risks.slice(0, 2).map((risk) => (
              <div key={risk.title}>
                <p className="text-xs font-bold">{risk.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-ink-2">
                  {risk.suggestion}
                </p>
              </div>
            ))}
          </div>
        </section>

        {error ? (
          <div className="mt-4">
            <StatusNotice tone="danger" title="保存没有完成">
              {error}。页面中的选择都已保留，可以直接重试。
            </StatusNotice>
          </div>
        ) : null}
      </div>
      <BottomBar>
        <PrimaryButton
          onClick={onSave}
          disabled={saving}
          icon={
            saving ? (
              <SpinnerGap className="animate-spin" size={18} weight="bold" />
            ) : (
              <FolderOpen size={18} weight="fill" />
            )
          }
        >
          {saving ? '正在保存' : '保存到我的染发档案'}
        </PrimaryButton>
        <p className="mt-2 text-center text-[10px] leading-4 text-ink-3">
          等商品到手、准备染发时，再从档案开始教程。
        </p>
      </BottomBar>
    </AppFrame>
  );
}

export function ArchiveSavedScreen({
  targetName,
  onArchives,
  onBackToVideos,
}: {
  targetName: string;
  onArchives: () => void;
  onBackToVideos: () => void;
}) {
  return (
    <AppFrame title="保存成功">
      <div className="flex min-h-full flex-col justify-center px-6 pb-12">
        <div className="mx-auto grid size-24 place-items-center rounded-[32px] bg-sage/55 text-good shadow-card">
          <CheckCircle size={52} weight="fill" />
        </div>
        <p className="mt-7 text-center text-[11px] font-black uppercase tracking-[.18em] text-good">
          方案已保存
        </p>
        <h1 className="mx-auto mt-2 max-w-[10ch] text-center text-[36px] font-black leading-[.98] tracking-[-.05em]">
          {targetName}在档案里等你
        </h1>
        <p className="mx-auto mt-4 max-w-[34ch] text-center text-sm leading-6 text-ink-2">
          商品到手、时间合适的时候，再从个人档案进入分步骤教程。
        </p>
        <div className="mt-9 grid gap-2">
          <PrimaryButton onClick={onArchives}>查看我的档案</PrimaryButton>
          <SecondaryButton onClick={onBackToVideos}>返回视频</SecondaryButton>
        </div>
      </div>
    </AppFrame>
  );
}

function archiveStatus(summary: ArchiveSummary) {
  if (summary.status === 'completed') {
    return { label: '已完成', action: '查看记录', tone: 'bg-sage/50 text-good' };
  }
  if (summary.status === 'in_progress') {
    return {
      label: `教程进行中${summary.current_step_no ? ` · 第 ${summary.current_step_no} 步` : ''}`,
      action: `继续第 ${summary.current_step_no ?? 1} 步`,
      tone: 'bg-sky/45 text-ink',
    };
  }
  if (summary.purchase_status === 'saved') {
    return { label: '方案已保存', action: '查看方案', tone: 'bg-line text-ink-2' };
  }
  return { label: '已购买，待开始', action: '准备开始', tone: 'bg-orange-soft text-orange-dark' };
}

export function ArchivesScreen({
  archives,
  loading,
  error,
  onBack,
  onRetry,
  onSelect,
  onNew,
}: {
  archives: ArchiveSummary[];
  loading: boolean;
  error: string;
  onBack: () => void;
  onRetry: () => void;
  onSelect: (archiveId: string) => void;
  onNew: () => void;
}) {
  return (
    <AppFrame title="我的染发档案" eyebrow="随时回来继续" onBack={onBack}>
      <PageIntro
        eyebrow="个人染发档案"
        title="每一次选择，都有迹可循"
        description="方案、商品快照和教程进度都保存在这里。"
      />
      <div className="px-5 pb-8">
        {loading ? (
          <div className="grid gap-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : null}
        {error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : null}
        {!loading && !error && archives.length === 0 ? (
          <div className="rounded-[30px] border border-line bg-white p-7 text-center shadow-soft">
            <FolderOpen className="mx-auto text-ink-3" size={42} weight="duotone" />
            <h2 className="mt-5 text-xl font-black">还没有染发档案</h2>
            <p className="mt-2 text-sm leading-6 text-ink-2">
              从一条喜欢的发色视频开始，先判断是否适合，再保存方案。
            </p>
            <div className="mt-6">
              <PrimaryButton onClick={onNew}>去找喜欢的发色</PrimaryButton>
            </div>
          </div>
        ) : null}
        {!loading && archives.length ? (
          <div className="grid gap-3">
            {archives.map((archive, index) => {
              const status = archiveStatus(archive);
              return (
                <button
                  key={archive.archive_id}
                  type="button"
                  onClick={() => onSelect(archive.archive_id)}
                  className="tap animate-slideUp overflow-hidden rounded-[26px] border border-line bg-white text-left shadow-soft"
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <div className="grid grid-cols-[86px_1fr]">
                    <div
                      className="relative min-h-[138px]"
                      style={{
                        background:
                          'linear-gradient(145deg, #d2e0aa 0%, #abd7fb 55%, #fccEB4 100%)',
                      }}
                    >
                      <div className="absolute inset-0 grid place-items-center">
                        <span className="grid size-12 place-items-center rounded-full border-4 border-white/70 bg-ink text-xs font-black text-white shadow-card">
                          {archive.target_color_name.slice(0, 2)}
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cx('rounded-full px-2.5 py-1 text-[9px] font-bold', status.tone)}>
                          {status.label}
                        </span>
                        <span className="text-[10px] text-ink-3">
                          {formatDate(archive.created_at)}
                        </span>
                      </div>
                      <h2 className="mt-3 text-xl font-black tracking-tight">
                        {archive.target_color_name}
                      </h2>
                      <p className="mt-1 truncate text-xs text-ink-2">
                        {archive.product_name} · {archive.shade_name}
                      </p>
                      <span className="mt-4 flex items-center gap-1 text-xs font-black text-orange-dark">
                        {status.action}
                        <CaretRight size={14} weight="bold" />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </AppFrame>
  );
}

export function ArchiveDetailScreen({
  archive,
  loading,
  error,
  starting,
  tutorialError,
  onBack,
  onRetry,
  onStartTutorial,
}: {
  archive: ArchiveDetailData | null;
  loading: boolean;
  error: string;
  starting: boolean;
  tutorialError: string;
  onBack: () => void;
  onRetry: () => void;
  onStartTutorial: () => void;
}) {
  const preparationItems = [
    { label: '染发剂和建议数量已备齐', required: true },
    { label: '手套、围布和发夹已备齐', required: true },
    { label: '现在有足够时间完成全部步骤', required: true },
    { label: '穿上不怕弄脏的旧衣服', required: false },
    { label: '先在发际线涂一层凡士林', required: false },
  ];
  const [preparationOpen, setPreparationOpen] = useState(false);
  const [operationPreviewOpen, setOperationPreviewOpen] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(
    preparationItems.map(() => false),
  );
  const ready = preparationItems.every(
    (item, index) => !item.required || checked[index],
  );
  if (loading) {
    return (
      <AppFrame title="档案详情" onBack={onBack}>
        <div className="px-5 py-7">
          <Skeleton className="h-48" />
          <Skeleton className="mt-4 h-32" />
          <Skeleton className="mt-4 h-44" />
        </div>
      </AppFrame>
    );
  }
  if (error || !archive) {
    return (
      <AppFrame title="档案详情" onBack={onBack}>
        <ErrorState message={error || '档案不存在'} onRetry={onRetry} />
      </AppFrame>
    );
  }
  const currentColor =
    archive.profile_snapshot.current_hair.color?.display_name ??
    archive.profile_snapshot.current_hair.regions?.end.color.display_name ??
    '待确认';
  const operationDifficulty = Math.min(5, Math.max(1, archive.product_snapshot.usage.difficulty ?? 3));
  const operationMinutes = Math.max(55, (archive.product_snapshot.usage.waiting_minutes ?? 30) + 50);
  return (
    <AppFrame
      title="档案详情"
      eyebrow={formatDate(archive.created_at)}
      onBack={onBack}
      headerAction={
        <span className="whitespace-nowrap rounded-full border border-[#78a983] bg-[#eef8ed] px-2 py-1 text-[8px] font-black text-good">
          ☆ 已保存
        </span>
      }
    >
      <ArchiveReferenceView
        archive={archive}
        currentColor={currentColor}
        difficulty={operationDifficulty}
        minutes={operationMinutes}
      />
      <div className="hidden" aria-hidden="true">
      <div className="px-5 pb-6 pt-7">
        <div className="rounded-[30px] bg-ink p-5 text-white shadow-card">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/50">
            目标发色
          </p>
          <h1 className="mt-2 text-[34px] font-black tracking-[-.05em]">
            {archive.profile_snapshot.target_color.display_name}
          </h1>
          <p className="mt-2 max-w-[34ch] text-sm leading-6 text-white/70">
            从 {currentColor} 出发 · 可达度 {archive.plan_snapshot.reachability_score}/100
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            {[
              lengthLabels[archive.profile_snapshot.hair_length] ??
                archive.profile_snapshot.hair_length,
              volumeLabels[archive.profile_snapshot.hair_volume] ??
                archive.profile_snapshot.hair_volume,
              archive.plan_snapshot.selected_route === 'dye' ? '染色' : '固色',
            ].map((item) => (
              <div key={item} className="rounded-[14px] bg-white/9 px-2 py-3">
                <p className="text-[10px] font-bold text-white/78">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <section className="mt-4 rounded-[26px] border border-line bg-white p-4 shadow-soft">
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-ink-3">
            已选商品
          </p>
          <div className="mt-3 flex gap-4">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-[18px] bg-line">
              <MediaImage
                src={archive.product_snapshot.url}
                alt={archive.product_snapshot.product_name}
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-ink-3">
                {archive.product_snapshot.brand}
              </p>
              <h2 className="mt-1 text-lg font-black leading-tight">
                {archive.product_snapshot.product_name}
              </h2>
              <p className="mt-1 text-xs font-bold text-orange-dark">
                {archive.product_snapshot.shade_name}
              </p>
              <p className="numerals mt-2 text-sm font-black">
                ¥{archive.product_snapshot.price.total_price} ·{' '}
                {archive.product_snapshot.usage.units_label}
              </p>
            </div>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <section className="border border-pink bg-[#fff8f9] p-3 text-center">
            <p className="text-xs font-black text-pink-dark">操作难度</p>
            <div className="mt-2 flex justify-center gap-1">
              {Array.from({ length: 5 }, (_, index) => (
                <Star key={index} size={20} weight={index < operationDifficulty ? 'fill' : 'regular'} className={index < operationDifficulty ? 'text-pink-dark' : 'text-ink-3'} />
              ))}
            </div>
            <p className="mt-1 text-[10px] font-black">{operationDifficulty}/5 · 中等</p>
          </section>
          <section className="border border-[#8f7bd1] bg-[#fbf9ff] p-3 text-center">
            <p className="text-xs font-black text-[#6d5aaf]">预计耗时</p>
            <p className="numerals mt-2 text-xl font-black">约 {operationMinutes} 分钟</p>
            <p className="mt-1 text-[9px] text-ink-3">含准备、涂抹与等待</p>
          </section>
        </div>

        <section className="mt-4 overflow-hidden rounded-[26px] border border-line bg-white shadow-soft">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-black">确认信息</p>
          </div>
          <div className="divide-y divide-line">
            {[
              ['当前底色', currentColor],
              [
                '漂染历史',
                historyLabels[archive.profile_snapshot.dye_history] ??
                  archive.profile_snapshot.dye_history,
              ],
              ['预计维持', archive.product_snapshot.duration],
              ['购买状态', archive.purchase_status === 'saved' ? '尚未购买' : '已准备'],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 px-4 py-3.5"
              >
                <p className="text-xs font-bold text-ink-3">{label}</p>
                <p className="text-right text-xs font-black">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-[26px] border border-orange/25 bg-orange-soft/30 p-4">
          <p className="text-sm font-black">关键风险</p>
          <div className="mt-3 space-y-3">
            {archive.plan_snapshot.risks.map((risk) => (
              <div key={risk.title}>
                <p className="text-xs font-bold">{risk.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-ink-2">
                  {risk.suggestion}
                </p>
              </div>
            ))}
          </div>
        </section>

        {archive.completion_record ? (
          <section className="mt-4 rounded-[26px] border border-sage-dark/30 bg-sage/35 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle size={19} weight="fill" className="text-good" />
              <p className="text-sm font-black">这次染发已经完成</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-2">
              完成 {archive.completion_record.completed_steps} 个步骤，用时约{' '}
              {archive.completion_record.total_minutes} 分钟。
            </p>
          </section>
        ) : null}
      </div>
      </div>
      <BottomBar>
        {archive.completion_record ? (
          <SecondaryButton onClick={onStartTutorial}>查看教程记录</SecondaryButton>
        ) : (
          <div className="grid grid-cols-[.9fr_1.2fr] gap-2">
            <SecondaryButton onClick={() => setOperationPreviewOpen(true)}>
              <span className="whitespace-nowrap text-[13px]">查看操作预览</span>
            </SecondaryButton>
            <PrimaryButton onClick={() => setPreparationOpen(true)}>
              <span className="whitespace-nowrap text-[12px]">
                {archive.purchase_status === 'saved' ? '商品已到手，开始准备' : '开始准备'}
              </span>
            </PrimaryButton>
          </div>
        )}
      </BottomBar>
      <Sheet
        open={operationPreviewOpen}
        onClose={() => setOperationPreviewOpen(false)}
        title="操作预览"
        description={`预计 ${operationMinutes} 分钟 · 难度 ${operationDifficulty}/5`}
      >
        <div className="grid gap-3">
          {(archive.product_snapshot.usage.key_steps?.length
            ? archive.product_snapshot.usage.key_steps
            : ['准备与分区', '分区涂抹', '补涂发根', '等待与冲洗']
          ).slice(0, 5).map((step, index) => (
            <div key={`${step}-${index}`} className="flex items-center gap-3 rounded-[16px] border border-line bg-white p-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-pink text-xs font-black text-white">{String(index + 1).padStart(2, '0')}</span>
              <p className="text-sm font-black">{step}</p>
            </div>
          ))}
          <StatusNotice tone="warning">正式操作时请同时阅读商品说明，并先完成过敏测试。</StatusNotice>
        </div>
      </Sheet>
      <Sheet
        open={preparationOpen}
        onClose={() => setPreparationOpen(false)}
        title="染发前准备"
        description="必备物品确认完成后，就从第 1 步开始。"
      >
        {archive.purchase_status === 'saved' ? (
          <div className="mb-4">
            <StatusNotice tone="warning" title="商品还未标记为已购买">
              请确认商品已经到手再开始实际操作。
            </StatusNotice>
          </div>
        ) : null}
        <div className="overflow-hidden rounded-[22px] border border-line bg-white">
          {preparationItems.map((item, index) => (
            <button
              key={item.label}
              type="button"
              onClick={() =>
                setChecked((current) =>
                  current.map((value, currentIndex) =>
                    currentIndex === index ? !value : value,
                  ),
                )
              }
              className="tap flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left last:border-b-0"
            >
              <span
                className={cx(
                  'grid size-7 shrink-0 place-items-center rounded-[9px] border',
                  checked[index]
                    ? 'border-good bg-good text-white'
                    : 'border-line bg-cream text-transparent',
                )}
              >
                <Check size={15} weight="bold" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-bold">{item.label}</span>
              <span className="text-xs font-black text-ink-3">
                {item.required ? '必备' : '建议'}
              </span>
            </button>
          ))}
        </div>
        {tutorialError ? (
          <div className="mt-4">
            <StatusNotice tone="danger" title="教程没有启动">
              {tutorialError}
            </StatusNotice>
          </div>
        ) : null}
        <PrimaryButton
          className="mt-5"
          onClick={onStartTutorial}
          disabled={!ready || starting}
          icon={
            starting ? (
              <SpinnerGap className="animate-spin" size={18} weight="bold" />
            ) : (
              <Play size={18} weight="fill" />
            )
          }
        >
          {starting ? '正在准备教程' : '我准备好了，开始第 1 步'}
        </PrimaryButton>
        {!ready ? (
          <p className="mt-2 text-center text-xs text-ink-3">
            请先勾选 3 项必备准备
          </p>
        ) : null}
      </Sheet>
    </AppFrame>
  );
}

export function TutorialPrepareScreen({
  archive,
  starting,
  error,
  onBack,
  onStart,
}: {
  archive: ArchiveDetailData;
  starting: boolean;
  error: string;
  onBack: () => void;
  onStart: () => void;
}) {
  const checks = [
    '商品和建议数量已备齐',
    '手套、围布、发夹等辅助工具已备齐',
    '现在有足够时间完成全部步骤',
    '已经阅读本次方案的关键风险',
  ];
  const [checked, setChecked] = useState<boolean[]>(
    checks.map((_, index) => archive.purchase_status !== 'saved' && index === 0),
  );
  const ready = checked.every(Boolean);
  return (
    <AppFrame title="开始前准备" eyebrow="教程准备" onBack={onBack}>
      <PageIntro
        eyebrow="准备好再开始"
        title="先把需要的东西放到手边"
        description="教程会分步播放。每段结束后，你可以直接说“下一步”或向助手提问。"
      />
      <div className="px-5 pb-6">
        <div className="mb-4">
          <MascotNote
            title="先看清步骤，再动手"
            frame="/loading/03-reading.png"
            tone="sage"
          >
            视频会按章节循环播放；完成这一段后，再用语音或按钮进入下一步。
          </MascotNote>
        </div>
        {archive.purchase_status === 'saved' ? (
          <StatusNotice tone="warning" title="档案还没有标记已购买">
            请先确认商品已经到手。演示环境允许继续，但真实操作不要跳过。
          </StatusNotice>
        ) : null}
        <section className="mt-4 overflow-hidden rounded-[26px] border border-line bg-white shadow-soft">
          <div className="divide-y divide-line">
            {checks.map((item, index) => (
              <button
                key={item}
                type="button"
                onClick={() =>
                  setChecked((current) =>
                    current.map((value, currentIndex) =>
                      currentIndex === index ? !value : value,
                    ),
                  )
                }
                className="tap flex w-full items-center gap-3 px-4 py-4 text-left"
              >
                <span
                  className={cx(
                    'grid size-7 shrink-0 place-items-center rounded-[10px] border',
                    checked[index]
                      ? 'border-good bg-good text-white'
                      : 'border-line bg-cream text-transparent',
                  )}
                >
                  <Check size={15} weight="bold" />
                </span>
                <span className="text-sm font-bold leading-5">{item}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="mt-4 rounded-[24px] border border-line bg-white p-4 shadow-soft">
          <div className="flex gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[16px] bg-sky/40 text-ink">
              <Microphone size={21} weight="fill" />
            </span>
            <div>
              <p className="text-sm font-black">语音和按钮都能推进</p>
              <p className="mt-1 text-xs leading-5 text-ink-2">
                嘈杂环境下可以直接点击“下一步”，不会因为语音识别失败而卡住。
              </p>
            </div>
          </div>
        </div>
        {error ? (
          <div className="mt-4">
            <StatusNotice tone="danger" title="教程没有启动">
              {error}
            </StatusNotice>
          </div>
        ) : null}
      </div>
      <BottomBar>
        <PrimaryButton
          onClick={onStart}
          disabled={!ready || starting}
          icon={
            starting ? (
              <SpinnerGap className="animate-spin" size={18} weight="bold" />
            ) : (
              <Play size={18} weight="fill" />
            )
          }
        >
          {starting ? '正在准备教程' : '开始第 1 步'}
        </PrimaryButton>
        {!ready ? (
          <p className="mt-2 text-center text-[10px] text-ink-3">
            勾选全部准备事项后即可开始
          </p>
        ) : null}
      </BottomBar>
    </AppFrame>
  );
}

function speak(text: string) {
  return new Promise<void>((resolve) => {
    if (
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      !text
    ) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

async function playTTS(audioUrl: string | null | undefined, text: string) {
  if (!audioUrl) {
    await speak(text);
    return;
  }
  await new Promise<void>((resolve) => {
    const audio = new Audio(audioUrl);
    audio.onended = () => resolve();
    audio.onerror = () => {
      void speak(text).then(resolve);
    };
    void audio.play().catch(() => {
      void speak(text).then(resolve);
    });
  });
}

function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    0?: {
      transcript?: string;
    };
  }>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function browserSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

/** 把秒数格式化成 0:07 */
function mmss(sec: number) {
  const t = Math.max(0, Math.floor(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * 教程视频。视频是这一屏的绝对主角，所以控件全部做成浮层压在画面上，
 * 不额外占用垂直空间。
 *
 * 进度和跳转都相对【当前步骤的片段】，不是整条视频——用户的心智是
 * "这一步演到哪了"，不是"整个教程演到哪了"。
 */
function SegmentVideo({
  url,
  step,
  onSegmentEnd,
  replaySignal,
  chapterLabel,
  onChapter,
}: {
  url: string;
  step: TutorialStep;
  onSegmentEnd: () => void;
  replaySignal: number;
  /** 语义章节按钮，如「回到上色部分」。没有章节数据时不渲染 */
  chapterLabel?: string;
  onChapter?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [cur, setCur] = useState(0);

  const start = step.start_time_ms / 1000;
  const dur = Math.max(0.1, (step.end_time_ms - step.start_time_ms) / 1000);

  const playSegment = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setFailed(false);
    video.currentTime = start;
    setCur(0);
    void video.play().catch(() => undefined);
  }, [start]);

  useEffect(() => { playSegment(); }, [playSegment, replaySignal, step.step_id]);

  const seek = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(start + dur - 0.2, Math.max(start, video.currentTime + delta));
  };

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  const onTime = () => {
    const video = videoRef.current;
    if (!video) return;
    setCur(Math.min(dur, Math.max(0, video.currentTime - start)));
    if (video.currentTime * 1000 >= step.end_time_ms - 120) {
      video.pause();
      setPlaying(false);
      onSegmentEnd();
    }
  };

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-[18px] border-[1.6px] border-ink bg-ink">
      {failed ? (
        <div className="absolute inset-0 grid place-items-center p-5 text-center text-white">
          <div>
            <Warning className="mx-auto" size={26} weight="fill" />
            <p className="mt-3 text-sm font-black">这段视频没有加载出来</p>
            <p className="mt-1 text-[11px] leading-5 text-white/60">可以听下方讲解，或重新加载视频。</p>
            <button type="button" onClick={playSegment}
              className="tap mt-4 rounded-full bg-white px-4 py-2 text-xs font-bold text-ink">重新加载</button>
          </div>
        </div>
      ) : (
        <video
          ref={videoRef} src={url} playsInline preload="metadata"
          onLoadedMetadata={() => { setLoading(false); playSegment(); }}
          onCanPlay={() => setLoading(false)}
          onWaiting={() => setLoading(true)}
          onPlaying={() => { setLoading(false); setPlaying(true); }}
          onPause={() => setPlaying(false)}
          onTimeUpdate={onTime}
          onEnded={onTime}
          onError={() => { setLoading(false); setFailed(true); }}
          className="size-full object-cover"
        />
      )}

      {/* 轻点画面暂停/播放。控件很小，主要交互面是整块画面 */}
      {!failed && !loading ? (
        <button type="button" onClick={toggle} aria-label={playing ? '暂停' : '播放'}
          className="absolute inset-x-0 top-0 bottom-[86px]" />
      ) : null}

      {loading && !failed ? (
        <div className="absolute inset-0 grid place-items-center bg-ink/72">
          <SpinnerGap className="animate-spin text-white" size={26} weight="bold" />
        </div>
      ) : null}

      {!failed ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-8">
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggle} aria-label={playing ? '暂停' : '播放'}
              className="tap shrink-0 text-white">
              {playing ? <Pause size={17} weight="fill" /> : <Play size={17} weight="fill" />}
            </button>
            <div className="relative h-[3px] flex-1 rounded-full bg-white/30">
              <span className="absolute inset-y-0 left-0 rounded-full bg-pink"
                style={{ width: `${(cur / dur) * 100}%` }} />
              <span className="absolute top-1/2 size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                style={{ left: `${(cur / dur) * 100}%` }} />
            </div>
            <span className="numerals shrink-0 text-[11px] font-bold text-white/85">
              {mmss(cur)} / {mmss(dur)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => seek(-10)} aria-label="后退 10 秒"
                className="tap flex items-center gap-1 text-[11px] font-bold text-white">
                <ArrowCounterClockwise size={17} weight="bold" />10秒
              </button>
              <button type="button" onClick={toggle}
                className="tap grid size-9 place-items-center rounded-full bg-white text-ink">
                {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
              </button>
              <button type="button" onClick={() => seek(10)} aria-label="前进 10 秒"
                className="tap flex items-center gap-1 text-[11px] font-bold text-white">
                10秒<ArrowClockwise size={17} weight="bold" />
              </button>
            </div>
            {/* 语义章节跳转。用户说的是"退回上色部分"而不是"退回 40 秒"，
                所以按章节时间戳定位，不做机械倒退 */}
            {chapterLabel && onChapter ? (
              <button type="button" onClick={onChapter}
                className="tap flex items-center gap-1.5 rounded-full border border-white/35 px-3 py-1.5 text-[11px] font-bold text-white">
                <ListBullets size={14} weight="bold" />{chapterLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CountdownCard({
  seconds,
  onReady,
}: {
  seconds: number;
  onReady: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const endAtRef = useRef<number | null>(null);

  useEffect(() => {
    endAtRef.current = Date.now() + seconds * 1000;
    const sync = () => {
      const endAt = endAtRef.current ?? Date.now();
      setRemaining(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
    };
    const timer = window.setInterval(sync, 250);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [seconds]);

  useEffect(() => {
    if (remaining === 0) {
      if ('vibrate' in navigator) navigator.vibrate?.(120);
      speak('等待时间结束，可以继续了。');
    }
  }, [remaining]);

  return (
    <div className="sketch-card border border-[#d5ae55] bg-[#fff6d9] p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-[16px] bg-white text-ink shadow-soft">
          <Timer size={22} weight="fill" />
        </span>
        <div>
          <p className="text-xs font-bold text-ink-3">
            {remaining > 0 ? '演示等待中' : '可以继续了'}
          </p>
          <p className="numerals mt-0.5 text-2xl font-black">
            00:{String(remaining).padStart(2, '0')}
          </p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/70">
        <div
          className="h-full origin-left rounded-full bg-sky-dark transition-transform duration-300"
          style={{ transform: `scaleX(${remaining / seconds})` }}
        />
      </div>
      <button
        type="button"
        onClick={onReady}
        className="tap mt-4 min-h-11 w-full rounded-[15px] bg-white px-4 text-xs font-black text-ink shadow-soft"
      >
        {remaining > 0 ? '跳过演示倒计时' : '我准备好了，继续'}
      </button>
    </div>
  );
}

export function TutorialTimerStage({
  step,
  onBack,
  onContinue,
}: {
  step: TutorialStep;
  onBack: () => void;
  onContinue: () => void;
}) {
  const demoSeconds = 10;
  const [status, setStatus] = useState<'setup' | 'listening' | 'running' | 'done'>('setup');
  const [remaining, setRemaining] = useState(demoSeconds);
  const [heardText, setHeardText] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const alarmContextRef = useRef<AudioContext | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const alarmFiredRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognizedTimerIntentRef = useRef(false);

  useEffect(() => {
    void playTTS(null, '现在可以对 Tony 说，定一个十五分钟的闹钟。');
  }, []);

  const ring = useCallback(() => {
    const context = alarmContextRef.current;
    if (context) {
      void context.resume().then(() => {
        [0, 0.28, 0.56].forEach((offset) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(880, context.currentTime + offset);
          gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + 0.2);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(context.currentTime + offset);
          oscillator.stop(context.currentTime + offset + 0.22);
        });
      });
    }
    navigator.vibrate?.([160, 80, 160]);
    speak('时间到了，可以继续下一步了。');
  }, []);

  useEffect(() => {
    if (status !== 'running') return;
    const sync = () => {
      const deadline = deadlineRef.current;
      if (!deadline) return;
      const millisecondsLeft = deadline - Date.now();
      setRemaining(Math.max(0, Math.ceil(millisecondsLeft / 1000)));
      if (millisecondsLeft <= 0 && !alarmFiredRef.current) {
        alarmFiredRef.current = true;
        deadlineRef.current = null;
        setStatus('done');
        ring();
      }
    };
    sync();
    const timer = window.setInterval(sync, 100);
    return () => window.clearInterval(timer);
  }, [ring, status]);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      void alarmContextRef.current?.close().catch(() => undefined);
      alarmContextRef.current = null;
    },
    [],
  );

  const startTimer = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    if (!alarmContextRef.current) alarmContextRef.current = new AudioContext();
    alarmFiredRef.current = false;
    deadlineRef.current = Date.now() + demoSeconds * 1000;
    setRemaining(demoSeconds);
    setVoiceError('');
    setStatus('running');
    speak('好的，已经为你设置十五分钟闹钟。演示需要设计成十秒钟，我现在开始计时。');
  }, []);

  const startVoiceTimer = async () => {
    setVoiceError('');
    setHeardText('');
    recognizedTimerIntentRef.current = false;
    const Recognition = browserSpeechRecognition();
    if (!Recognition) {
      setHeardText('已收到，开始 10 秒演示计时');
      startTimer();
      return;
    }
    await playTTS(null, '请说，定一个十五分钟的闹钟。');
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join('')
        .trim();
      setHeardText(transcript || '已收到，开始 10 秒演示计时');
      recognizedTimerIntentRef.current = true;
      startTimer();
    };
    recognition.onerror = () => {
      setHeardText('已收到，开始 10 秒演示计时');
      recognizedTimerIntentRef.current = true;
      startTimer();
    };
    recognition.onend = () => {
      if (!recognizedTimerIntentRef.current) {
        setHeardText('已收到，开始 10 秒演示计时');
        recognizedTimerIntentRef.current = true;
        startTimer();
      }
    };
    setStatus('listening');
    recognition.start();
  };

  return (
    <AppFrame
      title="定时等待"
      eyebrow={`第 ${step.step_no} 步 / 共 ${step.total_steps} 步`}
      onBack={onBack}
      progress={{ current: step.step_no, total: step.total_steps, label: '染发教程' }}
    >
      <div className="flex min-h-full flex-col px-4 pb-5 pt-5">
        <div className="relative text-center">
          <Star className="absolute right-5 top-0 rotate-12 text-[#8f7bd1]" size={30} weight="duotone" />
          <p className="text-xs font-black tracking-[.14em] text-pink-dark">等待显色 · 语音定时</p>
          <h1 className="mt-2 text-[28px] font-black">帮你记住等待时间</h1>
          <p className="mt-2 text-xs leading-5 text-ink-2">
            染膏停留期间不用一直看时间，Tony 会在到点时提醒你。
          </p>
        </div>

        <section className="mt-5 border border-[#8f7bd1] bg-[#f7f3ff] p-4">
          <span className="inline-flex -rotate-1 items-center gap-2 rounded-[9px] bg-[#ded3f7] px-3 py-1 text-xs font-black text-[#6554a0]">
            <Microphone size={16} weight="fill" /> 直接对 Tony 说
          </span>
          <div className="mt-4 rounded-[20px] border-2 border-[#8f7bd1] bg-white px-4 py-5 text-center">
            <p className="text-[11px] text-ink-3">试着说：</p>
            <p className="mt-1 text-xl font-black">“定一个15分钟的闹钟”</p>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-pink-dark" aria-hidden="true">
            {[12, 22, 15, 30, 18, 26, 12, 20, 14].map((height, index) => (
              <span key={`${height}-${index}`} className="w-1 rounded-full bg-current" style={{ height }} />
            ))}
            <Microphone size={25} weight="fill" className="mx-2 text-[#765fc4]" />
            {[14, 24, 18, 31, 16, 26, 12, 22, 13].map((height, index) => (
              <span key={`${height}-${index}`} className="w-1 rounded-full bg-current" style={{ height }} />
            ))}
          </div>
        </section>

        <section className="mt-4 flex flex-1 flex-col items-center justify-center border border-[#e5aa28] bg-[#fff9e3] p-5 text-center">
          <div className="relative grid size-40 place-items-center rounded-full border-[3px] border-ink bg-white shadow-[4px_5px_0_#f0c35d]">
            <Timer size={45} weight="duotone" className="absolute top-5 text-[#d69b16]" />
            <p className="numerals mt-10 text-[48px] font-black leading-none">
              00:{String(status === 'setup' ? demoSeconds : remaining).padStart(2, '0')}
            </p>
            {status === 'done' ? (
              <span className="absolute -right-3 top-2 grid size-12 animate-bounce place-items-center rounded-full border-2 border-ink bg-pink text-white">
                <BellRinging size={25} weight="fill" />
              </span>
            ) : null}
          </div>
          <h2 className="mt-5 text-xl font-black">
            {status === 'setup'
              ? '等待你设置闹钟'
              : status === 'listening'
                ? '正在听你说'
              : status === 'running'
                ? '闹钟倒计时中'
                : '时间到了！'}
          </h2>
          <p className="mt-2 text-xs text-ink-2">
            {status === 'setup'
              ? '点击下方按钮后说一句话即可。演示倒计时设计为 10 秒。'
              : status === 'listening'
                ? '正在接收语音，识别结束后会直接开始 10 秒演示计时。'
              : status === 'running'
                ? '可以锁屏或去做别的事，到点我会响铃。'
                : '请回来检查显色情况，然后继续下一步。'}
          </p>
          {heardText ? (
            <p className="mt-2 text-[11px] font-black text-[#6d5aaf]">
              你说：{heardText}
            </p>
          ) : null}
          {voiceError ? (
            <p className="mt-2 text-[11px] font-bold text-red-900">
              {voiceError}
            </p>
          ) : null}
          {status === 'setup' ? (
            <PrimaryButton className="mt-5" onClick={() => void startVoiceTimer()} icon={<Microphone size={18} weight="fill" />}>
              开始语音设置
            </PrimaryButton>
          ) : null}
          {status === 'listening' ? (
            <PrimaryButton className="mt-5" onClick={startTimer} icon={<Timer size={18} weight="fill" />}>
              直接开始 10 秒计时
            </PrimaryButton>
          ) : null}
        </section>
      </div>
      <BottomBar>
        <div className="grid grid-cols-[.8fr_1.2fr] gap-2">
          <SecondaryButton onClick={onBack}>返回教程</SecondaryButton>
          <PrimaryButton onClick={onContinue}>
            {status === 'done' ? '时间到了，继续' : '直接继续下一步'}
          </PrimaryButton>
        </div>
      </BottomBar>
    </AppFrame>
  );
}

export function TutorialScreen({
  session,
  offline,
  onBack,
  onSend,
  onNextStep,
  onSessionStep,
  onComplete,
}: {
  session: TutorialSessionData;
  offline: boolean;
  onBack: () => void;
  onSend: (audio: File) => Promise<TutorialAction>;
  onNextStep: () => Promise<TutorialAction>;
  onSessionStep: (step: TutorialStep, stepEndTTS?: StepEndTTS) => void;
  onComplete: (qaSummary: string[]) => Promise<void> | void;
}) {
  const [phase, setPhase] = useState<
    'video' | 'prompting' | 'waiting' | 'listening' | 'thinking' | 'answering'
  >(() => (session.awaiting_voice_input ? 'waiting' : 'video'));
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('');
  const [nextPrompt, setNextPrompt] = useState('');
  const [error, setError] = useState('');
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [replaySignal, setReplaySignal] = useState(0);
  const [countdownDone, setCountdownDone] = useState(false);
  const [timerPageOpen, setTimerPageOpen] = useState(false);
  const [finishConfirm, setFinishConfirm] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const monitorFrameRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);
  const voiceRequestInFlightRef = useRef(false);
  const lastHandledVoiceRef = useRef<{ transcript: string; at: number }>({
    transcript: '',
    at: 0,
  });
  const lastSilencePromptAtRef = useRef(0);
  const qaRef = useRef<string[]>([]);
  const step = session.current_step;
  const isListening = phase === 'listening';
  const isThinking = phase === 'thinking';
  const isAnswering = phase === 'answering';
  const voiceStatusText =
    isListening
      ? voiceLevel > 0.16
        ? '正在听你说'
        : '等你开口'
      : isThinking
        ? transcript
          ? '听到了，正在思考'
          : '已收到，正在理解'
        : isAnswering
          ? '正在回答'
          : phase === 'prompting'
            ? '正在播放提示'
            : '等待你的问题';
  const assistantSubtitle =
    answer ||
    session.step_end_tts?.text ||
    `先看视频完成“${step.title}”。${step.description}`;

  const cleanupAudioInput = useCallback(() => {
    if (monitorFrameRef.current !== null) {
      window.cancelAnimationFrame(monitorFrameRef.current);
      monitorFrameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  const cancelRecording = useCallback(() => {
    discardRecordingRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    cleanupAudioInput();
  }, [cleanupAudioInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      cancelRecording();
      setPhase(session.awaiting_voice_input ? 'waiting' : 'video');
      setTranscript('');
      setAnswer('');
      setNextPrompt('');
      setError('');
      setVoiceLevel(0);
      setCountdownDone(false);
      setTimerPageOpen(false);
      stopSpeaking();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cancelRecording, session.awaiting_voice_input, step.step_id]);

  useEffect(
    () => () => {
      cancelRecording();
      stopSpeaking();
    },
    [cancelRecording],
  );

  const handleAudio = async (audio: File) => {
    if (voiceRequestInFlightRef.current) return;
    if (offline) {
      setError('当前网络不可用，请恢复网络后重新说一次。');
      setPhase('waiting');
      return;
    }
    voiceRequestInFlightRef.current = true;
    setError('');
    setPhase('thinking');
    setVoiceLevel(0);
    try {
      const action = await onSend(audio);
      const heard = action.asr_transcript?.trim() ?? '';
      const now = Date.now();
      if (
        heard &&
        heard === lastHandledVoiceRef.current.transcript &&
        now - lastHandledVoiceRef.current.at < 4500
      ) {
        setPhase('waiting');
        window.setTimeout(() => {
          void startListening();
        }, 400);
        return;
      }
      if (heard) {
        lastHandledVoiceRef.current = { transcript: heard, at: now };
      }
      setTranscript(heard);
      if (step.step_no === step.total_steps && isFinishUtterance(heard)) {
        await playTTS(
          action.action === 'capture_after_photo' ? action.tts_audio_url : null,
          action.action === 'capture_after_photo'
            ? action.tts_text
          : '好的，本次染发教程已结束。现在为你生成完成记录。',
        );
        await onComplete(qaRef.current);
      } else if (action.action === 'answer') {
        setAnswer(action.tts_text);
        setNextPrompt(action.next_prompt);
        if (heard) qaRef.current.push(`${heard}：${action.tts_text}`);
        setPhase('answering');
        await playTTS(action.tts_audio_url, action.tts_text);
        resumeListening();
      } else if (action.action === 'play_next_step') {
        setAnswer('');
        setNextPrompt('');
        setPhase('video');
        onSessionStep(action.current_step, action.step_end_tts);
      } else if (action.action === 'replay_current_step') {
        onSessionStep(action.current_step);
        setAnswer(action.tts_text);
        setPhase('video');
        setReplaySignal((value) => value + 1);
        await playTTS(action.tts_audio_url, action.tts_text);
      } else if (action.action === 'capture_after_photo') {
        await playTTS(action.tts_audio_url, action.tts_text);
        await onComplete(qaRef.current);
      } else if (action.action === 'silence') {
        setAnswer(action.tts_text);
        setPhase('waiting');
        const now = Date.now();
        if (now - lastSilencePromptAtRef.current > 9000) {
          lastSilencePromptAtRef.current = now;
          await playTTS(action.tts_audio_url, action.tts_text);
        }
        resumeListening();
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '没有听清，请再试一次');
      setPhase('waiting');
    } finally {
      voiceRequestInFlightRef.current = false;
    }
  };

  const handleManualNext = async () => {
    if (voiceRequestInFlightRef.current) return;
    if (offline) {
      setError('当前网络不可用，请恢复网络后再进入下一步。');
      setPhase('waiting');
      return;
    }
    voiceRequestInFlightRef.current = true;
    setError('');
    setAnswer('');
    setNextPrompt('');
    setVoiceLevel(0);
    setPhase('thinking');
    try {
      const action = await onNextStep();
      if (action.action === 'play_next_step') {
        setPhase('video');
        onSessionStep(action.current_step, action.step_end_tts);
      } else if (action.action === 'capture_after_photo') {
        await playTTS(action.tts_audio_url, action.tts_text);
        await onComplete(qaRef.current);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '进入下一步失败，请再试一次');
      setPhase('waiting');
    } finally {
      voiceRequestInFlightRef.current = false;
    }
  };

  const startListening = async () => {
    if (recorderRef.current?.state === 'recording') return;
    if (offline) {
      setError('当前网络不可用，暂时无法上传语音。');
      setPhase('waiting');
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setError('当前浏览器不支持录音，请换用最新版 Chrome 或 Safari。');
      setPhase('waiting');
      return;
    }
    cancelRecording();
    discardRecordingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const discarded = discardRecordingRef.current;
        const resolvedType = recorder.mimeType || mimeType || 'audio/webm';
        cleanupAudioInput();
        setVoiceLevel(0);
        if (discarded) return;
        const blob = new Blob(chunks, { type: resolvedType });
        if (blob.size < 900) {
          setError('我没有听清，你靠近一点再说一次。');
          setPhase('waiting');
          return;
        }
        const extension = resolvedType.includes('mp4') ? 'm4a' : 'webm';
        const file = new File(
          [blob],
          `voice-${window.crypto.randomUUID()}.${extension}`,
          { type: resolvedType },
        );
        void handleAudio(file);
      };

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const startedAt = audioContext.currentTime * 1000;
      let speechStarted = false;
      let lastVoiceAt = startedAt;
      let voiceBeganAt = 0;
      let lastLevelUpdateAt = startedAt;
      const monitor = () => {
        if (recorder.state === 'inactive') return;
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const value of samples) {
          const normalized = (value - 128) / 128;
          energy += normalized * normalized;
        }
        const volume = Math.sqrt(energy / samples.length);
        const now = audioContext.currentTime * 1000;
        if (now - lastLevelUpdateAt > 80) {
          lastLevelUpdateAt = now;
          setVoiceLevel(Math.min(1, volume / 0.12));
        }
        if (volume > 0.035) {
          if (!speechStarted) {
            voiceBeganAt = now;
          }
          speechStarted = true;
          lastVoiceAt = now;
        }
        const enoughSpeech = speechStarted && now - voiceBeganAt >= 450;
        const silentAfterSpeech = speechStarted && now - lastVoiceAt >= 1500;
        const noSpeechTimeout = !speechStarted && now - startedAt >= 5000;
        const hardTimeout = now - startedAt >= 15000;
        if (noSpeechTimeout || (hardTimeout && !speechStarted)) {
          discardRecordingRef.current = true;
          recorder.stop();
          window.setTimeout(() => {
            void startListening();
          }, 250);
          return;
        }
        if ((silentAfterSpeech && enoughSpeech) || hardTimeout) {
          recorder.stop();
          return;
        }
        monitorFrameRef.current = window.requestAnimationFrame(monitor);
      };

      setTranscript('');
      setAnswer('');
      setNextPrompt('');
      setError('');
      setVoiceLevel(0);
      setPhase('listening');
      recorder.start(250);
      monitorFrameRef.current = window.requestAnimationFrame(monitor);
    } catch {
      cleanupAudioInput();
      setError('无法使用麦克风。请允许录音权限后，点击“重新聆听”。');
      setPhase('waiting');
    }
  };

  const resumeListening = () => {
    if (offline) {
      setError('当前网络不可用，问题会保留，请恢复网络后重试。');
      setPhase('waiting');
      return;
    }
    if (API_MODE === 'mock') {
      setPhase('listening');
      return;
    }
    window.setTimeout(() => {
      void startListening();
    }, 0);
  };

  const segmentEnded = () => {
    if (step.wait_seconds && !countdownDone) {
      setPhase('waiting');
      setTimerPageOpen(true);
      return;
    }
    const prompt = session.step_end_tts ?? {
      text: '你在这一步有什么问题，可以随时问我～',
      audio_url: null,
    };
    setPhase('prompting');
    void playTTS(prompt.audio_url, prompt.text).then(resumeListening);
  };

  const sendMockCommand = (
    command: 'question' | 'next' | 'finish',
  ) => {
    const name =
      command === 'next'
        ? 'command-next.webm'
        : command === 'finish'
          ? 'command-finish.webm'
          : 'mock-question.webm';
    void handleAudio(new File([new Uint8Array([0])], name, { type: 'audio/webm' }));
  };

  if (timerPageOpen) {
    return (
      <TutorialTimerStage
        step={step}
        onBack={() => setTimerPageOpen(false)}
        onContinue={() => {
          setCountdownDone(true);
          setTimerPageOpen(false);
          setPhase('waiting');
        }}
      />
    );
  }

  return (
    <AppFrame fullBleed className="overflow-hidden">
      <div className="flex h-full min-h-0 flex-col">
        <header className="relative shrink-0 border-b border-ink/20 bg-cream px-4 pb-1.5 pt-2">
          <div className="grid grid-cols-[40px_1fr_40px] items-center">
            <button
              type="button"
              onClick={onBack}
              className="sketch-icon-button tap grid size-9 place-items-center bg-white"
              aria-label="返回上一页"
            >
              <ArrowLeft size={20} weight="bold" />
            </button>
            <div className="text-center">
              <p className="text-[11px] font-black tracking-[.14em] text-pink-dark">
                第 {step.step_no} 步 / 共 {step.total_steps} 步
              </p>
              <h1 className="mt-0.5 text-[20px] font-black leading-none">{step.title}</h1>
            </div>
            <Star className="justify-self-end rotate-12 text-[#8f7bd1]" size={29} weight="duotone" />
          </div>
          <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-2">
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${step.total_steps}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: step.total_steps }, (_, index) => (
                <span
                  key={index}
                  className={cx(
                    'h-1.5 border border-ink',
                    index < step.step_no ? 'bg-pink' : 'bg-white',
                  )}
                />
              ))}
            </div>
            <span className="numerals text-[11px] font-black">
              {step.step_no}/{step.total_steps}
            </span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-1 pt-2">
        {offline ? (
          <p className="mb-1 border border-[#e5aa28] bg-[#fff9e3] px-2 py-1 text-[8px] font-bold">
            当前离线：视频可继续播放，语音问答将在网络恢复后重试。
          </p>
        ) : null}
        <div
          className={cx(
            'grid h-[296px] shrink-0 grid-cols-[auto_1fr] items-stretch gap-0',
          )}
        >
          <div className="relative h-full min-h-0 aspect-[9/16] overflow-hidden">
            <div className="h-full overflow-hidden border-2 border-ink">
              <SegmentVideo
                url={session.tutorial_video.url}
                step={step}
                onSegmentEnd={segmentEnded}
                replaySignal={replaySignal}
              />
            </div>
          </div>
          <NotebookCard tone="yellow" className="h-full overflow-hidden p-2 pt-5">
            <span className="absolute -left-2 top-5 flex flex-col gap-5" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((item) => <span key={item} className="h-2.5 w-4 rounded-full border-2 border-ink bg-cream" />)}
            </span>
            <DoodleIcon kind="heart" className="absolute right-2 top-5 rotate-12" size={16} />
            <h1 className="text-sm font-black">
              <ScribbleUnderline>{step.title}</ScribbleUnderline>
            </h1>
            <p className="mt-2 text-[9px] font-bold leading-3.5">{step.description}</p>
            {step.points?.length ? (
              <ul className="mt-2 space-y-1 border-t border-dashed border-line pt-2">
                {step.points.slice(0, 3).map((point) => (
                  <li key={point} className="flex gap-1 text-[8px] font-bold leading-3">
                    <span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-sage text-white"><Check size={9} weight="bold" /></span>
                    {point}
                  </li>
                ))}
              </ul>
            ) : null}
            {step.caution ? <p className="mt-1 text-[7px] font-bold leading-3 text-[#b36f00]">⚠ {step.caution}</p> : null}
            <DoodleIcon tone="yellow" className="absolute bottom-2 right-2 rotate-12" size={17} />
          </NotebookCard>
        </div>

        {phase !== 'video' && step.wait_seconds && !countdownDone ? (
          <div className="mt-2">
            <CountdownCard
              seconds={step.wait_seconds}
              onReady={() => setCountdownDone(true)}
            />
          </div>
        ) : null}

        <section className="relative mt-2 min-h-[72px] shrink-0 border-[1.6px] border-[#8f7bd1] bg-[#f6f2ff] px-3 pb-1 pt-4">
          <TapeLabel tone="lavender" className="absolute -left-1 -top-2 !px-3 !py-1 text-[10px]">
            小助手正在说 <SpeakerHigh className="ml-1 inline" size={14} weight="fill" />
          </TapeLabel>
          <DoodleIcon kind="sparkle" tone="lavender" className="absolute right-2 top-2" size={15} />
          <p className="text-[16px] font-black leading-[1.3] text-ink-2">
            {assistantSubtitle}
          </p>
          {transcript ? (
            <p className="mt-1 text-right text-[8px] font-bold text-[#6d5aaf]">
              你说：{transcript}
            </p>
          ) : null}
          {nextPrompt ? <p className="mt-1 text-[8px] text-ink-3">{nextPrompt}</p> : null}
          {error ? <p className="mt-1 text-[8px] font-bold text-red-900">{error}</p> : null}
        </section>

        {API_MODE === 'mock' ? (
              <div className="mt-2 grid shrink-0 grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => sendMockCommand('next')}
                  disabled={phase === 'thinking'}
                  className="tap relative min-h-10 rounded-[12px] border-[1.5px] border-[#78a983] bg-[#eff8ec] px-3 text-left text-[9px]"
                >
                  <span>直接说：</span>
                  <span className="ml-2 text-[9px] font-black">下一步</span>
                  <DoodleIcon kind="sparkle" tone="mint" className="absolute bottom-1 right-1" size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => sendMockCommand('question')}
                  disabled={phase === 'thinking'}
                  className="tap relative min-h-10 rounded-[12px] border-[1.5px] border-pink bg-[#fff1f5] px-3 text-left text-[9px]"
                >
                  <span>试着问：</span>
                  <span className="ml-1 text-[8px] font-black">染膏量不够会怎样？</span>
                  <DoodleIcon kind="heart" className="absolute right-1 top-1" size={13} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void startListening()}
                  disabled={
                  phase === 'listening' ||
                  phase === 'thinking' ||
                  phase === 'prompting'
                }
                className="tap mt-2 flex min-h-9 w-full items-center justify-center gap-2 rounded-[48%_52%_46%_54%] border-2 border-ink bg-orange text-xs font-black text-ink disabled:opacity-40"
              >
                <Microphone size={18} weight="fill" />
                {phase === 'listening' ? '正在听你说…' : '重新开始聆听'}
              </button>
            )}

        <div className="flex h-9 shrink-0 items-center justify-center gap-2">
          <div
            className={cx(
              'flex h-7 min-w-[118px] items-center justify-center gap-1 rounded-full border border-[#cabdf2] bg-white/65 px-2 text-[#765fc4]',
              isListening ? 'shadow-[0_0_0_3px_rgba(255,126,38,.12)]' : '',
            )}
            aria-hidden="true"
          >
            {[0.35, 0.62, 0.92, 0.55, 0.78, 0.48].map((weight, index) => {
              const activeHeight = 5 + Math.round(voiceLevel * weight * 17);
              const idleHeight = [5, 8, 12, 7, 10, 6][index];
              const height = isListening ? activeHeight : idleHeight;
              return (
                <span
                  key={`voice-${weight}-${index}`}
                  className={cx(
                    'w-1 rounded-full bg-current transition-[height,opacity] duration-100',
                    isThinking || isAnswering ? 'animate-pulse opacity-80' : 'opacity-100',
                  )}
                  style={{
                    height,
                    transitionDelay: isListening ? `${index * 18}ms` : '0ms',
                  }}
                />
              );
            })}
            {isThinking ? (
              <SpinnerGap size={16} weight="bold" className="ml-1 animate-spin text-orange" />
            ) : (
              <Microphone
                size={16}
                weight="fill"
                className={cx('ml-1', isListening ? 'text-orange' : 'text-[#765fc4]')}
              />
            )}
          </div>
          <p className="text-[9px] font-black text-[#6d5aaf]">
            {voiceStatusText}
          </p>
        </div>
        </div>

      <BottomBar className="!pb-1 !pt-1">
        <div className="grid grid-cols-[.8fr_1.35fr] gap-2 [&_.candy-btn]:!min-h-8 [&_.candy-btn]:!text-xs">
          <SecondaryButton
            onClick={() => {
              setReplaySignal((value) => value + 1);
              setPhase('video');
              setAnswer('');
            }}
            icon={<Repeat size={17} weight="bold" />}
          >
            <span className="whitespace-nowrap text-[13px]">重播本步</span>
          </SecondaryButton>
          {step.step_no === step.total_steps ? (
            <PrimaryButton
              onClick={() => setFinishConfirm(true)}
              icon={<CheckCircle size={18} weight="fill" />}
            >
              完成染发
            </PrimaryButton>
          ) : (
            <PrimaryButton
              onClick={() => {
                void handleManualNext();
              }}
            >
              下一步
            </PrimaryButton>
          )}
        </div>
      </BottomBar>
      </div>

      <Sheet
        open={finishConfirm}
        title="确认已经完成全部步骤吗？"
        description="确认后会生成本次染发的文字档案。染后拍照和转场视频是可选功能。"
        onClose={() => setFinishConfirm(false)}
      >
        <div className="grid gap-2">
          <PrimaryButton
            onClick={() => {
              setFinishConfirm(false);
              if (API_MODE === 'mock') {
                sendMockCommand('finish');
              } else {
                void playTTS(null, '好的，本次染发教程已结束。现在为你生成完成记录。').then(() =>
                  onComplete(qaRef.current),
                );
              }
            }}
            icon={<CheckCircle size={18} weight="fill" />}
          >
            确认完成
          </PrimaryButton>
          <SecondaryButton onClick={() => setFinishConfirm(false)}>
            继续检查这一步
          </SecondaryButton>
        </div>
      </Sheet>
    </AppFrame>
  );
}

export function CompletionScreen({
  archive,
  record,
  saved,
  onSave,
  onArchives,
  onTransitionVideo,
}: {
  archive: ArchiveDetailData;
  record: CompletionRecord;
  saved: boolean;
  onSave: () => void;
  onArchives: () => void;
  onTransitionVideo: () => void;
}) {
  return (
    <AppFrame title="本次染发完成" eyebrow="完成记录">
      <PageIntro
        eyebrow="你的染发档案"
        title="这次操作已经整理好了"
        description="先保存文字记录。拍染后照片和生成转场视频完全由你决定。"
      />
      <div className="px-5 pb-6">
        <div className="mb-4">
          <MascotNote
            title="完成记录已经生成"
            frame="/loading/05-blowdry.png"
            tone="peach"
          >
            方案、商品、步骤和问答会合并进个人档案，下次判断底色时可以继续参考。
          </MascotNote>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[22px] bg-ink p-4 text-white">
            <p className="text-[10px] text-white/50">目标发色</p>
            <p className="mt-2 text-xl font-black">
              {archive.profile_snapshot.target_color.display_name}
            </p>
          </div>
          <div className="rounded-[22px] bg-sage/45 p-4 text-ink">
            <p className="text-[10px] text-ink-3">总耗时</p>
            <p className="numerals mt-2 text-xl font-black">
              约 {record.total_minutes} 分钟
            </p>
          </div>
        </div>

        <section className="mt-4 rounded-[26px] border border-line bg-white p-4 shadow-soft">
          <p className="text-sm font-black">本次使用</p>
          <div className="mt-3 grid grid-cols-[72px_1fr] gap-3">
            <div className="relative aspect-square overflow-hidden rounded-[16px] bg-line">
              <MediaImage
                src={archive.product_snapshot.url}
                alt={archive.product_snapshot.product_name}
                className="object-cover"
              />
            </div>
            <div className="py-1">
              <p className="text-xs font-bold text-ink-3">
                {archive.product_snapshot.brand}
              </p>
              <p className="mt-1 text-base font-black">
                {archive.product_snapshot.product_name}
              </p>
              <p className="mt-1 text-xs text-orange-dark">
                {archive.product_snapshot.shade_name} ·{' '}
                {archive.product_snapshot.usage.units_label}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[26px] border border-line bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black">步骤完成情况</p>
            <span className="rounded-full bg-sage/45 px-2.5 py-1 text-[10px] font-bold text-good">
              {record.completed_steps}/{record.total_steps}
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-good"
              style={{
                width: `${(record.completed_steps / record.total_steps) * 100}%`,
              }}
            />
          </div>
        </section>

        <section className="mt-4 rounded-[26px] border border-line bg-white p-4 shadow-soft">
          <p className="text-sm font-black">问答摘要</p>
          {record.qa_summary.length ? (
            <ul className="mt-3 space-y-2">
              {record.qa_summary.map((item) => (
                <li key={item} className="flex gap-2 text-xs leading-5 text-ink-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-dark" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs leading-5 text-ink-3">
              本次没有保存需要特别回顾的问答。
            </p>
          )}
        </section>

        <section className="mt-4 rounded-[26px] border border-orange/25 bg-orange-soft/30 p-4">
          <p className="text-sm font-black">后续注意</p>
          <ul className="mt-3 space-y-2">
            {record.care_notes.map((note) => (
              <li key={note} className="flex gap-2 text-xs leading-5 text-ink-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
                {note}
              </li>
            ))}
          </ul>
        </section>

        {saved ? (
          <div className="mt-4">
            <StatusNotice tone="success" title="完成记录已保存">
              你可以留在这里查看，也可以回到个人档案。
            </StatusNotice>
          </div>
        ) : null}
      </div>

      <BottomBar>
        <div className="grid gap-2">
          {!saved ? (
            <PrimaryButton onClick={onSave} icon={<FolderOpen size={18} weight="fill" />}>
              保存完成记录
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={onArchives}>返回个人档案</PrimaryButton>
          )}
          <SecondaryButton
            onClick={onTransitionVideo}
            icon={<VideoCamera size={18} weight="fill" />}
          >
            生成我的染发转场视频
          </SecondaryButton>
        </div>
      </BottomBar>
    </AppFrame>
  );
}

type AfterCaptureStage = 'intro' | 'live' | 'review';

export function AfterPhotoScreen({
  onBack,
  onUse,
}: {
  onBack: () => void;
  onUse: (file: File, previewUrl: string) => Promise<void>;
}) {
  const [stage, setStage] = useState<AfterCaptureStage>('intro');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const open = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setStage('live');
      window.requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setError('无法打开摄像头。转场视频是可选功能，你可以返回完成页。');
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    // 与预览一致地镜像存图，理由同 CameraScreen.capture
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.88),
    );
    if (!blob) return;
    const nextFile = new File([blob], `after-hair-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });
    setFile(nextFile);
    setPreview(URL.createObjectURL(blob));
    stop();
    setStage('review');
  };

  return (
    <AppFrame title="生成染发转场视频" eyebrow="可选创作功能" onBack={onBack}>
      {stage === 'intro' ? (
        <>
          <PageIntro
            eyebrow="完全可选"
            title="拍一张现在的头发"
            description="系统会使用你的染前照片和染后照片生成转场视频。生成失败也不会影响你的完成记录。"
          />
          <div className="px-5">
            <div className="rounded-[28px] border border-line bg-white p-5 shadow-soft">
              <span className="grid size-14 place-items-center rounded-[20px] bg-sky/40 text-ink">
                <VideoCamera size={27} weight="fill" />
              </span>
              <h2 className="mt-5 text-xl font-black">现场拍摄一张染后照片</h2>
              <p className="mt-2 text-sm leading-6 text-ink-2">
                可以重拍，确认使用后才会上传。不会强制保存完整对话或语音。
              </p>
            </div>
            {error ? (
              <div className="mt-4">
                <StatusNotice tone="danger">{error}</StatusNotice>
              </div>
            ) : null}
          </div>
          <BottomBar>
            <PrimaryButton onClick={() => void open()} icon={<Camera size={18} weight="fill" />}>
              打开相机
            </PrimaryButton>
          </BottomBar>
        </>
      ) : null}

      {stage === 'live' ? (
        <div className="relative min-h-full bg-ink">
          {/* 与拍照页、试色屏保持一致：原始帧未镜像，翻一次才等于照镜子 */}
          <video
            ref={videoRef}
            muted
            playsInline
            className="absolute inset-0 size-full scale-x-[-1] object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 bg-gradient-to-b from-ink/20 via-transparent to-ink/70" />
          <div className="absolute inset-[12%_12%_20%] rounded-[40%] border-2 border-dashed border-white/80" />
          <button
            type="button"
            onClick={() => void capture()}
            className="tap absolute bottom-[max(28px,env(safe-area-inset-bottom))] left-1/2 grid size-20 -translate-x-1/2 place-items-center rounded-full border-[5px] border-white bg-white/25"
            aria-label="拍摄染后照片"
          >
            <span className="size-14 rounded-full bg-white" />
          </button>
        </div>
      ) : null}

      {stage === 'review' ? (
        <>
          <PageIntro
            eyebrow="染后照片确认"
            title="用这张生成转场视频吗？"
            description="确认后会上传并创建生成任务。"
          />
          <div className="px-5">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[30px] bg-line shadow-card">
              {preview ? (
                <MediaImage src={preview} alt="染后照片" className="object-cover" />
              ) : null}
              {submitting ? (
                <div className="absolute inset-0 grid place-items-center bg-cream/82 backdrop-blur-md">
                  <LoadingGirl size={110} label="正在上传照片" />
                </div>
              ) : null}
            </div>
            {error ? (
              <div className="mt-4">
                <StatusNotice tone="danger">{error}</StatusNotice>
              </div>
            ) : null}
          </div>
          <BottomBar>
            <div className="grid grid-cols-[.8fr_1.4fr] gap-2">
              <SecondaryButton
                onClick={() => {
                  if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
                  setPreview('');
                  setFile(null);
                  void open();
                }}
                disabled={submitting}
              >
                重拍
              </SecondaryButton>
              <PrimaryButton
                disabled={!file || submitting}
                onClick={() => {
                  if (!file) return;
                  setSubmitting(true);
                  setError('');
                  void onUse(file, preview).catch((submitError) => {
                    setError(
                      submitError instanceof Error
                        ? submitError.message
                        : '上传失败，请重试',
                    );
                    setSubmitting(false);
                  });
                }}
                icon={
                  submitting ? (
                    <SpinnerGap className="animate-spin" size={18} weight="bold" />
                  ) : (
                    <Check size={18} weight="bold" />
                  )
                }
              >
                {submitting ? '正在提交' : '确认使用'}
              </PrimaryButton>
            </div>
          </BottomBar>
        </>
      ) : null}
    </AppFrame>
  );
}

export function AfterVideoScreen({
  task,
  onBack,
  onRetry,
}: {
  task: AfterVideoTaskData;
  onBack: () => void;
  onRetry: () => void;
}) {
  if (task.status === 'generating') {
    return (
      <AppFrame
        title="生成染发转场视频"
        eyebrow="可以离开，任务会保留"
        onBack={onBack}
      >
        <div className="flex min-h-full flex-col justify-center px-6 pb-12">
          <LoadingGirl size={150} label={task.message} />
          <div className="mx-auto mt-8 w-full max-w-[320px]">
            <div className="flex items-center justify-between text-xs font-bold text-ink-3">
              <span>生成进度</span>
              <span className="numerals">{task.progress_percent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-orange transition-[width] duration-500"
                style={{ width: `${task.progress_percent}%` }}
              />
            </div>
            <p className="mt-4 text-center text-xs leading-5 text-ink-3">
              生成失败不会影响已经保存的教程完成记录。
            </p>
          </div>
        </div>
      </AppFrame>
    );
  }

  if (task.status === 'failed') {
    return (
      <AppFrame title="生成染发转场视频" onBack={onBack}>
        <ErrorState
          title="这次视频没有生成出来"
          message={task.fallback_message}
          onRetry={onRetry}
          secondary={<SecondaryButton onClick={onBack}>返回完成页</SecondaryButton>}
        />
      </AppFrame>
    );
  }

  return (
    <AppFrame title="你的染发转场视频" eyebrow="生成完成" onBack={onBack}>
      <div className="px-5 pb-6 pt-7">
        <div className="relative aspect-[9/16] overflow-hidden rounded-[30px] bg-ink shadow-card">
          <video
            src={task.url}
            poster={task.cover_url}
            controls
            autoPlay
            loop
            playsInline
            className="size-full object-cover"
          />
        </div>
        <div className="mt-4 grid gap-2">
          <PrimaryButton
            onClick={() => {
              if (navigator.share) {
                void navigator.share({
                  title: '我的染发转场视频',
                  text: '这是我的染发转场记录',
                  url: window.location.href,
                });
              }
            }}
            icon={<ShareNetwork size={18} weight="fill" />}
          >
            分享视频
          </PrimaryButton>
          <SecondaryButton
            onClick={onRetry}
            icon={<ArrowClockwise size={18} weight="bold" />}
          >
            重新生成
          </SecondaryButton>
        </div>
      </div>
    </AppFrame>
  );
}
