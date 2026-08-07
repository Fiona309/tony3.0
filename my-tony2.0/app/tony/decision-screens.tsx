'use client';

import {
  At,
  ArrowRight,
  ArrowLeft,
  BookmarkSimple,
  Camera,
  ChatCircle,
  Check,
  CheckCircle,
  CornersOut,
  Lightbulb,
  CurrencyCny,
  Drop,
  FolderOpen,
  Heart,
  ImageSquare,
  MagicWand,
  MagnifyingGlass,
  MusicNotes,
  PencilSimple,
  Play,
  Plus,
  Scales,
  ShareFat,
  ShoppingBagOpen,
  Smiley,
  Sparkle,
  SpinnerGap,
  Star,
  X,
} from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { API_MODE } from './api';
import { productsForRoute } from './mock-data';
import { NotReachablePlan } from './not-reachable-plan';
import {
  PRODUCT_BUDGET_MAX,
  PRODUCT_BUDGET_MIN,
  PRODUCT_BUDGET_PRESETS,
  ProductReferenceView,
} from './product-reference-view';
import type {
  Budget,
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

export function DiscoveryScreen({
  videos,
  loading,
  error,
  onRetry,
  onStart,
  onOpenArchives,
}: {
  videos: MockVideo[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onStart: (video: MockVideo) => void;
  onOpenArchives: () => void;
}) {
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const touchStartY = useRef<number | null>(null);
  const wheelLocked = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sameStyleVisible, setSameStyleVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittedComment, setSubmittedComment] = useState('');
  const [commentRecommendation, setCommentRecommendation] = useState(false);
  const active = videos[activeIndex];

  useEffect(() => {
    if (!active) return;
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (index === activeIndex) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });
    const resetTimer = window.setTimeout(() => {
      setSameStyleVisible(false);
      setPaused(false);
      setVideoFailed(false);
      setSaved(false);
      setSavedNotice(false);
      setCommentsOpen(false);
      setCommentText('');
      setSubmittedComment('');
      setCommentRecommendation(false);
    }, 0);
    const entryTimer = window.setTimeout(
      () => setSameStyleVisible(true),
      Math.min(active.trigger_time_ms, 2600),
    );
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(entryTimer);
    };
  }, [active, activeIndex]);

  const moveFeed = (direction: 1 | -1) => {
    if (commentsOpen) return;
    setActiveIndex((current) =>
      Math.max(0, Math.min(videos.length - 1, current + direction)),
    );
  };

  const toggleVideo = () => {
    const video = videoRefs.current[activeIndex];
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => undefined);
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
  };

  const toggleSaved = () => {
    setSaved((current) => {
      const next = !current;
      setSavedNotice(next);
      return next;
    });
  };

  const openComments = () => {
    setCommentsOpen(true);
    videoRefs.current[activeIndex]?.pause();
    setPaused(true);
  };

  const closeComments = () => {
    setCommentsOpen(false);
    if (videoRefs.current[activeIndex]) {
      void videoRefs.current[activeIndex]?.play().catch(() => undefined);
      setPaused(false);
    }
  };

  const submitComment = () => {
    const value = commentText.trim();
    if (!value) return;
    setSubmittedComment(value);
    setCommentText('');
    window.setTimeout(() => setCommentRecommendation(true), 280);
  };

  if (loading) {
    return (
      <AppFrame fullBleed>
        <div className="grid min-h-full place-items-center bg-[#211c19] text-white">
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
      <div
        className="relative h-full min-h-0 overflow-hidden bg-[#171717] font-sans text-white"
        onWheel={(event) => {
          if (wheelLocked.current || Math.abs(event.deltaY) < 32) return;
          wheelLocked.current = true;
          moveFeed(event.deltaY > 0 ? 1 : -1);
          window.setTimeout(() => {
            wheelLocked.current = false;
          }, 520);
        }}
        onTouchStart={(event) => {
          touchStartY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchEnd={(event) => {
          if (touchStartY.current === null) return;
          const delta = touchStartY.current - (event.changedTouches[0]?.clientY ?? touchStartY.current);
          if (Math.abs(delta) > 44) moveFeed(delta > 0 ? 1 : -1);
          touchStartY.current = null;
        }}
      >
        <div
          className="absolute inset-0 transition-transform duration-500 ease-out"
          style={{ transform: `translateY(-${activeIndex * 100}%)` }}
        >
          {videos.map((video, index) => (
            <div key={video.video_id} className="relative h-full w-full">
              {videoFailed && index === activeIndex ? (
                <MediaImage
                  src={video.cover_url}
                  alt={`${video.color_name}视频封面`}
                  className="object-cover"
                  priority={index === 0}
                />
              ) : (
                <video
                  ref={(node) => {
                    videoRefs.current[index] = node;
                  }}
                  src={video.url}
                  poster={video.cover_url}
                  autoPlay={index === 0}
                  muted
                  loop
                  playsInline
                  preload={Math.abs(index - activeIndex) <= 1 ? 'metadata' : 'none'}
                  onError={() => {
                    if (index === activeIndex) setVideoFailed(true);
                  }}
                  className="size-full object-cover"
                />
              )}
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80" />

        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-[max(18px,env(safe-area-inset-top))]">
          <span className="grid size-11 place-items-center text-white">
            <span className="text-[11px] font-black leading-none">LIVE</span>
          </span>
          <div className="absolute left-1/2 top-[max(22px,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-7 text-base font-bold">
            <span className="text-white/65">关注</span>
            <span className="relative">
              推荐
              <span className="absolute -bottom-2 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-white" />
            </span>
            <span className="text-white/65">杭州</span>
          </div>
          <button
            type="button"
            onClick={onOpenArchives}
            className="tap grid size-11 place-items-center"
            aria-label="搜索与档案"
          >
            <MagnifyingGlass size={29} weight="bold" />
          </button>
          <span className="absolute right-16 rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
            {activeIndex + 1} / {videos.length}
          </span>
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

        <div className="absolute bottom-[126px] right-2.5 z-[5] flex flex-col items-center gap-4">
          <div className="relative">
            <div className="relative size-[50px] overflow-hidden rounded-full border-2 border-white bg-[#d9c2b1]">
              <MediaImage
                src={active.target_frame_url}
                alt="视频作者头像"
                className="object-cover"
              />
            </div>
            <span className="absolute -bottom-2 left-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full bg-[#fe2c55]">
              <Plus size={15} weight="bold" />
            </span>
          </div>
          <button
            type="button"
            onClick={() => undefined}
            className="tap flex min-h-[58px] w-14 flex-col items-center justify-center"
            aria-label="点赞"
          >
            <Heart size={39} weight="fill" />
            <span className="mt-0.5 text-xs font-bold drop-shadow">3.6万</span>
          </button>
          <button
            type="button"
            onClick={openComments}
            className="tap flex min-h-[58px] w-14 flex-col items-center justify-center"
            aria-label="打开评论"
          >
            <ChatCircle size={39} weight="fill" />
            <span className="mt-0.5 text-xs font-bold drop-shadow">892</span>
          </button>
          <button
            type="button"
            onClick={toggleSaved}
            className="tap flex min-h-[58px] w-14 flex-col items-center justify-center"
            aria-label={saved ? '取消收藏' : '收藏'}
          >
            <BookmarkSimple
              size={39}
              weight="fill"
              className={saved ? 'text-[#ffc32b]' : 'text-white'}
            />
            <span className="mt-0.5 text-xs font-bold drop-shadow">1.2万</span>
          </button>
          <button
            type="button"
            className="tap flex min-h-[58px] w-14 flex-col items-center justify-center"
            aria-label="分享"
          >
            <ShareFat size={39} weight="fill" />
            <span className="mt-0.5 text-xs font-bold drop-shadow">256</span>
          </button>
          <span className="grid size-12 place-items-center rounded-full bg-[#242424]">
            <MusicNotes size={19} weight="fill" />
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-[62px] z-[3] px-4 pr-[76px]">
          <p className="text-base font-bold drop-shadow">@栗子酱</p>
          <p className="mt-3 text-[15px] font-medium leading-6 drop-shadow">
            新发色也太显白了吧！阳光下更好看～
            <br />
            谁懂这种通透感啊！ <span className="font-black">#夏日氛围感发色</span>
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm font-medium">
            <MusicNotes size={18} weight="fill" />
            Originel - La vie en rose
          </p>
        </div>

        {sameStyleVisible && !savedNotice && !commentsOpen ? (
          <button
            type="button"
            data-testid="start-same-style"
            onClick={(event) => {
              event.stopPropagation();
              onStart(active);
            }}
            className="tap animate-bounce-in absolute right-[72px] top-[34%] z-[7] flex min-h-14 items-center gap-2 rounded-[17px] border border-[#ffd9ad]/80 bg-[#f7e7d7]/90 px-3 text-left text-[#4a372d] shadow-[0_8px_26px_rgba(0,0,0,.2)] backdrop-blur-md"
          >
            <span className="grid size-9 place-items-center rounded-[12px] bg-[#ff8a31] text-white">
              <MagicWand size={20} weight="fill" />
            </span>
            <span>
              <span className="block text-sm font-black">试试染同款</span>
              <span className="block text-[11px] font-medium text-[#7f695d]">
                我能不能染出这种颜色
              </span>
            </span>
          </button>
        ) : null}

        {savedNotice && !commentsOpen ? (
          <div className="animate-slideUp absolute inset-x-3 bottom-[155px] z-[8] flex min-h-[88px] items-center gap-3 rounded-[22px] border border-[#ffbb6a] bg-[#f7efe7]/95 p-3 text-[#352d29] shadow-[0_16px_40px_rgba(0,0,0,.26)] backdrop-blur-xl">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#ff9c45] text-white">
              <Sparkle size={23} weight="fill" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">发色灵感已收藏</p>
              <p className="mt-1 text-xs text-[#75665f]">我能不能染出这种颜色</p>
            </div>
            <button
              type="button"
              onClick={() => onStart(active)}
              className="tap min-h-11 shrink-0 rounded-full bg-[#ff812d] px-4 text-sm font-black text-white"
            >
              试试染同款
            </button>
            <div className="relative size-12 shrink-0 overflow-hidden rounded-[13px] border-2 border-white">
              <MediaImage
                src={active.target_frame_url}
                alt={`${active.color_name}收藏缩略图`}
                className="object-cover"
              />
            </div>
          </div>
        ) : null}

        {commentsOpen ? (
          <div className="absolute inset-0 z-[20] flex items-end bg-black/35">
            <section className="flex max-h-[76dvh] min-h-[66dvh] w-full flex-col rounded-t-[24px] bg-[#fafafa] text-[#171717] shadow-[0_-16px_45px_rgba(0,0,0,.26)]">
              <header className="flex min-h-14 items-center border-b border-[#eeeeee] px-4">
                <p className="text-base font-black">评论 892</p>
                <p className="ml-7 text-sm text-[#999]">赞 4.3万</p>
                <button
                  type="button"
                  className="tap ml-auto grid size-11 place-items-center"
                  aria-label="展开评论区"
                >
                  <CornersOut size={21} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={closeComments}
                  className="tap grid size-11 place-items-center"
                  aria-label="关闭评论区"
                >
                  <X size={24} weight="bold" />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {[
                  ['小鹿的碎碎念', '这个发色也太显白了！求色号', '152'],
                  ['一只CC', '色号在这：奶茶棕+灰粉调，阳光下更好看～', '92'],
                  ['奶油小方', '需要漂吗', '24'],
                ].map(([name, text, likes], index) => (
                  <div key={name} className="mb-5 flex gap-3">
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-[#ead7cb]">
                      <MediaImage
                        src={videos[(index + 1) % videos.length]?.target_frame_url ?? active.target_frame_url}
                        alt={`${name}头像`}
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[#999]">
                        {name}
                        {index === 1 ? (
                          <span className="ml-2 rounded bg-[#fe2c55] px-1.5 py-0.5 text-[10px] font-bold text-white">
                            作者
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-[15px] leading-6">{text}</p>
                      <p className="mt-1 text-xs text-[#aaa]">昨天 20:{11 + index * 12} · 上海　 回复</p>
                    </div>
                    <span className="flex flex-col items-center text-[#aaa]">
                      <Heart size={22} />
                      <span className="mt-1 text-[11px]">{likes}</span>
                    </span>
                  </div>
                ))}

                {submittedComment ? (
                  <div className="mb-4 rounded-[18px] bg-[#fff2ea] p-3">
                    <div className="flex gap-3">
                      <div className="relative size-9 shrink-0 overflow-hidden rounded-full bg-[#ead7cb]">
                        <MediaImage
                          src={active.target_frame_url}
                          alt="你的头像"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[#999]">你</p>
                        <p className="mt-1 text-[15px] leading-6">{submittedComment}</p>
                        <p className="mt-1 text-xs text-[#aaa]">刚刚 · 上海　 回复</p>
                      </div>
                      <span className="self-center text-xs font-bold text-[#ff7a23]">已发送</span>
                    </div>
                  </div>
                ) : null}

                {commentRecommendation ? (
                  <div className="animate-slideUp rounded-[22px] border border-[#ffb86f] bg-[#fff9f5] p-3 shadow-[0_8px_24px_rgba(255,126,38,.12)]">
                    <p className="flex items-center gap-2 text-xs font-bold text-[#ff7a23]">
                      <CheckCircle size={17} weight="fill" />
                      已理解你的评论
                    </p>
                    <div className="mt-3 grid grid-cols-[72px_1fr_86px] items-center gap-3">
                      <div className="relative aspect-[4/5] overflow-hidden rounded-[16px] bg-[#ead7cb]">
                        <MediaImage
                          src={active.target_frame_url}
                          alt={`${active.color_name}目标发色`}
                          className="object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-xl font-black">
                          <span className="text-[#ff7a23]">发色</span>已锁定
                        </p>
                        <p className="mt-1 text-xs text-[#777]">我能不能染出这种颜色</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onStart(active)}
                        className="tap min-h-12 rounded-full bg-[#ff7a23] px-3 text-sm font-black text-white"
                      >
                        试试染同款
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <footer className="border-t border-[#eeeeee] bg-white px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
                <div className="flex min-h-12 items-center gap-2 rounded-full bg-[#f3f3f3] px-4">
                  <input
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submitComment();
                    }}
                    placeholder="善语结善缘，恶言伤人心"
                    className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#aaa]"
                    aria-label="发表评论"
                  />
                  {commentText.trim() ? (
                    <button
                      type="button"
                      onClick={submitComment}
                      className="tap min-h-10 px-2 text-sm font-black text-[#ff7a23]"
                    >
                      发送
                    </button>
                  ) : (
                    <>
                      <ImageSquare size={23} weight="bold" />
                      <At size={23} weight="bold" />
                      <Smiley size={23} weight="bold" />
                    </>
                  )}
                </div>
              </footer>
            </section>
          </div>
        ) : null}
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
    /* 存下来的照片也要跟预览一样镜像：否则用户按取景框摆好姿势，
       下一屏"这张照片够清楚吗"却给她一张左右颠倒的图，很突兀。
       水平翻转不影响任何颜色，底色识别测的是明度与色相，与朝向无关。 */
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.setTransform(1, 0, 0, 1, 0, 0);
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

  /* 相册兜底：摄像头权限拿不到时至少能把流程走通。
     默认不鼓励用——相册照片常带美颜/滤镜，而底色识别本质是测明度，
     实测仅光照差异就能让识别偏 2~3 度，滤镜只会更糟。所以仅在
     摄像头失败后才显示，并提示用户务必核对结论屏上的度数。 */
  const pickFromAlbum = (file: File | undefined) => {
    if (!file) return;
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    const url = URL.createObjectURL(file);
    stopCamera();
    setCameraError('');
    setCapturedFile(file);
    setPreview(url);
    setStage('review');
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
      title="拍一张你当前发色的照片"
      eyebrow="分析发色"
      onBack={() => {
        stopCamera();
        onBack();
      }}
      progress={{ current: 1, total: 4, label: '准备照片' }}
      className="flex min-h-0 flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1"
    >
      {stage === 'intro' ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-4">
            <h1 className="shrink-0 text-[22px] font-black tracking-[-.035em]">
              拍一张你当前发色的照片
            </h1>
            <p className="mt-2 shrink-0 text-xs leading-5 text-ink-2">
              用于判断当前底色、发长和发量，识别后仍可修改。
            </p>
            {/* 取景参考图固定 9:16（和真机取景一致），并居中自适应，绝不越过底部按钮 */}
            <div className="mt-3 flex min-h-0 flex-1 items-center justify-center">
              <div className="relative aspect-[9/16] h-full max-w-full overflow-hidden rounded-[26px] border border-line bg-[#d9c2b1] shadow-card">
                <MediaImage
                  src={target.target_frame_url}
                  alt="拍摄构图参考"
                  className="object-cover opacity-65"
                  priority
                />
                <div className="absolute inset-[12%_14%] rounded-[42%_42%_34%_34%] border-2 border-dashed border-white/90" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-3 pb-3 pt-12 text-white">
                  <p className="text-[11px] font-black leading-4">自然光 · 关闭美颜滤镜 · 头发占画面大部分</p>
                </div>
              </div>
            </div>
            {cameraError ? (
              <div className="mt-3 shrink-0 space-y-2">
                <StatusNotice tone="danger" title="无法打开摄像头">
                  {cameraError}
                </StatusNotice>
                <label className="tap flex cursor-pointer items-center justify-center gap-2 rounded-[16px] border-2 border-dashed border-ink/25 bg-white px-4 py-3 text-[13px] font-black">
                  <ImageSquare size={18} weight="bold" />
                  从相册选一张继续
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      pickFromAlbum(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </label>
                <p className="px-1 text-[11px] leading-4 text-ink-3">
                  底色识别测的是明度，相册照片若带美颜或滤镜会明显影响准确度。
                  下一屏请务必核对识别出的度数。
                </p>
              </div>
            ) : null}
          </div>
          <BottomBar>
            <PrimaryButton
              onClick={() => void openCamera()}
              variant="green"
              icon={<Camera size={19} weight="fill" />}
            >
              打开相机
            </PrimaryButton>
          </BottomBar>
        </div>
      ) : null}

      {stage === 'live' ? (
        <div className="relative min-h-full bg-[#211c19]">
          {/* scale-x-[-1] 把预览翻成镜子。getUserMedia 交出来的是未镜像的原始帧
              （"别人看你"的视角），直接铺出来会导致人往左移、画面里往右移，
              自拍取景时会下意识往反方向调整。试色屏在 shader 里做了同样的翻转。 */}
          <video
            ref={videoRef}
            muted
            playsInline
            className="absolute inset-0 size-full scale-x-[-1] object-cover"
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
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-4">
            <h1 className="whitespace-nowrap text-[24px] font-black tracking-[-.04em]">
              这张照片够清楚吗？
            </h1>
            <p className="mt-2 text-xs leading-5 text-ink-2">
              确认后分析当前发色、发长和发量，下一步仍可修改。
            </p>
            <div className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-[26px] border border-line bg-line shadow-card">
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
                重新拍摄
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
                {submitting ? '正在提交照片…' : '确认使用'}
              </PrimaryButton>
            </div>
          </BottomBar>
        </div>
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

const HAIR_LEVEL_OPTIONS: HairColor[] = [
  ['black', 1, '1 度深黑色'],
  ['black', 2, '2 度黑色'],
  ['dark_brown', 3, '3 度原生黑棕色'],
  ['dark_brown', 4, '4 度深棕色'],
  ['brown', 5, '5 度棕色'],
  ['light_brown', 6, '6 度浅棕色'],
  ['gold', 7, '7 度金色'],
  ['light_gold', 8, '8 度浅金色'],
  ['blonde', 9, '9 度白金色'],
  ['pale_blonde', 10, '10 度淡白金色'],
].map(([tone, level, display_name]) => ({
  tone: String(tone),
  level: Number(level),
  display_name: String(display_name),
  saturation: 'medium',
}));

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
  const [profile, setProfile] = useState<HairProfileData>(() => initialProfile);
  const [manualFields, setManualFields] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ProfileField>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [levelGuideOpen, setLevelGuideOpen] = useState(false);

  const currentColor = currentDisplayColor(profile);
  const targetConfidence =
    profile.attribute_confidences?.target_color ??
    profile.target_color.confidence ??
    1;
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
      return profile.current_hair.color_options ?? [currentDisplayColor(profile)];
    }
    const regionKey =
      field === 'root_color' ? 'root' : field === 'mid_color' ? 'mid' : 'end';
    const region = profile.current_hair.regions?.[regionKey];
    return region?.color_options ?? (region ? [region.color] : []);
  };

  const selectedColorFor = (field: ProfileField) => {
    if (field === 'target_color') return profile.target_color;
    if (field === 'single_color') return currentDisplayColor(profile);
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
            region_mode: 'single',
            color,
            color_options: current.current_hair.color_options ?? HAIR_LEVEL_OPTIONS,
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
      title="确认你的头发信息"
      eyebrow="分析准备 · 最后一步"
      onBack={onBack}
      progress={{ current: 3, total: 3, label: '分析准备' }}
    >
      <div className="px-5 pb-4 pt-5">
        <p className="text-[10px] font-black uppercase tracking-[.14em] text-pink-dark">
          根据照片预填，请确认
        </p>
        <h1 className="mt-2 whitespace-nowrap text-[25px] font-black tracking-[-.04em]">
          确认你的头发信息
        </h1>
      </div>
      <div className="px-5 pb-5">
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => setEditing('target_color')}
            className={cx(
              'tap grid min-h-[104px] w-full grid-cols-[112px_1fr] overflow-hidden rounded-[24px] border bg-white text-left shadow-soft',
              targetConfidence < 0.8 ? 'border-red-300' : 'border-line',
            )}
          >
            <div className="relative min-h-[104px] bg-line">
              <MediaImage
                src={target.target_frame_url}
                alt="想染的目标发色参考"
                className="object-cover object-top"
              />
            </div>
            <div className="flex flex-col justify-center p-4">
              <p className="text-[11px] font-black text-ink-3">
                想染的目标色
              </p>
              <p className="mt-1 text-xl font-black">
                {profile.target_color.display_name}
              </p>
              <p className="mt-2 text-[10px] font-bold text-pink-dark">点击可以修改</p>
            </div>
          </button>

          <article
            className="grid min-h-[104px] grid-cols-[112px_1fr] overflow-hidden rounded-[24px] border border-line bg-white shadow-soft"
          >
            <div className="relative min-h-[104px] bg-line">
              <MediaImage
                src={currentPhotoUrl}
                alt="我当前的发色照片"
                className="object-cover object-top"
              />
            </div>
            <div className="flex flex-col justify-center p-4">
              <p className="text-[11px] font-black text-ink-3">
                我的发色
              </p>
              <p className="mt-1 text-xl font-black">{currentColor.display_name}</p>
            </div>
          </article>
        </div>

        <p className="mt-4 rounded-[18px] bg-sage/30 px-4 py-3 text-xs font-bold leading-5 text-ink-2">
          AI 帮你识别了以下信息，请确认识别是否准确。
        </p>

        <section className="mt-5 overflow-hidden rounded-[24px] border border-line bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-black">我的头发色度</p>
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
          <button
            type="button"
            onClick={() => setEditing('single_color')}
            className="tap flex w-full items-center justify-between px-4 py-4 text-left"
          >
            <div>
              <p className="text-xs font-bold text-ink-3">当前识别结果</p>
              <p className="mt-1 text-sm font-black">{currentColor.level} 度</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-black text-pink-dark">
              点击选择
              <PencilSimple size={17} weight="bold" />
            </div>
          </button>
          <div className="border-t border-line px-4 pb-4 pt-3">
            <button
              type="button"
              onClick={() => setLevelGuideOpen((open) => !open)}
              className="tap flex min-h-10 w-full items-center justify-between text-left text-xs font-black text-ink-2"
              aria-expanded={levelGuideOpen}
            >
              <span>？ 如何判断我的头发是几度？</span>
              <span className="text-lg">{levelGuideOpen ? '−' : '+'}</span>
            </button>
            {levelGuideOpen ? (
              <div className="relative mt-3 aspect-[16/8] overflow-hidden rounded-[16px] bg-line">
                <MediaImage
                  src="/hair-level-guide.jpg"
                  alt="1度到10度头发色度判断参考图"
                  className="object-contain"
                />
              </div>
            ) : null}
          </div>
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
        <PrimaryButton
          onClick={() => void submit()}
          disabled={submitting}
          variant="yellow"
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
        title="你的头发大概多长？"
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
        title="你的发量属于哪一种？"
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
        title="你的头发以前处理过吗？"
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
        title={editing === 'single_color' ? '选择我的头发色度' : '确认目标发色'}
        description={
          editing === 'single_color'
            ? '对照肉眼看到的头发颜色，选择最接近的 1–10 度。'
            : '选择最接近想染目标的颜色。'
        }
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
        <div className="flex min-h-full flex-col justify-center px-6 pb-16">
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

export type PlanVerdict = {
  level: number;
  /** 该色系最低可染度数，取自知识库，不是估算 */
  minLevel: number | null;
  colorName: string;
  canDye: boolean;
  canDyeWhy: string;
  biasRisky: boolean;
  biasWhy: string;
  saturation: number;
  vibrancyNote: string;
};

function VerdictRow({
  index, title, ok, value, note,
}: { index: string; title: string; ok: boolean; value: string; note: string }) {
  return (
    <div className={cx('rounded-[16px] border p-3',
      ok ? 'border-[#8bc79c] bg-[#eef7f0]' : 'border-[#e8c47a] bg-[#fff8e4]')}>
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-black text-ink-3">{index}</span>
        <span className="text-[12px] font-bold text-ink-3">{title}</span>
        <span className="ml-auto text-[13px] font-black">{value}</span>
      </div>
      {note ? <p className="mt-1.5 text-[11px] leading-[1.6] text-ink-2">{note}</p> : null}
    </div>
  );
}

function feasibilityLabel(plan: PlanResultData) {
  if (plan.feasibility === 'salon_required' || plan.feasibility === 'not_reachable') {
    return '不建议在家操作';
  }
  if (plan.feasibility === 'reachable') return '可以尝试';
  return '可以，但需要注意';
}

const intensityExplanations = [
  '颜色更柔和，和目标色差距较大，但翻车风险更低。',
  '保留更多底色透感，适合第一次尝试。',
  '最接近当前条件下的推荐效果。',
  '显色更明显，需要更均匀的涂抹和停留。',
  '高饱和模拟档，实际结果受底色影响最大。',
];

export function PlanScreen({
  plan,
  selectedRoute,
  selectedIntensity,
  previewProgress,
  previewNotice,
  demoMode = false,
  demoLoading = false,
  demoError = '',
  onRouteChange,
  onIntensityChange,
  onBack,
  onProducts,
  onDemoPreview,
  verdict,
}: {
  plan: PlanResultData;
  selectedRoute: RouteType;
  selectedIntensity: number;
  previewProgress: number;
  previewNotice: string;
  demoMode?: boolean;
  demoLoading?: boolean;
  demoError?: string;
  onRouteChange: (route: RouteType) => void;
  onIntensityChange: (intensity: number) => void;
  onBack: () => void;
  onProducts: () => void;
  onDemoPreview?: () => void;
  /** 结论屏算好的三层结果。判定只发生一次，本屏只展示，不重算 */
  verdict?: PlanVerdict;
}) {
  const carouselRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 只移动轮播自身的横向滚动，不使用 scrollIntoView；
    // scrollIntoView 会连带把整张方案页向下滚，导致用户首屏看不到结论。
    const carousel = carouselRef.current;
    const selected = carousel?.querySelector<HTMLElement>('[data-selected="true"]');
    if (!carousel || !selected) return;
    carousel.scrollTo({
      left: selected.offsetLeft - (carousel.clientWidth - selected.clientWidth) / 2,
      behavior: 'smooth',
    });
  }, [selectedIntensity]);

  const previewsReady = plan.preview_images.length > 0;
  const selectedLabel =
    plan.preview_images.find((item) => item.preview_level === selectedIntensity)?.label ??
    plan.preview_labels[String(selectedIntensity)] ??
    `第 ${selectedIntensity} 档`;
  /* 只有当三层判断的第一层也说不能染时，才走「不建议在家操作」整屏。
     此前只看后端的 can_recommend_product，它与结论屏用不同的规则表判定，
     导致结论屏说"能染"、本屏却整屏渲染"现在还不能直接染"。
     verdict 存在时以它为准——判定只在结论屏发生一次。 */
  const hardStop = verdict ? !verdict.canDye : !plan.can_recommend_product;
  if (hardStop) {
    return (
      <NotReachablePlan
        plan={plan}
        verdict={verdict}
        onBack={onBack}
        onDemoPreview={onDemoPreview}
        demoLoading={demoLoading}
        demoError={demoError}
        allowDemoPreview={!demoMode}
      />
    );
  }
  return (
    <AppFrame
      title="你的染发方案"
      eyebrow="分析完成"
      onBack={onBack}
      progress={{ current: 4, total: 4, label: '查看结果' }}
    >
      <div className="px-5 pb-6 pt-6">
        {demoMode ? (
          <div className="mb-4 rounded-[18px] border-2 border-pink-dark bg-pink-soft/70 px-4 py-3 text-xs font-bold leading-5 text-ink shadow-[3px_4px_0_#2d211c]">
            当前是演示底色方案：系统使用你的照片和浅金底色参数生成效果图，不代表你当前真实发色适合居家染。
          </div>
        ) : null}

        {/* 三层结论。这里不重新判定——判定只在结论屏发生一次，本屏只做展示。
            此前本屏独立跑 evaluate_profile，与结论屏用不同输入、不同规则表，
            导致"试色说能染、方案说不能染"的直接矛盾。 */}
        {verdict ? (
          <>
            <p className="inline-block text-[13px] font-black text-pink-dark decoration-[3px] underline-offset-[6px] [text-decoration-line:underline] [text-decoration-color:var(--pink-soft)]">
              你的三层判断结果
            </p>
            <div className="mt-3 space-y-2">
              <VerdictRow
                index="①"
                title="能不能染"
                ok={verdict.canDye}
                value={verdict.canDye ? `能染 · 你的底色 ${verdict.level} 度` : `不建议 · 底色 ${verdict.level} 度还不够浅`}
                note={verdict.canDyeWhy}
              />
              <VerdictRow
                index="②"
                title="会不会偏色"
                ok={!verdict.biasRisky}
                value={verdict.biasRisky ? '有偏色风险' : '无明显偏色风险'}
                note={verdict.biasWhy}
              />
              <VerdictRow
                index="③"
                title="出来多鲜艳"
                ok={verdict.saturation >= 70}
                value={`显色饱和度 ${Math.round(verdict.saturation)}%`}
                note={verdict.vibrancyNote}
              />
            </div>
          </>
        ) : (
          <>
            <p className="inline-block text-[13px] font-black text-pink-dark decoration-[3px] underline-offset-[6px] [text-decoration-line:underline] [text-decoration-color:var(--pink-soft)]">
              先回答最重要的问题
            </p>
            <div className="mt-3">
              <h1 className="text-[26px] font-black leading-[1.14] tracking-[-.05em]">
                {feasibilityLabel(plan)}
              </h1>
              <p className="mt-2.5 text-[13px] leading-[1.6] text-ink-2">{plan.summary}</p>
            </div>
          </>
        )}

        {/* 需要注意的风险 */}
        {plan.risks.length ? (
          <section className="mt-5 rounded-[22px] border border-[#e8c47a] bg-[#fff8e4] p-4">
            <div className="flex items-center gap-1.5">
              <p className="text-[12px] font-black text-[#b4801f]">需要注意的风险</p>
              <Lightbulb size={15} weight="fill" className="text-[#e8b53d]" />
            </div>
            <h2 className="mt-2 text-[19px] font-black leading-tight">{plan.risks[0].title}</h2>
            <p className="mt-1.5 text-[12px] leading-[1.6] text-ink-2">{plan.risks[0].reason}</p>
            <div className="my-3 border-t border-dashed border-[#e0c68a]" />
            <div className="flex gap-2.5">
              <Lightbulb size={20} weight="fill" className="mt-px shrink-0 text-[#e8b53d]" />
              <p className="text-[12px] font-bold leading-[1.55]">
                {plan.risks[1]?.reason ?? '如果不能接受偏色，建议先处理底色或咨询专业人士。'}
              </p>
            </div>
          </section>
        ) : null}

        {/* 效果预览已移至上一屏的实时试色（零成本、可无限次切换颜色与档位），
            此处不再重复展示。生图只保留一张标准效果图用于归档，在本屏进入时生成。 */}

        {!hardStop ? (
          <section className="mt-5">
            <span className="inline-block -rotate-1 rounded-[10px] bg-[#d5ecd8] px-3 py-1 text-[12px] font-black">
              选择接下来的方案
            </span>
            <div className="mt-3 grid gap-2.5">
              {plan.route_cards.map((card) => {
                const selected = card.route === selectedRoute;
                return (
                  <button
                    key={card.route}
                    type="button"
                    onClick={() => onRouteChange(card.route)}
                    className={cx(
                      'tap flex items-center gap-3 rounded-[22px] border-2 p-3.5 text-left',
                      selected
                        ? 'border-pink bg-pink-soft/45 shadow-soft'
                        : 'border-line bg-white',
                    )}
                  >
                    <span
                      className={cx(
                        'grid size-11 shrink-0 place-items-center rounded-[16px]',
                        selected ? 'bg-pink text-white' : 'bg-cream text-ink-2',
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
                        <span className="text-[17px] font-black">{card.title}</span>
                        {card.recommended ? (
                          <span className="rounded-full bg-sage/60 px-2 py-0.5 text-[9px] font-bold text-good">
                            默认推荐
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-[1.5] text-ink-2">
                        {card.reason}
                      </span>
                    </span>
                    <span
                      className={cx(
                        'grid size-6 shrink-0 place-items-center rounded-full border-2',
                        selected
                          ? 'border-pink bg-pink text-white'
                          : 'border-line text-transparent',
                      )}
                    >
                      <Check size={13} weight="bold" />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2.5 flex items-center gap-2 rounded-[16px] border border-line bg-white px-3 py-2.5">
              <Star size={16} weight="fill" className="shrink-0 text-pink" />
              <p className="text-[11px] font-bold leading-4">
                切换方案后，商品推荐会按当前选择更新。
              </p>
            </div>
          </section>
        ) : (
          <div className="mt-8">
            <StatusNotice tone="danger" title="本次建议交给理发店">
              命中了不适合家庭操作的硬规则，因此暂不提供商品推荐，避免让你承担不必要的风险。
            </StatusNotice>
          </div>
        )}
        <div className="mt-6 pb-2">
          <PrimaryButton onClick={onProducts} icon={null}>
            <span className="inline-flex items-center gap-2">
              按{selectedRoute === 'dye' ? '染色' : '固色'}方案选商品
              <ArrowRight size={19} weight="bold" />
            </span>
          </PrimaryButton>
        </div>
      </div>
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
    const recommended = [
      recommendation.primary_product,
      ...recommendation.other_products.map(normalizeProduct),
    ];
    if (API_MODE !== 'mock') return recommended.slice(0, 3);

    // The prototype always demonstrates the complete decision set:
    // one primary recommendation plus two comparison cards. In real mode
    // these cards continue to come only from the backend response.
    const fallbackCatalog = productsForRoute(route).map(({ primary }) => primary);
    return [...recommended, ...fallbackCatalog]
      .filter(
        (product, index, collection) =>
          collection.findIndex((item) => item.sku_id === product.sku_id) === index,
      )
      .slice(0, 3);
  }, [recommendation, route]);
  const effectiveSelectedSku =
    selectedSku ?? recommendation?.primary_product?.sku_id ?? null;
  const selectedProduct =
    allProducts.find((product) => product.sku_id === effectiveSelectedSku) ??
    recommendation?.primary_product ??
    null;
  const ruleRejected =
    recommendation?.color_rule?.result_quality === 'not_recommended' ||
    recommendation?.color_rule?.result_quality === 'unknown';

  const updateMin = (value: number) => {
    onBudgetChange({
      min_price: Math.max(
        PRODUCT_BUDGET_MIN,
        Math.min(value, budget.max_price - 10),
      ),
      max_price: budget.max_price,
    });
  };
  const updateMax = (value: number) => {
    onBudgetChange({
      min_price: budget.min_price,
      max_price: Math.min(
        PRODUCT_BUDGET_MAX,
        Math.max(value, budget.min_price + 10),
      ),
    });
  };

  return (
    <AppFrame
      title="商品推荐"
      eyebrow={route === 'dye' ? '染色方案' : '固色方案'}
      onBack={onBack}
    >
      <ProductReferenceView
        target={target}
        route={route}
        budget={budget}
        recommendation={recommendation}
        products={allProducts}
        selectedSku={effectiveSelectedSku}
        loading={loading}
        error={error}
        onBudgetChange={onBudgetChange}
        onRecommend={onRecommend}
        onSelect={setSelectedSku}
        onDetail={setDetailProduct}
      />
      <div className="hidden" aria-hidden="true">
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
                ¥{budget.min_price}-¥{budget.max_price}
              </p>
            </div>
            <span className="grid size-11 place-items-center rounded-[16px] bg-sage/50 text-good">
              <CurrencyCny size={22} weight="bold" />
            </span>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-2" aria-label="预算快捷选择">
            {[
              ...PRODUCT_BUDGET_PRESETS.map((preset) => ({
                label: preset.label,
                value: {
                  min_price: preset.min_price,
                  max_price: preset.max_price,
                },
              })),
              { label: '自定义', value: null },
            ].map((option) => {
              const selected =
                option.value !== null &&
                budget.min_price === option.value.min_price &&
                budget.max_price === option.value.max_price;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => {
                    if (option.value) onBudgetChange(option.value);
                  }}
                  className={cx(
                    'tap min-h-11 rounded-[14px] border px-1 text-xs font-black transition-transform',
                    selected
                      ? 'border-ink bg-pink text-ink shadow-[2px_3px_0_#2f2a27]'
                      : 'border-line bg-cream text-ink-2',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="relative mt-7 h-8">
            <div className="sketch-budget-track absolute inset-x-0 top-3 h-2" />
            <div
              className="sketch-budget-fill absolute top-3 h-2"
              style={{
                left: `${((budget.min_price - PRODUCT_BUDGET_MIN) / (PRODUCT_BUDGET_MAX - PRODUCT_BUDGET_MIN)) * 100}%`,
                right: `${100 - ((budget.max_price - PRODUCT_BUDGET_MIN) / (PRODUCT_BUDGET_MAX - PRODUCT_BUDGET_MIN)) * 100}%`,
              }}
            />
            <input
              aria-label="最低预算"
              type="range"
              min={PRODUCT_BUDGET_MIN}
              max={PRODUCT_BUDGET_MAX}
              step={10}
              value={budget.min_price}
              onChange={(event) => updateMin(Number(event.target.value))}
              className="tony-dual-range absolute inset-x-0 top-0 w-full"
            />
            <input
              aria-label="最高预算"
              type="range"
              min={PRODUCT_BUDGET_MIN}
              max={PRODUCT_BUDGET_MAX}
              step={10}
              value={budget.max_price}
              onChange={(event) => updateMax(Number(event.target.value))}
              className="tony-dual-range absolute inset-x-0 top-0 w-full"
            />
          </div>
          <div className="mt-3 flex justify-between text-[10px] font-bold text-ink-3">
            <span>¥10</span>
            <span>¥200</span>
          </div>
          <PrimaryButton
            onClick={onRecommend}
            disabled={loading}
            className="mt-5"
            icon={
              loading ? (
                <SpinnerGap className="animate-spin" size={17} weight="bold" />
              ) : (
                <Scales size={17} weight="bold" />
              )
            }
          >
            {loading ? '正在匹配预算内商品' : '按此预算推荐'}
          </PrimaryButton>
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
            <h2 className="mt-4 text-xl font-black">
              {ruleRejected
                ? '当前底色不建议居家染发'
                : '预算内暂时没有合适商品'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-2">
              {recommendation.message}
              {ruleRejected ? '' : '。可以调整预算后重新匹配。'}
            </p>
          </div>
        ) : null}

        {!loading && recommendation?.primary_product ? (
          <section className="mt-8">
            {recommendation.risk_level === 'medium' ||
            recommendation.color_rule?.result_quality === 'biased' ? (
              <div className="mb-4">
                <StatusNotice tone="warning" title="需要先接受偏色风险">
                  {recommendation.risk_summary ??
                    recommendation.primary_product.color_rule_risk?.risk_reason ??
                    recommendation.primary_product.possible_risk}
                </StatusNotice>
              </div>
            ) : null}
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[.15em] text-ink-3">
                  结合底色与用量
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">最推荐这一款</h2>
              </div>
              <Star size={22} weight="fill" className="text-orange" />
            </div>
            <article className="mt-4 -rotate-[0.35deg] overflow-hidden border border-[#d5ae55] bg-[#fff9e8] transition-transform duration-300 hover:rotate-0">
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
                      <span className="sketch-sticker">
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
      </div>

      {selectedProduct ? (
        <BottomBar>
          <PrimaryButton onClick={() => setPurchaseSheetOpen(true)}>
            查看操作预览 · 合计 ¥{selectedProduct.price.total_price}
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
        description="先记录当前购买状态，下一步查看这款商品的操作难度与耗时。"
        onClose={() => setPurchaseSheetOpen(false)}
      >
        {selectedProduct ? (
          <div className="grid gap-2">
            {selectedProduct.purchase_mode === 'external_link' && selectedProduct.purchase_url ? (
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
