'use client';

import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle,
  Clock,
  CurrencyCny,
  Drop,
  FolderOpen,
  MagicWand,
  Pause,
  PencilSimple,
  Play,
  Scales,
  ShieldCheck,
  ShoppingBagOpen,
  Sparkle,
  SpinnerGap,
  Star,
} from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CURRENT_COLOR_OPTIONS,
  CURRENT_GOLD,
  TARGET_META,
} from './mock-data';
import type {
  Budget,
  FlowDraft,
  HairColor,
  HairProfileData,
  HairProfileUpdate,
  MockVideo,
  OtherProduct,
  PlanResultData,
  PrimaryProduct,
  ProductRecommendationData,
  PurchaseStatus,
  RouteType,
} from './types';
import {
  AppFrame,
  BottomBar,
  ChoiceList,
  ErrorState,
  LoadingGirl,
  MediaImage,
  PageIntro,
  PrimaryButton,
  SecondaryButton,
  Sheet,
  Skeleton,
  StatusNotice,
  cx,
} from './ui';

function videoTargetMeta(video: MockVideo) {
  const key = Object.keys(TARGET_META).find((item) =>
    video.video_id.includes(item),
  );
  return TARGET_META[key ?? 'blue'];
}

const DEMO_CURRENT_COLORS: Record<string, HairColor> = {
  blue: {
    tone: 'purple',
    level: 8,
    saturation: 'medium',
    display_name: '紫色',
    confidence: 0.96,
  },
  red: {
    tone: 'yellow',
    level: 8,
    saturation: 'medium',
    display_name: '金色',
    confidence: 0.96,
  },
  purple: {
    tone: 'red',
    level: 7,
    saturation: 'medium',
    display_name: '红色',
    confidence: 0.96,
  },
  pink: {
    tone: 'yellow',
    level: 8,
    saturation: 'medium',
    display_name: '金色',
    confidence: 0.96,
  },
  cold_tea: {
    tone: 'brown',
    level: 6,
    saturation: 'medium',
    display_name: '棕色',
    confidence: 0.96,
  },
  cold_brown: {
    tone: 'brown',
    level: 6,
    saturation: 'medium',
    display_name: '棕色',
    confidence: 0.96,
  },
};

function demoCurrentColorForTarget(targetColor: HairColor) {
  const targetName = targetColor.display_name;
  if (targetName.includes('蓝')) return DEMO_CURRENT_COLORS.blue;
  if (targetName.includes('红')) return DEMO_CURRENT_COLORS.red;
  if (targetName.includes('紫')) return DEMO_CURRENT_COLORS.purple;
  if (targetName.includes('粉')) return DEMO_CURRENT_COLORS.pink;
  if (targetName.includes('茶')) return DEMO_CURRENT_COLORS.cold_tea;
  if (targetName.includes('棕')) return DEMO_CURRENT_COLORS.cold_brown;
  return CURRENT_GOLD;
}

export function DiscoveryScreen({
  videos,
  loading,
  error,
  draft,
  onRetry,
  onStart,
  onOpenArchives,
  onResumeDraft,
}: {
  videos: MockVideo[];
  loading: boolean;
  error: string;
  draft: FlowDraft | null;
  onRetry: () => void;
  onStart: (video: MockVideo) => void;
  onOpenArchives: () => void;
  onResumeDraft: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [entryVisible, setEntryVisible] = useState(false);
  const [entryCardOpen, setEntryCardOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const active = videos[activeIndex];
  const targetMeta = active ? videoTargetMeta(active) : TARGET_META.blue;

  useEffect(() => {
    if (!active) return;
    const resetTimer = window.setTimeout(() => {
      setEntryVisible(false);
      setEntryCardOpen(false);
      setPaused(false);
      setVideoFailed(false);
    }, 0);
    const entryTimer = window.setTimeout(
      () => setEntryVisible(true),
      active.trigger_time_ms,
    );
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(entryTimer);
    };
  }, [active]);

  const toggleVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => undefined);
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
  };

  if (loading) {
    return (
      <AppFrame fullBleed>
        <div className="grid min-h-[100dvh] place-items-center bg-[#211c19] text-white">
          <div className="w-full px-5">
            <Skeleton className="h-[68dvh] w-full bg-white/10" />
            <Skeleton className="mt-5 h-5 w-1/3 bg-white/10" />
            <Skeleton className="mt-3 h-12 w-4/5 bg-white/10" />
          </div>
        </div>
      </AppFrame>
    );
  }

  if (error || !active) {
    return (
      <AppFrame title="视频灵感">
        <ErrorState
          title="视频暂时没有加载出来"
          message={error || '没有可用的染发视频，请稍后再试。'}
          onRetry={onRetry}
        />
      </AppFrame>
    );
  }

  return (
    <AppFrame fullBleed>
      <div className="relative min-h-[100dvh] overflow-hidden bg-[#211c19] text-white">
        {videoFailed ? (
          <div className="absolute inset-0">
            <MediaImage
              src={active.cover_url}
              alt={`${active.color_name}视频封面`}
              className="object-cover"
              priority
              style={{ filter: targetMeta.filter }}
            />
          </div>
        ) : (
          <video
            key={active.video_id}
            ref={videoRef}
            src={active.url}
            poster={active.cover_url}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setVideoFailed(true)}
            className="absolute inset-0 size-full object-cover"
            style={{ filter: targetMeta.filter }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#211c19]/45 via-transparent to-[#211c19]/95" />

        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-[max(18px,env(safe-area-inset-top))]">
          <div className="rounded-full border border-white/15 bg-[#211c19]/35 px-3 py-1.5 text-xs font-bold backdrop-blur-md">
            染发灵感
          </div>
          <button
            type="button"
            onClick={onOpenArchives}
            className="tap flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-[#211c19]/35 px-3 text-xs font-bold backdrop-blur-md"
          >
            <FolderOpen size={17} weight="bold" />
            我的档案
          </button>
        </div>

        <button
          type="button"
          onClick={toggleVideo}
          className="absolute inset-0 z-[1] grid place-items-center"
          aria-label={paused ? '继续播放' : '暂停视频'}
        >
          {paused ? (
            <span className="grid size-16 place-items-center rounded-full border border-white/20 bg-[#211c19]/45 backdrop-blur-md">
              <Play size={27} weight="fill" />
            </span>
          ) : null}
        </button>

        <div className="absolute bottom-32 right-3 z-[5] flex flex-col gap-3">
          <button
            type="button"
            onClick={toggleVideo}
            className="grid size-12 place-items-center rounded-full border border-white/15 bg-[#211c19]/38 backdrop-blur-md"
            aria-label={paused ? '播放' : '暂停'}
          >
            {paused ? (
              <Play size={20} weight="fill" />
            ) : (
              <Pause size={20} weight="fill" />
            )}
          </button>
          {entryVisible ? (
            <button
              type="button"
              onClick={() => setEntryCardOpen(true)}
              className="animate-bounce-in flex min-h-12 items-center gap-2 rounded-full border border-white/25 bg-white px-4 text-xs font-black text-[#211c19] shadow-[0_12px_28px_rgba(0,0,0,.25)]"
            >
              <MagicWand size={18} weight="fill" color={targetMeta.accent} />
              染同款
            </button>
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] px-4 pb-[max(20px,env(safe-area-inset-bottom))] pr-20">
          <p className="text-sm font-bold">@莓发实验室</p>
          <h1 className="mt-2 max-w-[10ch] text-[34px] font-black leading-[.94] tracking-[-.05em]">
            今天想试试
            <span className="block" style={{ color: active.accent ?? targetMeta.accent }}>
              {active.color_alias ?? active.color_name}
            </span>
          </h1>
          <p className="mt-3 max-w-[29ch] text-sm leading-5 text-white/78">
            拍一下你现在的头发，先看看这个颜色适不适合你。
          </p>
        </div>

        <div className="absolute bottom-5 left-4 z-[4] hidden">
          <span>{active.title}</span>
        </div>

        <div className="absolute left-4 top-20 z-[4] flex max-w-[calc(100%-2rem)] gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {videos.map((video, index) => (
            <button
              key={video.video_id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={cx(
                'tap shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold backdrop-blur-md',
                index === activeIndex
                  ? 'border-white bg-white text-[#211c19]'
                  : 'border-white/18 bg-[#211c19]/35 text-white',
              )}
            >
              {video.color_alias ?? video.color_name}
            </button>
          ))}
        </div>

        {draft ? (
          <button
            type="button"
            onClick={onResumeDraft}
            className="absolute left-4 top-32 z-[4] flex max-w-[260px] items-center gap-3 rounded-[18px] border border-white/15 bg-[#211c19]/48 p-3 text-left backdrop-blur-xl"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[#211c19]">
              <Clock size={18} weight="bold" />
            </span>
            <span>
              <span className="block text-xs font-black">继续上次分析</span>
              <span className="mt-0.5 block text-[10px] text-white/65">
                {draft.video.color_alias ?? draft.video.color_name}
              </span>
            </span>
            <ArrowRight className="ml-auto" size={15} weight="bold" />
          </button>
        ) : null}

        <Sheet
          open={entryCardOpen}
          title={`试试 ${active.color_alias ?? active.color_name}`}
          description="不用先懂染发知识，我们先帮你判断能否做到。"
          onClose={() => setEntryCardOpen(false)}
        >
          <div className="grid grid-cols-[104px_1fr] gap-4">
            <div className="relative aspect-[3/4] overflow-hidden rounded-[20px] bg-line">
              <MediaImage
                src={active.target_frame_url}
                alt={`${active.color_name}参考帧`}
                className="object-cover"
                style={{ filter: targetMeta.filter }}
              />
            </div>
            <div className="flex flex-col justify-between py-1">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[.14em] text-orange-dark">
                  目标发色
                </p>
                <p className="mt-1 text-2xl font-black tracking-tight">
                  {active.color_alias ?? active.color_name}
                </p>
                <p className="mt-2 text-xs leading-5 text-ink-2">
                  下一步只需现场拍一张当前头发，识别结果还可以修改。
                </p>
              </div>
              <div
                className="mt-3 h-2 rounded-full"
                style={{ backgroundColor: active.accent ?? targetMeta.accent }}
              />
            </div>
          </div>
          <div className="mt-5 grid gap-2">
            <PrimaryButton onClick={() => onStart(active)}>开始分析</PrimaryButton>
            <SecondaryButton onClick={() => setEntryCardOpen(false)}>
              稍后再说
            </SecondaryButton>
          </div>
        </Sheet>
      </div>
    </AppFrame>
  );
}

type CameraStage = 'intro' | 'live' | 'review';

export function CameraScreen({
  target,
  onBack,
  onUsePhoto,
}: {
  target: MockVideo;
  onBack: () => void;
  onUsePhoto: (file: File, previewUrl: string) => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stage, setStage] = useState<CameraStage>('intro');
  const [preview, setPreview] = useState('');
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const openCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1080 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setStage('live');
      window.requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      setCameraError(
        name === 'NotAllowedError'
          ? '摄像头权限没有开启。请在浏览器或系统设置中允许使用摄像头，再回来重试。'
          : '当前设备无法调用摄像头。MVP 仅支持现场拍摄，不能从相册选择。',
      );
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.88),
    );
    if (!blob) return;
    const file = new File([blob], `current-hair-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });
    const url = URL.createObjectURL(blob);
    stopCamera();
    setCapturedFile(file);
    setPreview(url);
    setStage('review');
  };

  const retake = () => {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    setPreview('');
    setCapturedFile(null);
    setSubmitError('');
    void openCamera();
  };

  const submit = async () => {
    if (!capturedFile || !preview) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await onUsePhoto(capturedFile, preview);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '照片提交失败，请重试');
      setSubmitting(false);
    }
  };

  return (
    <AppFrame
      title="拍摄当前发色"
      eyebrow="分析发色"
      onBack={() => {
        stopCamera();
        onBack();
      }}
      progress={{ current: 1, total: 4, label: '准备照片' }}
    >
      {stage === 'intro' ? (
        <>
          <PageIntro
            eyebrow="只需一张现场照片"
            title="让头发成为画面主角"
            description="我们只用这张照片判断当前底色。识别结果会在下一步交给你确认。"
          />
          <div className="px-5">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[30px] border border-line bg-[#d9c2b1] shadow-card">
              <MediaImage
                src={target.target_frame_url}
                alt="拍摄构图参考"
                className="object-cover opacity-65"
                priority
              />
              <div className="absolute inset-[12%_14%] rounded-[42%_42%_34%_34%] border-2 border-dashed border-white/90" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent p-5 pt-16 text-white">
                <p className="text-sm font-black">拍摄小提示</p>
                <ul className="mt-2 space-y-1.5 text-xs leading-5 text-white/80">
                  <li>在自然光或明亮室内拍摄</li>
                  <li>避免强逆光，让头发占画面主要区域</li>
                  <li>只支持现在拍摄，不支持从相册选择</li>
                </ul>
              </div>
            </div>
            {cameraError ? (
              <div className="mt-4">
                <StatusNotice tone="danger" title="无法打开摄像头">
                  {cameraError}
                </StatusNotice>
              </div>
            ) : null}
          </div>
          <BottomBar>
            <PrimaryButton onClick={() => void openCamera()} icon={<Camera size={19} weight="fill" />}>
              打开相机
            </PrimaryButton>
          </BottomBar>
        </>
      ) : null}

      {stage === 'live' ? (
        <div className="relative min-h-[calc(100dvh-98px)] bg-[#211c19]">
          <video
            ref={videoRef}
            muted
            playsInline
            className="absolute inset-0 size-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#211c19]/35 via-transparent to-[#211c19]/70" />
          <div className="absolute inset-[12%_10%_18%] rounded-[42%_42%_34%_34%] border-2 border-dashed border-white/80" />
          <div className="absolute inset-x-0 top-4 px-5">
            <div className="flex items-center gap-3 rounded-[18px] border border-white/15 bg-[#211c19]/42 p-3 text-white backdrop-blur-md">
              <div className="relative size-11 shrink-0 overflow-hidden rounded-[12px]">
                <MediaImage
                  src={target.target_frame_url}
                  alt={`${target.color_name}目标参考`}
                  className="object-cover"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold text-white/60">正在分析</p>
                <p className="text-sm font-black">{target.color_alias ?? target.color_name}</p>
              </div>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-[max(28px,env(safe-area-inset-bottom))]">
            <p className="mb-4 rounded-full bg-[#211c19]/42 px-4 py-2 text-xs font-bold text-white backdrop-blur-md">
              让头发进入参考框，保持手机稳定
            </p>
            <button
              type="button"
              onClick={() => void capture()}
              className="tap grid size-20 place-items-center rounded-full border-[5px] border-white bg-white/25 shadow-[0_10px_34px_rgba(0,0,0,.22)]"
              aria-label="拍照"
            >
              <span className="size-14 rounded-full bg-white" />
            </button>
          </div>
        </div>
      ) : null}

      {stage === 'review' ? (
        <>
          <PageIntro
            eyebrow="照片确认"
            title="这张照片够清楚吗？"
            description="确认后会分析当前发色、发长和发量，你仍可在下一步修改。"
          />
          <div className="px-5">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[30px] border border-line bg-line shadow-card">
              {preview ? (
                <MediaImage
                  src={preview}
                  alt="刚刚拍摄的当前头发"
                  className="object-cover"
                />
              ) : null}
              {submitting ? (
                <div className="absolute inset-0 grid place-items-center bg-cream/82 backdrop-blur-md">
                  <LoadingGirl size={104} label="正在上传并准备识别" />
                </div>
              ) : null}
            </div>
            {submitError ? (
              <div className="mt-4">
                <StatusNotice tone="danger" title="提交失败">
                  {submitError}。照片已经保留，不需要重拍。
                </StatusNotice>
              </div>
            ) : null}
          </div>
          <BottomBar>
            <div className="grid grid-cols-[.8fr_1.4fr] gap-2">
              <SecondaryButton onClick={retake} disabled={submitting}>
                重拍
              </SecondaryButton>
              <PrimaryButton
                onClick={() => void submit()}
                disabled={submitting}
                icon={
                  submitting ? (
                    <SpinnerGap className="animate-spin" size={18} weight="bold" />
                  ) : (
                    <Check size={18} weight="bold" />
                  )
                }
              >
                {submitting ? '正在提交' : '使用这张'}
              </PrimaryButton>
            </div>
          </BottomBar>
        </>
      ) : null}
    </AppFrame>
  );
}

type ProfileField =
  | 'hair_length'
  | 'hair_volume'
  | 'dye_history'
  | 'target_color'
  | 'single_color'
  | 'root_color'
  | 'mid_color'
  | 'end_color'
  | null;

function optionLabel(
  profile: HairProfileData,
  field: 'hair_length' | 'hair_volume' | 'dye_history',
  value: string,
) {
  return profile.editable_options[field].find((item) => item.value === value)?.label ?? value;
}

function currentDisplayColor(profile: HairProfileData) {
  return (
    profile.current_hair.color ??
    profile.current_hair.regions?.end.color ??
    CURRENT_COLOR_FALLBACK
  );
}

const CURRENT_COLOR_FALLBACK: HairColor = {
  tone: 'unknown',
  level: 0,
  saturation: 'medium',
  display_name: '待确认',
};

function cleanColor(color: HairColor) {
  const { confidence, ...confirmed } = color;
  void confidence;
  return confirmed;
}

export function ProfileScreen({
  initialProfile,
  currentPhotoUrl,
  target,
  onBack,
  onConfirm,
}: {
  initialProfile: HairProfileData;
  currentPhotoUrl: string;
  target: MockVideo;
  onBack: () => void;
  onConfirm: (update: HairProfileUpdate) => Promise<void>;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [manualFields, setManualFields] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ProfileField>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const currentColor = currentDisplayColor(profile);
  const targetConfidence =
    profile.attribute_confidences?.target_color ??
    profile.target_color.confidence ??
    1;
  const currentConfidence =
    profile.attribute_confidences?.current_color ??
    currentColor.confidence ??
    1;
  const lowConfidence = Math.min(targetConfidence, currentConfidence) < 0.8;

  const markManual = (field: string) => {
    setManualFields((current) => new Set(current).add(field));
  };

  const updateSimple = (
    field: 'hair_length' | 'hair_volume' | 'dye_history',
    value: string,
  ) => {
    setProfile((current) => ({ ...current, [field]: value }));
    markManual(field);
    setEditing(null);
  };

  const colorOptionsFor = (field: ProfileField) => {
    if (field === 'target_color') {
      return profile.target_color_options ?? [profile.target_color];
    }
    if (field === 'single_color') {
      return profile.current_hair.color_options ?? [profile.current_hair.color!];
    }
    const regionKey =
      field === 'root_color' ? 'root' : field === 'mid_color' ? 'mid' : 'end';
    const region = profile.current_hair.regions?.[regionKey];
    return region?.color_options ?? (region ? [region.color] : []);
  };

  const selectedColorFor = (field: ProfileField) => {
    if (field === 'target_color') return profile.target_color;
    if (field === 'single_color') return profile.current_hair.color;
    const regionKey =
      field === 'root_color' ? 'root' : field === 'mid_color' ? 'mid' : 'end';
    return profile.current_hair.regions?.[regionKey].color;
  };

  const updateColor = (field: ProfileField, color: HairColor) => {
    if (!field) return;
    setProfile((current) => {
      if (field === 'target_color') {
        return {
          ...current,
          target_color: color,
        };
      }
      if (field === 'single_color') {
        return {
          ...current,
          current_hair: {
            ...current.current_hair,
            color,
          },
        };
      }
      const regionKey =
        field === 'root_color' ? 'root' : field === 'mid_color' ? 'mid' : 'end';
      if (!current.current_hair.regions) return current;
      return {
        ...current,
        current_hair: {
          ...current.current_hair,
          regions: {
            ...current.current_hair.regions,
            [regionKey]: {
              ...current.current_hair.regions[regionKey],
              color,
            },
          },
        },
      };
    });
    markManual(field);
    setEditing(null);
  };

  const applyDemoProfile = () => {
    const demoColor = demoCurrentColorForTarget(profile.target_color);
    setProfile((current) => ({
      ...current,
      status: 'need_confirm',
      vision_error: undefined,
      current_hair: {
        region_mode: 'single',
        color: demoColor,
        color_options: [
          demoColor,
          ...CURRENT_COLOR_OPTIONS.filter(
            (option) => option.display_name !== demoColor.display_name,
          ),
        ],
      },
      hair_length: 'chest',
      hair_volume: 'medium',
      dye_history: 'dyed_no_bleach',
      attribute_confidences: {
        ...current.attribute_confidences,
        hair_length: 0.96,
        hair_volume: 0.96,
        dye_history: 0.96,
        current_color: 0.96,
      },
    }));
    setManualFields(
      new Set([
        'single_color',
        'hair_length',
        'hair_volume',
        'dye_history',
      ]),
    );
    setEditing(null);
    setError('');
  };

  const submit = async () => {
    setSubmitting(true);
    setError('');
    const currentHair =
      profile.current_hair.region_mode === 'single'
        ? {
            ...profile.current_hair,
            color: cleanColor(profile.current_hair.color!),
          }
        : {
            ...profile.current_hair,
            regions: {
              root: {
                color: cleanColor(profile.current_hair.regions!.root.color),
              },
              mid: {
                color: cleanColor(profile.current_hair.regions!.mid.color),
              },
              end: {
                color: cleanColor(profile.current_hair.regions!.end.color),
              },
            },
          };
    try {
      await onConfirm({
        target_color: cleanColor(profile.target_color),
        current_hair: currentHair,
        hair_length: profile.hair_length,
        hair_volume: profile.hair_volume,
        dye_history: profile.dye_history,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '确认失败，请重试');
      setSubmitting(false);
    }
  };

  const fieldRows = [
    {
      key: 'hair_length' as const,
      title: '发长',
      value: optionLabel(profile, 'hair_length', profile.hair_length),
      confidence: profile.attribute_confidences?.hair_length,
    },
    {
      key: 'hair_volume' as const,
      title: '发量',
      value: optionLabel(profile, 'hair_volume', profile.hair_volume),
      confidence: profile.attribute_confidences?.hair_volume,
    },
    {
      key: 'dye_history' as const,
      title: '漂染历史',
      value: optionLabel(profile, 'dye_history', profile.dye_history),
      confidence: profile.attribute_confidences?.dye_history,
    },
  ];

  return (
    <AppFrame
      title="确认识别结果"
      eyebrow="分析发色"
      onBack={onBack}
      progress={{ current: 2, total: 4, label: '确认信息' }}
    >
      <PageIntro
        eyebrow="AI 先填，你来确认"
        title="这些信息和你实际情况一致吗？"
        description="所有识别结果都能修改，最终方案会以你确认的内容为准。"
      />
      <div className="px-5 pb-5">
        {profile.status === 'failed' ? (
          <StatusNotice tone="warning" title="多模态识别没有成功">
            当前结果不是多模态模型的完整识别，请手动确认发色、目标色、发长、发量和漂染历史。
            {profile.vision_error ? ` 错误信息：${profile.vision_error}` : ''}
          </StatusNotice>
        ) : null}
        {lowConfidence ? (
          <div className={cx(profile.status === 'failed' && 'mt-3')}>
            <StatusNotice tone="warning" title="有一项需要重点确认">
              发尾区域的光线让颜色不太确定，请确认是否接近 {currentColor.display_name}。
            </StatusNotice>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <article className="overflow-hidden rounded-[24px] border border-line bg-white shadow-soft">
            <div className="relative aspect-[4/3] bg-line">
              <MediaImage
                src={currentPhotoUrl}
                alt="当前头发照片"
                className="object-cover"
              />
            </div>
            <div className="p-3">
              <p className="text-[10px] font-black uppercase tracking-[.14em] text-ink-3">
                你现在的发色
              </p>
              <p className="mt-1 text-sm font-black">{currentColor.display_name}</p>
              <p className="mt-1 text-xs text-ink-2">{currentColor.level} 度底色</p>
            </div>
          </article>
          <button
            type="button"
            onClick={() => setEditing('target_color')}
            className={cx(
              'tap overflow-hidden rounded-[24px] border bg-white text-left shadow-soft',
              targetConfidence < 0.8 ? 'border-red-300' : 'border-line',
            )}
          >
            <div className="relative aspect-[4/3] bg-line">
              <MediaImage
                src={target.target_frame_url}
                alt="目标发色参考"
                className="object-cover"
                style={{ filter: videoTargetMeta(target).filter }}
              />
            </div>
            <div className="p-3">
              <p className="text-[10px] font-black uppercase tracking-[.14em] text-ink-3">
                想染的目标色
              </p>
              <p className="mt-1 text-sm font-black">{profile.target_color.display_name}</p>
              <p className="mt-1 text-xs text-ink-2">{profile.target_color.level} 度目标</p>
              {targetConfidence < 0.8 ? (
                <p className="mt-2 text-[10px] font-bold text-red-700">
                  识别把握较低，点此确认
                </p>
              ) : null}
            </div>
          </button>
        </div>

        <section className="mt-5 overflow-hidden rounded-[24px] border border-line bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-black">当前颜色与明度</p>
              <p className="mt-0.5 text-[11px] text-ink-3">
                {profile.current_hair.region_mode === 'root_mid_end'
                  ? '识别为布丁头，分区确认'
                  : '全头颜色基本一致'}
              </p>
            </div>
            <span className="rounded-full bg-sky/35 px-2.5 py-1 text-[10px] font-bold text-ink-2">
              AI 已识别
            </span>
          </div>
          {profile.current_hair.region_mode === 'single' ? (
            <button
              type="button"
              onClick={() => setEditing('single_color')}
              className={cx(
                'tap flex w-full items-center justify-between px-4 py-4 text-left',
                currentConfidence < 0.8 && 'bg-red-50',
              )}
            >
              <div>
                <p className="text-sm font-bold">{profile.current_hair.color?.display_name}</p>
                <p className="mt-1 text-xs text-ink-3">
                  {profile.current_hair.color?.level} 度
                </p>
              </div>
              <PencilSimple size={17} weight="bold" className="text-orange-dark" />
            </button>
          ) : (
            <div className="divide-y divide-line">
              {(
                [
                  ['root', '发根', 'root_color'],
                  ['mid', '发中', 'mid_color'],
                  ['end', '发尾', 'end_color'],
                ] as const
              ).map(([region, label, field]) => {
                const color = profile.current_hair.regions![region].color;
                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() => setEditing(field)}
                    className={cx(
                      'tap flex w-full items-center justify-between px-4 py-3.5 text-left',
                      (color.confidence ?? 1) < 0.8 && 'bg-orange-soft/25',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="size-9 rounded-full border-4 border-white shadow-soft"
                        style={{
                          backgroundColor:
                            region === 'root'
                              ? '#2d2723'
                              : region === 'mid'
                                ? '#bd843b'
                                : '#cda660',
                        }}
                      />
                      <div>
                        <p className="text-[11px] font-bold text-ink-3">{label}</p>
                        <p className="text-sm font-black">
                          {color.display_name} · {color.level} 度
                        </p>
                      </div>
                    </div>
                    <PencilSimple size={17} weight="bold" className="text-orange-dark" />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-4 overflow-hidden rounded-[24px] border border-line bg-white shadow-soft">
          <div className="divide-y divide-line">
            {fieldRows.map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => setEditing(row.key)}
                className={cx(
                  'tap flex w-full items-center justify-between gap-4 px-4 py-4 text-left',
                  (row.confidence ?? 1) < 0.7 && 'bg-red-50',
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-ink-3">{row.title}</p>
                    <span
                      className={cx(
                        'rounded-full px-2 py-0.5 text-[9px] font-bold',
                        manualFields.has(row.key)
                          ? 'bg-sage/55 text-good'
                          : (row.confidence ?? 1) < 0.7
                            ? 'bg-red-100 text-red-800'
                          : 'bg-sky/35 text-ink-2',
                      )}
                    >
                      {manualFields.has(row.key)
                        ? '已手动确认'
                        : (row.confidence ?? 1) < 0.7
                          ? '需要确认'
                          : 'AI 已识别'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-black">{row.value}</p>
                </div>
                <PencilSimple size={17} weight="bold" className="shrink-0 text-orange-dark" />
              </button>
            ))}
          </div>
        </section>

        {profile.dye_history === 'unknown' ? (
          <div className="mt-4">
            <StatusNotice tone="warning">
              你选择了“不确定”，可以继续，但系统会给出更保守的结果。
            </StatusNotice>
          </div>
        ) : null}
        {error ? (
          <div className="mt-4">
            <StatusNotice tone="danger" title="提交失败">
              {error}
            </StatusNotice>
          </div>
        ) : null}
      </div>

      <BottomBar>
        <SecondaryButton
          onClick={applyDemoProfile}
          disabled={submitting}
          className="mb-2 min-h-11 text-xs"
          icon={<MagicWand size={16} weight="bold" />}
        >
          使用模拟数据继续测试
        </SecondaryButton>
        <PrimaryButton
          onClick={() => void submit()}
          disabled={submitting}
          icon={
            submitting ? (
              <SpinnerGap className="animate-spin" size={18} weight="bold" />
            ) : undefined
          }
        >
          {submitting ? '正在确认' : '看看能不能染成'}
        </PrimaryButton>
      </BottomBar>

      <Sheet
        open={editing === 'hair_length'}
        title="确认发长"
        description="发长会影响推荐购买数量。"
        onClose={() => setEditing(null)}
      >
        <ChoiceList
          value={profile.hair_length}
          options={profile.editable_options.hair_length}
          onChange={(value) => updateSimple('hair_length', value)}
        />
      </Sheet>
      <Sheet
        open={editing === 'hair_volume'}
        title="确认发量"
        description="发量与发长一起用于估算产品用量。"
        onClose={() => setEditing(null)}
      >
        <ChoiceList
          value={profile.hair_volume}
          options={profile.editable_options.hair_volume}
          onChange={(value) => updateSimple('hair_volume', value)}
        />
      </Sheet>
      <Sheet
        open={editing === 'dye_history'}
        title="确认漂染历史"
        description="它会影响可达判断和风险提示。"
        onClose={() => setEditing(null)}
      >
        <ChoiceList
          value={profile.dye_history}
          options={profile.editable_options.dye_history}
          onChange={(value) => updateSimple('dye_history', value)}
        />
      </Sheet>
      <Sheet
        open={Boolean(editing?.endsWith('_color'))}
        title="确认颜色与明度"
        description="选择最接近肉眼看到的结果，不需要追求像素级一致。"
        onClose={() => setEditing(null)}
      >
        <ChoiceList
          value={`${selectedColorFor(editing)?.tone}-${selectedColorFor(editing)?.level}`}
          options={colorOptionsFor(editing).map((color) => ({
            value: `${color.tone}-${color.level}`,
            label: `${color.display_name} · ${color.level} 度`,
            helper: color.saturation ? `饱和度：${color.saturation}` : undefined,
          }))}
          onChange={(value) => {
            const color = colorOptionsFor(editing).find(
              (item) => `${item.tone}-${item.level}` === value,
            );
            if (color) updateColor(editing, color);
          }}
        />
      </Sheet>
    </AppFrame>
  );
}

export function CalculatingScreen({
  currentStage,
  error,
  onRetry,
  onBack,
}: {
  currentStage: number;
  error: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const stages = [
    '正在判断当前底色与目标色差距',
    '正在检查漂染和偏色风险',
    '正在整理染色与固色路线',
  ];
  return (
    <AppFrame
      title="正在计算方案"
      eyebrow="分析发色"
      onBack={onBack}
      progress={{ current: 3, total: 4, label: '计算方案' }}
    >
      {error ? (
        <ErrorState
          title="方案计算没有完成"
          message={error}
          onRetry={onRetry}
          secondary={
            <SecondaryButton onClick={onBack}>返回修改信息</SecondaryButton>
          }
        />
      ) : (
        <div className="flex min-h-[calc(100dvh-110px)] flex-col justify-center px-6 pb-16">
          <LoadingGirl size={148} label={stages[Math.min(currentStage, stages.length - 1)]} />
          <div className="mx-auto mt-10 w-full max-w-[330px] space-y-3">
            {stages.map((stage, index) => {
              const complete = index < currentStage;
              const active = index === currentStage;
              return (
                <div
                  key={stage}
                  className={cx(
                    'flex items-center gap-3 rounded-[17px] border px-4 py-3 transition-all duration-300',
                    complete
                      ? 'border-sage-dark/30 bg-sage/35'
                      : active
                        ? 'border-orange/30 bg-white shadow-soft'
                        : 'border-line bg-white/45 opacity-55',
                  )}
                >
                  <span
                    className={cx(
                      'grid size-7 shrink-0 place-items-center rounded-full',
                      complete
                        ? 'bg-good text-white'
                        : active
                          ? 'bg-orange text-white'
                          : 'bg-line text-ink-3',
                    )}
                  >
                    {complete ? (
                      <Check size={14} weight="bold" />
                    ) : active ? (
                      <SpinnerGap className="animate-spin" size={14} weight="bold" />
                    ) : (
                      <span className="text-[10px] font-black">{index + 1}</span>
                    )}
                  </span>
                  <p className="text-xs font-bold text-ink">{stage}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AppFrame>
  );
}

function feasibilityLabel(plan: PlanResultData) {
  if (plan.feasibility === 'salon_required' || plan.feasibility === 'not_reachable') {
    return '不建议在家操作';
  }
  if (plan.feasibility === 'reachable') return '可以尝试';
  return '可以，但需要注意';
}

const previewLevelExplanations = [
  '颜色更柔和，和目标色差距较大，但翻车风险更低。',
  '保留更多底色透感，适合第一次尝试。',
  '最接近当前条件下的推荐效果。',
  '显色更明显，需要更均匀的涂抹和停留。',
  '高饱和模拟档，实际结果受底色影响最大。',
];

export function PlanScreen({
  plan,
  selectedRoute,
  selectedPreviewLevel,
  previewProgress,
  previewNotice,
  onRouteChange,
  onPreviewLevelChange,
  onBack,
  onProducts,
}: {
  plan: PlanResultData;
  selectedRoute: RouteType;
  selectedPreviewLevel: number;
  previewProgress: number;
  previewNotice: string;
  onRouteChange: (route: RouteType) => void;
  onPreviewLevelChange: (previewLevel: number) => void;
  onBack: () => void;
  onProducts: () => void;
}) {
  const selectedPreview =
    plan.preview_images.find((item) => item.preview_level === selectedPreviewLevel) ??
    plan.preview_images[0];
  const previewsReady = plan.preview_images.length > 0;
  const selectedLabel =
    selectedPreview?.label ??
    plan.preview_labels[String(selectedPreviewLevel)] ??
    `第 ${selectedPreviewLevel} 档`;
  const hardStop = !plan.can_recommend_product;
  return (
    <AppFrame
      title="你的染发方案"
      eyebrow="分析完成"
      onBack={onBack}
      progress={{ current: 4, total: 4, label: '查看结果' }}
    >
      <div className="px-5 pb-6 pt-7">
        <p className="text-[11px] font-black uppercase tracking-[.18em] text-orange-dark">
          先回答最重要的问题
        </p>
        <h1 className="mt-2 max-w-[12ch] text-[36px] font-black leading-[.96] tracking-[-.05em]">
          {feasibilityLabel(plan)}
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-2">{plan.summary}</p>

        <div className="mt-5 grid grid-cols-[1fr_1.35fr] gap-3">
          <div className="rounded-[24px] bg-ink p-4 text-white shadow-card">
            <p className="text-[10px] font-bold text-white/55">可达度</p>
            <p className="numerals mt-2 text-4xl font-black tracking-[-.06em]">
              {plan.reachability_score}
              <span className="ml-1 text-sm text-white/55">/100</span>
            </p>
            <p className="mt-3 text-[10px] leading-4 text-white/60">
              表示在当前底色与历史条件下，接近目标效果的程度。
            </p>
          </div>
          <div className="rounded-[24px] border border-line bg-white p-4 shadow-soft">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} weight="fill" className="text-orange-dark" />
              <p className="text-xs font-black">核心风险</p>
            </div>
            <div className="mt-3 space-y-2">
              {plan.risks.slice(0, 2).map((risk) => (
                <div key={risk.title}>
                  <p className="text-xs font-bold">{risk.title}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-ink-3">
                    {risk.reason}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[.15em] text-ink-3">
                结果范围
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight">五档效果预览</h2>
            </div>
            <span className="text-xs font-bold text-ink-3">
              {selectedPreviewLevel}/5
            </span>
          </div>
          <div className="relative mt-4 aspect-[4/5] overflow-hidden rounded-[30px] border border-line bg-line shadow-card">
            {selectedPreview ? (
              <MediaImage
                src={selectedPreview.url}
                alt={`${selectedPreview.label}模拟效果`}
                className="object-cover transition-opacity duration-500"
              />
            ) : (
              <div className="grid size-full place-items-center bg-cream">
                <div className="w-full px-8">
                  <LoadingGirl
                    size={112}
                    label={`AI 正在生成五档效果图 · ${Math.max(previewProgress, 8)}%`}
                  />
                  <Skeleton className="mt-5 h-2 w-full" />
                </div>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-5 pt-20 text-white">
              <p className="text-xl font-black">{selectedLabel}</p>
              <p className="mt-1 max-w-[34ch] text-xs leading-5 text-white/75">
                {previewsReady
                  ? previewLevelExplanations[selectedPreviewLevel - 1]
                  : '可行性、风险和路线已经计算完成，效果图会在后台继续生成。'}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {previewsReady
              ? plan.preview_images.map((preview) => (
                  <button
                    key={preview.preview_level}
                    type="button"
                    onClick={() => onPreviewLevelChange(preview.preview_level)}
                    disabled={!preview.enabled}
                    className={cx(
                      'tap relative aspect-square overflow-hidden rounded-[15px] border-2 bg-line disabled:opacity-35',
                      selectedPreviewLevel === preview.preview_level
                        ? 'border-orange'
                        : 'border-transparent',
                    )}
                    aria-label={`选择第 ${preview.preview_level} 档：${preview.label}`}
                  >
                    <MediaImage
                      src={preview.url}
                      alt=""
                      className="object-cover"
                    />
                    <span className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full bg-ink/65 text-[9px] font-black text-white">
                      {preview.preview_level}
                    </span>
                  </button>
                ))
              : Array.from({ length: 5 }, (_, index) => (
                  <div
                    key={index}
                    className={cx(
                      'relative aspect-square overflow-hidden rounded-[15px] border-2 bg-line',
                      selectedPreviewLevel === index + 1
                        ? 'border-orange'
                        : 'border-transparent',
                    )}
                  >
                    <Skeleton className="size-full rounded-none" />
                    <span className="absolute inset-x-1 bottom-1 truncate text-center text-[8px] font-bold text-ink-3">
                      {plan.preview_labels[String(index + 1)] ?? `${index + 1} 档`}
                    </span>
                  </div>
                ))}
          </div>
          {previewNotice ? (
            <div className="mt-3">
              <StatusNotice tone="warning">{previewNotice}</StatusNotice>
            </div>
          ) : null}
          <p className="mt-3 text-[10px] leading-4 text-ink-3">
            {previewsReady
              ? '效果图为 AI 模拟预览，实际结果仍受底色、操作和停留时间影响。'
              : `未加载完成时会使用默认第 ${plan.default_preview_level} 档进入商品推荐，不阻塞你继续查看方案。`}
          </p>
        </section>

        {!hardStop ? (
          <section className="mt-8">
            <p className="text-[11px] font-black uppercase tracking-[.15em] text-ink-3">
              选择接下来的方案
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">染色还是固色？</h2>
            <div className="mt-4 grid gap-3">
              {plan.route_cards.map((card) => {
                const selected = card.route === selectedRoute;
                return (
                  <button
                    key={card.route}
                    type="button"
                    onClick={() => onRouteChange(card.route)}
                    className={cx(
                      'tap flex items-start gap-4 rounded-[24px] border p-4 text-left',
                      selected
                        ? 'border-orange bg-orange-soft/45 shadow-soft'
                        : 'border-line bg-white',
                    )}
                  >
                    <span
                      className={cx(
                        'grid size-11 shrink-0 place-items-center rounded-[16px]',
                        selected ? 'bg-orange text-white' : 'bg-cream text-ink-2',
                      )}
                    >
                      {card.route === 'dye' ? (
                        <Drop size={21} weight="fill" />
                      ) : (
                        <Sparkle size={21} weight="fill" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-base font-black">{card.title}</span>
                        {card.recommended ? (
                          <span className="rounded-full bg-sage/60 px-2 py-0.5 text-[9px] font-bold text-good">
                            默认推荐
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-ink-2">
                        {card.reason}
                      </span>
                    </span>
                    <span
                      className={cx(
                        'mt-1 grid size-6 place-items-center rounded-full border',
                        selected
                          ? 'border-orange bg-orange text-white'
                          : 'border-line text-transparent',
                      )}
                    >
                      <Check size={13} weight="bold" />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <StatusNotice>
                切换方案后，商品会按新路线匹配；MVP 的五档图不重复生成。
              </StatusNotice>
            </div>
          </section>
        ) : (
          <div className="mt-8">
            <StatusNotice tone="danger" title="本次建议交给理发店">
              命中了不适合家庭操作的硬规则，因此暂不提供商品推荐，避免让你承担不必要的风险。
            </StatusNotice>
          </div>
        )}
      </div>
      <BottomBar>
        {hardStop ? (
          <SecondaryButton onClick={onBack}>返回修改信息</SecondaryButton>
        ) : (
          <PrimaryButton onClick={onProducts}>
            按{selectedRoute === 'dye' ? '染色' : '固色'}方案选商品
          </PrimaryButton>
        )}
      </BottomBar>
    </AppFrame>
  );
}

function normalizeProduct(
  product: PrimaryProduct | OtherProduct,
): PrimaryProduct {
  if ('usage' in product) return product;
  return {
    sku_id: product.sku_id,
    brand: product.brand,
    product_name: product.product_name,
    shade_name: product.shade_name,
    product_type: product.product_type,
    is_video_same_product: product.is_video_same_product,
    url: product.url,
    suitable_reason: product.card_reason,
    possible_risk: product.possible_risk,
    usage: {
      units_needed: product.units_needed,
      units_label: product.units_label,
      method: '按商品说明分区操作',
      waiting_minutes: 30,
      short_instruction: '具体操作以商品官方说明为准。',
    },
    price: {
      unit_price: product.unit_price,
      total_price: product.total_price,
      currency: product.currency,
      collected_at: '2026-07-25',
    },
    purchase_url: product.purchase_url,
    purchase_mode: product.purchase_mode,
    duration: product.duration ?? '维持时间受洗头频率影响',
    official_base_effect: product.official_base_effect,
  };
}

export function ProductsScreen({
  target,
  route,
  budget,
  recommendation,
  loading,
  error,
  onBudgetChange,
  onRecommend,
  onBack,
  onContinue,
}: {
  target: MockVideo;
  route: RouteType;
  budget: Budget;
  recommendation: ProductRecommendationData | null;
  loading: boolean;
  error: string;
  onBudgetChange: (budget: Budget) => void;
  onRecommend: () => void;
  onBack: () => void;
  onContinue: (product: PrimaryProduct, status: PurchaseStatus) => void;
}) {
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<PrimaryProduct | null>(null);
  const [purchaseSheetOpen, setPurchaseSheetOpen] = useState(false);

  const allProducts = useMemo(() => {
    if (!recommendation?.primary_product) return [];
    return [
      recommendation.primary_product,
      ...recommendation.other_products.map(normalizeProduct),
    ];
  }, [recommendation]);
  const effectiveSelectedSku =
    selectedSku ?? recommendation?.primary_product?.sku_id ?? null;
  const selectedProduct =
    allProducts.find((product) => product.sku_id === effectiveSelectedSku) ??
    recommendation?.primary_product ??
    null;

  const updateMin = (value: number) => {
    onBudgetChange({
      min_price: Math.min(value, budget.max_price - 20),
      max_price: budget.max_price,
    });
  };
  const updateMax = (value: number) => {
    onBudgetChange({
      min_price: budget.min_price,
      max_price: Math.max(value, budget.min_price + 20),
    });
  };

  return (
    <AppFrame
      title="商品推荐"
      eyebrow={route === 'dye' ? '染色方案' : '固色方案'}
      onBack={onBack}
    >
      <PageIntro
        eyebrow={`${target.color_alias ?? target.color_name} · ${route === 'dye' ? '染色' : '固色'}`}
        title="先告诉我你的预算"
        description="拖动只会调整本地预算，点击确认后才会请求后端匹配商品。"
      />
      <div className="px-5 pb-6">
        <section className="rounded-[28px] border border-line bg-white p-5 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-ink-3">本次预算范围</p>
              <p className="numerals mt-1 text-3xl font-black tracking-[-.05em]">
                ¥{budget.min_price}–¥{budget.max_price}
              </p>
            </div>
            <span className="grid size-11 place-items-center rounded-[16px] bg-sage/50 text-good">
              <CurrencyCny size={22} weight="bold" />
            </span>
          </div>
          <div className="relative mt-7 h-8">
            <div className="absolute inset-x-0 top-3 h-1.5 rounded-full bg-line" />
            <div
              className="absolute top-3 h-1.5 rounded-full bg-orange"
              style={{
                left: `${(budget.min_price / 400) * 100}%`,
                right: `${100 - (budget.max_price / 400) * 100}%`,
              }}
            />
            <input
              aria-label="最低预算"
              type="range"
              min={0}
              max={400}
              step={10}
              value={budget.min_price}
              onChange={(event) => updateMin(Number(event.target.value))}
              className="tony-dual-range absolute inset-x-0 top-0 w-full"
            />
            <input
              aria-label="最高预算"
              type="range"
              min={0}
              max={400}
              step={10}
              value={budget.max_price}
              onChange={(event) => updateMax(Number(event.target.value))}
              className="tony-dual-range absolute inset-x-0 top-0 w-full"
            />
          </div>
          <div className="mt-3 flex justify-between text-[10px] font-bold text-ink-3">
            <span>¥0</span>
            <span>¥400</span>
          </div>
          <button
            type="button"
            onClick={onRecommend}
            disabled={loading}
            className="tap mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-ink px-4 text-sm font-black text-white disabled:opacity-45"
          >
            {loading ? (
              <SpinnerGap className="animate-spin" size={17} weight="bold" />
            ) : (
              <Scales size={17} weight="bold" />
            )}
            {loading ? '正在匹配预算内商品' : '按此预算推荐'}
          </button>
        </section>

        {error ? (
          <div className="mt-4">
            <StatusNotice tone="danger" title="推荐没有完成">
              {error}
            </StatusNotice>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-7">
            <LoadingGirl size={116} label="正在匹配底色、用量和商品资料" />
            <div className="mt-5 grid gap-3">
              <Skeleton className="h-52" />
              <Skeleton className="h-24" />
            </div>
          </div>
        ) : null}

        {!loading && recommendation?.status === 'no_match' ? (
          <div className="mt-7 rounded-[28px] border border-line bg-white p-6 text-center shadow-soft">
            <ShoppingBagOpen className="mx-auto text-ink-3" size={34} weight="duotone" />
            <h2 className="mt-4 text-xl font-black">预算内暂时没有合适商品</h2>
            <p className="mt-2 text-sm leading-6 text-ink-2">
              {recommendation.message}。可以调整预算后重新匹配。
            </p>
          </div>
        ) : null}

        {!loading && recommendation?.primary_product ? (
          <section className="mt-8">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[.15em] text-ink-3">
                  结合底色与用量
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">最推荐这一款</h2>
              </div>
              <Star size={22} weight="fill" className="text-orange" />
            </div>
            <article className="mt-4 overflow-hidden rounded-[30px] border border-orange/35 bg-white shadow-card">
              <div className="grid grid-cols-[118px_1fr]">
                <div className="relative min-h-[164px] bg-line">
                  <MediaImage
                    src={recommendation.primary_product.url}
                    alt={`${recommendation.primary_product.brand}${recommendation.primary_product.product_name}`}
                    className="object-cover"
                  />
                </div>
                <div className="p-4">
                  <div className="flex flex-wrap gap-1.5">
                    {recommendation.primary_product.badge ? (
                      <span className="rounded-full bg-orange-soft px-2 py-1 text-[9px] font-bold text-orange-dark">
                        {recommendation.primary_product.badge}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-sage/45 px-2 py-1 text-[9px] font-bold text-good">
                      主推荐
                    </span>
                  </div>
                  <p className="mt-3 text-xs font-bold text-ink-3">
                    {recommendation.primary_product.brand}
                  </p>
                  <h3 className="mt-0.5 text-lg font-black leading-tight">
                    {recommendation.primary_product.product_name}
                  </h3>
                  <p className="mt-1 text-sm font-bold text-orange-dark">
                    {recommendation.primary_product.shade_name}
                  </p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="numerals text-2xl font-black">
                      ¥{recommendation.primary_product.price.total_price}
                    </span>
                    <span className="text-[10px] text-ink-3">
                      共 {recommendation.primary_product.usage.units_needed} 盒
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 border-t border-line p-4">
                <div>
                  <p className="text-[10px] font-black text-good">为什么适合你</p>
                  <p className="mt-1 text-xs leading-5 text-ink-2">
                    {recommendation.primary_product.suitable_reason}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-orange-dark">可能的风险</p>
                  <p className="mt-1 text-xs leading-5 text-ink-2">
                    {recommendation.primary_product.possible_risk}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[15px] bg-cream p-3">
                    <p className="text-[10px] text-ink-3">单价</p>
                    <p className="numerals mt-1 text-sm font-black">
                      ¥{recommendation.primary_product.price.unit_price}
                    </p>
                  </div>
                  <div className="rounded-[15px] bg-cream p-3">
                    <p className="text-[10px] text-ink-3">预计维持</p>
                    <p className="mt-1 text-sm font-black">
                      {recommendation.primary_product.duration}
                    </p>
                  </div>
                </div>
                {recommendation.primary_product.official_base_effect ? (
                  <StatusNotice>
                    {recommendation.primary_product.official_base_effect}
                  </StatusNotice>
                ) : null}
              </div>
            </article>

            {recommendation.other_products.length ? (
              <div className="mt-7">
                <h2 className="text-lg font-black tracking-tight">其他预算内选择</h2>
                <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {recommendation.other_products.map((product) => {
                    const normalized = normalizeProduct(product);
                    return (
                      <button
                        key={product.sku_id}
                        type="button"
                        onClick={() => setDetailProduct(normalized)}
                        className={cx(
                          'tap w-[230px] shrink-0 snap-start overflow-hidden rounded-[22px] border bg-white text-left shadow-soft',
                          effectiveSelectedSku === product.sku_id
                            ? 'border-orange'
                            : 'border-line',
                        )}
                      >
                        <div className="grid grid-cols-[76px_1fr]">
                          <div className="relative min-h-24 bg-line">
                            <MediaImage
                              src={product.url}
                              alt={`${product.brand}${product.product_name}`}
                              className="object-cover"
                            />
                          </div>
                          <div className="p-3">
                            <p className="text-[10px] font-bold text-ink-3">{product.brand}</p>
                            <p className="mt-1 text-sm font-black leading-tight">
                              {product.product_name}
                            </p>
                            <p className="numerals mt-2 text-sm font-black text-orange-dark">
                              ¥{product.total_price}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      {selectedProduct ? (
        <BottomBar>
          <PrimaryButton onClick={() => setPurchaseSheetOpen(true)}>
            选择并保存方案
          </PrimaryButton>
        </BottomBar>
      ) : null}

      <Sheet
        open={Boolean(detailProduct)}
        title={detailProduct ? `${detailProduct.brand} ${detailProduct.product_name}` : '商品详情'}
        description="查看完整优缺点后，再明确选择。"
        onClose={() => setDetailProduct(null)}
      >
        {detailProduct ? (
          <div>
            <div className="relative aspect-[16/9] overflow-hidden rounded-[20px] bg-line">
              <MediaImage
                src={detailProduct.url}
                alt={detailProduct.product_name}
                className="object-cover"
              />
            </div>
            <div className="mt-4 grid gap-3">
              <StatusNotice tone="success" title="适合你的地方">
                {detailProduct.suitable_reason}
              </StatusNotice>
              <StatusNotice tone="warning" title="需要接受的风险">
                {detailProduct.possible_risk}
              </StatusNotice>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[16px] bg-white p-3">
                  <p className="text-[10px] text-ink-3">建议数量</p>
                  <p className="mt-1 text-sm font-black">{detailProduct.usage.units_label}</p>
                </div>
                <div className="rounded-[16px] bg-white p-3">
                  <p className="text-[10px] text-ink-3">总价</p>
                  <p className="numerals mt-1 text-sm font-black">
                    ¥{detailProduct.price.total_price}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-5">
              <PrimaryButton
                onClick={() => {
                  setSelectedSku(detailProduct.sku_id);
                  setDetailProduct(null);
                }}
                icon={<Check size={18} weight="bold" />}
              >
                选择这个商品
              </PrimaryButton>
            </div>
          </div>
        ) : null}
      </Sheet>

      <Sheet
        open={purchaseSheetOpen}
        title="商品准备到哪一步？"
        description="无论是否已经购买，方案都会先保存到个人档案，不会直接进入教程。"
        onClose={() => setPurchaseSheetOpen(false)}
      >
        {selectedProduct ? (
          <div className="grid gap-2">
            {selectedProduct.purchase_mode === 'external_link' ? (
              <a
                href={selectedProduct.purchase_url}
                target="_blank"
                rel="noreferrer"
                className="tap flex min-h-12 items-center justify-center gap-2 rounded-[16px] bg-ink px-4 text-sm font-black text-white"
              >
                前往商品页
                <ArrowRight size={17} weight="bold" />
              </a>
            ) : null}
            <PrimaryButton
              onClick={() => onContinue(selectedProduct, 'simulated')}
              icon={<CheckCircle size={18} weight="fill" />}
            >
              模拟已购买
            </PrimaryButton>
            <SecondaryButton
              onClick={() => onContinue(selectedProduct, 'saved')}
              icon={<FolderOpen size={18} weight="bold" />}
            >
              暂未购买，先保存方案
            </SecondaryButton>
          </div>
        ) : null}
      </Sheet>
    </AppFrame>
  );
}
