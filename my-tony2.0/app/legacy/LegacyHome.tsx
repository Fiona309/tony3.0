'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import PrototypeApp from '../prototype/PrototypeApp';

interface HairImage {
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  preview: string;
}

interface HairAnalysis {
  length: string;
  color: string;
  bleach_count: number;
  color_note: string;
  target_color: string;
  target_color_note: string;
}

interface TutorialData {
  dyes: Array<{
    tier: string;
    name: string;
    product_type?: string;
    bottle_ml: number;
    quantity: number;
    quantity_reason: string;
    price?: string | null;
    monthly_sales?: string | null;
    pros?: string[];
    cons?: string[];
    reviews?: Array<{ quote: string; source_url: string }>;
    mixing?: {
      components: Array<{ label: string; ml: number }>;
      ratio_display: string;
      instructions: string;
      reference_quote?: string;
      custom_notes?: string;
    };
  }>;
  care: Array<{ type: string; name: string; timing: string; bottle_ml?: number; quantity?: number; quantity_reason?: string; price?: string | null }>;
  steps: Array<{ title: string; content: string; tip?: string }>;
  expectation: string;
  simulated_premise?: string;
}

interface VideoFrame { path: string; time: number; }
interface VideoActionStep {
  step: number;
  category: '调色' | '选品' | '涂抹' | '冲洗护理';
  title: string;
  content: string;
  start: number;
  end: number;
  tip?: string;
  frames: VideoFrame[];
}
interface VideoKnowledge { topic: string; content: string; start: number; end: number; }
interface VideoAnalysis {
  video_path?: string;
  duration: number;
  title: string;
  summary: string;
  background_knowledge: VideoKnowledge[];
  action_steps: VideoActionStep[];
  upload_id?: string;
}

interface CompareResult {
  verdict: 'possible' | 'partial' | 'impossible';
  one_line: string;
  approach_match: number;
  limitations: string[];
  budget_min: number;
  budget_max: number;
  time_hours: number;
  when_can_do: string;
  pre_required_steps?: Array<{
    action: string;
    where?: string;
    cost?: string;
    duration?: string;
  }>;
  blogger_profile?: {
    color: string;
    bleach_count: string;
    length: string;
    notes: string;
  };
  diffs?: Array<{
    aspect: string;
    blogger: string;
    user: string;
    impact: 'high' | 'medium' | 'low';
    adjustment: string;
  }>;
  summary?: string;
}

interface ParsedBlogger {
  platform: 'xiaohongshu' | 'douyin';
  title: string;
  desc: string;
  author: string;
  tags: string[];
  images: string[];
  comments: Array<{ text: string; likes: number; isPinned: boolean; isAuthor: boolean }>;
  formatted: string;
}

type Step = 'input' | 'feasibility' | 'product' | 'mixing' | 'operation';

const STEPS: Array<{ id: Step; label: string; short: string; emoji: string }> = [
  { id: 'input',       label: '上传与解析', short: '上传', emoji: '📸' },
  { id: 'feasibility', label: '能否染成功', short: '判断', emoji: '🔮' },
  { id: 'product',     label: '选染膏',     short: '选品', emoji: '🛒' },
  { id: 'mixing',      label: '怎么调',     short: '调配', emoji: '⚗️' },
  { id: 'operation',   label: '上手染发',   short: '操作', emoji: '✨' },
];

const HAIR_LENGTHS = ['齐耳短发', '齐肩短发', '齐胸中长发', '齐腰长发', '超长发'];
const BLEACH_OPTIONS = [
  { value: 0, label: '未漂过（原始发色）' },
  { value: 1, label: '漂过1次' },
  { value: 2, label: '漂过2次' },
  { value: 3, label: '漂过3次或以上' },
];

const TIER_COLORS: Record<string, string> = {
  '经济款': 'bg-sage text-good',
  '中端款': 'bg-sky text-sky-dark',
  '高端款': 'bg-orange-soft text-orange-dark',
};

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// 卡通女孩 loading 动画 — 5 张图每 0.5s 循环（已抠透明背景）
const LOADING_FRAMES = [
  '/loading/01-mirror.png',
  '/loading/02-brush.png',
  '/loading/05-blowdry.png',
  '/loading/03-reading.png',
  '/loading/04-reading2.png',
];
function LoadingGirl({ size = 96 }: { size?: number }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % LOADING_FRAMES.length), 500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {LOADING_FRAMES.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={src}
          alt=""
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-150 ${i === idx ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
    </div>
  );
}

// 手绘风装饰元素
function Star({ className = '', size = 24, style }: { className?: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} fill="currentColor">
      <path d="M12 1L14.5 8.5L22 11L14.5 13.5L12 21L9.5 13.5L2 11L9.5 8.5Z" />
    </svg>
  );
}
function Sparkle({ className = '', size = 16, style }: { className?: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 3 L12 8 M12 16 L12 21 M3 12 L8 12 M16 12 L21 12" />
    </svg>
  );
}
function Squiggle({ className = '', size = 60, style }: { className?: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 20" width={size} height={size * 0.2} className={className} style={style} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M2 10 Q 15 0, 28 10 T 54 10 T 80 10 T 98 10" />
    </svg>
  );
}
function Heart({ className = '', size = 24, style }: { className?: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} fill="currentColor">
      <path d="M12 21s-7-4.5-9-9C1 7 5 4 8 4c2 0 3.5 1 4 2 .5-1 2-2 4-2 3 0 7 3 5 8-2 4.5-9 9-9 9z" />
    </svg>
  );
}

function PhotoUploadBox({ label, hint, image, onChange, tilt = 'left' }: {
  label: string; hint: string; image: HairImage | null; onChange: (img: HairImage) => void;
  tilt?: 'left' | 'right';
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const MAX = 1024;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        onChange({ data: dataUrl.split(',')[1], mediaType: 'image/jpeg', preview: dataUrl });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const tiltClass = tilt === 'left' ? '-rotate-2' : 'rotate-2';
  return (
    <div className="flex-1 relative">
      {/* 散落小装饰 */}
      {tilt === 'left' && (
        <Star className="absolute -top-3 -right-2 z-10 text-orange float" size={22} />
      )}
      {tilt === 'right' && (
        <Sparkle className="absolute -top-4 -left-3 z-10 text-orange-dark pulse-soft" size={20} />
      )}
      <p className={`text-[11px] uppercase tracking-[0.18em] text-ink-3 font-bold mb-2 ${tilt === 'left' ? '-rotate-1' : 'rotate-1'} inline-block`}>{label}</p>
      <div
        className={`relative border border-line rounded-[28px] overflow-hidden bg-canvas cursor-pointer hover:shadow-lift shadow-soft transition-all ${tiltClass} hover:rotate-0`}
        style={{ aspectRatio: '3/4', transformOrigin: 'center' }}
        onClick={() => inputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleFile(f); }}
        onDragOver={(e) => e.preventDefault()}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.preview} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center bg-cream-2">
            <div className="w-12 h-12 rounded-full bg-peach flex items-center justify-center">
              <svg className="w-5 h-5 text-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <p className="text-sm text-ink font-medium">点击或拖入</p>
            <p className="text-xs text-ink-3 leading-snug">{hint}</p>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
    </div>
  );
}

export function LegacyHome() {
  const [step, setStep] = useState<Step>('input');
  const [visitedSteps, setVisitedSteps] = useState<Set<Step>>(new Set(['input']));
  const [selectedDyeIdx, setSelectedDyeIdx] = useState<number | null>(null);
  // 语音助手
  const [voiceOn, setVoiceOn] = useState(false);
  const [lastHeard, setLastHeard] = useState('');
  const [voiceFeedback, setVoiceFeedback] = useState('');
  // 进入操作步骤时主动询问开语音
  const [voicePromptOpen, setVoicePromptOpen] = useState(false);
  const [voicePromptShown, setVoicePromptShown] = useState(false);
  const voiceOnRef = useRef(voiceOn);
  // 计时器
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(false);
  const timerInitialRef = useRef<number>(0);
  // 博主帧自动轮播
  const [activeFrameIdx, setActiveFrameIdx] = useState(0);
  // TTS 自动朗读
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  // 防止语音意图请求堆积
  const voiceProcessingRef = useRef(false);
  // 用 ref 持有最新的 processVoiceCommand，避免 SR 因每次状态更新被重启
  const processVoiceCommandRef = useRef<((t: string) => Promise<string | null>) | null>(null);

  const [currentHairImage, setCurrentHairImage] = useState<HairImage | null>(null);
  const [targetColorImage, setTargetColorImage] = useState<HairImage | null>(null);
  const [bloggerTutorial, setBloggerTutorial] = useState('');
  const [bloggerUrl, setBloggerUrl] = useState('');
  const [parsedBlogger, setParsedBlogger] = useState<ParsedBlogger | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  // 博主教程输入方式（文字/链接/视频）
  const [bloggerMode, setBloggerMode] = useState<'text' | 'url' | 'video'>('url');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysis | null>(null);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState('');
  const [videoError, setVideoError] = useState('');
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [analysis, setAnalysis] = useState<HairAnalysis | null>(null);
  const [editedAnalysis, setEditedAnalysis] = useState<HairAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [tutorialData, setTutorialData] = useState<TutorialData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [prices, setPrices] = useState<Record<string, string | null>>({});
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [error, setError] = useState('');

  // 缓存指纹：记录上次成功生成 compare/tutorial 时的输入快照
  // 当用户回到 Step 1/2 → 再前进时，如果输入没变就跳过 API 调用
  const lastComparedSnapshot = useRef<string>('');
  const lastTutorialSnapshot = useRef<string>('');

  const analyzeHair = useCallback(async () => {
    if (!currentHairImage || !targetColorImage) return;
    setIsAnalyzing(true);
    setError('');
    // 重新分析图片 → 清空所有下游缓存
    setCompareResult(null);
    setTutorialData(null);
    lastComparedSnapshot.current = '';
    lastTutorialSnapshot.current = '';
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentHairImage: { data: currentHairImage.data, mediaType: currentHairImage.mediaType },
          targetColorImage: { data: targetColorImage.data, mediaType: targetColorImage.mediaType },
        }),
      });
      if (!res.ok) throw new Error();
      const data: HairAnalysis = await res.json();
      setAnalysis(data);
      setEditedAnalysis(data);
      // 不再自动跳转；用户在 input 屏幕审核后点确认按钮
    } catch {
      setError('分析失败，请检查图片后重试');
    } finally {
      setIsAnalyzing(false);
    }
  }, [currentHairImage, targetColorImage]);

  // 确认头发信息无误 → 进入可行性判断
  const confirmAndProceed = useCallback(async () => {
    if (!editedAnalysis) return;
    const snapshot = JSON.stringify({ a: editedAnalysis, b: bloggerTutorial });
    // 缓存命中：直接跳转，不重新分析
    if (compareResult && lastComparedSnapshot.current === snapshot) {
      setStep('feasibility');
      setVisitedSteps(prev => new Set([...prev, 'feasibility']));
      return;
    }
    setStep('feasibility');
    setVisitedSteps(prev => new Set([...prev, 'feasibility']));
    setIsComparing(true);
    try {
      const cRes = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis: editedAnalysis, bloggerTutorial }),
      });
      if (cRes.ok) {
        setCompareResult(await cRes.json());
        lastComparedSnapshot.current = snapshot;
      }
    } catch {}
    setIsComparing(false);
  }, [editedAnalysis, bloggerTutorial, compareResult]);

  const generateTutorial = useCallback(async () => {
    if (!editedAnalysis || !targetColorImage) return;
    const snapshot = JSON.stringify({
      a: editedAnalysis, b: bloggerTutorial,
      v: compareResult?.verdict, ps: compareResult?.pre_required_steps,
    });
    // 缓存命中：直接跳转，不重新生成
    if (tutorialData && lastTutorialSnapshot.current === snapshot) {
      setStep('product');
      setVisitedSteps(prev => new Set([...prev, 'product']));
      return;
    }
    setIsGenerating(true);
    setTutorialData(null);
    setCurrentStepIndex(0);
    setStep('product');
    setVisitedSteps(prev => new Set([...prev, 'product']));
    try {
      const res = await fetch('/api/tutorial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis: editedAnalysis,
          targetColorImage: { data: targetColorImage.data, mediaType: targetColorImage.mediaType },
          bloggerTutorial,
          compareResult,
          videoAnalysis,
        }),
      });
      if (!res.ok) throw new Error();
      const data: TutorialData = await res.json();
      setTutorialData(data);
      lastTutorialSnapshot.current = snapshot;

      // 后台抓取实时价格
      const allProducts = [...data.dyes.map((d) => d.name), ...data.care.map((c) => c.name)];
      setIsFetchingPrices(true);
      setPrices({});
      fetch('/api/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: allProducts }),
      })
        .then((r) => r.json())
        .then(({ results }) => {
          const map: Record<string, string | null> = {};
          results.forEach((r: { name: string; price: string | null }) => { map[r.name] = r.price; });
          setPrices(map);
        })
        .catch(() => {})
        .finally(() => setIsFetchingPrices(false));
    } catch {
      setError('生成教程失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  }, [editedAnalysis, targetColorImage, bloggerTutorial, compareResult, videoAnalysis]);

  const parseBloggerUrl = useCallback(async () => {
    if (!bloggerUrl.trim()) return;
    setIsParsing(true);
    setParseError('');
    setParsedBlogger(null);
    try {
      const res = await fetch('/api/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: bloggerUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '解析失败');
      setParsedBlogger(data);
      setBloggerTutorial(data.formatted);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : '解析失败，请重试');
    } finally {
      setIsParsing(false);
    }
  }, [bloggerUrl]);

  // 上传视频解析（mock 路径：调 /api/process-video）
  const handleVideoUpload = useCallback(async (file: File) => {
    setVideoError('');
    setVideoFile(file);
    setVideoAnalysis(null);
    setIsProcessingVideo(true);
    setVideoProgress('上传视频中...');
    const form = new FormData();
    form.append('video', file);
    const stages = ['抽取音频...', '语音识别（Whisper）...', '聚合教程步骤（Claude）...', '抽取关键帧（Vision 选优）...'];
    let stageIdx = 0;
    const ticker = setInterval(() => {
      if (stageIdx < stages.length) { setVideoProgress(stages[stageIdx]); stageIdx++; }
    }, 15000);
    try {
      const res = await fetch('/api/process-video', { method: 'POST', body: form });
      clearInterval(ticker);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '解析失败' }));
        throw new Error(err.error || '解析失败');
      }
      const data: VideoAnalysis = await res.json();
      setVideoAnalysis(data);
      // 自动把视频解析结果格式化成 bloggerTutorial 文本，供下游 compare/tutorial API 使用
      const formatted = [
        `【视频教程：${data.title}】`,
        data.summary,
        '',
        '## 博主背景知识',
        ...data.background_knowledge.map(k => `- ${k.topic}：${k.content}`),
        '',
        '## 博主实操步骤',
        ...data.action_steps.map(s => `${s.step}. [${s.category}] ${s.title}：${s.content}${s.tip ? ` 提示：${s.tip}` : ''}`),
      ].join('\n');
      setBloggerTutorial(formatted);
      setVideoProgress('');
    } catch (e) {
      clearInterval(ticker);
      setVideoError(e instanceof Error ? e.message : '解析失败');
    } finally {
      setIsProcessingVideo(false);
    }
  }, []);

  // 加载示例视频（避免每次 demo 都要等 1-2 分钟解析）
  const loadMockVideo = useCallback(async () => {
    setVideoError('');
    setIsProcessingVideo(true);
    setVideoProgress('加载示例视频...');
    try {
      const res = await fetch('/video-mock/analysis.json');
      const data: VideoAnalysis = await res.json();
      setVideoAnalysis(data);
      const formatted = [
        `【视频教程：${data.title}】`,
        data.summary,
        '',
        '## 博主背景知识',
        ...data.background_knowledge.map(k => `- ${k.topic}：${k.content}`),
        '',
        '## 博主实操步骤',
        ...data.action_steps.map(s => `${s.step}. [${s.category}] ${s.title}：${s.content}${s.tip ? ` 提示：${s.tip}` : ''}`),
      ].join('\n');
      setBloggerTutorial(formatted);
      setVideoProgress('');
    } catch {
      setVideoError('加载示例失败');
    } finally {
      setIsProcessingVideo(false);
    }
  }, []);

  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);

  // step 切换或离开 operation 时强制停 TTS
  useEffect(() => {
    if (step !== 'operation') {
      ttsSeqRef.current += 1;
      if (ttsAudioRef.current) { try { ttsAudioRef.current.pause(); } catch {} ttsAudioRef.current = null; }
    }
  }, [step]);

  // ── 语音开启时进入 operation / 切换步骤都自动朗读 ────
  const playStepTtsRef = useRef<((idx: number) => void) | null>(null);
  useEffect(() => {
    if (!voiceOn || step !== 'operation' || !tutorialData) return;
    const id = setTimeout(() => { playStepTtsRef.current?.(currentStepIndex); }, 200);
    return () => clearTimeout(id);
  }, [voiceOn, step, currentStepIndex, tutorialData]);

  // 进入操作步骤时主动弹一次「要不要开语音」
  useEffect(() => {
    if (step === 'operation' && !voicePromptShown && !voiceOn) {
      setVoicePromptOpen(true);
      setVoicePromptShown(true);
    }
  }, [step, voicePromptShown, voiceOn]);

  // ── 切换 step 时重置帧索引；操作 step 自动轮播 ────────
  useEffect(() => { setActiveFrameIdx(0); }, [currentStepIndex, step]);
  useEffect(() => {
    if (step !== 'operation' || !videoAnalysis) return;
    const frames = videoAnalysis.action_steps[currentStepIndex]?.frames;
    if (!frames || frames.length <= 1) return;
    const id = setInterval(() => setActiveFrameIdx(i => (i + 1) % frames.length), 4000);
    return () => clearInterval(id);
  }, [step, currentStepIndex, videoAnalysis]);

  // ── 计时器 tick ────────────────────────────────────────
  useEffect(() => {
    if (!timerActive || timerSeconds === null) return;
    if (timerSeconds <= 0) {
      setTimerActive(false);
      // 闹钟：响一下 + 弹窗
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU' + 'A'.repeat(800));
        audio.play().catch(() => {});
      } catch {}
      setVoiceFeedback('⏰ 时间到啦！');
      setTimeout(() => setVoiceFeedback(''), 5000);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('做自己的 Tony', { body: '⏰ 时间到啦！该进入下一步了' });
      }
      return;
    }
    const id = setTimeout(() => setTimerSeconds(s => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(id);
  }, [timerActive, timerSeconds]);

  // ── 主动提醒设闹钟 ─────────────────────────────────────
  const [timerPromptActive, setTimerPromptActive] = useState(false);
  const [pendingTimerSeconds, setPendingTimerSeconds] = useState(0);

  // 判断当前操作步是不是"停留时间"那一步 → 主动询问
  useEffect(() => {
    if (step !== 'operation' || !tutorialData) return;
    const s = tutorialData.steps[currentStepIndex];
    if (!s) return;
    // 检测标题/内容里是不是"停留"步骤
    const isWaitStep = /停留|等待|静置|放置|停\s*\d+\s*分/.test(s.title) || /停留|静置|等待.*分钟/.test(s.content);
    if (isWaitStep) {
      // 提取分钟数（默认 30）
      const m = (s.title + s.content).match(/(\d+)[-到～~](\d+)\s*分钟/) || (s.title + s.content).match(/(\d+)\s*分钟/);
      const minutes = m ? parseInt(m[2] || m[1], 10) : 30;
      setPendingTimerSeconds(minutes * 60);
      setTimerPromptActive(true);
    } else {
      setTimerPromptActive(false);
    }
  }, [step, currentStepIndex, tutorialData]);

  // ── 应用语音意图动作 ───────────────────────────────────
  // ── TTS 自动朗读 ────────────────────────────────────────
  const ttsSeqRef = useRef(0);
  const stopTts = useCallback(() => {
    ttsSeqRef.current += 1; // 让所有进行中的 playStepTts 请求都失效
    if (ttsAudioRef.current) {
      try { ttsAudioRef.current.pause(); } catch {}
      ttsAudioRef.current = null;
    }
  }, []);
  const playStepTts = useCallback(async (stepIdx: number) => {
    if (!tutorialData) return;
    const s = tutorialData.steps[stepIdx];
    if (!s) return;
    stopTts();
    const mySeq = ttsSeqRef.current;
    const bulletText = s.content.split('\n').map(l => l.replace(/^[•·\-\s]+/, '').trim()).filter(Boolean).join('。');
    const text = `第${stepIdx + 1}步，${s.title}。${bulletText}${s.tip ? '。小贴士：' + s.tip : ''}`;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      // 如果在 fetch 期间序号变了，说明用户已经跳到别处 → 放弃这次播放
      if (ttsSeqRef.current !== mySeq) return;
      if (!res.ok) return;
      const blob = await res.blob();
      if (ttsSeqRef.current !== mySeq) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      // 再次检查
      if (ttsSeqRef.current !== mySeq) { URL.revokeObjectURL(url); return; }
      ttsAudioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); if (ttsAudioRef.current === audio) ttsAudioRef.current = null; };
      audio.play().catch(() => {});
    } catch {}
  }, [tutorialData, stopTts]);

  // 把 playStepTts 同步到 ref 让 useEffect 用
  useEffect(() => { playStepTtsRef.current = playStepTts; }, [playStepTts]);

  const applyVoiceAction = useCallback((action: string, params?: { step_num?: number; seconds?: number }, fallbackResponse?: string): string | null => {
    if (action === 'next') {
      if (step === 'product' && selectedDyeIdx === null) return '请先选一支染膏，再说下一步';
      if (step === 'product' && selectedDyeIdx !== null) {
        setStep('mixing'); setVisitedSteps(p => new Set([...p, 'mixing']));
        return fallbackResponse || '好，进入调配';
      }
      if (step === 'mixing') {
        setStep('operation'); setVisitedSteps(p => new Set([...p, 'operation'])); setCurrentStepIndex(0);
        return fallbackResponse || '好，开始染发';
      }
      if (step === 'operation' && tutorialData) {
        if (currentStepIndex < tutorialData.steps.length - 1) {
          const nextIdx = currentStepIndex + 1;
          setCurrentStepIndex(nextIdx);
          // 自动朗读由 useEffect 处理（voiceOn + currentStepIndex 变化触发）
          return fallbackResponse || '好，下一步操作';
        }
        return '已经是最后一步啦';
      }
      if (step === 'feasibility') {
        if (compareResult?.verdict === 'impossible') return '当前判断不可行，需要先漂发';
        generateTutorial();
        return fallbackResponse || '好，挑染膏';
      }
      if (step === 'input') return '请先上传两张图，点开始分析';
      return '当前不能下一步';
    }
    if (action === 'prev') {
      stopTts();
      if (step === 'operation' && currentStepIndex > 0) { setCurrentStepIndex(i => i - 1); return fallbackResponse || '回到上一步'; }
      if (step === 'mixing') { setStep('product'); return fallbackResponse || '回到选染膏'; }
      if (step === 'product') { setStep('feasibility'); return fallbackResponse || '回到判断'; }
      if (step === 'feasibility') { setStep('input'); return fallbackResponse || '回到上传'; }
      if (step === 'operation' && currentStepIndex === 0) return '已是第一步';
      return '已是开头';
    }
    if (action === 'stop_tts') {
      stopTts();
      return fallbackResponse || '好，停止朗读';
    }
    if (action === 'play_tts') {
      if (step !== 'operation' || !tutorialData) return '请先进入染发步骤';
      playStepTts(currentStepIndex);
      return fallbackResponse || '好，朗读这一步';
    }
    if (action === 'jump_step') {
      if (!params?.step_num) return '没听清要跳到第几步';
      if (step !== 'operation') return '请先到操作步骤';
      if (!tutorialData) return '教程还没生成';
      const n = params.step_num;
      if (n >= 1 && n <= tutorialData.steps.length) {
        setCurrentStepIndex(n - 1);
        return fallbackResponse || `跳到第 ${n} 步`;
      }
      return `只有 ${tutorialData.steps.length} 步`;
    }
    if (action === 'start_timer') {
      if (!params?.seconds || params.seconds <= 0) return '没听清要定多少分钟';
      timerInitialRef.current = params.seconds;
      setTimerSeconds(params.seconds);
      setTimerActive(true);
      setTimerPromptActive(false);
      const min = Math.round(params.seconds / 60);
      return fallbackResponse || `好，倒计时 ${min} 分钟`;
    }
    if (action === 'accept_timer') {
      if (!timerPromptActive || pendingTimerSeconds <= 0) return '现在没有待定的闹钟';
      timerInitialRef.current = pendingTimerSeconds;
      setTimerSeconds(pendingTimerSeconds);
      setTimerActive(true);
      setTimerPromptActive(false);
      const min = Math.round(pendingTimerSeconds / 60);
      return fallbackResponse || `好，已设 ${min} 分钟闹钟`;
    }
    if (action === 'decline_timer') {
      setTimerPromptActive(false);
      return fallbackResponse || '好的';
    }
    if (action === 'cancel_timer') {
      setTimerActive(false); setTimerSeconds(null);
      return fallbackResponse || '已取消计时';
    }
    if (action === 'close_voice') {
      setVoiceOn(false);
      return fallbackResponse || '已关闭语音';
    }
    return null;
  }, [step, selectedDyeIdx, tutorialData, currentStepIndex, compareResult, generateTutorial, timerPromptActive, pendingTimerSeconds, playStepTts, stopTts]);

  // ── 语音命令处理器（先正则快配，没命中再调 Claude 意图） ────
  const processVoiceCommand = useCallback(async (rawText: string): Promise<string | null> => {
    // 去标点 + 去末尾语气词（啊吧呢嗯哦呀啦了等）
    const text = rawText.trim()
      .replace(/[\s,，。.!?！？、~～]/g, '')
      .replace(/(啊|吧|呢|嗯|呀|哦|喔|哇|啦|了|嘛|哈|噢)+$/g, '');
    if (text.length === 0) return null;

    // === 一层：宽松正则（包含即匹配，不要求 ^ ... $）===
    // next：包含「下一步/下一张」或表达「做完了」的口语化
    if (/(下一?步|下一?张|往下|接下来|继续吧?)/.test(text)
      || /(搞定了?|搞完了?|完成了?|染好了?|涂好了?|做好了?|弄好了?)$/.test(text))
      return applyVoiceAction('next');
    // prev
    if (/(上一?步|上一?张|前一步|返回|回去|再看看)/.test(text)
      || /(没搞定|没弄好|还没好|没好|没完成|还没|没跟上)$/.test(text))
      return applyVoiceAction('prev');
    if (/^(关闭语音|不用语音|关掉语音|停止语音)$/.test(text)) return applyVoiceAction('close_voice');
    if (/(停止朗读|别说了?|别念了?|安静|闭嘴|住口|不要说|停一下|暂停朗读)/.test(text)) return applyVoiceAction('stop_tts');
    if (/(读一下|朗读|念一下|给我读|读这一?步|开始朗读|读给我听)/.test(text)) return applyVoiceAction('play_tts');
    if (/^(取消计时|关闭计时|停止计时|关闭闹钟|取消闹钟)$/.test(text)) return applyVoiceAction('cancel_timer');
    // 在闹钟提示活跃时，"好/可以/嗯" 视为接受
    if (timerPromptActive && !timerActive) {
      if (/^(好|好的|好啊|可以|嗯|要|要的|是的|帮我|定吧|设吧)$/.test(text)) return applyVoiceAction('accept_timer');
      if (/^(不用|不要|算了|不需要|不用了)$/.test(text)) return applyVoiceAction('decline_timer');
    }
    const jump = text.match(/^第([一二三四五六七八九十两\d]+)步$/);
    if (jump) {
      const cn: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
      const n = cn[jump[1]] || parseInt(jump[1], 10);
      return applyVoiceAction('jump_step', { step_num: n });
    }
    // 数字 + 单位 + 闹钟相关
    const timer = text.match(/(\d+|[一二三四五六七八九十两]+)(分钟|秒)/);
    if (timer && (/闹钟|计时|倒计时|提醒|定个|定一个/.test(text) || timer[2])) {
      const cn: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
      const num = cn[timer[1]] || parseInt(timer[1], 10);
      const seconds = timer[2] === '分钟' ? num * 60 : num;
      if (num > 0 && num < 1000) return applyVoiceAction('start_timer', { seconds });
    }
    // 没明确数字的「帮我定闹钟」→ 用当前步骤的 pendingTimerSeconds
    if (/(帮我|给我|来个|定个|设个).*?(闹钟|计时|倒计时|提醒)/.test(text) && pendingTimerSeconds > 0) {
      return applyVoiceAction('start_timer', { seconds: pendingTimerSeconds });
    }

    // === 二层：长句子 → Claude 意图识别（~2s）===
    if (text.length < 3) return null;
    if (voiceProcessingRef.current) return null; // 防止并发请求堆积
    voiceProcessingRef.current = true;
    try {
      const curStepObj = tutorialData?.steps[currentStepIndex];
      const res = await fetch('/api/voice-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: rawText,
          step,
          currentStepIndex,
          totalSteps: tutorialData?.steps.length || 6,
          hasSelectedDye: selectedDyeIdx !== null,
          currentStepTitle: curStepObj?.title || '',
        }),
      });
      if (!res.ok) return null;
      const { action, params, response } = await res.json();
      if (action === 'none') return null;
      return applyVoiceAction(action, params, response);
    } catch {
      return null;
    } finally {
      voiceProcessingRef.current = false;
    }
  }, [step, currentStepIndex, tutorialData, selectedDyeIdx, applyVoiceAction, timerPromptActive, timerActive, pendingTimerSeconds]);

  // ── 同步最新的 processVoiceCommand 到 ref，避免 SR effect 反复重启 ────
  useEffect(() => { processVoiceCommandRef.current = processVoiceCommand; }, [processVoiceCommand]);

  // ── Whisper ASR：MediaRecorder + 自建 VAD（音量阈值检测停顿）────
  useEffect(() => {
    if (!voiceOn) return;

    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let isRecording = false;
    let silentFrames = 0;
    let recordFrames = 0;
    let vadTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    let mimeType = '';

    const setup = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }

        // 选 MediaRecorder 支持的 mimeType
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';

        const AudioCtor = (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || window.AudioContext;
        audioCtx = new AudioCtor();
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);

        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
          chunks = [];
          if (blob.size < 1500) return; // 太短跳过

          setLastHeard('（识别中…）');
          try {
            const form = new FormData();
            const ext = (mimeType.includes('mp4') ? 'mp4' : 'webm');
            form.append('audio', blob, `speech.${ext}`);
            const res = await fetch('/api/whisper', { method: 'POST', body: form });
            if (!res.ok) { setLastHeard('（识别失败）'); return; }
            const { text } = await res.json();
            if (!text || !text.trim()) { setLastHeard('（没听清）'); return; }
            setLastHeard(text);
            const fn = processVoiceCommandRef.current;
            if (!fn) return;
            const fb = await fn(text);
            if (fb) {
              setVoiceFeedback(fb);
              setTimeout(() => setVoiceFeedback(''), 2800);
            } else {
              setVoiceFeedback('（没听懂这句指令）');
              setTimeout(() => setVoiceFeedback(''), 1800);
            }
          } catch (err) {
            console.error('[whisper]', err);
          }
        };

        // VAD：每 100ms 检查一次音量
        const buf = new Uint8Array(analyser.fftSize);
        const THRESH_RMS = 0.025;
        const SILENT_FRAMES_STOP = 8;  // 800ms 静音停止录音
        const MIN_RECORD_FRAMES = 5;   // 至少录满 500ms 才允许停

        vadTimer = setInterval(() => {
          if (!analyser || !recorder) return;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);

          if (rms > THRESH_RMS) {
            silentFrames = 0;
            if (!isRecording && recorder.state === 'inactive') {
              isRecording = true;
              recordFrames = 1;
              try { recorder.start(); } catch {}
            } else if (isRecording) {
              recordFrames++;
            }
          } else if (isRecording) {
            silentFrames++;
            recordFrames++;
            if (silentFrames >= SILENT_FRAMES_STOP && recordFrames >= MIN_RECORD_FRAMES) {
              isRecording = false;
              silentFrames = 0;
              recordFrames = 0;
              try { if (recorder.state === 'recording') recorder.stop(); } catch {}
            }
          }
        }, 100);
      } catch (err) {
        console.error('麦克风启动失败', err);
        alert('麦克风权限被拒或不可用，请允许后重试');
        setVoiceOn(false);
      }
    };

    setup();
    // 请求通知权限（用于闹钟）
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    return () => {
      stopped = true;
      if (vadTimer) clearInterval(vadTimer);
      if (recorder && recorder.state === 'recording') { try { recorder.stop(); } catch {} }
      if (audioCtx) { try { audioCtx.close(); } catch {} }
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [voiceOn]);

  const resetAll = () => {
    setStep('input');
    setVisitedSteps(new Set(['input']));
    setSelectedDyeIdx(null);
    setVoiceOn(false);
    setVoicePromptOpen(false);
    setVoicePromptShown(false);
    setTimerActive(false);
    setTimerSeconds(null);
    setTimerPromptActive(false);
    setCurrentHairImage(null);
    setTargetColorImage(null);
    setBloggerTutorial('');
    setBloggerUrl('');
    setParsedBlogger(null);
    setParseError('');
    setBloggerMode('url');
    setVideoFile(null);
    setVideoAnalysis(null);
    setIsProcessingVideo(false);
    setVideoProgress('');
    setVideoError('');
    setCompareResult(null);
    setIsComparing(false);
    setAnalysis(null);
    setEditedAnalysis(null);
    setTutorialData(null);
    setPrices({});
    setIsFetchingPrices(false);
    setCurrentStepIndex(0);
  };

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-20 bg-cream/90 backdrop-blur-md border-b border-line">
        <div className="max-w-2xl mx-auto px-5 pt-4 pb-2 flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[20px] leading-none font-black tracking-tight text-ink">做自己的<span className="text-orange">tony</span></span>
          </div>
          {step !== 'input' && (
            <div className="flex items-center gap-1.5">
              {step === 'operation' && (
                <button
                  onClick={() => setVoiceOn(v => !v)}
                  className={`text-[11px] font-medium px-3 py-1.5 rounded-full transition-all tap ${
                    voiceOn ? 'bg-orange text-canvas animate-pulse' : 'bg-canvas border border-line text-ink-2 hover:border-pink/60'
                  }`}
                >
                  {voiceOn ? '听着呢…' : '语音'}
                </button>
              )}
              <button onClick={resetAll} className="text-[11px] font-medium text-ink-3 hover:text-ink transition-colors px-2.5 py-1.5 rounded-full hover:bg-canvas/60 tap">
                重来
              </button>
            </div>
          )}
        </div>

        {/* 极简进度条 */}
        <div className="max-w-2xl mx-auto px-5 pt-3 pb-3">
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => {
              const stepIdx = STEPS.findIndex(x => x.id === step);
              const isActive = step === s.id;
              const isVisited = visitedSteps.has(s.id);
              const isPast = stepIdx > i;
              return (
                <button
                  key={s.id}
                  onClick={() => isVisited && setStep(s.id)}
                  disabled={!isVisited}
                  className="group flex-1 flex flex-col items-start gap-1.5 text-left"
                  aria-label={`第${i + 1}步：${s.label}`}
                >
                  <div className={`w-full h-[3px] rounded-full transition-all duration-500 ${
                    isActive ? 'bg-orange' : isPast ? 'bg-sage-dark' : 'bg-ink/10'
                  }`} />
                  <div className="flex items-center gap-1">
                    <span className={`text-[14px] leading-none transition-all ${isActive ? 'scale-125' : isVisited ? 'opacity-90' : 'opacity-30 grayscale'}`}>
                      {s.emoji}
                    </span>
                    <span className={`text-[10px] leading-none font-bold ${isActive ? 'text-ink' : isVisited ? 'text-ink-2' : 'text-ink-4'}`}>
                      {s.short}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 语音浮条 */}
        {voiceOn && (
          <div className="bg-peach/40 border-t border-orange/20">
            <div className="max-w-2xl mx-auto px-5 py-2 flex items-center gap-2 text-xs">
              <span className="font-medium text-orange flex-shrink-0 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange animate-pulse" />听着呢
              </span>
              {lastHeard && <span className="text-ink-2 truncate flex-1">「{lastHeard}」</span>}
              {voiceFeedback && <span className="ml-auto text-good font-medium flex-shrink-0">✓ {voiceFeedback}</span>}
            </div>
            <div className="max-w-2xl mx-auto px-5 pb-2 text-[10px] text-ink-3">
              说「下一步」「30 分钟倒计时」「跳到第三步」「关闭语音」
            </div>
          </div>
        )}

        {/* 计时器 */}
        {timerSeconds !== null && (
          <div className="bg-amber-50 border-t border-amber-200">
            <div className="max-w-2xl mx-auto px-5 py-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">⏱️</span>
                <div>
                  <p className="text-[10px] text-amber-700">倒计时</p>
                  <p className="text-base font-bold text-amber-900 leading-tight tabular-nums">
                    {Math.floor(timerSeconds / 60).toString().padStart(2, '0')}:{(timerSeconds % 60).toString().padStart(2, '0')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {!timerActive && timerSeconds > 0 && (
                  <button onClick={() => setTimerActive(true)} className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-amber-200 text-amber-900">
                    继续
                  </button>
                )}
                {timerActive && (
                  <button onClick={() => setTimerActive(false)} className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-amber-200 text-amber-900">
                    暂停
                  </button>
                )}
                <button onClick={() => { setTimerActive(false); setTimerSeconds(null); }} className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-amber-700 hover:bg-amber-100">
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-5 py-6">
        {/* ===== STEP 1: INPUT (upload + edit) ===== */}
        {step === 'input' && (
          <div className="space-y-8 relative pt-4">
            {/* 散落的背景装饰 SVG */}
            <Star className="absolute top-12 -left-2 text-sky-dark float opacity-40 pointer-events-none" size={18} />
            <Star className="absolute top-72 -right-4 text-orange-dark pulse-soft opacity-60 pointer-events-none" size={14} />
            <Heart className="absolute top-[420px] left-1 text-peach float opacity-50 pointer-events-none" size={20} style={{ animationDelay: '0.6s' }} />
            <Squiggle className="absolute top-[200px] right-8 text-orange/40 spin-slow pointer-events-none" size={50} />
            <Sparkle className="absolute top-[560px] right-2 text-good pulse-soft pointer-events-none" size={22} />

            {/* Hero */}
            <div className="relative pt-2">
              <p className="text-[12px] uppercase tracking-[0.3em] text-orange font-bold mb-3 -rotate-1 inline-block">
                ✦ HEY THERE
              </p>
              <h2 className="hero-display text-[52px] sm:text-[64px] text-ink mb-1 leading-[0.9]">
                上传我的<br/>
                <span className="text-orange relative inline-block">
                  头发照片
                  <Squiggle className="absolute -bottom-2 left-0 text-orange/60" size={140} />
                </span>
                <span className="inline-block ml-2 animate-bounce-in" style={{ animationDelay: '0.3s' }}>✨</span>
              </h2>
              <p className="text-[14px] text-ink-2 mt-4 max-w-md leading-relaxed">
                在自然光下拍摄，效果最准确 <span className="inline-block float">→</span> AI 会马上分析我的发色情况
              </p>
            </div>

            {/* 上传双卡，左右各旋转 */}
            <div className="flex gap-4 pt-2 pb-4">
              <PhotoUploadBox label="现在的头发" hint="能看清发色和发长" image={currentHairImage} onChange={setCurrentHairImage} tilt="left" />
              <PhotoUploadBox label="想要的颜色" hint="目标发色或博主效果图" image={targetColorImage} onChange={setTargetColorImage} tilt="right" />
            </div>

            <div>
              <p className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange" />
                博主教程参考 <span className="font-normal text-ink-3 text-xs">— 可选</span>
              </p>

              {/* Tab 切换 — pill 风格 */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {([['url', '🔗 链接'], ['video', '📹 视频'], ['text', '📝 文字']] as const).map(([m, label], idx) => {
                  const active = bloggerMode === m;
                  return (
                    <button
                      key={m}
                      onClick={() => setBloggerMode(m)}
                      className={`px-4 py-2 text-[13px] font-semibold rounded-full transition-all tap ${
                        active
                          ? `bg-ink text-canvas shadow-card ${idx === 0 ? '-rotate-1' : idx === 2 ? 'rotate-1' : ''}`
                          : 'bg-canvas border border-line text-ink-2 hover:border-orange hover:text-ink'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* 链接 tab */}
              {bloggerMode === 'url' && (
                <>
                  <div className="flex gap-2 mb-3">
                    <input
                      value={bloggerUrl}
                      onChange={(e) => setBloggerUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && parseBloggerUrl()}
                      placeholder="粘贴小红书或抖音链接"
                      className="flex-1 px-3 py-2.5 rounded-xl border border-line bg-canvas text-sm text-ink placeholder-[#C4A09A] focus:outline-none focus:border-pink"
                    />
                    <button
                      onClick={parseBloggerUrl}
                      disabled={!bloggerUrl.trim() || isParsing}
                      className="px-4 py-2.5 rounded-xl bg-pink text-white text-sm font-semibold disabled:opacity-40 hover:bg-pink-2 transition-colors whitespace-nowrap"
                    >
                      {isParsing ? <span className="flex items-center gap-1.5"><Spinner />解析中</span> : '解析'}
                    </button>
                  </div>
                  {parseError && (
                    <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{parseError}</div>
                  )}
                  {parsedBlogger && (
                    <div className="mb-3 bg-vellum border border-line rounded-2xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-line-soft/50 border-b border-line flex items-center gap-2">
                        <span className="text-xs font-semibold text-ink-2">
                          {parsedBlogger.platform === 'xiaohongshu' ? '📖 小红书笔记' : '🎬 抖音视频'}
                        </span>
                        {parsedBlogger.author && (
                          <span className="text-xs text-ink-3">@{parsedBlogger.author}</span>
                        )}
                        <span className="ml-auto text-xs text-emerald-600 font-medium">✓ 已解析</span>
                      </div>
                      {parsedBlogger.title && (
                        <div className="px-4 pt-3 pb-1">
                          <p className="text-sm font-semibold text-ink">{parsedBlogger.title}</p>
                        </div>
                      )}
                      {parsedBlogger.desc && (
                        <div className="px-4 py-2">
                          <p className="text-xs text-ink-2 leading-relaxed line-clamp-4">{parsedBlogger.desc.slice(0, 300)}</p>
                        </div>
                      )}
                      {parsedBlogger.comments.length > 0 && (
                        <div className="px-4 pb-3">
                          <p className="text-xs text-ink-3 mb-1.5">高赞评论（{parsedBlogger.comments.length} 条）：</p>
                          {parsedBlogger.comments.slice(0, 3).map((c, i) => (
                            <div key={i} className="flex items-start gap-1.5 mb-1">
                              {c.isPinned && <span className="text-xs text-ink flex-shrink-0">📌</span>}
                              {c.isAuthor && <span className="text-xs text-ink flex-shrink-0">👤</span>}
                              <p className="text-xs text-ink-2 leading-relaxed">{c.text.slice(0, 80)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {parsedBlogger.images.length > 0 && (
                        <div className="px-4 pb-3 flex gap-1.5 overflow-x-auto">
                          {parsedBlogger.images.slice(0, 5).map((src, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={src} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* 视频 tab */}
              {bloggerMode === 'video' && (
                <div className="space-y-3">
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); }}
                    className="hidden"
                    disabled={isProcessingVideo}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => videoInputRef.current?.click()}
                      disabled={isProcessingVideo}
                      className="flex-1 py-2.5 rounded-xl bg-pink text-white text-sm font-semibold disabled:opacity-40 hover:bg-pink-2 transition-colors flex items-center justify-center gap-2"
                    >
                      {isProcessingVideo ? (
                        <><Spinner />{videoProgress || '处理中...'}</>
                      ) : (
                        <>📤 上传染发视频</>
                      )}
                    </button>
                    <button
                      onClick={loadMockVideo}
                      disabled={isProcessingVideo}
                      className="px-4 py-2.5 rounded-xl border border-line text-sm font-medium text-ink-2 hover:bg-vellum disabled:opacity-40 transition-colors whitespace-nowrap"
                    >
                      📺 试用示例
                    </button>
                  </div>
                  <p className="text-xs text-ink-3">支持 mp4/mov，≤200MB，解析约 1-3 分钟。AI 会自动转录、拆分操作步骤、抽取关键帧。</p>
                  {videoError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{videoError}</div>
                  )}
                  {videoFile && !videoAnalysis && (
                    <div className="text-xs text-ink-2">📁 {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(1)}MB)</div>
                  )}
                  {videoAnalysis && (
                    <div className="bg-vellum border border-line rounded-2xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-line-soft/50 border-b border-line flex items-center gap-2">
                        <span className="text-xs font-semibold text-ink-2">📹 视频已解析</span>
                        <span className="ml-auto text-xs text-emerald-600 font-medium">
                          ✓ {videoAnalysis.action_steps.length} 步操作 · {videoAnalysis.background_knowledge.length} 条背景知识
                        </span>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-sm font-semibold text-ink mb-1">{videoAnalysis.title}</p>
                        <p className="text-xs text-ink-2 leading-relaxed">{videoAnalysis.summary}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 文字 tab */}
              {bloggerMode === 'text' && (
                <textarea
                  value={bloggerTutorial}
                  onChange={(e) => setBloggerTutorial(e.target.value)}
                  placeholder="直接粘贴教程文字内容..."
                  className="w-full h-32 px-4 py-3 rounded-2xl border border-line bg-canvas text-sm text-ink placeholder-[#C4A09A] focus:outline-none focus:border-pink resize-none"
                />
              )}
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

            {/* 分析按钮（仅当分析未完成时显示） */}
            {!editedAnalysis && (
              <div className="relative pt-2">
                {isAnalyzing ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <LoadingGirl size={140} />
                    <p className="text-[15px] font-bold text-ink">AI 正在<span className="text-orange">看我的头发</span> ...</p>
                    <div className="flex gap-1.5">
                      {[0,1,2].map(i => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-orange animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <Sparkle className="absolute -top-1 left-6 text-orange-dark pulse-soft" size={18} />
                    <Star className="absolute -top-2 right-12 text-orange float" size={20} />
                    <button onClick={analyzeHair} disabled={!currentHairImage || !targetColorImage}
                      className="relative w-full py-5 rounded-full bg-ink text-canvas font-semibold text-[16px] tracking-wide shadow-card hover:bg-orange hover:shadow-lift disabled:opacity-40 disabled:cursor-not-allowed transition-all tap overflow-hidden">
                      <span className="flex items-center justify-center gap-2">
                        <span>开始分析</span>
                        <span className="inline-block">→</span>
                        <Sparkle className="text-canvas pulse-soft" size={16} />
                      </span>
                    </button>
                    <p className="text-center text-[10px] text-ink-3 mt-3 tracking-widest uppercase">
                      ✦ AI 会准确判断我能不能染成这样 ✦
                    </p>
                  </>
                )}
              </div>
            )}

            {/* 分析完成后：内联展示可编辑分析结果 + 确认按钮 */}
            {editedAnalysis && (
              <div className="space-y-4 animate-fadeIn">
                <div className="bg-canvas rounded-2xl border border-line overflow-hidden shadow-sm">
                  <div className="px-4 py-3 bg-gradient-to-r from-vellum to-tint border-b border-line flex items-center gap-2">
                    <span>✨</span>
                    <p className="text-sm font-bold text-ink">AI 分析结果（可修改）</p>
                    {analysis?.color_note && <p className="ml-auto text-[10px] text-ink-3">{analysis.color_note}</p>}
                  </div>
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-ink-3 uppercase tracking-wide">发长</label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {HAIR_LENGTHS.map((l) => (
                          <button key={l} onClick={() => setEditedAnalysis({ ...editedAnalysis, length: l })}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${editedAnalysis.length === l ? 'bg-pink text-white' : 'bg-vellum text-ink-2 border border-line hover:border-pink'}`}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-ink-3 uppercase tracking-wide">当前发色</label>
                      <input value={editedAnalysis.color} onChange={(e) => setEditedAnalysis({ ...editedAnalysis, color: e.target.value })}
                        className="mt-2 w-full px-3 py-2 rounded-xl border border-line text-sm text-ink bg-vellum focus:outline-none focus:border-pink" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-ink-3 uppercase tracking-wide">漂染历史</label>
                      <div className="flex flex-col gap-2 mt-2">
                        {BLEACH_OPTIONS.map((opt) => (
                          <button key={opt.value} onClick={() => setEditedAnalysis({ ...editedAnalysis, bleach_count: opt.value })}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left ${editedAnalysis.bleach_count === opt.value ? 'bg-pink text-white' : 'bg-vellum text-ink-2 border border-line hover:border-pink'}`}>
                            <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${editedAnalysis.bleach_count === opt.value ? 'border-white bg-canvas' : 'border-[#C4A09A]'}`} />
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-line">
                      <label className="text-xs font-semibold text-ink-3 uppercase tracking-wide">目标发色</label>
                      {editedAnalysis.target_color_note && <p className="text-xs text-ink-3 mt-1">{editedAnalysis.target_color_note}</p>}
                      <input value={editedAnalysis.target_color} onChange={(e) => setEditedAnalysis({ ...editedAnalysis, target_color: e.target.value })}
                        className="mt-2 w-full px-3 py-2 rounded-xl border border-line text-sm text-ink bg-vellum focus:outline-none focus:border-pink" />
                    </div>
                  </div>
                </div>

                {/* 重新分析 + 确认按钮 */}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setAnalysis(null); setEditedAnalysis(null); }}
                    className="flex-1 py-4 rounded-full border border-line text-ink font-semibold text-[14px] hover:bg-sky hover:border-sky-dark transition-colors tap"
                  >
                    重新分析
                  </button>
                  <button
                    onClick={confirmAndProceed}
                    className="flex-[2] py-4 rounded-full bg-ink text-canvas font-semibold text-[15px] tracking-wide shadow-card hover:bg-orange hover:shadow-lift transition-all tap"
                  >
                    确认无误，判断我能不能染 →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== STEP 2: FEASIBILITY ===== */}
        {step === 'feasibility' && editedAnalysis && (
          <div className="space-y-8 relative pt-4">
            {/* 散落装饰 */}
            <Star className="absolute top-20 -left-3 text-sage-dark-dark float opacity-60 pointer-events-none" size={18} />
            <Sparkle className="absolute top-40 -right-2 text-orange pulse-soft opacity-70 pointer-events-none" size={20} />
            <Heart className="absolute top-[500px] left-2 text-soft-pink float opacity-80 pointer-events-none" size={22} style={{ animationDelay: '0.4s', color: 'var(--bad)' }} />

            {/* Hero */}
            <div className="relative pt-2">
              <p className="text-[12px] uppercase tracking-[0.3em] text-orange font-bold mb-3 rotate-1 inline-block">
                ✦ THE BIG QUESTION
              </p>
              <h2 className="hero-display text-[52px] sm:text-[60px] text-ink mb-3 leading-[0.9]">
                我能<span className="text-orange relative inline-block">染成
                  <Squiggle className="absolute -bottom-2 left-0 text-orange/50" size={120} />
                </span>这样<br/>
                <span className="inline-block animate-bounce-in" style={{ animationDelay: '0.2s' }}>吗</span>
                <span className="text-orange-dark">?</span>
              </h2>
              <p className="text-sm text-ink-2 mt-4">基于我的头发情况 ← AI 在评估</p>
            </div>

            {/* 头发对比 — 旋转贴纸样式 */}
            <div className="flex gap-3 items-center bg-canvas rounded-3xl border border-line p-4 shadow-card relative -rotate-[0.8deg] hover:rotate-0 transition-transform">
              {currentHairImage && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={currentHairImage.preview} className="w-16 h-16 object-cover rounded-2xl border-2 border-canvas shadow-soft" alt="current" />
                  <p className="absolute -bottom-1.5 -left-1 px-1.5 py-0.5 rounded-full bg-ink text-canvas text-[8px] font-bold tracking-wider">NOW</p>
                </div>
              )}
              <svg className="w-7 h-5 text-sky-dark" viewBox="0 0 28 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M2 10 Q 10 0, 18 10" />
                <path d="M14 5 L 20 10 L 14 15" />
              </svg>
              {targetColorImage && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={targetColorImage.preview} className="w-16 h-16 object-cover rounded-2xl border-2 border-canvas shadow-soft" alt="target" />
                  <p className="absolute -bottom-1.5 -left-1 px-1.5 py-0.5 rounded-full bg-sky-dark text-canvas text-[8px] font-bold tracking-wider">GOAL</p>
                </div>
              )}
              <div className="flex-1 min-w-0 text-xs text-ink-2 leading-snug pl-2">
                <p className="flex gap-1.5 mb-0.5"><span className="text-ink-3 w-8 shrink-0">发长</span><span className="font-medium">{editedAnalysis.length}</span></p>
                <p className="flex gap-1.5 mb-0.5"><span className="text-ink-3 w-8 shrink-0">底色</span><span className="font-medium">{editedAnalysis.color}{editedAnalysis.bleach_count > 0 ? ` · 漂${editedAnalysis.bleach_count}次` : ''}</span></p>
                <p className="flex gap-1.5"><span className="text-ink-3 w-8 shrink-0">目标</span><span className="font-medium text-orange">{editedAnalysis.target_color}</span></p>
              </div>
            </div>
            {error && <div className="bg-bad-bg border border-bad/20 rounded-2xl px-4 py-3 text-sm text-bad">{error}</div>}

            {/* 可行性判断 + 预算 + 博主对比折叠 */}
            {(isComparing || compareResult) && (() => {
              const cr = compareResult;
              const verdictStyle = cr?.verdict === 'impossible'
                ? { bg: 'bg-bad-bg', text: 'text-bad', accent: 'bg-bad', sticker: '✗', label: 'NOPE' }
                : cr?.verdict === 'partial'
                ? { bg: 'bg-warn-bg', text: 'text-orange-dark', accent: 'bg-warn', sticker: '!', label: 'MAYBE' }
                : { bg: 'bg-good-bg', text: 'text-good', accent: 'bg-good', sticker: '✓', label: 'YES' };

              return (
                <div className={`rounded-3xl overflow-hidden relative ${cr ? verdictStyle.bg : 'bg-canvas border border-line'} ${cr ? 'shadow-lift' : ''}`}>
                  {/* 大圆形 sticker 角标 */}
                  {cr && (
                    <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full ${verdictStyle.accent} text-canvas flex flex-col items-center justify-center shadow-lift rotate-12 hover:rotate-0 transition-transform z-10`}>
                      <span className="text-2xl font-black leading-none">{verdictStyle.sticker}</span>
                      <span className="text-[8px] tracking-[0.15em] font-bold mt-0.5">{verdictStyle.label}</span>
                    </div>
                  )}
                  {isComparing && !cr && (
                    <div className="p-10 flex flex-col items-center gap-5">
                      <LoadingGirl size={200} />
                      <div className="text-center">
                        <p className="hero-display text-[22px] text-ink leading-tight">AI 正在<span className="text-orange">判断</span></p>
                        <p className="text-sm text-ink-2 mt-2">看看能不能染成这样...</p>
                      </div>
                    </div>
                  )}

                  {cr && (
                    <div className="p-4 space-y-4">
                      {/* 主结论大字 */}
                      <div>
                        <p className={`hero-display text-[34px] ${verdictStyle.text}`}>{cr.one_line}</p>
                        {cr.approach_match > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-2 bg-canvas/60 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${cr.verdict === 'impossible' ? 'bg-rose-400' : cr.verdict === 'partial' ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                style={{ width: `${cr.approach_match}%` }}
                              />
                            </div>
                            <span className={`text-xs font-bold ${verdictStyle.text}`}>{cr.approach_match}% 接近度</span>
                          </div>
                        )}
                      </div>

                      {/* 主要限制 */}
                      {cr.limitations && cr.limitations.length > 0 && (
                        <div className="bg-canvas/70 rounded-xl p-3">
                          <p className="text-xs font-semibold text-ink-2 mb-1.5">📋 主要限制</p>
                          <ul className="space-y-1">
                            {cr.limitations.map((l, i) => (
                              <li key={i} className="text-sm text-ink leading-relaxed flex gap-1.5">
                                <span className="text-ink-3 flex-shrink-0">·</span>
                                <span>{l}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 预算/时间/何时 三栏 */}
                      {cr.verdict !== 'impossible' && (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-canvas/70 rounded-xl p-2.5 text-center">
                            <p className="text-[10px] text-ink-3">💰 预算</p>
                            <p className="text-sm font-bold text-ink mt-0.5">¥{cr.budget_min}-{cr.budget_max}</p>
                          </div>
                          <div className="bg-canvas/70 rounded-xl p-2.5 text-center">
                            <p className="text-[10px] text-ink-3">⏱️ 耗时</p>
                            <p className="text-sm font-bold text-ink mt-0.5">~{cr.time_hours}h</p>
                          </div>
                          <div className="bg-canvas/70 rounded-xl p-2.5 text-center">
                            <p className="text-[10px] text-ink-3">📅 时机</p>
                            <p className="text-sm font-bold text-ink mt-0.5">{cr.when_can_do}</p>
                          </div>
                        </div>
                      )}

                      {/* 不可行：前置步骤 */}
                      {cr.verdict === 'impossible' && cr.pre_required_steps && cr.pre_required_steps.length > 0 && (
                        <div className="bg-canvas rounded-xl p-3 space-y-2">
                          <p className="text-sm font-semibold text-rose-900">🪞 我需要先做这些</p>
                          {cr.pre_required_steps.map((s, i) => (
                            <div key={i} className="flex gap-3 items-start py-1.5 border-l-2 border-rose-300 pl-3">
                              <span className="w-5 h-5 rounded-full bg-rose-200 text-rose-800 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-ink">{s.action}</p>
                                <div className="flex flex-wrap gap-2 mt-0.5">
                                  {s.where && <span className="text-xs text-ink-3">📍 {s.where}</span>}
                                  {s.cost && <span className="text-xs text-ink-3">💰 {s.cost}</span>}
                                  {s.duration && <span className="text-xs text-ink-3">⏱️ {s.duration}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 我 vs 博主 — 极简横排列表 */}
                      {cr.blogger_profile && cr.diffs && cr.diffs.length > 0 && (
                        <div className="pt-2 mt-2 border-t border-line/60">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-ink-3 font-bold mb-3">✦ 我 vs 博主</p>
                          <div className="space-y-2.5">
                            {cr.diffs.map((diff, i) => (
                              <div key={i} className="flex items-baseline gap-3 text-[13px]">
                                <span className="text-ink-3 w-12 shrink-0 text-[11px]">{diff.aspect}</span>
                                <span className="text-ink-2">{diff.blogger}</span>
                                <span className="text-ink-4 text-[10px]">→</span>
                                <span className="text-ink font-semibold">{diff.user}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex gap-3">
              <button onClick={() => setStep('input')} className="flex-1 py-4 rounded-full border border-line text-ink font-semibold text-[14px] hover:bg-sky hover:border-sky-dark transition-colors tap">
                {compareResult?.verdict === 'impossible' ? '换个目标色' : '← 上一步'}
              </button>
              <button
                onClick={() => {
                  generateTutorial();
                  // generateTutorial 已经 setStep('product')
                }}
                className={`flex-[2] py-3.5 rounded-2xl text-white font-semibold text-base shadow-md hover:shadow-lg transition-all ${
                  compareResult?.verdict === 'impossible'
                    ? 'bg-gradient-to-br from-[#A08880] to-[#7A5550]'
                    : 'bg-pink'
                }`}
              >
                {compareResult?.verdict === 'impossible' ? '仅看参考教程 →' : '挑染膏 →'}
              </button>
            </div>
          </div>
        )}

        {/* ===== STEPS 3-5: PRODUCT / MIXING / OPERATION ===== */}
        {(step === 'product' || step === 'mixing' || step === 'operation') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-[28px] leading-[1.05] tracking-[-0.02em] text-ink">我的<span className="text-ink">专属</span>染发指南</h2>
                <p className="text-sm text-ink-2 mt-0.5">{editedAnalysis?.color} → {editedAnalysis?.target_color}</p>
              </div>
              <div className="flex gap-2">
                {currentHairImage && <img src={currentHairImage.preview} className="w-10 h-10 object-cover rounded-lg" alt="current" />}
                {targetColorImage && <img src={targetColorImage.preview} className="w-10 h-10 object-cover rounded-lg" alt="target" />}
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

            {/* Loading */}
            {isGenerating && (
              <div className="flex flex-col items-center gap-6 py-8">
                <LoadingGirl size={220} />
                <div className="text-center">
                  <p className="hero-display text-[24px] text-ink leading-tight">Tony 正在<span className="text-orange">定制专属教程</span></p>
                  <p className="text-sm text-ink-2 mt-3">分析发色 · 算用量 · 找真实评价 ...</p>
                </div>
                <div className="flex gap-1.5">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-orange animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}

            {tutorialData && (() => {
              const totalSteps = tutorialData.steps.length;
              const safeStepIdx = Math.max(0, Math.min(currentStepIndex, totalSteps - 1));
              const curStep = tutorialData.steps[safeStepIdx];
              if (!curStep) return null;
              return (
                <div className="space-y-4">
                  {/* 1. 购买清单（仅 product 屏） */}
                  {step === 'product' && (
                  <div className="space-y-3">
                    {tutorialData.simulated_premise && (
                      <div className="rounded-2xl bg-sky/30 border border-sky-dark/30 p-4 text-[13px] text-ink leading-relaxed">
                        <div className="flex items-start gap-2">
                          <span className="text-base">💡</span>
                          <div>
                            <div className="font-semibold text-ink mb-1">这是漂发完成后的染发教程</div>
                            <div className="text-ink-2">{tutorialData.simulated_premise}</div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="relative mb-5">
                      <p className="hero-display text-[30px] text-ink leading-none">三款适合<span className="text-orange">我的</span>染膏</p>
                      <p className="text-xs text-ink-3 mt-2">选一款准备开染 ↓</p>
                      {/* 装饰：飘动的小心 */}
                      <svg className="absolute -top-1 right-0 w-10 h-10 text-peach float" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 21s-7-4.5-9-9C1 7 5 4 8 4c2 0 3.5 1 4 2 .5-1 2-2 4-2 3 0 7 3 5 8-2 4.5-9 9-9 9z" />
                      </svg>
                    </div>
                    {tutorialData.dyes.map((d, i) => {
                      const isSelected = selectedDyeIdx === i;
                      const tilt = i === 0 ? 'tilt-l' : i === 2 ? 'tilt-r' : '';
                      return (
                      <div key={i} className={`relative rounded-3xl transition-all ${
                        isSelected
                          ? 'bg-peach border border-orange/30 shadow-lift'
                          : `bg-canvas border border-line shadow-soft hover:shadow-lift ${tilt}`
                      }`}>
                        {isSelected && (
                          <div className="absolute -top-3 -right-3 px-3.5 py-1.5 rounded-full bg-ink text-canvas text-[10px] font-bold tracking-[0.15em] shadow-card animate-bounce-in">已选 ✦</div>
                        )}
                        <div className="p-5">
                          {/* 头部：tier 大字 + 价格 */}
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-[14px] text-ink leading-none mb-1.5">{d.tier}</p>
                              <p className="text-[17px] text-ink font-medium leading-tight">{d.name}</p>
                              <div className="flex items-center gap-2 mt-2 text-[11px] text-ink-3">
                                {d.product_type && <span>{d.product_type}</span>}
                                {d.bottle_ml > 0 && (<><span>·</span><span className="numerals">{d.bottle_ml}ml</span></>)}
                                {d.monthly_sales && (<><span>·</span><span>{d.monthly_sales}</span></>)}
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              {(d.price || prices[d.name]) ? (
                                <>
                                  <p className="numerals text-[28px] font-black text-ink leading-none">{d.price || prices[d.name]}</p>
                                  <p className="text-[10px] text-ink-3 mt-1 tracking-wider uppercase">参考价/支</p>
                                </>
                              ) : isFetchingPrices ? (
                                <span className="flex items-center gap-1 text-xs text-ink-3"><Spinner />查价中</span>
                              ) : (
                                <p className="text-xs text-ink-3">点淘宝看</p>
                              )}
                            </div>
                          </div>

                          {/* 数量说明 - 简洁一行 */}
                          <div className="flex items-baseline gap-2 pb-3 mb-3 border-b border-line/50">
                            <span className="text-[11px] text-ink-3 uppercase tracking-wider">买多少</span>
                            <span className="numerals text-[20px] font-black text-ink leading-none">{d.quantity}</span>
                            <span className="text-xs text-ink-2">支</span>
                            {d.price && d.quantity > 1 && (() => {
                              const num = parseFloat(d.price.replace(/[^\d.]/g, ''));
                              if (!num) return null;
                              return <span className="text-[11px] text-ink-3 ml-auto">总计 <span className="numerals">¥{(num * d.quantity).toFixed(0)}</span></span>;
                            })()}
                          </div>
                          <p className="text-[12px] text-ink-2 leading-relaxed mb-4">{d.quantity_reason}</p>

                          {/* 优缺点 - 简洁列表 */}
                          {((d.pros && d.pros.length > 0) || (d.cons && d.cons.length > 0)) && (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-4">
                              {d.pros && d.pros.map((p, j) => (
                                <div key={`p${j}`} className="flex gap-1.5 text-[12px] text-ink-2 leading-snug">
                                  <span className="text-good mt-0.5 flex-shrink-0">✓</span><span>{p}</span>
                                </div>
                              ))}
                              {d.cons && d.cons.map((c, j) => (
                                <div key={`c${j}`} className="flex gap-1.5 text-[12px] text-ink-2 leading-snug">
                                  <span className="text-bad mt-0.5 flex-shrink-0">−</span><span>{c}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* 评价直接展开（不折叠） */}
                          {d.reviews && d.reviews.length > 0 && (
                            <div className="mb-4 space-y-2">
                              {d.reviews.slice(0, 2).map((r, j) => (
                                <div key={j} className="relative pl-4">
                                  <span className="absolute left-0 top-0 font-display text-[20px] text-ink/30 leading-none">"</span>
                                  <p className="text-[12px] text-ink-2 leading-relaxed">{r.quote}</p>
                                  {r.source_url && r.source_url.startsWith('http') && (
                                    <a href={r.source_url} target="_blank" rel="noopener noreferrer"
                                      className="text-[10px] text-ink-3 hover:text-ink inline-block mt-0.5">— 小红书原帖</a>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* 购买 + 选这款 */}
                          <div className="flex gap-2">
                            <a href={`https://s.taobao.com/search?q=${encodeURIComponent(d.name)}&commend=all`}
                              target="_blank" rel="noopener noreferrer"
                              className="flex-1 flex items-center justify-center py-2.5 rounded-full border border-line text-[12px] font-semibold text-ink hover:bg-ink hover:text-canvas transition-all tap">
                              淘宝下单 →
                            </a>
                            <button
                              onClick={() => setSelectedDyeIdx(isSelected ? null : i)}
                              className={`flex-1 py-2.5 rounded-full text-[13px] font-medium transition-all tap ${
                                isSelected
                                  ? 'bg-sage-dark text-canvas shadow-soft'
                                  : 'bg-canvas border border-line text-ink hover:bg-sky hover:border-sky-dark'
                              }`}
                            >
                              {isSelected ? '✓ 已选' : '选这款'}
                            </button>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                    <p className="text-[20px] font-black text-ink leading-none mt-8 mb-4">染后护色（可选）</p>
                      {tutorialData.care.map((c, i) => (
                        <div key={i} className="bg-canvas border border-line rounded-2xl p-4 shadow-soft">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-[12px] text-ink leading-none mb-1">{c.type}</p>
                              <p className="text-[15px] font-medium text-ink leading-tight">{c.name}</p>
                              <p className="text-[11px] text-ink-3 mt-1">{c.timing}</p>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              {(c.price || prices[c.name]) ? (
                                <p className="numerals text-[20px] font-black text-ink leading-none">{c.price || prices[c.name]}</p>
                              ) : isFetchingPrices ? (
                                <span className="flex items-center gap-1 text-xs text-ink-3"><Spinner />查价中</span>
                              ) : (
                                <p className="text-xs text-ink-3">点淘宝看</p>
                              )}
                              <p className="text-[10px] text-ink-3 mt-0.5">参考价/瓶</p>
                            </div>
                          </div>
                          {c.quantity_reason && (
                            <p className="text-[12px] text-ink-2 leading-relaxed mb-3 pt-2 border-t border-line/50">
                              {c.quantity && (
                                <span className="mr-2">
                                  买 <span className="numerals text-[16px] text-ink">{c.quantity}</span> 瓶 ·
                                </span>
                              )}
                              {c.quantity_reason}
                            </p>
                          )}
                          <a href={`https://s.taobao.com/search?q=${encodeURIComponent(c.name)}&commend=all`}
                            target="_blank" rel="noopener noreferrer"
                            className="w-full flex items-center justify-center py-2 rounded-full border border-line text-[11px] font-semibold text-ink hover:bg-ink hover:text-canvas transition-all tap">
                            淘宝下单 →
                          </a>
                        </div>
                      ))}
                  </div>
                  )}

                  {/* === STEP 3 (product) 导航按钮 === */}
                  {step === 'product' && (
                    <div className="flex gap-3 sticky bottom-4 z-10">
                      <button
                        onClick={() => setStep('feasibility')}
                        className="flex-1 py-4 rounded-full bg-canvas border border-line text-ink font-semibold text-[14px] shadow-soft hover:bg-sky hover:border-sky-dark transition-colors tap"
                      >
                        ← 上一步
                      </button>
                      <button
                        onClick={() => {
                          if (selectedDyeIdx === null) {
                            alert('请先选一支染膏');
                            return;
                          }
                          setStep('mixing');
                          setVisitedSteps(prev => new Set([...prev, 'mixing']));
                        }}
                        disabled={selectedDyeIdx === null}
                        className="flex-[2] py-4 rounded-full bg-ink text-canvas font-semibold text-[15px] tracking-wide shadow-card hover:bg-orange hover:shadow-lift disabled:opacity-40 disabled:cursor-not-allowed transition-all tap"
                      >
                        {selectedDyeIdx === null ? '请先选一支染膏' : '按这款的方法调配 →'}
                      </button>
                    </div>
                  )}

                  {/* 3. 调配指南（按用户选定的产品，从 dyes 取） */}
                  {step === 'mixing' && tutorialData.dyes.some(d => d.mixing) && (() => {
                    const dyesWithMixing = tutorialData.dyes.filter(d => d.mixing);
                    const safeIdx = Math.min(selectedDyeIdx ?? 0, dyesWithMixing.length - 1);
                    const selected = dyesWithMixing[safeIdx];
                    const mixing = selected?.mixing;
                    if (!mixing) return null;
                    const comps = mixing.components.length;
                    return (
                      <div className="relative space-y-5 pt-2">
                        {/* 散落装饰 */}
                        <Sparkle className="absolute top-12 -right-2 text-orange pulse-soft pointer-events-none" size={22} />
                        <Star className="absolute top-44 -left-2 text-orange-dark float opacity-60 pointer-events-none" size={18} />

                        {/* Hero */}
                        <div className="relative">
                          <p className="text-[12px] uppercase tracking-[0.3em] text-orange font-bold mb-2 -rotate-1 inline-block">
                            ✦ MIXING TIME
                          </p>
                          <h2 className="hero-display text-[44px] text-ink leading-[0.9]">
                            按这个比例 <br/>
                            <span className="text-orange">混合</span> ⚗️
                          </h2>
                        </div>

                        {/* 已选的产品迷你卡 — 紫色软块 */}
                        <div className="bg-peach rounded-2xl p-4 flex items-center gap-3 -rotate-[0.6deg] hover:rotate-0 transition-transform shadow-soft">
                          <div className="w-12 h-12 rounded-xl bg-canvas flex items-center justify-center text-2xl shrink-0">⚗️</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-orange mb-0.5 tracking-widest uppercase font-bold">{selected.tier}{selected.product_type ? ` · ${selected.product_type}` : ''}</p>
                            <p className="text-[15px] font-semibold text-ink truncate">{selected.name}</p>
                          </div>
                          <button
                            onClick={() => setStep('product')}
                            className="text-[11px] text-ink font-semibold px-3 py-1.5 rounded-full bg-canvas hover:bg-cream transition-colors shrink-0 border border-ink/10"
                          >
                            换 ⇄
                          </button>
                        </div>

                        {/* 用量速览 — 三列大数字卡片，各自旋转 */}
                        <div className={`grid gap-3 ${comps === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                          {mixing.components.map((c, i) => (
                            <div key={i} className={`bg-canvas border border-line rounded-3xl p-4 text-center shadow-soft hover:shadow-lift transition-all ${
                              i === 0 ? '-rotate-2 hover:rotate-0' : i === comps - 1 ? 'rotate-2 hover:rotate-0' : ''
                            }`}>
                              <p className="text-[9px] font-bold text-orange mb-2 truncate uppercase tracking-widest" title={c.label}>{c.label}</p>
                              <p className="numerals text-[36px] text-ink leading-none font-black">{c.ml}</p>
                              <p className="text-[10px] text-ink-3 mt-1 tracking-widest">ML</p>
                            </div>
                          ))}
                        </div>

                        {/* 比例 + 调配说明 — 紫色块 */}
                        <div className="bg-sky-dark rounded-3xl p-5 text-canvas relative shadow-lift">
                          <div className="absolute -top-2 -left-2 px-3 py-1 rounded-full bg-warn text-ink text-[10px] font-bold tracking-widest rotate-[-6deg]">RATIO ✦</div>
                          <p className="text-[10px] uppercase tracking-widest opacity-80 mb-1">比例</p>
                          <p className="numerals text-[44px] font-black leading-none mb-3">{mixing.ratio_display}</p>
                          <p className="text-[13px] leading-relaxed opacity-95">{mixing.instructions}</p>
                        </div>

                        {/* 我的情况特别提示 */}
                        {mixing.custom_notes && (
                          <div className="bg-soft-yellow rounded-2xl p-4 rotate-[0.4deg] hover:rotate-0 transition-transform shadow-soft border border-warn/20">
                            <p className="text-[11px] font-bold text-orange-dark mb-1.5 tracking-widest uppercase">✦ 我的情况</p>
                            <p className="text-[13px] text-ink leading-relaxed">{mixing.custom_notes}</p>
                          </div>
                        )}

                        {/* 真实经验引用 */}
                        {mixing.reference_quote && (
                          <div className="relative pl-6 py-2">
                            <span className="absolute left-0 top-1 text-[36px] text-orange font-black leading-none">&ldquo;</span>
                            <p className="text-[12px] text-ink-2 leading-relaxed">{mixing.reference_quote}</p>
                            <p className="text-[10px] text-ink-3 mt-1 tracking-widest uppercase">— 来自小红书</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* === STEP 4 (mixing) 导航按钮 === */}
                  {step === 'mixing' && (
                    <div className="flex gap-3 sticky bottom-4 z-10">
                      <button
                        onClick={() => setStep('product')}
                        className="flex-1 py-4 rounded-full bg-canvas border border-line text-ink font-semibold text-[14px] shadow-soft hover:bg-sky hover:border-sky-dark transition-colors tap"
                      >
                        ← 上一步
                      </button>
                      <button
                        onClick={() => {
                          setStep('operation');
                          setVisitedSteps(prev => new Set([...prev, 'operation']));
                          setCurrentStepIndex(0);
                        }}
                        className="flex-[2] py-4 rounded-full bg-ink text-canvas font-semibold text-[15px] tracking-wide shadow-card hover:bg-orange hover:shadow-lift transition-all tap"
                      >
                        都调好了，开始染 →
                      </button>
                    </div>
                  )}

                  {/* 4. 染发步骤（operation 屏） */}
                  {step === 'operation' && (
                  <div className="bg-canvas rounded-2xl border border-line overflow-hidden">
                    <div className="px-5 py-3 bg-canvas border-b border-line/50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>✂️</span>
                        <span className="font-bold text-sm text-ink">染发步骤</span>
                      </div>
                      <span className="text-xs text-ink-3">{currentStepIndex + 1} / {totalSteps}</span>
                    </div>

                    {/* Progress dots */}
                    <div className="flex gap-1.5 px-4 pt-4">
                      {tutorialData.steps.map((_, i) => (
                        <button key={i} onClick={() => { stopTts(); setCurrentStepIndex(i); }}
                          className={`flex-1 h-1.5 rounded-full transition-all ${i <= currentStepIndex ? 'bg-orange' : 'bg-line'}`} />
                      ))}
                    </div>

                    <div className="p-4">
                      {/* Step header */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-pink text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {currentStepIndex + 1}
                        </div>
                        <h3 className="font-bold text-ink">{curStep.title}</h3>
                      </div>

                      {/* 博主该步骤的连续帧（基于 videoAnalysis，自动轮播）— 缩小 */}
                      {videoAnalysis && videoAnalysis.action_steps[currentStepIndex]?.frames && videoAnalysis.action_steps[currentStepIndex].frames.length > 0 && (() => {
                        const frames = videoAnalysis.action_steps[currentStepIndex].frames;
                        const safeIdx = activeFrameIdx % frames.length;
                        return (
                          <div className="mb-4 flex gap-3 items-start">
                            <div className="relative rounded-2xl overflow-hidden bg-black w-28 h-40 shrink-0 shadow-soft">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={frames[safeIdx].path}
                                alt={`博主步骤${currentStepIndex + 1}帧${safeIdx + 1}`}
                                className="w-full h-full object-cover transition-opacity duration-500"
                              />
                              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-white text-[9px] font-medium">
                                {safeIdx + 1}/{frames.length}
                              </div>
                            </div>
                            <div className="flex-1 pt-1 min-w-0">
                              <p className="text-[10px] uppercase tracking-widest text-ink-3 font-bold mb-1">博主示范</p>
                              <p className="text-[11px] text-ink-2 leading-snug">这一步博主是这样做的，可参考</p>
                              {frames.length > 1 && (
                                <div className="flex items-center gap-1 mt-2 flex-wrap">
                                  {frames.map((_, i) => (
                                    <button key={i} onClick={() => setActiveFrameIdx(i)}
                                      className={`h-1.5 rounded-full transition-all ${i === safeIdx ? 'bg-orange w-5' : 'bg-line w-1.5 hover:bg-ink-4'}`}
                                      aria-label={`第${i + 1}张`} />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Content — 支持 • 开头的分点 */}
                      {/* Content — 支持 • 开头的分点 */}
                      {curStep.content.includes('•') || curStep.content.includes('\n') ? (
                        <ul className="space-y-2.5 mb-2">
                          {curStep.content.split('\n').map(line => line.replace(/^[•·\-\s]+/, '').trim()).filter(Boolean).map((bullet, j) => (
                            <li key={j} className="flex gap-2.5 text-[14px] text-ink leading-relaxed">
                              <span className="w-1.5 h-1.5 mt-2 rounded-full bg-orange shrink-0" />
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[14px] text-ink leading-relaxed">{curStep.content}</p>
                      )}

                      {/* Tip */}
                      {curStep.tip && (
                        <div className="mt-3 flex gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                          <span className="text-base flex-shrink-0">💡</span>
                          <p className="text-xs text-amber-800 leading-relaxed">{curStep.tip}</p>
                        </div>
                      )}

                      {/* Navigation */}
                      <div className="flex gap-3 mt-5">
                        <button onClick={() => { stopTts(); setCurrentStepIndex(i => i - 1); }} disabled={currentStepIndex === 0}
                          className="flex-1 py-2.5 rounded-xl border border-line text-sm text-ink-2 font-medium disabled:opacity-30 hover:bg-vellum transition-colors">
                          ← 上一步
                        </button>
                        <button onClick={() => { stopTts(); setCurrentStepIndex(i => i + 1); }} disabled={currentStepIndex === totalSteps - 1}
                          className="flex-[2] py-2.5 rounded-xl bg-pink text-white text-sm font-semibold disabled:opacity-30 hover:bg-pink-2 transition-colors">
                          下一步 →
                        </button>
                      </div>
                    </div>
                  </div>
                  )}

                  {/* === STEP 5 (operation) 完成 + 重新开始 === */}
                  {step === 'operation' && (
                    <button onClick={resetAll} className="w-full py-4 rounded-full border border-line text-ink-2 font-medium text-[14px] hover:bg-canvas transition-colors tap">
                      🎉 完成染发 / 换个发色重新开始
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </main>

      {/* 闹钟提醒弹窗（停留步骤时弹出） */}
      {timerPromptActive && !timerActive && pendingTimerSeconds > 0 && step === 'operation' && (
        <div className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fadeIn">
          <div className="bg-canvas rounded-3xl w-full max-w-md p-6 shadow-2xl border border-line">
            <div className="flex justify-center mb-3">
              <div className="w-16 h-16 rounded-2xl bg-orange-soft flex items-center justify-center text-3xl shadow-soft">⏰</div>
            </div>
            <h3 className="text-[22px] font-black text-ink text-center leading-tight mb-2">这步要等 {Math.round(pendingTimerSeconds / 60)} 分钟</h3>
            <p className="text-sm text-ink-2 text-center leading-relaxed mb-5">
              要不要我帮你设个闹钟？<br/>
              时间到了会自动提醒你。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => applyVoiceAction('decline_timer')}
                className="flex-1 py-3 rounded-full border border-line text-ink-2 font-medium text-sm hover:bg-cream transition-colors tap"
              >
                不用
              </button>
              <button
                onClick={() => applyVoiceAction('accept_timer')}
                className="flex-[2] py-3 rounded-full bg-ink text-canvas font-semibold text-sm shadow-card hover:bg-orange transition-all tap"
              >
                好，帮我设闹钟 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 进入操作步骤的语音弹窗 */}
      {voicePromptOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fadeIn">
          <div className="bg-canvas rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex justify-center mb-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center text-2xl shadow-md">🎤</div>
            </div>
            <h3 className="text-lg font-bold text-ink text-center mb-2">手脏不方便？开语音吧</h3>
            <p className="text-sm text-ink-2 text-center leading-relaxed mb-5">
              戴上手套染发时不好碰屏幕。我可以听懂你说的话，比如：<br/>
              <span className="text-ink font-medium">「我染好了，下一步」</span><br/>
              <span className="text-ink font-medium">「你帮我定个闹钟」</span><br/>
              <span className="text-ink font-medium">「我还没好呢，回到上一步」</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setVoicePromptOpen(false)}
                className="flex-1 py-3 rounded-2xl border border-line text-ink-2 font-medium text-sm hover:bg-vellum transition-colors"
              >
                不用，我手动操作
              </button>
              <button
                onClick={() => { setVoiceOn(true); setVoicePromptOpen(false); }}
                className="flex-[2] py-3 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 text-white font-semibold text-sm shadow hover:shadow-lg transition-all"
              >
                好，开启语音 →
              </button>
            </div>
            <p className="text-[10px] text-ink-3 text-center mt-3">需要允许浏览器使用麦克风</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return <PrototypeApp />;
}
