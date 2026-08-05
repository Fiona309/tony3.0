'use client';

/**
 * 染发魔镜 · 结论 + 实时试色（屏2）
 *
 * 结论与效果同屏出现：单独一屏文字判断读完就走，叠在自己脸上才有情绪，
 * 这正是用实时渲染替代"百分之多少能染"的意义。
 *
 * 与施华蔻的差异都来自定位差异（我们是风险顾问，不是品牌货架）：
 *   1. 底部只放 6 个种草视频里的博主色，按"能不能染"分组，不做色系货架
 *   2. 滑块含"可能偏色"一档，且偏色方向随底色度数变化
 *   3. 敢展示翻车效果
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowsLeftRight, Check, PencilSimple, WarningCircle, X } from '@phosphor-icons/react';

import {
  bleachVariants,
  decide,
  GROUP_META,
  lookup,
  riskGroup,
  toneVariants,
  undertoneOf,
  type ColorMatrix,
  type Decision,
  type RiskGroup,
  type Variant,
  type VideoColor,
} from './hair-mirror-core';
import { cx } from './ui';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18';
const MODEL = '/hair-mirror/hair_segmenter.tflite';

/* 亮度保留换色：只替换 YCbCr 色度，保留亮度 Y —— 发丝纹理/高光/层次全编码在 Y 里。
   recept 让亮的（漂过的）发丝吃色深、暗的发根几乎不上色，即布丁头。
   lift 模拟漂浅：先提亮再上色；必须乘 mask，否则整幅画面会蒙一层白纱。
   mix0=0 时输出原始画面（按住看染前）。 */
const FRAG = `precision mediump float;varying vec2 uv;
uniform sampler2D cam,mask;uniform vec3 target;uniform float strength;uniform float lift;uniform float mix0;
void main(){
  vec3 c=texture2D(cam,uv).rgb; float m=texture2D(mask,uv).r;
  float Y0=dot(c,vec3(.299,.587,.114));
  float lm=lift*m;
  float Y=clamp(Y0+lm*(1.0-Y0)*mix(1.4,0.6,Y0),0.,1.);
  float Cb=(c.b-Y0)*.564*mix(1.0,0.35,lm), Cr=(c.r-Y0)*.713*mix(1.0,0.35,lm);
  float tY=dot(target,vec3(.299,.587,.114));
  float tCb=(target.b-tY)*.564, tCr=(target.r-tY)*.713;
  float recept=clamp((Y-.10)/.45,0.,1.);
  float a=m*mix(.30,1.,recept)*strength;
  float nCb=mix(Cb,tCb,a), nCr=mix(Cr,tCr,a);
  float nY=mix(Y,Y*.72+tY*.28,a*.65);
  vec3 o=vec3(nY+1.403*nCr, nY-.714*nCr-.344*nCb, nY+1.773*nCb);
  gl_FragColor=vec4(clamp(mix(c,o,mix0),0.,1.),1.);
}`;
const VERT = `attribute vec2 p;varying vec2 uv;
void main(){uv=vec2(1.0-(p.x*.5+.5),1.0-(p.y*.5+.5));gl_Position=vec4(p,0.,1.);}`;

type GL = {
  gl: WebGLRenderingContext;
  camTex: WebGLTexture;
  maskTex: WebGLTexture;
  uT: WebGLUniformLocation | null;
  uS: WebGLUniformLocation | null;
  uL: WebGLUniformLocation | null;
  uM: WebGLUniformLocation | null;
};

function initGL(canvas: HTMLCanvasElement): GL | null {
  const gl = canvas.getContext('webgl', { alpha: false });
  if (!gl) return null;
  const sh = (t: number, src: string) => {
    const s = gl.createShader(t)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = (u: number) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + u);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  };
  const camTex = tex(0);
  const maskTex = tex(1);
  gl.uniform1i(gl.getUniformLocation(prog, 'cam'), 0);
  gl.uniform1i(gl.getUniformLocation(prog, 'mask'), 1);
  return {
    gl, camTex, maskTex,
    uT: gl.getUniformLocation(prog, 'target'),
    uS: gl.getUniformLocation(prog, 'strength'),
    uL: gl.getUniformLocation(prog, 'lift'),
    uM: gl.getUniformLocation(prog, 'mix0'),
  };
}

export type HairMirrorProps = {
  matrix: ColorMatrix;
  /** 屏1 确认后的底色度数 */
  level: number;
  /** 用户种草进来的那个视频，决定默认选中哪个博主色 */
  entryVideoId?: string;
  onLevelChange?: (level: number) => void;
  onBack?: () => void;
  /** 用户接受风险，进入方案与商品。此时才会触发生图（B 方案） */
  onAccept?: (choice: { videoId: string; colorName: string; level: number }) => void;
};

export function HairMirror({ matrix, level, entryVideoId, onLevelChange, onBack, onAccept }: HairMirrorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GL | null>(null);
  const segRef = useRef<any>(null);
  const runRef = useRef(false);
  const variantRef = useRef<Variant | null>(null);
  const rawRef = useRef(false);

  const usable = useMemo(() => matrix.videos.filter((v) => v.kb_color), [matrix]);
  const [videoId, setVideoId] = useState(() => entryVideoId ?? usable[0]?.video_id ?? '');
  const [stop, setStop] = useState(1);
  const [editLevel, setEditLevel] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  const picked: VideoColor | undefined = usable.find((v) => v.video_id === videoId) ?? usable[0];
  const kb = picked?.kb_color ?? '';
  const group: RiskGroup | null = kb ? riskGroup(matrix, kb, level) : null;
  const needBleach = group === 'bleach1' || group === 'bleach2' || group === 'no';

  const { variants, decision } = useMemo(() => {
    if (!kb) return { variants: [] as Variant[], decision: null as Decision | null };
    const d = decide(matrix, kb, level);
    if (needBleach) return { variants: bleachVariants(matrix, kb, level), decision: d };
    const base = d.entry?.rgb ?? ([0, 0, 0] as [number, number, number]);
    return { variants: toneVariants(base, undertoneOf(matrix, level), d.q), decision: d };
  }, [matrix, kb, level, needBleach]);

  // 切换颜色/度数后把滑块落到有意义的位置：能染时停在"和博主一样"
  useEffect(() => { setStop(needBleach ? 0 : 1); }, [kb, level, needBleach]);

  const active = variants[Math.min(stop, Math.max(0, variants.length - 1))] ?? null;
  variantRef.current = active;

  /* 载入 MediaPipe */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { ImageSegmenter, FilesetResolver } = await import(/* webpackIgnore: true */ MP as string);
        const vision = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
        const seg = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
        if (!alive) return;
        segRef.current = seg;
        setReady(true);
      } catch (e: any) {
        if (alive) setErr(e?.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, []);

  /* 摄像头 + 渲染循环 */
  useEffect(() => {
    if (!ready) return;
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    if (!glRef.current) {
      try { glRef.current = initGL(canvas); } catch (e: any) { setErr(e?.message || 'WebGL 初始化失败'); return; }
    }
    const G = glRef.current;
    if (!G) { setErr('浏览器不支持 WebGL'); return; }

    let stream: MediaStream | null = null;
    let lastT = -1;

    const uploadMask = (res: any) => {
      const cm = res.confidenceMasks?.[res.confidenceMasks.length - 1];
      if (!cm) return;
      const f = cm.getAsFloat32Array();
      const b = new Uint8Array(f.length);
      for (let i = 0; i < f.length; i++) b[i] = f[i] * 255;
      const { gl, maskTex } = G;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, cm.width, cm.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, b);
      cm.close();
    };

    const loop = () => {
      if (!runRef.current) return;
      requestAnimationFrame(loop);
      if (video.readyState < 2 || video.currentTime === lastT) return;
      lastT = video.currentTime;
      const { gl, camTex, uT, uS, uL, uM } = G;
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      segRef.current.segmentForVideo(video, performance.now(), uploadMask);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, camTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      const v = variantRef.current;
      gl.uniform3f(uT, (v?.rgb[0] ?? 0) / 255, (v?.rgb[1] ?? 0) / 255, (v?.rgb[2] ?? 0) / 255);
      gl.uniform1f(uS, v?.str ?? 1);
      gl.uniform1f(uL, v?.lift ?? 0);
      gl.uniform1f(uM, rawRef.current || !v ? 0 : 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
        });
        video.srcObject = stream;
        await video.play();
        runRef.current = true;
        loop();
      } catch (e: any) {
        setErr(/NotAllowed|denied|permission/i.test(e?.message || '')
          ? '需要摄像头权限，请在浏览器里允许后刷新页面'
          : e?.message || '摄像头打不开');
      }
    })();
    return () => { runRef.current = false; stream?.getTracks().forEach((t) => t.stop()); };
  }, [ready]);

  const tone = active?.risk ? 'bad' : group === 'ok' ? (decision?.q === 'biased' ? 'warn' : 'ok') : 'warn';
  const headline = active?.risk
    ? '这就是翻车的样子'
    : group === 'ok'
      ? decision?.q === 'biased' ? '能染，但这个底色容易偏色' : `你现在就能染成${picked?.color_name ?? ''}`
      : `想染${picked?.color_name ?? ''}，${GROUP_META[group ?? 'no'].label}`;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#111014] text-white">
      <header className="flex shrink-0 items-center gap-2 bg-cream px-3 pb-2.5 pt-[max(12px,env(safe-area-inset-top))] text-ink">
        <button type="button" onClick={onBack} aria-label="返回"
          className="sketch-icon-button tap grid size-9 place-items-center bg-white">
          <ArrowLeft size={18} weight="bold" />
        </button>
        <p className="flex-1 truncate text-center text-sm font-black">实时试色</p>
        <button type="button" onClick={() => setEditLevel((v) => !v)}
          className="tap flex items-center gap-1 rounded-full border border-ink/20 bg-white px-2.5 py-1 text-[11px] font-bold">
          底色 <span className="numerals">{level}</span> 度 <PencilSimple size={12} weight="bold" />
        </button>
      </header>

      {editLevel && (
        <div className="shrink-0 bg-cream px-3 pb-3 text-ink">
          <p className="mb-1.5 text-[11px] text-ink-3">光线会让自动识别偏差 2~3 度，以你实际发根为准</p>
          <div className="flex gap-1.5">
            {[3, 4, 5, 6, 7, 8, 9].map((lv) => (
              <button key={lv} type="button" onClick={() => { onLevelChange?.(lv); setEditLevel(false); }}
                aria-pressed={lv === level}
                className={cx('flex-1 rounded-[10px] border py-1.5 text-[13px] font-bold',
                  lv === level ? 'border-pink bg-pink text-white' : 'border-ink/20 bg-white text-ink-2')}>
                {lv}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video ref={videoRef} playsInline muted className="hidden" />
        <canvas ref={canvasRef} className="size-full object-cover" />

        <button type="button" aria-label="按住查看染前"
          onPointerDown={() => { rawRef.current = true; }}
          onPointerUp={() => { rawRef.current = false; }}
          onPointerLeave={() => { rawRef.current = false; }}
          className="absolute right-3 top-3 grid size-11 place-items-center rounded-full bg-black/45 backdrop-blur">
          <ArrowsLeftRight size={20} weight="bold" />
        </button>

        {(!ready || err) && (
          <div className="absolute inset-0 grid place-items-center bg-black/75 px-8 text-center text-sm">
            <p className="leading-6 text-white/85">{err || '正在准备实时试色…'}</p>
          </div>
        )}

        {decision && (
          <div className={cx('absolute inset-x-3 bottom-3 rounded-2xl px-3.5 py-3 backdrop-blur',
            tone === 'ok' ? 'bg-[#1d4b2a]/85' : tone === 'bad' ? 'bg-[#5b2320]/88' : 'bg-[#5a4416]/88')}>
            <div className="flex items-center gap-1.5">
              {tone === 'ok' ? <Check size={15} weight="bold" />
                : tone === 'bad' ? <X size={15} weight="bold" />
                : <WarningCircle size={15} weight="bold" />}
              <p className="text-[13px] font-black">{headline}</p>
            </div>
            <p className="mt-1 text-[11px] leading-[1.55] text-white/80">
              {active?.risk ? active.note : decision.why}
            </p>
          </div>
        )}
      </div>

      {/* 效果档位：能染时是浅/一样/深/偏色，需要漂时是不漂/漂1次/漂2次 */}
      <div className="shrink-0 bg-[#1b1a1f] px-4 py-2.5">
        <input type="range" min={0} max={Math.max(0, variants.length - 1)} step={1} value={stop}
          onChange={(e) => setStop(Number(e.target.value))}
          className={cx('w-full', active?.risk ? 'accent-[#e08a84]' : 'accent-white')}
          aria-label="效果档位" />
        <div className="mt-0.5 flex justify-between text-[11px]">
          {variants.map((v, i) => (
            <span key={v.key} className={cx(
              i === stop ? 'font-black' : 'text-white/45',
              i === stop && v.risk ? 'text-[#e08a84]' : i === stop ? 'text-white' : '',
            )}>{v.label}</span>
          ))}
        </div>
      </div>

      {/* 6 个博主色，按能不能染分组 */}
      <div className="shrink-0 bg-[#141317] pt-2.5">
        <div className="flex items-end gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {usable.map((v) => {
            const g = riskGroup(matrix, v.kb_color!, level);
            const e = lookup(matrix, v.kb_color!, level);
            const on = v.video_id === picked?.video_id;
            return (
              <button key={v.video_id} type="button" onClick={() => setVideoId(v.video_id)}
                aria-pressed={on} className="w-16 shrink-0 text-center">
                <span className={cx('mx-auto block size-12 rounded-full border-2 transition',
                  on ? 'border-pink' : 'border-transparent')}
                  style={{ background: e?.hex ?? v.accent ?? '#3a3a3a' }} />
                <span className={cx('mt-1 block truncate text-[11px]', on ? 'font-black text-white' : 'text-white/60')}>
                  {v.color_name}
                </span>
                <span className={cx('block text-[10px]',
                  g === 'ok' ? 'text-[#7fd39a]' : g === 'no' ? 'text-[#e08a84]' : 'text-[#e5c169]')}>
                  {GROUP_META[g].short}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 bg-[#141317] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-1">
        <button type="button"
          onClick={() => picked && onAccept?.({ videoId: picked.video_id, colorName: picked.color_name, level })}
          className="tap w-full rounded-full bg-pink py-3 text-[14px] font-black text-white">
          我接受这些风险，看方案与商品 →
        </button>
      </div>
    </div>
  );
}
