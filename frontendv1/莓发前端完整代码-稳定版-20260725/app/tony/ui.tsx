'use client';

import Image, { type ImageLoaderProps } from 'next/image';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  Sparkle,
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

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="grid size-9 place-items-center rounded-[14px] bg-orange text-white shadow-orange">
        <Sparkle size={18} weight="fill" />
      </div>
      {!compact ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-ink-3">
            Berry Hair
          </p>
          <p className="text-sm font-black tracking-tight text-ink">莓发</p>
        </div>
      ) : null}
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
}: {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
  onBack?: () => void;
  progress?: { current: number; total: number; label: string };
  headerAction?: ReactNode;
  fullBleed?: boolean;
}) {
  return (
    <main className="relative mx-auto min-h-[100dvh] w-full max-w-[460px] overflow-x-hidden bg-cream text-ink shadow-[0_24px_80px_rgba(61,46,34,.14)] md:my-5 md:min-h-[calc(100dvh-2.5rem)] md:rounded-[36px] md:border md:border-white/80">
      {!fullBleed ? (
        <header className="sticky top-0 z-30 border-b border-line/80 bg-cream/92 px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur-xl">
          <div className="grid grid-cols-[44px_1fr_44px] items-center">
            <div>
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="tap grid size-10 place-items-center rounded-full border border-line bg-white text-ink shadow-soft"
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
                <p className="text-sm font-black">莓发</p>
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
              <div className="h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-orange transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, (progress.current / progress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </header>
      ) : null}
      {children}
    </main>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="px-5 pb-5 pt-7">
      {eyebrow ? (
        <p className="mb-2 text-[11px] font-black uppercase tracking-[.18em] text-orange-dark">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="max-w-[13ch] text-[34px] font-black leading-[.98] tracking-[-.045em] text-ink">
        {title}
      </h1>
      {description ? (
        <p className="mt-3 max-w-[38ch] text-sm leading-6 text-ink-2">{description}</p>
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
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'tap flex min-h-14 w-full items-center justify-center gap-2 rounded-[19px] bg-orange px-5 text-[15px] font-black text-white shadow-orange disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
    >
      <span>{children}</span>
      {icon === undefined ? <ArrowRight size={18} weight="bold" /> : icon}
    </button>
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'tap flex min-h-12 w-full items-center justify-center gap-2 rounded-[17px] border border-line bg-white px-4 text-sm font-bold text-ink shadow-soft disabled:opacity-40',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 border-t border-line/80 bg-cream/94 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
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
    <div className={cx('flex gap-3 rounded-[18px] border p-4', styles[tone])}>
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-3 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-sheetUp w-full max-w-[430px] rounded-[30px] border border-white/80 bg-cream p-5 shadow-[0_28px_80px_rgba(61,46,34,.24)]"
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
            className="tap grid size-10 shrink-0 place-items-center rounded-full border border-line bg-white"
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
              'tap flex min-h-14 items-center justify-between gap-3 rounded-[17px] border px-4 text-left',
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
