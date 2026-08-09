'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  Check,
  DownloadSimple,
  Play,
  Sparkle,
  VideoCamera,
} from '@phosphor-icons/react';
import { HairMirror, type HairMirrorSurface } from './hair-mirror';
import type { ColorMatrix } from './hair-mirror-core';

// 固定走同源的 /media/*（next.config.ts 里已经 rewrite 到 BACKEND_ORIGIN）。
// 之前按 NEXT_PUBLIC_API_BASE_URL 拼成 http://localhost:8001/... 的绝对地址，
// 一旦后端端口 / CORS_ORIGINS / 前端端口三者有任意一个对不上，<video> 就静默
// 加载失败——画面全黑、时长 0:00、没有任何报错。同源取模板把这三个变量一起消掉，
// 顺带让 createMediaElementSource 不会因跨域被判定为污染而静音。
const TEMPLATE_PATH = '/media/mock-assets/red/transition.mp4';
// 版本参数避免浏览器继续播放之前错误模板的缓存。
const TEMPLATE_URL = `${TEMPLATE_PATH}?v=red-transition-3`;
const TRANSITION_AT = 5;

type Stage = 'demo' | 'ready' | 'countdown' | 'recording' | 'review';

function bestRecorderMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function TransitionRecorderScreen({
  matrix,
  level,
  entryVideoId,
  simulatedNineDegree,
  onBack,
}: {
  matrix: ColorMatrix;
  level: number;
  entryVideoId?: string;
  simulatedNineDegree: boolean;
  onBack: () => void;
}) {
  const [stage, setStage] = useState<Stage>('demo');
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [templateDuration, setTemplateDuration] = useState(15);
  // 模板视频能不能播，必须是一个显式状态：它加载失败时 <video> 不抛异常、
  // 只是永远停在 0:00，用户看到的就是「模板播放失败」却没有任何提示。
  const [templateReady, setTemplateReady] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [effectEnabled, setEffectEnabled] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [resultFile, setResultFile] = useState<File | null>(null);
  const templateRef = useRef<HTMLVideoElement>(null);
  const surfaceRef = useRef<HairMirrorSurface | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  // 记住音频源当前绑在哪个 <video> 上，元素换了就得重建音频图
  const audioSourceElementRef = useRef<HTMLVideoElement | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  // 这次停止是「正常拍完」还是「出错中止」。onstop 无条件跳 review 正是
  // 「点了拍摄直接蹦出一条 0:00 空成片」的元凶：beginRecording 的 catch 里
  // 调 stopRecording()，onstop 抢先把 stage 设成 review，把 catch 末尾的
  // setStage('ready') 覆盖掉，于是失败被伪装成了成功。
  const abortedRef = useRef(false);
  const resultUrlRef = useRef(resultUrl);
  useEffect(() => { resultUrlRef.current = resultUrl; }, [resultUrl]);

  const stopRecording = useCallback((aborted = false) => {
    if (aborted) abortedRef.current = true;
    if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    templateRef.current?.pause();
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  }, []);

  useEffect(() => () => {
    stopRecording();
    void audioContextRef.current?.close();
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, [stopRecording]);

  const handleSurfaceReady = useCallback((surface: HairMirrorSurface) => {
    surfaceRef.current = surface;
    setCameraReady(true);
    setError('');
  }, []);

  const ensureAudioGraph = useCallback(async (template: HTMLVideoElement) => {
    const AudioContextClass = window.AudioContext;
    audioContextRef.current ??= new AudioContextClass();
    const audioContext = audioContextRef.current;
    if (audioContext.state === 'suspended') await audioContext.resume();
    audioDestinationRef.current ??= audioContext.createMediaStreamDestination();

    // 必须按【当前这个 video 元素】判断，不能只看 audioSourceRef 是否存在。
    // demo / 录制 / 回看 是三棵独立的 DOM 树，templateRef 会先后指向两个不同的
    // <video>。startCountdown 在 demo 那棵树上建好音频图后，进入录制阶段
    // React 卸载旧树、挂上新 <video>，而 audioSourceRef 还绑在已卸载的旧元素上，
    // 于是录制时播放的声音根本没进 audioDestination —— 成片音轨全静音。
    if (audioSourceRef.current && audioSourceElementRef.current === template) return;
    if (audioSourceRef.current) {
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    // createMediaElementSource 对同一个元素只能调一次，重复调用会抛错。
    // 这里不吞异常：吞掉的话录制会带着空音轨照常跑完，用户拿到一条没声音的
    // 成片却看不到任何提示。startCountdown 那边本来就 try 住了，不影响预览。
    try {
      audioSourceRef.current = audioContext.createMediaElementSource(template);
      audioSourceElementRef.current = template;
      audioSourceRef.current.connect(audioContext.destination);
      audioSourceRef.current.connect(audioDestinationRef.current);
    } catch (cause) {
      audioSourceElementRef.current = null;
      audioSourceRef.current = null;
      throw cause;
    }
  }, []);

  const beginRecording = useCallback(async () => {
    const template = templateRef.current;
    const surface = surfaceRef.current;
    // 录制 HairMirror 的实时试色画布：前 5 秒原发，第 5 秒后切换染后发色。
    const output = surface?.canvas;
    if (!template || !output || !surface || !cameraReady) return;
    if (!('MediaRecorder' in window) || !('captureStream' in output)) {
      setError('当前浏览器不支持视频录制，请使用最新版 Safari 或 Chrome。');
      return;
    }
    try {
      setError('');
      setEffectEnabled(false);
      setElapsed(0);
      chunksRef.current = [];
      template.currentTime = 0;

      await ensureAudioGraph(template);

      const stream = output.captureStream(30);
      const audioDestination = audioDestinationRef.current;
      if (!audioDestination) throw new Error('音乐轨道初始化失败，请重新开始跟拍。');
      const audioTracks = audioDestination.stream.getAudioTracks();
      // 音频图建失败时 getAudioTracks() 返回空数组，addTrack 一个都不加，
      // 录制照常跑完、不报错，成片却是纯视频无音轨——那正是"没有声音"的样子。
      // 与其静默出片，不如在这里就说清楚。
      if (!audioTracks.length) throw new Error('没能接上模板音乐，请退出重进这个页面再试。');
      audioTracks.forEach((track) => stream.addTrack(track));
      const mimeType = bestRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError('录制中断了，请重新拍一次。');
        stopRecording(true);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        // 中止收场：不产出成片，把用户放回可以重拍的界面。
        if (abortedRef.current) {
          abortedRef.current = false;
          chunksRef.current = [];
          setStage('ready');
          return;
        }
        const type = recorder.mimeType || mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type });
        // 空 blob 说明一帧都没录到（模板没播、画布没供流），
        // 与其给一条打不开的 0:00 成片，不如说清楚并让他重拍。
        if (blob.size < 1024) {
          chunksRef.current = [];
          setError('这次没录到画面，请确认模板视频能正常播放后再拍一次。');
          setStage('ready');
          return;
        }
        const extension = type.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `Tony-转场-${Date.now()}.${extension}`, { type });
        setResultFile(file);
        setResultUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return URL.createObjectURL(blob);
        });
        setStage('review');
      };

      recorder.start(250);
      setStage('recording');
      template.muted = false;
      await template.play();
      // play() resolve 了不代表真的在走：模板没加载出来时它会停在 0:00，
      // 于是录满 15 秒也全是静止画面。这里等它真正推进再继续。
      const startedAt = Date.now();
      let advanced = false;
      recordingTimerRef.current = window.setInterval(() => {
        const time = template.currentTime;
        if (time > 0.05) advanced = true;
        if (!advanced && Date.now() - startedAt > 1500) {
          setError('模板视频没能播放，请退出这个页面重进一次。');
          stopRecording(true);
          return;
        }
        setElapsed(time);
        if (time >= TRANSITION_AT) setEffectEnabled(true);
        const duration = Number.isFinite(template.duration) && template.duration > 0 ? template.duration : 10;
        if (advanced && (time >= duration - 0.05 || template.ended)) stopRecording();
      }, 80);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '录制启动失败，请重试。');
      stopRecording(true);
      setStage('ready');
    }
  }, [cameraReady, ensureAudioGraph, stopRecording]);

  const startCountdown = async () => {
    const template = templateRef.current;
    if (!template) return;
    setError('');
    try {
      // 必须在用户点击的同一事件中解锁音频和媒体播放；等待倒计时后再 play，
      // iOS/Safari 会把它当成无用户手势的自动播放而静音或拒绝。
      await ensureAudioGraph(template);
      template.currentTime = 0;
      template.muted = true;
      await template.play();
    } catch {
      // 音频图失败时仍继续；beginRecording 会给出明确错误，不让画面假装在录。
    }
    setStage('countdown');
    setCountdown(3);
  };

  useEffect(() => {
    if (stage !== 'countdown') return;
    if (countdown <= 0) {
      const timer = window.setTimeout(() => void beginRecording(), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 800);
    return () => window.clearTimeout(timer);
  }, [beginRecording, countdown, stage]);

  const saveResult = async () => {
    if (!resultFile) return;
    const shareData = { files: [resultFile], title: 'Tony 染发转场' };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
    }
    const anchor = document.createElement('a');
    anchor.href = resultUrl;
    anchor.download = resultFile.name;
    anchor.click();
  };

  const retry = () => {
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    audioSourceRef.current = null;
    audioSourceElementRef.current = null;
    audioDestinationRef.current = null;
    setEffectEnabled(false);
    setElapsed(0);
    setResultFile(null);
    setResultUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return '';
    });
    setStage('ready');
  };

  if (stage === 'demo') {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#111014] text-white">
        <header className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))]">
          <button type="button" onClick={onBack} aria-label="返回" className="grid size-10 place-items-center rounded-full bg-white/10">
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div>
            <p className="text-[15px] font-black">先看一遍动作模板</p>
            <p className="mt-0.5 text-[11px] text-white/50">第 5 秒用手掌完全遮住镜头</p>
          </div>
        </header>
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
          {/* 模板走同源 /media/*，不再需要 crossOrigin：跨域时缺它会让
              createMediaElementSource 认为音频被 CORS 污染而静默无声，
              同源则从根上没有这个问题。 */}
          <video
            ref={templateRef}
            src={TEMPLATE_URL}
            controls
            playsInline
            preload="auto"
            onLoadedMetadata={(event) => {
              setTemplateDuration(event.currentTarget.duration);
              setTemplateReady(true);
              setTemplateError('');
            }}
            onError={() => {
              setTemplateReady(false);
              setTemplateError('模板视频加载失败，请确认后端服务在运行后刷新页面。');
            }}
            className="size-full object-cover"
          >
            当前浏览器无法播放转场模板。
          </video>
          <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-bold backdrop-blur">
            看到手掌 → 跟着遮镜
          </div>
          {templateError ? (
            <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-2xl bg-black/80 px-4 py-3 text-center text-[12px] font-bold leading-5 text-[#ffaaa4] backdrop-blur">
              {templateError}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
          {/* 模板都没加载出来就别放人进录制页：那边只会拍出一条 0:00 的空片。 */}
          <button type="button" disabled={!templateReady} onClick={() => setStage('ready')} className="flex w-full items-center justify-center gap-2 rounded-full bg-pink py-3.5 text-[14px] font-black disabled:opacity-45">
            <VideoCamera size={18} weight="fill" /> {templateReady ? '我看懂了，开始跟拍' : templateError ? '模板加载失败' : '正在加载模板…'}
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'review' && resultUrl) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#111014] text-white">
        <header className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))]">
          <span className="grid size-9 place-items-center rounded-full bg-[#7fd39a]/15 text-[#7fd39a]"><Check size={19} weight="bold" /></span>
          <div><p className="text-[15px] font-black">转场拍好了</p><p className="text-[11px] text-white/50">参考画面不会出现在成片里</p></div>
        </header>
        {/* 回看播放器不能 muted：成片里录了模板音乐，静音的话用户会以为没录上声音。
            自动播放策略要求静音才能 autoPlay，但这里是用户点完"开始→结束"才进来的，
            已经有用户手势，出声播放不会被浏览器拦。 */}
        <div className="min-h-0 flex-1 bg-black"><video src={resultUrl} controls playsInline autoPlay loop preload="auto" onLoadedData={(event) => void event.currentTarget.play()} className="size-full object-cover" /></div>
        <div className="grid shrink-0 grid-cols-[.82fr_1.18fr] gap-2.5 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
          <button type="button" onClick={retry} className="flex items-center justify-center gap-1.5 rounded-full border border-white/20 py-3.5 text-[13px] font-bold"><ArrowCounterClockwise size={17} /> 重拍</button>
          <button type="button" onClick={() => void saveResult()} className="flex items-center justify-center gap-1.5 rounded-full bg-pink py-3.5 text-[13px] font-black"><DownloadSimple size={18} weight="bold" /> 保存到手机</button>
        </div>
      </div>
    );
  }

  const recording = stage === 'recording';
  const transitionSoon = recording && elapsed >= 3.8 && elapsed < TRANSITION_AT;
  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-black text-white">
      <div className="absolute inset-0">
        <HairMirror
          matrix={matrix}
          level={level}
          entryVideoId={entryVideoId}
          renderMode="surface"
          effectEnabled={effectEnabled}
          onSurfaceReady={handleSurfaceReady}
        />
      </div>

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pb-10 pt-[max(14px,env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} aria-label="返回" className="grid size-10 place-items-center rounded-full bg-black/35 backdrop-blur"><ArrowLeft size={18} weight="bold" /></button>
        <div className="rounded-full bg-black/45 px-3 py-1.5 text-[11px] font-bold backdrop-blur">
          {recording ? <><span className="mr-1.5 inline-block size-1.5 rounded-full bg-red-500" />{elapsed.toFixed(1)}s</> : '模板跟拍'}
        </div>
      </header>

      <div className="absolute left-4 top-[max(68px,calc(env(safe-area-inset-top)+58px))] z-20 w-[34%] max-w-[150px] overflow-hidden rounded-2xl border border-white/35 bg-black shadow-2xl">
        <div className="aspect-[9/16]">
          {/* 录制阶段这个 <video> 才是真正给 MediaRecorder 供音的那个。 */}
          <video
            ref={templateRef}
            src={TEMPLATE_URL}
            playsInline
            preload="auto"
            onLoadedMetadata={(event) => {
              setTemplateDuration(event.currentTarget.duration);
              setTemplateReady(true);
            }}
            onError={() => {
              setTemplateReady(false);
              setError('模板视频加载失败，请退出这个页面重进一次。');
            }}
            className="size-full object-cover"
          />
        </div>
        <p className="bg-black/85 py-1.5 text-center text-[9px] font-bold tracking-wide text-white/70">动作参考</p>
      </div>

      <div className="pointer-events-none absolute inset-x-4 bottom-28 z-20 text-center">
        {stage === 'countdown' ? (
          <span className="inline-grid size-24 place-items-center rounded-full bg-black/55 text-5xl font-black backdrop-blur">{Math.max(1, countdown)}</span>
        ) : (
          <div className={`mx-auto max-w-[290px] rounded-2xl px-4 py-3 backdrop-blur ${transitionSoon ? 'bg-pink text-white' : 'bg-black/50'}`}>
            <p className="text-[14px] font-black">
              {transitionSoon ? '准备伸手，完全遮住镜头' : effectEnabled ? '转场完成，保持动作到音乐结束' : '跟着左上角做动作'}
            </p>
            <p className="mt-1 text-[10px] opacity-70">第 5 秒自动切换染后发色</p>
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-12">
        {simulatedNineDegree && (
          <p className="mb-2 flex items-center justify-center gap-1 text-[10px] text-white/65"><Sparkle size={12} weight="fill" /> 染后段将模拟漂至 9 度的目标效果</p>
        )}
        {!recording && stage !== 'countdown' && (
          <button type="button" disabled={!cameraReady || !templateReady} onClick={() => void startCountdown()} className="flex w-full items-center justify-center gap-2 rounded-full bg-pink py-3.5 text-[14px] font-black disabled:opacity-45">
            <Play size={17} weight="fill" /> {!cameraReady ? '正在准备相机与实时试色…' : !templateReady ? '正在加载模板视频…' : `开始 ${Math.ceil(templateDuration)} 秒跟拍`}
          </button>
        )}
        {recording && <div className="mx-auto h-1.5 max-w-[300px] overflow-hidden rounded-full bg-white/20"><div className="h-full bg-pink transition-[width] duration-100" style={{ width: `${Math.min(100, elapsed / templateDuration * 100)}%` }} /></div>}
        {error && <p className="mt-2 text-center text-[11px] text-[#ffaaa4]">{error}</p>}
      </div>
    </div>
  );
}
