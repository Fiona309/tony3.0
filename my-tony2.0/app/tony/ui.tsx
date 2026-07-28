'use client';

import Image, { type ImageLoaderProps } from 'next/image';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  HeartStraight,
  Info,
  Sparkle,
  Star,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from 'react';
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type DoodleTone = 'pink' | 'lavender' | 'mint' | 'yellow';

const doodleTones: Record<DoodleTone, string> = {
  pink: 'text-[#e9719c]',
  lavender: 'text-[#8f7bd1]',
  mint: 'text-[#79ad86]',
  yellow: 'text-[#e4a91f]',
};

export function DoodleIcon({
  kind = 'star',
  tone = 'pink',
  size = 26,
  className,
}: {
  kind?: 'star' | 'heart' | 'sparkle';
  tone?: DoodleTone;
  size?: number;
  className?: string;
}) {
  const Icon = kind === 'heart' ? HeartStraight : kind === 'sparkle' ? Sparkle : Star;
  return (
    <Icon
      size={size}
      weight="duotone"
      className={cx('drop-shadow-[1px_1px_0_rgba(61,55,51,.28)]', doodleTones[tone], className)}
      aria-hidden="true"
    />
  );
}

export function TapeLabel({
  children,
  tone = 'pink',
  className,
}: {
  children: ReactNode;
  tone?: DoodleTone;
  className?: string;
}) {
  const fills: Record<DoodleTone, string> = {
    pink: 'bg-[#f8c2d2] text-[#9b315b]',
    lavender: 'bg-[#ddd3f5] text-[#6756a3]',
    mint: 'bg-[#d5ead8] text-[#397247]',
    yellow: 'bg-[#fae5a9] text-[#a26d00]',
  };
  return (
    <span
      className={cx(
        'relative inline-flex -rotate-1 items-center px-3 py-1 text-xs font-black before:absolute before:-left-1 before:inset-y-0 before:w-2 before:bg-inherit before:[clip-path:polygon(100%_0,35%_14%,100%_28%,30%_47%,100%_66%,25%_84%,100%_100%)] after:absolute after:-right-1 after:inset-y-0 after:w-2 after:bg-inherit after:[clip-path:polygon(0_0,65%_14%,0_28%,70%_47%,0_66%,75%_84%,0_100%)]',
        fills[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ScribbleUnderline({
  children,
  tone = 'pink',
  className,
}: {
  children: ReactNode;
  tone?: DoodleTone;
  className?: string;
}) {
  const lines: Record<DoodleTone, string> = {
    pink: 'decoration-[#ef92ae]',
    lavender: 'decoration-[#a596d7]',
    mint: 'decoration-[#98c7a1]',
    yellow: 'decoration-[#edc55b]',
  };
  return (
    <span className={cx('underline decoration-[3px] underline-offset-[5px]', lines[tone], className)}>
      {children}
    </span>
  );
}

export function NotebookCard({
  children,
  tone = 'lavender',
  className,
}: {
  children: ReactNode;
  tone?: DoodleTone;
  className?: string;
}) {
  const borders: Record<DoodleTone, string> = {
    pink: 'border-[#df7fa2] bg-[#fff8fa]',
    lavender: 'border-[#9d8ed4] bg-[#fbf9ff]',
    mint: 'border-[#78a983] bg-[#fbfff9]',
    yellow: 'border-[#ddb342] bg-[#fffaf0]',
  };
  return (
    <section className={cx('relative border-[1.6px] p-4', borders[tone], className)}>
      <span className="absolute -right-2 -top-2 h-5 w-12 rotate-[18deg] border border-[#c9b27f]/40 bg-[#ead7aa]/80" aria-hidden="true" />
      {children}
    </section>
  );
}

export function Polaroid({
  src,
  alt,
  caption,
  className,
}: {
  src: string;
  alt: string;
  caption: string;
  className?: string;
}) {
  return (
    <figure className={cx('sketch-photo relative bg-white p-2 pb-7', className)}>
      <span className="absolute -top-2 left-1/2 z-10 h-4 w-12 -translate-x-1/2 -rotate-3 bg-[#d8cef2]/85" />
      <div className="relative aspect-[4/5] overflow-hidden bg-line">
        <MediaImage src={src} alt={alt} className="object-cover" />
      </div>
      <figcaption className="absolute inset-x-1 bottom-1 text-center text-[10px] font-black">
        {caption}
      </figcaption>
    </figure>
  );
}

type CandyVariant = 'pink' | 'green' | 'yellow' | 'white';

const candyStyles: Record<
  CandyVariant,
  {
    fill: string;
    stroke: string;
    text: string;
    rotate: string;
  }
> = {
  pink: {
    fill: '#F5A3BE',
    stroke: '#3D3733',
    text: '#3D3733',
    rotate: '-0.5deg',
  },
  green: {
    fill: '#AFD6B8',
    stroke: '#3D3733',
    text: '#3D3733',
    rotate: '0.4deg',
  },
  yellow: {
    fill: '#F8D98A',
    stroke: '#3D3733',
    text: '#3D3733',
    rotate: '-0.3deg',
  },
  white: {
    fill: '#FFFDFA',
    stroke: '#3D3733',
    text: '#3D3733',
    rotate: '0.5deg',
  },
};

function CandyButtonShape({
  variant,
  gradientId,
}: {
  variant: CandyVariant;
  gradientId: string;
}) {
  const style = candyStyles[variant];

  return (
    <svg
      className="candy-btn__shape"
      viewBox="0 0 248 54"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <filter id={`${gradientId}-rough`} x="-4%" y="-12%" width="108%" height="124%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018 0.12"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.75" />
        </filter>
      </defs>
      <path
        d="M30 3 C90 1 170 2 218 4 C236 6 245 17 245 27 C245 38 236 50 216 51 C160 54 80 53 32 51 C13 50 3 38 3 27 C3 16 13 5 30 3 Z"
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth="2.25"
        filter={`url(#${gradientId}-rough)`}
        vectorEffect="non-scaling-stroke"
      />
      {variant !== 'white' ? (
        <path
          d="M35 12 C78 9 142 10 205 12"
          fill="none"
          stroke="rgba(255,255,255,.72)"
          strokeWidth="2.8"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

export function CandyButton({
  children,
  onClick,
  disabled,
  icon,
  type = 'button',
  className,
  variant = 'pink',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  type?: 'button' | 'submit';
  className?: string;
  variant?: CandyVariant;
}) {
  const gradientId = useId().replace(/:/g, '');
  const style = candyStyles[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx('candy-btn tap', className)}
      style={{ transform: `rotate(${style.rotate})` }}
    >
      <CandyButtonShape variant={variant} gradientId={gradientId} />
      <span
        className="candy-btn__label"
        style={{ color: style.text }}
      >
        {icon}
        <span>{children}</span>
      </span>
    </button>
  );
}

const passthroughLoader = ({ src }: ImageLoaderProps) => src;

export function MediaImage({
  src,
  alt,
  className,
  sizes = '430px',
  priority = false,
  style,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  style?: CSSProperties;
}) {
  return (
    <Image
      loader={passthroughLoader}
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized
      className={className}
      style={style}
    />
  );
}

const loadingFrames = [
  '/loading/01-mirror.png',
  '/loading/02-brush.png',
  '/loading/05-blowdry.png',
  '/loading/03-reading.png',
  '/loading/04-reading2.png',
];

export function LoadingGirl({
  size = 112,
  label,
}: {
  size?: number;
  label?: string;
}) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setFrame((value) => (value + 1) % loadingFrames.length),
      460,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3" role="status">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {loadingFrames.map((src, index) => (
          <Image
            key={src}
            src={src}
            alt=""
            fill
            sizes={`${size}px`}
            className={cx(
              'object-contain transition-opacity duration-200',
              frame === index ? 'opacity-100' : 'opacity-0',
            )}
          />
        ))}
      </div>
      {label ? <p className="text-sm font-semibold text-ink-2">{label}</p> : null}
    </div>
  );
}

export function MascotNote({
  title,
  children,
  frame = '/loading/01-mirror.png',
  tone = 'sky',
}: {
  title: string;
  children: ReactNode;
  frame?: string;
  tone?: 'sky' | 'sage' | 'peach';
}) {
  const tones = {
    sky: 'border-sky-dark/25 bg-sky/25',
    sage: 'border-sage-dark/25 bg-sage/35',
    peach: 'border-orange/20 bg-orange-soft/35',
  };

  return (
    <aside
      className={cx(
        'relative grid grid-cols-[78px_1fr] items-center gap-3 overflow-hidden rounded-[24px] border px-3 py-2.5 shadow-soft',
        tones[tone],
      )}
    >
      <div
        className="pointer-events-none absolute -right-3 -top-3 size-12 rounded-full border border-white/70 bg-white/25"
        aria-hidden="true"
      />
      <div className="relative h-[76px] w-[78px] self-end" aria-hidden="true">
        <Image
          src={frame}
          alt=""
          fill
          sizes="78px"
          className="object-contain object-bottom drop-shadow-[0_8px_14px_rgba(61,46,34,.12)]"
        />
      </div>
      <div className="relative py-1 pr-2">
        <p className="text-xs font-black tracking-tight text-ink">{title}</p>
        <div className="mt-1 text-[11px] leading-[1.65] text-ink-2">{children}</div>
      </div>
    </aside>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-end gap-1.5">
      <p className="text-[15px] font-black tracking-tight text-ink">做自己的</p>
      {!compact ? (
        <p
          className="font-[family-name:var(--font-script)] text-[22px] font-bold leading-none text-pink"
          style={{ transform: 'rotate(-4deg)' }}
        >
          Tony
        </p>
      ) : null}
    </div>
  );
}

function BrandDoodles() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <Star
        className="animate-tony-drift absolute left-3 top-32 text-sky-dark/28"
        size={18}
        weight="fill"
      />
      <HeartStraight
        className="animate-tony-drift-delay absolute right-3 top-[38%] text-orange/22"
        size={22}
        weight="fill"
      />
      <Sparkle
        className="animate-tony-drift absolute bottom-36 left-2 text-sage-dark/28"
        size={19}
        weight="fill"
      />
      <svg
        className="absolute -right-5 top-52 h-20 w-28 rotate-12 text-orange/14"
        viewBox="0 0 112 80"
        fill="none"
      >
        <path
          d="M4 46C20 10 40 73 57 35C70 7 84 63 108 21"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function AppFrame({
  children,
  title,
  eyebrow,
  onBack,
  progress,
  headerAction,
  fullBleed = false,
  className,
  contentClassName,
}: {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
  onBack?: () => void;
  progress?: { current: number; total: number; label: string };
  headerAction?: ReactNode;
  fullBleed?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <main
      className={cx(
        // 高度与比例由 globals.css 的 .tony-app 统一控制（手机填满 100dvh，桌面 9:16 模型），
        // 这里不再用 aspect-[9/16]/h-auto，避免两套高度体系打架。
        'tony-app relative mx-auto flex min-h-0 flex-col overflow-x-hidden bg-cream text-ink md:my-5 md:rounded-[34px] md:border-2 md:border-ink',
        className,
      )}
    >
      {!fullBleed ? <BrandDoodles /> : null}
      {!fullBleed ? (
        <header className="tony-app-header relative z-[2] border-b border-ink/25 bg-cream px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))]">
          <div className="grid grid-cols-[44px_1fr_44px] items-center">
            <div>
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="sketch-icon-button tap grid size-10 place-items-center bg-white text-ink"
                  aria-label="返回上一页"
                >
                  <ArrowLeft size={19} weight="bold" />
                </button>
              ) : (
                <BrandMark compact />
              )}
            </div>
            <div className="min-w-0 text-center">
              {eyebrow ? (
                <p className="truncate text-[10px] font-bold uppercase tracking-[.16em] text-ink-3">
                  {eyebrow}
                </p>
              ) : null}
              {title ? (
                <p className="truncate text-sm font-black tracking-tight">{title}</p>
              ) : (
                <BrandMark compact />
              )}
            </div>
            <div className="flex justify-end">{headerAction}</div>
          </div>
          {progress ? (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold text-ink-3">
                <span>{progress.label}</span>
                <span className="numerals">
                  {progress.current}/{progress.total}
                </span>
              </div>
              <div className="sketch-progress h-1.5 overflow-hidden bg-line">
                <div
                  className="h-full bg-pink transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, (progress.current / progress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </header>
      ) : null}
      {/* 内容区撑满真实屏高；所有页面操作按钮都留在内容流中，
          仅 AgentShell 的主导航固定在屏幕底部。 */}
      <div className={cx(fullBleed ? 'h-full' : 'relative z-[1] flex-1', contentClassName)}>
        {children}
      </div>
    </main>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
  markerTone = 'pink',
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  markerTone?: 'pink' | 'green' | 'sky';
}) {
  const markerFills = {
    pink: '#FBDCE6',
    green: '#DCEFE1',
    sky: '#CFE4F2',
  };

  return (
    <div className="relative px-5 pb-5 pt-7">
      {eyebrow ? (
        <p className="mb-2 inline-flex -rotate-1 items-center rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-bold tracking-[.12em] text-ink-3">
          {eyebrow}
        </p>
      ) : null}
      <div className="marker-title w-fit max-w-full">
        <svg
          className="marker-title__stroke"
          viewBox="0 0 160 46"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M4 30 C24 25 60 27 96 26 C124 25 148 28 156 25 C158 30 157 36 154 39 C130 42 90 39 58 41 C34 42 12 40 5 41 C2 38 2 33 4 30 Z"
            fill={markerFills[markerTone]}
          />
        </svg>
        <h1 className="relative z-[1] max-w-[13ch] text-[34px] font-black leading-[.98] tracking-[-.045em] text-ink">
          {title}
        </h1>
      </div>
      {description ? (
        <p className="mt-4 max-w-[38ch] text-sm leading-6 text-ink-2">{description}</p>
      ) : null}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  icon,
  type = 'button',
  className,
  variant = 'pink',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  type?: 'button' | 'submit';
  className?: string;
  variant?: CandyVariant;
}) {
  return (
    <CandyButton
      type={type}
      onClick={onClick}
      disabled={disabled}
      variant={variant}
      className={className}
      icon={icon === undefined ? <ArrowRight size={18} weight="bold" /> : icon}
    >
      {children}
    </CandyButton>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  icon,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <CandyButton
      onClick={onClick}
      disabled={disabled}
      variant="white"
      className={className}
      icon={icon}
    >
      {children}
    </CandyButton>
  );
}

export function BottomBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'tony-bottom-bar relative shrink-0 border-t border-ink/25 bg-cream px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatusNotice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'success' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    info: 'border-sky-dark/30 bg-sky/25 text-ink',
    warning: 'border-orange/30 bg-orange-soft/55 text-ink',
    success: 'border-sage-dark/35 bg-sage/45 text-ink',
    danger: 'border-red-300/60 bg-red-50 text-red-950',
  };
  const Icon = tone === 'success' ? Check : tone === 'info' ? Info : WarningCircle;
  return (
    <div className={cx('sketch-card sketch-card--compact flex gap-3 border p-4', styles[tone])}>
      <Icon className="mt-0.5 shrink-0" size={19} weight="bold" />
      <div className="min-w-0">
        {title ? <p className="mb-1 text-sm font-black">{title}</p> : null}
        <div className="text-xs leading-5 text-current/80">{children}</div>
      </div>
    </div>
  );
}

export function ErrorState({
  title = '这一步没有完成',
  message,
  onRetry,
  retryLabel = '重新尝试',
  secondary,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondary?: ReactNode;
}) {
  return (
    <div className="mx-5 my-8 rounded-[28px] border border-red-200 bg-red-50/85 p-6 text-red-950 shadow-soft">
      <WarningCircle size={28} weight="fill" />
      <h2 className="mt-4 text-xl font-black tracking-tight">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-red-900/75">{message}</p>
      <div className="mt-5 grid gap-2">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="tap min-h-12 rounded-[16px] bg-red-900 px-4 text-sm font-bold text-white"
          >
            {retryLabel}
          </button>
        ) : null}
        {secondary}
      </div>
    </div>
  );
}

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cx('animate-tony-shimmer rounded-2xl bg-line', className)}
      style={style}
      aria-hidden="true"
    />
  );
}

export function Sheet({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/35 px-3 pb-[calc(88px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sketch-sheet animate-sheetUp max-h-[calc(100dvh-108px-env(safe-area-inset-bottom))] w-full max-w-[430px] overflow-y-auto border-2 border-ink bg-cream p-5 pb-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-black tracking-tight">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-xs leading-5 text-ink-2">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="sketch-icon-button tap grid size-10 shrink-0 place-items-center bg-white"
            aria-label="关闭"
          >
            <X size={18} weight="bold" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </section>
    </div>
  );
}

export function ChoiceList({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string; helper?: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cx(
              'sketch-choice tap flex min-h-14 items-center justify-between gap-3 border px-4 text-left',
              selected
                ? 'border-orange bg-orange-soft/55'
                : 'border-line bg-white hover:border-orange/40',
            )}
          >
            <div>
              <p className="text-sm font-bold">{option.label}</p>
              {option.helper ? (
                <p className="mt-0.5 text-xs leading-5 text-ink-3">{option.helper}</p>
              ) : null}
            </div>
            <span
              className={cx(
                'grid size-6 shrink-0 place-items-center rounded-full border',
                selected
                  ? 'border-orange bg-orange text-white'
                  : 'border-line bg-cream text-transparent',
              )}
            >
              <Check size={13} weight="bold" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
