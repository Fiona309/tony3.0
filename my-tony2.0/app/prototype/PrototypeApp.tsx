'use client';

import Image from 'next/image';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Camera,
  CaretDown,
  Check,
  CheckCircle,
  CurrencyCny,
  DotsThree,
  Drop,
  Heart,
  Info,
  MagicWand,
  Microphone,
  Pause,
  PencilSimple,
  Play,
  Plus,
  Repeat,
  ShareNetwork,
  ShieldCheck,
  Sparkle,
  SpeakerHigh,
  SpeakerSlash,
  Star,
  Timer,
  UserCircle,
  VideoCamera,
  Warning,
  X,
} from '@phosphor-icons/react';
import {
  DYE_CHAPTERS,
  HISTORY_OPTIONS,
  LENGTH_OPTIONS,
  PRODUCTS,
  TARGETS,
  TONING_CHAPTERS,
  VOLUME_OPTIONS,
  type Product,
  type RouteType,
  type TargetColor,
} from './data';
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Screen = 'douyin' | 'camera' | 'confirm' | 'result' | 'products' | 'operation' | 'achievement';
type VoiceState = 'idle' | 'listening' | 'thinking' | 'answering' | 'error';

interface HairProfile {
  hairState: 'full' | 'pudding';
  currentName: string;
  currentLevel: number;
  rootName: string;
  rootLevel: number;
  endsName: string;
  endsLevel: number;
  length: string;
  volume: string;
  history: string;
}

interface EditConfig {
  title: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
}

const TUTORIAL_VIDEO_SRC = '/video-uploads/a2431c5c23e6/video.mp4';
const FALLBACK_PHOTO = '/video-mock/frames/step-3-2.jpg';
const TOTAL_APP_STEPS = 6;

const defaultProfile: HairProfile = {
  hairState: 'pudding',
  currentName: '8度金色布丁头',
  currentLevel: 8,
  rootName: '自然黑',
  rootLevel: 3,
  endsName: '暖金色',
  endsLevel: 8,
  length: '齐胸中长发',
  volume: '适中',
  history: '漂过1–2次',
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function LoadingGirl({ size = 112 }: { size?: number }) {
  const frames = ['/loading/01-mirror.png', '/loading/02-brush.png', '/loading/05-blowdry.png', '/loading/03-reading.png', '/loading/04-reading2.png'];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setFrame((value) => (value + 1) % frames.length), 460);
    return () => window.clearInterval(timer);
  }, [frames.length]);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      {frames.map((src, index) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          sizes={`${size}px`}
          className={cx('object-contain transition-opacity duration-200', frame === index ? 'opacity-100' : 'opacity-0')}
        />
      ))}
    </div>
  );
}

function AppShell({
  children,
  screen,
  onBack,
  accent,
}: {
  children: ReactNode;
  screen: Screen;
  onBack?: () => void;
  accent: string;
}) {
  const stepMap: Record<Exclude<Screen, 'douyin'>, number> = {
    camera: 1,
    confirm: 2,
    result: 3,
    products: 4,
    operation: 5,
    achievement: 6,
  };

  if (screen === 'douyin') return <>{children}</>;

  const current = stepMap[screen];
  return (
    <div className="relative mx-auto min-h-[100dvh] w-full max-w-[430px] overflow-hidden bg-cream text-ink shadow-[0_18px_70px_rgba(61,46,34,.16)] md:my-5 md:min-h-[calc(100dvh-2.5rem)] md:rounded-[34px] md:border md:border-white/80">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-cream/90 px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="tap grid size-10 place-items-center rounded-full border border-line bg-white text-ink shadow-soft disabled:opacity-30"
            aria-label="返回上一页"
            disabled={!onBack}
          >
            <ArrowLeft size={19} weight="bold" />
          </button>
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-xl bg-orange text-white shadow-orange">
              <Sparkle size={17} weight="fill" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-ink-3">Tony Lab</p>
              <p className="text-sm font-black tracking-tight">做自己的 Tony</p>
            </div>
          </div>
          <div className="min-w-10 text-right text-xs font-bold text-ink-3">
            <span className="text-ink">{current}</span>/{TOTAL_APP_STEPS}
          </div>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(current / TOTAL_APP_STEPS) * 100}%`, backgroundColor: accent }} />
        </div>
      </header>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, accent, icon }: { children: ReactNode; onClick: () => void; disabled?: boolean; accent?: string; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tap flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] px-5 text-[15px] font-black text-white shadow-[0_12px_28px_rgba(61,46,34,.14)] disabled:cursor-not-allowed disabled:opacity-40"
      style={{ backgroundColor: accent ?? 'var(--orange)' }}
    >
      {children}
      {icon ?? <ArrowRight size={18} weight="bold" />}
    </button>
  );
}

function BottomAction({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-10 border-t border-line/80 bg-cream/92 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">{children}</div>;
}

function TargetPortrait({ target, src = FALLBACK_PHOTO, className = '' }: { target: TargetColor; src?: string; className?: string }) {
  return (
    <div className={cx('relative overflow-hidden bg-ink', className)}>
      <Image src={src} alt={`${target.label}发色参考`} fill sizes="430px" className="object-cover" style={{ filter: target.filter }} unoptimized={src.startsWith('data:')} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#211915]/70 via-transparent to-transparent" />
    </div>
  );
}

function DouyinScene({ target, onTargetChange, onEnter }: { target: TargetColor; onTargetChange: (target: TargetColor) => void; onEnter: (mode: 'auto' | 'scan') => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);
  const [autoTagTarget, setAutoTagTarget] = useState<string | null>(null);
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'found'>('idle');
  const autoTag = autoTagTarget === target.id;

  useEffect(() => {
    const timer = window.setTimeout(() => setAutoTagTarget(target.id), 1500);
    return () => window.clearTimeout(timer);
  }, [target.id]);

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }, []);

  const togglePause = () => {
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

  const beginHold = () => {
    if (!paused) return;
    holdTimer.current = setTimeout(() => {
      setScanState('scanning');
      setTimeout(() => setScanState('found'), 850);
    }, 560);
  };

  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  };

  const selectTarget = (nextTarget: TargetColor) => {
    setScanState('idle');
    onTargetChange(nextTarget);
  };

  return (
    <main className="relative mx-auto min-h-[100dvh] w-full max-w-[430px] overflow-hidden bg-[#171513] text-white md:my-5 md:min-h-[calc(100dvh-2.5rem)] md:rounded-[34px] md:shadow-[0_18px_70px_rgba(0,0,0,.28)]">
      <video
        key={target.id}
        ref={videoRef}
        src={target.videoSrc}
        poster={FALLBACK_PHOTO}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="absolute inset-0 size-full object-cover"
        style={{ filter: target.videoFilter }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#171513]/35 via-transparent to-[#171513]/90" />

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-[max(18px,env(safe-area-inset-top))]">
        <div className="rounded-full border border-white/15 bg-[#171513]/35 px-3 py-1.5 text-xs font-bold backdrop-blur-md">抖音场景模拟</div>
        <button type="button" className="grid size-10 place-items-center rounded-full bg-[#171513]/35 backdrop-blur-md" aria-label="更多"><DotsThree size={24} weight="bold" /></button>
      </div>

      <button
        type="button"
        onClick={togglePause}
        onPointerDown={beginHold}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
        className="absolute inset-0 z-[1] flex items-center justify-center"
        aria-label={paused ? '继续播放；长按画面识别发色' : '暂停视频'}
      >
        {paused && scanState === 'idle' && (
          <span className="grid size-16 place-items-center rounded-full border border-white/20 bg-[#171513]/45 backdrop-blur-md animate-fadeIn">
            <Play size={27} weight="fill" />
          </span>
        )}
      </button>

      <aside className="absolute bottom-36 right-3 z-[3] flex flex-col items-center gap-5 text-white">
        <div className="grid size-12 place-items-center overflow-hidden rounded-full border-2 border-white bg-peach text-ink"><UserCircle size={44} weight="fill" /></div>
        <button type="button" className="flex flex-col items-center gap-1 text-[10px] font-bold"><Heart size={31} weight="fill" /><span>8.6万</span></button>
        <button type="button" className="flex flex-col items-center gap-1 text-[10px] font-bold"><ShareNetwork size={30} weight="fill" /><span>分享</span></button>
      </aside>

      <div className="absolute inset-x-0 bottom-0 z-[3] px-4 pb-[max(18px,env(safe-area-inset-bottom))] pr-20">
        <p className="text-sm font-bold">@发色实验室</p>
        <h1 className="mt-2 text-[30px] font-black leading-[.96] tracking-[-.04em]">今天把头发换成<br/><span style={{ color: target.accent }}>{target.label}</span></h1>
        <p className="mt-3 max-w-[30ch] text-sm leading-relaxed text-white/78">{target.hook}。暂停画面并长按，可以识别同款发色。</p>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {TARGETS.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={(event) => { event.stopPropagation(); selectTarget(item); }}
              className={cx('tap shrink-0 rounded-full border px-3 py-2 text-xs font-bold backdrop-blur-md', item.id === target.id ? 'border-white bg-white text-ink' : 'border-white/20 bg-[#171513]/35 text-white')}
            >
              <span className="mr-1.5 inline-block size-2 rounded-full" style={{ backgroundColor: item.accent }} />{item.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {autoTag && scanState === 'idle' && (
        <button
          type="button"
          onClick={() => onEnter('auto')}
          className="tap absolute bottom-[205px] left-4 z-[4] flex items-center gap-2 rounded-full border border-white/20 bg-white px-4 py-3 text-sm font-black text-ink shadow-[0_14px_34px_rgba(0,0,0,.25)] animate-bounce-in"
        >
          <MagicWand size={19} weight="fill" style={{ color: target.accent }} />
          染同款 · {target.label}
        </button>
      )}

      {scanState !== 'idle' && (
        <div className="absolute inset-0 z-[8] flex items-end bg-[#171513]/35 p-4 pb-[max(24px,env(safe-area-inset-bottom))] backdrop-blur-[2px]">
          <div className="w-full rounded-[28px] border border-white/15 bg-[#24211f]/94 p-5 shadow-2xl animate-slideUp">
            {scanState === 'scanning' ? (
              <div className="flex items-center gap-4">
                <div className="relative grid size-12 place-items-center rounded-2xl bg-white/10"><MagicWand size={23} className="animate-pulse" /></div>
                <div><p className="font-black">正在识别这一帧</p><p className="mt-1 text-xs text-white/60">分析头发区域、颜色和明暗</p></div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="relative size-16 overflow-hidden rounded-2xl"><TargetPortrait target={target} className="size-full" /></div>
                  <div className="min-w-0 flex-1"><p className="text-xs text-white/55">识别到同款发色</p><p className="mt-1 text-xl font-black" style={{ color: target.accent }}>{target.label}</p><p className="mt-1 text-xs text-white/65">视觉约{target.visualLevel}度 · 全头色</p></div>
                  <CheckCircle size={27} weight="fill" className="text-sage" />
                </div>
                <button type="button" onClick={() => onEnter('scan')} className="tap mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-white text-sm font-black text-ink">
                  染同款 <ArrowRight size={18} weight="bold" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function CameraScreen({ target, onBack, onCaptured }: { target: TargetColor; onBack: () => void; onCaptured: (photo: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'ready' | 'denied' | 'unavailable'>('loading');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraStatus('loading');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('unavailable');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraStatus('ready');
    } catch (error) {
      setCameraStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unavailable');
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    const timer = window.setTimeout(() => void startCamera(), 0);
    return () => {
      window.clearTimeout(timer);
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || cameraStatus !== 'ready' || video.videoWidth === 0) {
      setPhoto(FALLBACK_PHOTO);
      return;
    }
    const maxWidth = 900;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL('image/jpeg', .84));
    video.pause();
  };

  const retry = () => {
    setPhoto(null);
    void videoRef.current?.play();
  };

  return (
    <AppShell screen="camera" onBack={onBack} accent={target.accent}>
      <main className="relative flex min-h-[calc(100dvh-79px)] flex-col bg-[#201d1a] text-white md:min-h-[calc(100dvh-7.4rem)]">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <video ref={videoRef} muted playsInline className={cx('absolute inset-0 size-full object-cover', photo && 'opacity-0')} />
          {photo && <Image src={photo} alt="刚拍摄的当前头发" fill className="object-cover" sizes="430px" unoptimized={photo.startsWith('data:')} />}

          {cameraStatus !== 'ready' && !photo && (
            <div className="absolute inset-0 grid place-items-center bg-[#201d1a] px-8 text-center">
              {cameraStatus === 'loading' ? (
                <div className="flex flex-col items-center"><LoadingGirl /><p className="mt-3 font-black">正在打开摄像头</p></div>
              ) : (
                <div className="max-w-[280px]">
                  <div className="mx-auto grid size-16 place-items-center rounded-[22px] bg-white/10"><Camera size={30} /></div>
                  <h2 className="mt-5 text-xl font-black">暂时无法使用摄像头</h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{cameraStatus === 'denied' ? '请允许摄像头权限，或用演示照片继续体验。' : '当前环境不支持实时拍照，可以直接使用演示照片。'}</p>
                  <div className="mt-5 grid gap-2">
                    <button type="button" onClick={() => void startCamera()} className="tap rounded-2xl bg-white px-4 py-3 text-sm font-black text-ink">重新打开摄像头</button>
                    <button type="button" onClick={() => setPhoto(FALLBACK_PHOTO)} className="tap rounded-2xl border border-white/15 px-4 py-3 text-sm font-bold">使用演示照片</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!photo && (
            <div className="pointer-events-none absolute inset-x-[15%] top-[13%] bottom-[18%] rounded-[48%_48%_28%_28%] border border-dashed border-white/65">
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#201d1a]/70 px-3 py-1.5 text-[11px] font-bold backdrop-blur-md">让发根和主要发长都入镜</div>
            </div>
          )}

          <div className="absolute right-4 top-4 w-24 overflow-hidden rounded-[18px] border-2 border-white bg-white shadow-xl">
            <TargetPortrait target={target} className="aspect-[3/4] w-full" />
            <div className="px-2 py-2 text-center text-[10px] font-black text-ink">目标 · {target.label}</div>
          </div>

          {photo && (
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-[#201d1a]/55 px-3 py-2 text-xs font-bold backdrop-blur-md">
              <Check size={15} weight="bold" className="text-sage" /> 已拍好染前照片
            </div>
          )}
        </div>

        <div className="border-t border-white/10 bg-[#201d1a]/96 px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-4">
          {photo ? (
            <div className="grid grid-cols-[.9fr_1.4fr] gap-3">
              <button type="button" onClick={retry} className="tap min-h-14 rounded-[18px] border border-white/15 text-sm font-bold">重新拍摄</button>
              <button type="button" onClick={() => { stopCamera(); onCaptured(photo); }} className="tap flex min-h-14 items-center justify-center gap-2 rounded-[18px] text-sm font-black text-white" style={{ backgroundColor: target.accent }}>使用这张 <ArrowRight size={17} weight="bold" /></button>
            </div>
          ) : (
            <div className="grid grid-cols-[48px_1fr_48px] items-center gap-4">
              <button type="button" onClick={() => setPhoto(FALLBACK_PHOTO)} className="tap grid size-12 place-items-center rounded-full bg-white/10" aria-label="使用演示照片"><MagicWand size={21} /></button>
              <button type="button" onClick={capture} disabled={cameraStatus === 'loading'} className="tap mx-auto grid size-[72px] place-items-center rounded-full border-[5px] border-white/35 bg-white disabled:opacity-40" aria-label="拍摄当前头发"><span className="size-12 rounded-full" style={{ backgroundColor: target.accent }} /></button>
              <button type="button" onClick={() => setFacingMode((value) => value === 'user' ? 'environment' : 'user')} className="tap grid size-12 place-items-center rounded-full bg-white/10" aria-label="切换摄像头"><Repeat size={21} /></button>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </main>
    </AppShell>
  );
}

function AnalysisLoading({ target, currentPhoto }: { target: TargetColor; currentPhoto: string }) {
  const messages = ['正在找到头发区域', '正在区分发根与发尾', '正在估算当前底色', '正在生成可修改的识别结果'];
  const [message, setMessage] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setMessage((value) => Math.min(value + 1, messages.length - 1)), 520);
    return () => window.clearInterval(timer);
  }, [messages.length]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-cream px-8 text-center">
      <div className="relative">
        <div className="absolute -inset-6 rounded-full border border-orange/15 animate-ping" />
        <LoadingGirl size={132} />
      </div>
      <p className="mt-6 text-[11px] font-black uppercase tracking-[.22em] text-orange">AI Hair Check</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight">正在理解你的头发</h2>
      <p className="mt-3 min-h-6 text-sm font-medium text-ink-2">{messages[message]}</p>
      <div className="mt-8 flex items-center gap-3">
        <div className="relative size-14 overflow-hidden rounded-2xl border-2 border-white shadow-card"><Image src={currentPhoto} alt="当前头发缩略图" fill className="object-cover" sizes="56px" unoptimized={currentPhoto.startsWith('data:')} /></div>
        <div className="h-px w-10 bg-line-strong/30" />
        <div className="relative size-14 overflow-hidden rounded-2xl border-2 border-white shadow-card"><TargetPortrait target={target} className="size-full" /></div>
      </div>
    </div>
  );
}

function FieldButton({ label, value, onClick, warning }: { label: string; value: string; onClick: () => void; warning?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="tap flex w-full items-center justify-between gap-4 border-b border-line py-4 text-left last:border-b-0">
      <div><p className="text-[11px] font-bold text-ink-3">{label}</p><p className="mt-1 text-sm font-black text-ink">{value}</p></div>
      <div className="flex items-center gap-2">
        {warning && <span className="rounded-full bg-orange-soft px-2 py-1 text-[10px] font-bold text-orange-dark">请确认</span>}
        <PencilSimple size={17} className="text-ink-3" />
      </div>
    </button>
  );
}

function EditSheet({ config, onClose }: { config: EditConfig | null; onClose: () => void }) {
  if (!config) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/35 px-3 pb-3 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-[410px] rounded-[28px] bg-white p-5 shadow-2xl animate-slideUp" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-lg font-black">{config.title}</h3><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-cream" aria-label="关闭"><X size={17} weight="bold" /></button></div>
        <div className="mt-4 grid gap-2">
          {config.options.map((option) => (
            <button type="button" key={option} onClick={() => { config.onSelect(option); onClose(); }} className={cx('tap flex min-h-12 items-center justify-between rounded-2xl border px-4 text-sm font-bold', option === config.value ? 'border-orange bg-orange-soft/50 text-orange-dark' : 'border-line bg-cream/45 text-ink')}>
              {option}{option === config.value && <Check size={17} weight="bold" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConfirmScreen({ target, currentPhoto, profile, setProfile, onBack, onContinue }: { target: TargetColor; currentPhoto: string; profile: HairProfile; setProfile: (profile: HairProfile) => void; onBack: () => void; onContinue: () => void }) {
  const [editConfig, setEditConfig] = useState<EditConfig | null>(null);
  const levels = Array.from({ length: 10 }, (_, index) => `${index + 1}度`);
  const currentColorOptions = ['自然黑', '深棕色', '暖棕色', '金色', '浅金色', '红色', '蓝色', '紫色'];

  const edit = (title: string, value: string, options: string[], onSelect: (value: string) => void) => setEditConfig({ title, value, options, onSelect });

  return (
    <AppShell screen="confirm" onBack={onBack} accent={target.accent}>
      <main className="px-4 pb-6 pt-5">
        <div className="flex items-start justify-between gap-5">
          <div><p className="text-[11px] font-black uppercase tracking-[.2em] text-orange">AI 识别结果</p><h1 className="mt-2 text-[27px] font-black leading-tight tracking-[-.04em]">确认一下<br/>我们看到的一样吗？</h1></div>
          <div className="relative size-[76px] shrink-0 overflow-hidden rounded-[24px] border-[3px] border-white shadow-card"><Image src={currentPhoto} alt="当前头发" fill className="object-cover" sizes="76px" unoptimized={currentPhoto.startsWith('data:')} /></div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">AI 已经先填好了。点任意一项可以修改，漂染历史需要你亲自确认。</p>

        <section className="mt-6 overflow-hidden rounded-[26px] border border-line bg-white px-4 shadow-soft">
          <div className="flex items-center justify-between border-b border-line py-4">
            <div><p className="text-[11px] font-bold text-ink-3">当前头发</p><p className="mt-1 text-lg font-black">{profile.currentName}</p></div>
            <button type="button" onClick={() => setProfile({ ...profile, hairState: profile.hairState === 'pudding' ? 'full' : 'pudding', currentName: profile.hairState === 'pudding' ? `${profile.endsLevel}度${profile.endsName}` : `${profile.endsLevel}度${profile.endsName}布丁头` })} className="tap rounded-full bg-orange-soft px-3 py-2 text-xs font-black text-orange-dark">{profile.hairState === 'pudding' ? '布丁头' : '全头'}</button>
          </div>
          {profile.hairState === 'pudding' ? (
            <div className="grid grid-cols-2 gap-3 border-b border-line py-4">
              <button type="button" onClick={() => edit('修改发根颜色', profile.rootName, currentColorOptions, (value) => setProfile({ ...profile, rootName: value }))} className="tap rounded-2xl bg-cream p-3 text-left"><p className="text-[10px] font-bold text-ink-3">发根</p><p className="mt-1 text-sm font-black">{profile.rootLevel}度 · {profile.rootName}</p></button>
              <button type="button" onClick={() => edit('修改发尾颜色', profile.endsName, currentColorOptions, (value) => setProfile({ ...profile, endsName: value }))} className="tap rounded-2xl bg-cream p-3 text-left"><p className="text-[10px] font-bold text-ink-3">发尾</p><p className="mt-1 text-sm font-black">{profile.endsLevel}度 · {profile.endsName}</p></button>
            </div>
          ) : (
            <FieldButton label="当前底色" value={`${profile.currentLevel}度 · ${profile.currentName}`} onClick={() => edit('修改当前底色', `${profile.currentLevel}度`, levels, (value) => setProfile({ ...profile, currentLevel: Number.parseInt(value) }))} />
          )}
          {profile.hairState === 'pudding' && (
            <FieldButton label="发根与发尾度数" value={`发根${profile.rootLevel}度 / 发尾${profile.endsLevel}度`} onClick={() => edit('修改发尾底色', `${profile.endsLevel}度`, levels, (value) => setProfile({ ...profile, endsLevel: Number.parseInt(value) }))} />
          )}
        </section>

        <section className="mt-3 overflow-hidden rounded-[26px] border border-line bg-white px-4 shadow-soft">
          <div className="flex items-center gap-3 border-b border-line py-4">
            <div className="relative size-14 overflow-hidden rounded-2xl"><TargetPortrait target={target} className="size-full" /></div>
            <div className="flex-1"><p className="text-[11px] font-bold text-ink-3">目标发色</p><p className="mt-1 text-lg font-black" style={{ color: target.deepAccent }}>{target.label}</p></div>
            <span className="rounded-full bg-sky/45 px-3 py-2 text-xs font-black text-ink">视觉约{target.visualLevel}度</span>
          </div>
          <p className="py-3 text-xs leading-relaxed text-ink-2"><Info size={14} className="mr-1 inline-block align-[-2px]" />这是目标看起来的深浅；真正需要的底色会在下一页判断。</p>
        </section>

        <section className="mt-3 overflow-hidden rounded-[26px] border border-line bg-white px-4 shadow-soft">
          <FieldButton label="发长" value={profile.length} onClick={() => edit('修改发长', profile.length, LENGTH_OPTIONS, (value) => setProfile({ ...profile, length: value }))} />
          <FieldButton label="发量" value={profile.volume} onClick={() => edit('修改发量', profile.volume, VOLUME_OPTIONS, (value) => setProfile({ ...profile, volume: value }))} />
          <FieldButton label="漂染历史" value={profile.history} warning onClick={() => edit('确认漂染历史', profile.history, HISTORY_OPTIONS, (value) => setProfile({ ...profile, history: value }))} />
        </section>
      </main>
      <BottomAction><PrimaryButton onClick={onContinue} accent={target.accent}>确认，查看我的染发方案</PrimaryButton></BottomAction>
      <EditSheet config={editConfig} onClose={() => setEditConfig(null)} />
    </AppShell>
  );
}

function ResultLoading({ target }: { target: TargetColor }) {
  const [progress, setProgress] = useState(18);
  const messages = ['先判断当前底色能否承载目标色', '计算最可能的偏色方向', '生成5档鲜艳度效果', '比较染发与固色路线'];
  const messageIndex = Math.min(messages.length - 1, Math.floor(progress / 25));

  useEffect(() => {
    const timer = window.setInterval(() => setProgress((value) => Math.min(96, value + 13)), 360);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-cream px-8 text-center">
      <LoadingGirl size={138} />
      <p className="mt-5 text-[11px] font-black uppercase tracking-[.2em]" style={{ color: target.deepAccent }}>Tony 正在推理</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight">不是套模板，正在按你的底色计算</h2>
      <p className="mt-3 min-h-11 text-sm leading-relaxed text-ink-2">{messages[messageIndex]}</p>
      <div className="mt-7 h-2 w-full max-w-[260px] overflow-hidden rounded-full bg-line"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, backgroundColor: target.accent }} /></div>
      <p className="mt-2 text-xs font-bold text-ink-3">{progress}%</p>
    </div>
  );
}

function HairEffectPreview({ src, color, intensity, label }: { src: string; color: string; intensity: number; label: string }) {
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-[24px] bg-ink shadow-card">
      <Image src={src} alt={label} fill sizes="260px" className="object-cover" unoptimized={src.startsWith('data:')} style={{ filter: `saturate(${.62 + intensity * .18}) contrast(1.02) brightness(${.96 + intensity * .015})` }} />
      <div className="absolute inset-0 mix-blend-color" style={{ backgroundColor: color, opacity: .28 + intensity * .09 }} />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-4 pb-4 pt-12 text-white"><p className="text-sm font-black">{label}</p></div>
    </div>
  );
}

function RouteChoice({ route, active, recommended, disabled, onClick, target }: { route: RouteType; active: boolean; recommended?: boolean; disabled?: boolean; onClick: () => void; target: TargetColor }) {
  const isToning = route === 'toning';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx('tap relative w-full rounded-[24px] border p-4 text-left transition-all disabled:opacity-45', active ? 'bg-white shadow-card' : 'border-line bg-cream/60')}
      style={active ? { borderColor: target.accent, boxShadow: `0 14px 30px ${target.accent}1f` } : undefined}
    >
      {recommended && <span className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-black text-white" style={{ backgroundColor: target.accent }}>更适合你</span>}
      <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl" style={{ backgroundColor: `${target.accent}1f`, color: target.deepAccent }}>{isToning ? <Drop size={23} weight="fill" /> : <Sparkle size={23} weight="fill" />}</div><div><p className="text-base font-black">{isToning ? '固色方案' : '染发方案'}</p><p className="mt-1 text-xs text-ink-3">{isToning ? '操作轻松 · 掉色较快' : '维持更久 · 操作更复杂'}</p></div></div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-cream p-2"><p className="text-[10px] text-ink-3">维持</p><p className="mt-1 text-xs font-black">{isToning ? '2–4周' : '5–8周'}</p></div><div className="rounded-xl bg-cream p-2"><p className="text-[10px] text-ink-3">难度</p><p className="mt-1 text-xs font-black">{isToning ? '简单' : '中等'}</p></div><div className="rounded-xl bg-cream p-2"><p className="text-[10px] text-ink-3">调整</p><p className="mt-1 text-xs font-black">{isToning ? '容易' : '较难'}</p></div></div>
      {active && <CheckCircle size={22} weight="fill" className="absolute -right-2 -top-2 text-good" />}
    </button>
  );
}

function ResultScreen({ target, currentPhoto, profile, route, setRoute, onBack, onContinue }: { target: TargetColor; currentPhoto: string; profile: HairProfile; route: RouteType; setRoute: (route: RouteType) => void; onBack: () => void; onContinue: () => void }) {
  const [tab, setTab] = useState<'expected' | 'risk'>('expected');
  const isBrown = target.id === 'brown';
  const recommendedRoute: RouteType = isBrown ? 'dye' : 'toning';
  const resultTitle = profile.hairState === 'pudding' && !isBrown ? '发尾能接近，发根会保留深色' : '可以接近目标色，建议控制鲜艳度';
  const match = isBrown ? 87 : profile.hairState === 'pudding' ? 76 : 84;

  return (
    <AppShell screen="result" onBack={onBack} accent={target.accent}>
      <main className="pb-5">
        <section className="px-4 pt-5">
          <div className="rounded-[28px] border border-white bg-white p-5 shadow-card">
            <div className="flex items-center justify-between"><span className="rounded-full bg-sage px-3 py-1.5 text-[11px] font-black text-good">可以在家完成</span><span className="text-xs font-bold text-ink-3">预计接近度 <b className="text-ink">{match}%</b></span></div>
            <h1 className="mt-4 text-[27px] font-black leading-[1.06] tracking-[-.04em]">{resultTitle}</h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">你的发尾约{profile.endsLevel}度，能承载{target.label}；{profile.hairState === 'pudding' ? `发根只有${profile.rootLevel}度，不漂时不会变成同样的${target.shortLabel}。` : '实际效果会比目标图片稍深。'}</p>
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-cream p-3 text-xs leading-relaxed text-ink-2"><ShieldCheck size={20} weight="fill" className="shrink-0 text-good" /><span>想让发根和发尾完全一致，需要先到理发店处理底色；本产品不提供自行漂发步骤。</span></div>
          </div>
        </section>

        <section className="mt-7">
          <div className="flex items-end justify-between px-4"><div><p className="text-[11px] font-black uppercase tracking-[.18em] text-ink-3">效果预览</p><h2 className="mt-1 text-xl font-black">先看大概率会变成什么样</h2></div><span className="text-[11px] font-bold text-ink-3">静态模拟</span></div>
          <div className="mx-4 mt-4 grid grid-cols-2 rounded-2xl bg-line/70 p-1">
            <button type="button" onClick={() => setTab('expected')} className={cx('tap rounded-xl px-3 py-2.5 text-xs font-black', tab === 'expected' && 'bg-white shadow-soft')}>预计效果 · 5档</button>
            <button type="button" onClick={() => setTab('risk')} className={cx('tap rounded-xl px-3 py-2.5 text-xs font-black', tab === 'risk' && 'bg-white shadow-soft')}>可能偏色</button>
          </div>
          {tab === 'expected' ? (
            <div className="mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
              {[1, 2, 3, 4, 5].map((intensity) => (
                <div key={intensity} className="w-[58%] shrink-0 snap-center"><HairEffectPreview src={currentPhoto} color={target.accent} intensity={intensity} label={intensity === 3 ? '推荐 · 最接近目标' : `鲜艳度 ${intensity}/5`} /></div>
              ))}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 px-4">
              <HairEffectPreview src={currentPhoto} color={target.riskColor} intensity={3} label={target.riskName} />
              <div className="relative aspect-[3/4] overflow-hidden rounded-[24px] bg-ink shadow-card">
                <Image src={currentPhoto} alt="布丁头根尾色差模拟" fill sizes="180px" className="object-cover" unoptimized={currentPhoto.startsWith('data:')} />
                <div className="absolute inset-x-0 bottom-0 h-[64%] mix-blend-color" style={{ backgroundColor: target.accent, opacity: .58 }} />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-4 pb-4 pt-12 text-white"><p className="text-sm font-black">根深尾亮</p></div>
              </div>
              <p className="col-span-2 rounded-2xl bg-orange-soft/70 p-3 text-xs leading-relaxed text-warn"><Warning size={16} className="mr-1 inline-block align-[-3px]" weight="fill" />最可能风险：黄色底色与蓝色色素叠加后偏青绿；发根不会与发尾同色。</p>
            </div>
          )}
        </section>

        <section className="mt-7 px-4">
          <div className="flex items-end justify-between"><div><p className="text-[11px] font-black uppercase tracking-[.18em] text-ink-3">选择操作路线</p><h2 className="mt-1 text-xl font-black">这次更适合染，还是固色？</h2></div></div>
          <div className="mt-4 grid gap-3">
            <RouteChoice route="toning" active={route === 'toning'} recommended={recommendedRoute === 'toning'} onClick={() => setRoute('toning')} target={target} />
            <RouteChoice route="dye" active={route === 'dye'} recommended={recommendedRoute === 'dye'} onClick={() => setRoute('dye')} target={target} />
          </div>
        </section>

        <section className="mt-6 px-4">
          <details className="rounded-[24px] border border-line bg-white px-4 py-3 shadow-soft"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black">其他风险与注意事项 <CaretDown size={16} /></summary><div className="mt-3 space-y-2 border-t border-line pt-3 text-xs leading-relaxed text-ink-2"><p>受损较重的发尾可能吸色更深，建议先做一小缕测试。</p><p>实际维持时间会随洗头频率、水温和产品浓度变化。</p><p>对商品成分敏感时，必须按说明提前进行皮肤测试。</p></div></details>
        </section>
      </main>
      <BottomAction><PrimaryButton onClick={onContinue} accent={target.accent}>按{route === 'toning' ? '固色' : '染发'}方案选产品</PrimaryButton></BottomAction>
    </AppShell>
  );
}

function ProductPack({ product, size = 'large' }: { product: Product; size?: 'small' | 'large' }) {
  return (
    <div className={cx('relative grid shrink-0 place-items-center rounded-[24px] bg-cream', size === 'large' ? 'h-40 w-32' : 'size-20')}>
      <div className={cx('absolute rounded-t-xl rounded-b-[18px] border-2 border-white/80 shadow-[0_10px_20px_rgba(61,46,34,.12)]', size === 'large' ? 'h-28 w-16' : 'h-14 w-9')} style={{ backgroundColor: product.color }}>
        <div className="absolute -top-3 left-1/2 h-4 w-8 -translate-x-1/2 rounded-t-lg bg-ink/70" />
        <div className="absolute inset-x-2 top-5 rounded-md bg-white/82 px-1 py-2 text-center text-[7px] font-black uppercase tracking-[.12em] text-ink">{product.brand.slice(0, 8)}</div>
      </div>
    </div>
  );
}

function ProductsScreen({ target, route, profile, selectedProduct, setSelectedProduct, onBack, onContinue }: { target: TargetColor; route: RouteType; profile: HairProfile; selectedProduct: Product | null; setSelectedProduct: (product: Product) => void; onBack: () => void; onContinue: () => void }) {
  const routeProducts = useMemo(() => PRODUCTS.filter((product) => product.route === route), [route]);
  const [budgetMin, setBudgetMin] = useState(0);
  const [budgetMax, setBudgetMax] = useState(360);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const tierLabel = { low: '入门价位', mid: '中档价位', high: '高档价位' } as const;
  const filtered = routeProducts.filter((product) => product.price * product.quantity >= budgetMin && product.price * product.quantity <= budgetMax);
  const visible = filtered.length > 0 ? filtered : [...routeProducts].sort((a, b) => Math.abs(a.price * a.quantity - budgetMax) - Math.abs(b.price * b.quantity - budgetMax)).slice(0, 3);
  const best = [...visible].sort((a, b) => b.score - a.score)[0];

  useEffect(() => {
    if (!selectedProduct || selectedProduct.route !== route) setSelectedProduct(best ?? routeProducts[0]);
  }, [best, route, routeProducts, selectedProduct, setSelectedProduct]);

  const selected = selectedProduct?.route === route ? selectedProduct : best;

  return (
    <AppShell screen="products" onBack={onBack} accent={target.accent}>
      <main className="px-4 pb-6 pt-5">
        <div className="flex items-center justify-between"><div><p className="text-[11px] font-black uppercase tracking-[.18em] text-orange">只推荐一类</p><h1 className="mt-1 text-[27px] font-black tracking-[-.04em]">{route === 'toning' ? '固色产品方案' : '染发产品方案'}</h1></div><span className="rounded-full bg-sage px-3 py-2 text-xs font-black text-good">共9款</span></div>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">已根据你的{target.label}目标、{profile.length}和{profile.volume}发量估算用量。价格按总用量计算。</p>

        <section className="mt-5 rounded-[26px] border border-line bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2"><CurrencyCny size={20} weight="bold" /><p className="text-sm font-black">我的预算范围</p></div><p className="text-sm font-black" style={{ color: target.deepAccent }}>¥{budgetMin} – ¥{budgetMax}</p></div>
          <label className="mt-4 block"><span className="text-[10px] font-bold text-ink-3">最低预算</span><input aria-label="最低预算" type="range" min="0" max="320" step="10" value={budgetMin} onChange={(event) => setBudgetMin(Math.min(Number(event.target.value), budgetMax - 20))} className="tony-range mt-2 w-full" style={{ '--range-accent': target.accent } as CSSProperties} /></label>
          <label className="mt-3 block"><span className="text-[10px] font-bold text-ink-3">最高预算</span><input aria-label="最高预算" type="range" min="40" max="700" step="10" value={budgetMax} onChange={(event) => setBudgetMax(Math.max(Number(event.target.value), budgetMin + 20))} className="tony-range mt-2 w-full" style={{ '--range-accent': target.accent } as CSSProperties} /></label>
          <div className="mt-4 grid grid-cols-3 gap-2">{[[0, 160, '低价'], [120, 320, '中价'], [280, 700, '高价']].map(([min, max, label]) => <button type="button" key={String(label)} onClick={() => { setBudgetMin(Number(min)); setBudgetMax(Number(max)); }} className="tap rounded-xl bg-cream py-2 text-xs font-black">{label}</button>)}</div>
        </section>

        {filtered.length === 0 && <div className="mt-4 rounded-2xl border border-orange/25 bg-orange-soft/55 p-3 text-xs leading-relaxed text-warn"><Info size={16} className="mr-1 inline-block align-[-3px]" />当前范围内没有完整方案，先显示最接近预算的3款。</div>}

        {best && (
          <section className="relative mt-6 overflow-hidden rounded-[30px] border-2 bg-white p-5 shadow-card" style={{ borderColor: target.accent }}>
            <span className="absolute right-4 top-4 rounded-full px-3 py-1.5 text-[10px] font-black text-white" style={{ backgroundColor: target.accent }}>预算内最佳</span>
            <div className="flex items-center gap-5"><ProductPack product={best} /><div className="min-w-0 flex-1"><p className="text-[11px] font-bold text-ink-3">{best.brand}</p><h2 className="mt-1 text-xl font-black leading-tight">{best.name}</h2><p className="mt-2 text-sm font-bold" style={{ color: target.deepAccent }}>{best.shade}</p><div className="mt-4 flex items-end gap-2"><p className="text-2xl font-black">¥{best.price * best.quantity}</p><p className="pb-1 text-[11px] text-ink-3">{best.quantity}件总价</p></div></div></div>
            <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-sage/55 p-3"><p className="text-[10px] font-bold text-good">适合你的地方</p><p className="mt-1 text-xs font-bold leading-relaxed text-ink">{best.pros[0]}</p></div><div className="rounded-2xl bg-orange-soft/60 p-3"><p className="text-[10px] font-bold text-warn">需要接受</p><p className="mt-1 text-xs font-bold leading-relaxed text-ink">{best.cons[0]}</p></div></div>
            <button type="button" onClick={() => setSelectedProduct(best)} className={cx('tap mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-black', selected?.id === best.id ? 'text-white' : 'bg-cream')} style={selected?.id === best.id ? { backgroundColor: target.accent, borderColor: target.accent } : { borderColor: 'var(--line)' }}>{selected?.id === best.id ? <Check size={17} weight="bold" /> : <Plus size={17} weight="bold" />}{selected?.id === best.id ? '已选为我的方案' : '选择这款'}</button>
          </section>
        )}

        <div className="mt-7 flex items-end justify-between"><div><p className="text-[11px] font-black uppercase tracking-[.18em] text-ink-3">其他选择</p><h2 className="mt-1 text-xl font-black">比较优点和代价</h2></div><span className="text-xs font-bold text-ink-3">{visible.length}款符合预算</span></div>
        <div className="mt-4 grid gap-3">
          {visible.filter((product) => product.id !== best?.id).map((product) => {
            const isSelected = selected?.id === product.id;
            const expanded = expandedId === product.id;
            return (
              <article key={product.id} className={cx('rounded-[24px] border bg-white p-4 transition-all', isSelected ? 'shadow-card' : 'border-line')} style={isSelected ? { borderColor: target.accent } : undefined}>
                <button type="button" className="flex w-full items-center gap-4 text-left" onClick={() => setExpandedId(expanded ? null : product.id)}>
                  <ProductPack product={product} size="small" />
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="rounded-full bg-cream px-2 py-1 text-[9px] font-black text-ink-2">{tierLabel[product.tier]}</span><span className="text-[10px] text-ink-3">匹配 {product.score}%</span></div><p className="mt-2 truncate text-sm font-black">{product.brand} · {product.name}</p><p className="mt-1 text-xs font-bold" style={{ color: target.deepAccent }}>{product.shade}</p></div>
                  <div className="text-right"><p className="text-lg font-black">¥{product.price * product.quantity}</p><CaretDown size={16} className={cx('ml-auto mt-2 text-ink-3 transition-transform', expanded && 'rotate-180')} /></div>
                </button>
                {expanded && <div className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-ink-2 animate-fadeIn"><p><b className="text-good">优点：</b>{product.pros.join('；')}</p><p className="mt-2"><b className="text-warn">缺点：</b>{product.cons.join('；')}</p><p className="mt-2"><b className="text-ink">用法：</b>{product.usage}</p><button type="button" onClick={() => setSelectedProduct(product)} className="tap mt-4 w-full rounded-2xl border py-3 font-black" style={isSelected ? { backgroundColor: target.accent, borderColor: target.accent, color: 'white' } : { borderColor: target.accent, color: target.deepAccent }}>{isSelected ? '已选择' : '选择这款'}</button></div>}
              </article>
            );
          })}
        </div>

        {selected && (
          <section className="mt-7 rounded-[28px] bg-ink p-5 text-white">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/50">官方底色效果参考</p><h2 className="mt-1 text-lg font-black">同一产品，底色不同结果不同</h2></div><Info size={20} className="text-white/50" /></div>
            <div className="mt-4 grid grid-cols-3 gap-3">{[{ level: 3, opacity: .25 }, { level: 6, opacity: .62 }, { level: 9, opacity: 1 }].map(({ level, opacity }) => <div key={level} className="text-center"><div className="mx-auto aspect-square w-full rounded-full border-4 border-white/10" style={{ background: `linear-gradient(145deg, ${selected.color}, #f1d1ad)`, filter: `saturate(${opacity}) brightness(${.55 + opacity * .55})` }} /><p className="mt-2 text-xs font-black">{level}度底色</p><p className="mt-1 text-[9px] text-white/50">{level === 3 ? '深而不明显' : level === 6 ? '接近商品色' : '最鲜明'}</p></div>)}</div>
          </section>
        )}
      </main>
      <BottomAction><PrimaryButton onClick={onContinue} disabled={!selected} accent={target.accent}>选好了，开始操作</PrimaryButton></BottomAction>
    </AppShell>
  );
}

function OperationScreen({ target, route, product, onBack, onFinish, onQuestionAnswered }: { target: TargetColor; route: RouteType; product: Product; onBack: () => void; onFinish: () => void; onQuestionAnswered: () => void }) {
  const chapters = route === 'toning' ? TONING_CHAPTERS : DYE_CHAPTERS;
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [answer, setAnswer] = useState('');
  const chapter = chapters[chapterIndex];

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const seek = () => { if (Number.isFinite(video.duration)) video.currentTime = chapter.start; };
    if (video.readyState >= 1) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
    void video.play().catch(() => undefined);
    return () => video.removeEventListener('loadedmetadata', seek);
  }, [chapter.start]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const loopChapter = () => { if (video.currentTime >= chapter.end) { video.currentTime = chapter.start; void video.play().catch(() => undefined); } };
    video.addEventListener('timeupdate', loopChapter);
    return () => video.removeEventListener('timeupdate', loopChapter);
  }, [chapter.end, chapter.start]);

  useEffect(() => {
    if (!timerActive || timerSeconds === null) return;
    timerRef.current = setInterval(() => setTimerSeconds((value) => {
      if (value === null || value <= 1) {
        setTimerActive(false);
        return 0;
      }
      return value - 1;
    }), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerActive, timerSeconds]);

  useEffect(() => () => {
    voiceTimersRef.current.forEach(clearTimeout);
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const formatTimer = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const startTimer = () => { setTimerSeconds(chapter.timerSeconds ?? 15 * 60); setTimerActive(true); };

  const finishChapter = () => {
    if (chapterIndex < chapters.length - 1) setChapterIndex((value) => value + 1);
    else onFinish();
  };

  const contextualAnswer = (text: string) => {
    if (/多久|时间|分钟/.test(text)) return chapter.timerSeconds ? `这一步按${Math.round(chapter.timerSeconds / 60)}分钟设置。时间到了先检查是否涂匀，再按教程冲洗。` : '这一步不需要额外等待，确认每一缕都处理到位后就可以继续。';
    if (/发根|黑色/.test(text)) return '深色发根不会和浅色发尾一样显色。重点把交界处揉匀，不要为了追求同色擅自延长时间。';
    if (/哪里|开始|顺序/.test(text)) return '从后脑勺下方开始，一小缕一小缕向上处理。这里最不容易看见，先做能减少漏色。';
    return `当前是“${chapter.title}”。先按页面的三条要点完成；如果皮肤明显不适，请立即停止并冲洗。`;
  };

  const askTony = (text: string) => {
    if (!text.trim()) return;
    setVoiceState('thinking');
    setAnswer('');
    const timer = setTimeout(() => { setAnswer(contextualAnswer(text)); setVoiceState('answering'); onQuestionAnswered(); }, 700);
    voiceTimersRef.current.push(timer);
  };

  const simulateVoice = async () => {
    setAskOpen(true);
    setAnswer('');
    try {
      const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
      voiceStreamRef.current = stream ?? null;
      setVoiceState('listening');
      const listeningTimer = setTimeout(() => {
        stream?.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
        const demoQuestion = chapter.timerSeconds ? '这一步需要等多久？' : '我应该从哪里开始？';
        setQuestion(demoQuestion);
        setVoiceState('thinking');
        const answerTimer = setTimeout(() => { setAnswer(contextualAnswer(demoQuestion)); setVoiceState('answering'); onQuestionAnswered(); }, 700);
        voiceTimersRef.current.push(answerTimer);
      }, 1300);
      voiceTimersRef.current.push(listeningTimer);
    } catch {
      setVoiceState('error');
      setAnswer('没有取得麦克风权限。你仍然可以在下面输入问题，或使用页面按钮继续。');
    }
  };

  return (
    <AppShell screen="operation" onBack={onBack} accent={target.accent}>
      <main className="relative min-h-[calc(100dvh-79px)] bg-cream md:min-h-[calc(100dvh-7.4rem)]">
        <section className="sticky top-[79px] z-10 bg-[#211e1b] text-white md:top-[79px]">
          <div className="relative aspect-video overflow-hidden">
            <video ref={videoRef} src={TUTORIAL_VIDEO_SRC} poster={chapter.frame} muted={isMuted} playsInline preload="metadata" className="size-full object-cover" />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-ink/70 to-transparent p-4 pb-10"><span className="rounded-full bg-ink/55 px-3 py-1.5 text-xs font-black backdrop-blur-md">第{chapterIndex + 1}/{chapters.length}步</span><div className="flex gap-2"><button type="button" onClick={() => { const video = videoRef.current; if (video?.paused) void video.play(); else video?.pause(); }} className="grid size-9 place-items-center rounded-full bg-ink/55 backdrop-blur-md" aria-label="播放或暂停"><Pause size={17} weight="fill" /></button><button type="button" onClick={() => setIsMuted((value) => !value)} className="grid size-9 place-items-center rounded-full bg-ink/55 backdrop-blur-md" aria-label={isMuted ? '打开声音' : '关闭声音'}>{isMuted ? <SpeakerSlash size={17} /> : <SpeakerHigh size={17} />}</button></div></div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-4 pt-12"><p className="text-base font-black">{chapter.title}</p><p className="mt-1 text-xs text-white/65">本章节会自动循环，直到你确认完成</p></div>
          </div>
          {timerSeconds !== null && (
            <div className="flex items-center justify-between border-t border-white/10 bg-[#2d2926] px-4 py-2.5 text-sm"><div className="flex items-center gap-2"><Timer size={18} weight="fill" style={{ color: target.accent }} /><span className="text-xs font-bold text-white/60">当前计时</span></div><p className="font-mono text-base font-black tabular-nums">{formatTimer(timerSeconds)}</p><button type="button" onClick={() => { setTimerActive(false); setTimerSeconds(null); }} className="text-xs font-bold text-white/55">取消</button></div>
          )}
        </section>

        <section className="px-4 pb-32 pt-5">
          <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">{chapters.map((item, index) => <button type="button" key={item.id} onClick={() => setChapterIndex(index)} className={cx('tap h-2 shrink-0 rounded-full transition-all', index === chapterIndex ? 'w-12' : index < chapterIndex ? 'w-6 bg-good' : 'w-6 bg-line')} style={index === chapterIndex ? { backgroundColor: target.accent } : undefined} aria-label={`跳到第${item.id}步`} />)}</div>

          <p className="mt-5 text-[11px] font-black uppercase tracking-[.18em] text-ink-3">现在只做这一件事</p>
          <h1 className="mt-2 text-[27px] font-black leading-tight tracking-[-.04em]">{chapter.summary}</h1>
          <div className="mt-5 divide-y divide-line rounded-[26px] border border-line bg-white px-4 shadow-soft">{chapter.points.map((point, index) => <div key={point} className="flex gap-3 py-4"><span className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-black text-white" style={{ backgroundColor: target.accent }}>{index + 1}</span><p className="pt-1 text-sm font-bold leading-relaxed">{point}</p></div>)}</div>
          {chapter.tip && <div className="mt-3 flex gap-3 rounded-[22px] bg-orange-soft/65 p-4 text-xs font-bold leading-relaxed text-warn"><Warning size={19} weight="fill" className="shrink-0" />{chapter.tip}</div>}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={startTimer} className="tap flex min-h-14 items-center justify-center gap-2 rounded-[18px] border border-line bg-white text-sm font-black shadow-soft"><Bell size={19} weight="fill" />{chapter.timerSeconds ? `设置${Math.round(chapter.timerSeconds / 60)}分钟` : '设置闹钟'}</button>
            <button type="button" onClick={() => void simulateVoice()} className="tap flex min-h-14 items-center justify-center gap-2 rounded-[18px] border border-line bg-white text-sm font-black shadow-soft"><Microphone size={19} weight="fill" />问 Tony</button>
          </div>

          <div className="mt-5 rounded-[24px] border border-line bg-white p-4 shadow-soft"><div className="flex items-center gap-3"><ProductPack product={product} size="small" /><div><p className="text-[10px] font-bold text-ink-3">当前使用产品</p><p className="mt-1 text-sm font-black">{product.brand} · {product.shade}</p><p className="mt-1 text-xs text-ink-2">{product.usage}</p></div></div></div>
        </section>

        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px] border-t border-line/80 bg-cream/94 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl md:bottom-5 md:rounded-b-[34px]">
          <PrimaryButton onClick={finishChapter} accent={target.accent}>{chapterIndex === chapters.length - 1 ? '全部完成，看看成果' : '这一步完成了'}</PrimaryButton>
        </div>
      </main>

      {askOpen && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/35 px-3 pb-3 backdrop-blur-[2px]">
          <div className="w-full max-w-[410px] rounded-[28px] bg-white p-5 shadow-2xl animate-slideUp">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-orange text-white"><Microphone size={19} weight="fill" /></div><div><p className="text-sm font-black">操作中问 Tony</p><p className="text-[10px] font-bold text-ink-3">当前步骤：{chapter.title}</p></div></div><button type="button" onClick={() => { setAskOpen(false); setVoiceState('idle'); }} className="grid size-9 place-items-center rounded-full bg-cream" aria-label="关闭"><X size={17} weight="bold" /></button></div>
            <div className="mt-5 rounded-[22px] bg-cream p-4">
              {voiceState === 'listening' && <div className="flex items-center gap-3"><span className="relative flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-orange opacity-60"/><span className="relative inline-flex size-3 rounded-full bg-orange"/></span><p className="text-sm font-black">正在听，请直接说问题</p></div>}
              {voiceState === 'thinking' && <div className="flex items-center gap-3"><LoadingGirl size={54} /><p className="text-sm font-black">正在结合当前步骤回答</p></div>}
              {voiceState === 'error' && <p className="text-sm font-bold leading-relaxed text-warn">{answer}</p>}
              {voiceState === 'answering' && <div><p className="text-[10px] font-bold text-ink-3">你问：{question}</p><p className="mt-2 text-sm font-bold leading-relaxed text-ink">{answer}</p></div>}
              {voiceState === 'idle' && <p className="text-sm text-ink-2">可以问“从哪里开始涂”“这一步要多久”或“发根为什么不上色”。</p>}
            </div>
            <div className="mt-4 flex gap-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') askTony(question); }} placeholder="输入操作中的问题" className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 text-sm outline-none focus:border-orange" /><button type="button" onClick={() => askTony(question)} className="tap grid size-12 shrink-0 place-items-center rounded-2xl text-white" style={{ backgroundColor: target.accent }} aria-label="发送问题"><ArrowRight size={18} weight="bold" /></button></div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function AchievementScreen({ target, currentPhoto, route, product, questionCount, onBack, onRestart }: { target: TargetColor; currentPhoto: string; route: RouteType; product: Product; questionCount: number; onBack: () => void; onRestart: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [afterPhoto, setAfterPhoto] = useState<string>(currentPhoto);
  const [saved, setSaved] = useState(false);
  const [transitionState, setTransitionState] = useState<'idle' | 'generating' | 'ready'>('idle');

  const chooseAfterPhoto = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAfterPhoto(String(reader.result));
    reader.readAsDataURL(file);
  };

  const saveRecord = () => {
    try {
      localStorage.setItem('tony-hair-record:v1', JSON.stringify({ version: 1, target: target.label, route, product: product.name, questionCount, createdAt: new Date().toISOString() }));
    } catch {}
    setSaved(true);
  };

  const generateTransition = () => {
    setTransitionState('generating');
    setTimeout(() => setTransitionState('ready'), 1500);
  };

  return (
    <AppShell screen="achievement" onBack={onBack} accent={target.accent}>
      <main className="px-4 pb-8 pt-5">
        <div className="text-center"><div className="mx-auto grid size-14 place-items-center rounded-[20px] bg-sage text-good shadow-card"><Star size={28} weight="fill" /></div><p className="mt-4 text-[11px] font-black uppercase tracking-[.2em] text-good">Hair Mission Complete</p><h1 className="mt-2 text-[30px] font-black tracking-[-.05em]">这次染发，完成了</h1><p className="mt-2 text-sm text-ink-2">保存经验，下次 Tony 会更懂你的头发。</p></div>

        <section className="mt-6 overflow-hidden rounded-[30px] border border-white bg-white p-3 shadow-card">
          <div className="grid grid-cols-2 gap-2">
            <div className="relative aspect-[3/4] overflow-hidden rounded-[22px]"><Image src={currentPhoto} alt="染前照片" fill sizes="190px" className="object-cover" unoptimized={currentPhoto.startsWith('data:')} /><span className="absolute bottom-2 left-2 rounded-full bg-ink/70 px-2.5 py-1 text-[10px] font-black text-white">染前</span></div>
            <button type="button" onClick={() => fileRef.current?.click()} className="relative aspect-[3/4] overflow-hidden rounded-[22px] text-left"><Image src={afterPhoto} alt="染后照片" fill sizes="190px" className="object-cover" unoptimized={afterPhoto.startsWith('data:')} style={{ filter: `saturate(1.4) contrast(1.04)` }} /><div className="absolute inset-0 mix-blend-color" style={{ backgroundColor: target.accent, opacity: .48 }} /><span className="absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-[10px] font-black text-white" style={{ backgroundColor: target.deepAccent }}>染后 · 点击重拍</span><Camera size={20} weight="fill" className="absolute right-3 top-3 text-white drop-shadow" /></button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => chooseAfterPhoto(event.target.files?.[0])} />
        </section>

        <section className="mt-4 rounded-[28px] border border-line bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold text-ink-3">本次染发档案</p><h2 className="mt-1 text-lg font-black">{target.label} · {route === 'toning' ? '固色' : '染发'}</h2></div><div className="grid size-12 place-items-center rounded-2xl" style={{ backgroundColor: `${target.accent}24`, color: target.deepAccent }}><Sparkle size={22} weight="fill" /></div></div>
          <div className="mt-5 divide-y divide-line border-y border-line text-sm"><div className="flex justify-between py-3"><span className="text-ink-3">操作产品</span><b className="max-w-[220px] text-right">{product.brand} · {product.shade}</b></div><div className="flex justify-between py-3"><span className="text-ink-3">当前底色</span><b>发根3度 / 发尾8度</b></div><div className="flex justify-between py-3"><span className="text-ink-3">预计维持</span><b>{product.duration}</b></div><div className="flex justify-between py-3"><span className="text-ink-3">操作问答</span><b>已记录{questionCount}条</b></div></div>
          <p className="mt-4 rounded-2xl bg-cream p-3 text-xs font-bold leading-relaxed text-ink-2">下次提醒：蓝色掉到浅青后再补色；重新拍照确认当前底色，不直接沿用本次记录。</p>
          <button type="button" onClick={saveRecord} className={cx('tap mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black', saved ? 'bg-sage text-good' : 'border border-line bg-white')}><CheckCircle size={18} weight="fill" />{saved ? '已保存到个人档案' : '保存到我的染发档案'}</button>
        </section>

        <section className="mt-4 overflow-hidden rounded-[28px] bg-[#201d1a] p-5 text-white shadow-card">
          {transitionState === 'generating' ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center"><LoadingGirl size={98} /><p className="mt-2 text-sm font-black">正在生成染前染后转场</p><p className="mt-1 text-xs text-white/50">同时准备标题和话题标签</p></div>
          ) : transitionState === 'ready' ? (
            <div className="animate-fadeIn"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-white text-ink"><Check size={20} weight="bold" /></div><div><p className="text-sm font-black">转场内容已准备好</p><p className="mt-1 text-xs text-white/50">9:16 · 染前0.8秒 · 染后定格2秒</p></div></div><p className="mt-4 rounded-2xl bg-white/8 p-3 text-xs leading-relaxed text-white/75">标题建议：从8度金到{target.label}，第一次自己在家固色没有翻车</p><div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold text-white/65"><span>#染发前后</span><span>#发色分享</span><span>#{target.label}</span><span>#做自己的Tony</span></div><button type="button" className="tap mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-black text-ink"><ShareNetwork size={18} weight="fill" />模拟发布到抖音</button></div>
          ) : (
            <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-white/45">回到抖音</p><h2 className="mt-2 text-xl font-black">把这次变化变成一条转场视频</h2><p className="mt-2 text-xs leading-relaxed text-white/60">自动使用染前、染后照片，并给出标题和话题标签。</p><button type="button" onClick={generateTransition} className="tap mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-black text-ink"><VideoCamera size={19} weight="fill" />生成抖音转场</button></div>
          )}
        </section>

        <button type="button" onClick={onRestart} className="tap mt-5 w-full py-3 text-sm font-black text-ink-2">再体验一个发色</button>
      </main>
    </AppShell>
  );
}

export default function PrototypeApp() {
  const [screen, setScreen] = useState<Screen>('douyin');
  const [target, setTarget] = useState<TargetColor>(TARGETS[2]);
  const [currentPhoto, setCurrentPhoto] = useState<string>(FALLBACK_PHOTO);
  const [profile, setProfile] = useState<HairProfile>(defaultProfile);
  const [route, setRoute] = useState<RouteType>('toning');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(PRODUCTS.find((product) => product.id === 'toning-4') ?? null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [resultLoading, setResultLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const transitionTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => () => transitionTimers.current.forEach(clearTimeout), []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [screen]);

  const enterCamera = () => setScreen('camera');

  const captureComplete = (photo: string) => {
    setCurrentPhoto(photo);
    setAnalysisLoading(true);
    const timer = setTimeout(() => { setAnalysisLoading(false); setScreen('confirm'); }, 2300);
    transitionTimers.current.push(timer);
  };

  const analyzeResult = () => {
    setResultLoading(true);
    const recommendedRoute: RouteType = target.id === 'brown' ? 'dye' : 'toning';
    setRoute(recommendedRoute);
    const timer = setTimeout(() => { setResultLoading(false); setScreen('result'); }, 2100);
    transitionTimers.current.push(timer);
  };

  const goProducts = () => {
    const first = PRODUCTS.filter((product) => product.route === route).sort((a, b) => b.score - a.score)[0];
    setSelectedProduct(first);
    setScreen('products');
  };

  const restart = () => {
    setScreen('douyin');
    setCurrentPhoto(FALLBACK_PHOTO);
    setProfile(defaultProfile);
    setRoute('toning');
    setSelectedProduct(PRODUCTS.find((product) => product.id === 'toning-4') ?? null);
    setQuestionCount(0);
  };

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,_rgba(252,206,180,.42),_transparent_40%),var(--cream)] md:py-px">
      {screen === 'douyin' && <DouyinScene target={target} onTargetChange={setTarget} onEnter={enterCamera} />}
      {screen === 'camera' && <CameraScreen target={target} onBack={() => setScreen('douyin')} onCaptured={captureComplete} />}
      {screen === 'confirm' && <ConfirmScreen target={target} currentPhoto={currentPhoto} profile={profile} setProfile={setProfile} onBack={() => setScreen('camera')} onContinue={analyzeResult} />}
      {screen === 'result' && <ResultScreen target={target} currentPhoto={currentPhoto} profile={profile} route={route} setRoute={setRoute} onBack={() => setScreen('confirm')} onContinue={goProducts} />}
      {screen === 'products' && <ProductsScreen target={target} route={route} profile={profile} selectedProduct={selectedProduct} setSelectedProduct={setSelectedProduct} onBack={() => setScreen('result')} onContinue={() => setScreen('operation')} />}
      {screen === 'operation' && selectedProduct && <OperationScreen target={target} route={route} product={selectedProduct} onBack={() => setScreen('products')} onFinish={() => setScreen('achievement')} onQuestionAnswered={() => setQuestionCount((count) => count + 1)} />}
      {screen === 'achievement' && selectedProduct && <AchievementScreen target={target} currentPhoto={currentPhoto} route={route} product={selectedProduct} questionCount={questionCount} onBack={() => setScreen('operation')} onRestart={restart} />}

      {analysisLoading && <div className="fixed inset-0 z-[100] mx-auto max-w-[430px]"><AnalysisLoading target={target} currentPhoto={currentPhoto} /></div>}
      {resultLoading && <div className="fixed inset-0 z-[100] mx-auto max-w-[430px]"><ResultLoading target={target} /></div>}
    </div>
  );
}
