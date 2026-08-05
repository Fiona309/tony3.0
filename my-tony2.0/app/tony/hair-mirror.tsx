'use client';

/**
 * 染发魔镜 · 实时试色
 *
 * 与施华蔻的三点关键差异，都来自定位差异（我们是风险顾问，不是品牌货架）：
 *   1. 色卡按"能不能染"分组，不按色系分类
 *   2. 能一键看"翻车效果"——施华蔻只给你看美的那面
 *   3. 滑块是用量/手法（居家翻车的真实原因），仅在需要漂浅时才切成漂浅档
 *
 * 全流程零 API 调用、零服务器 CPU：分割与渲染都在浏览器本地。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowsLeftRight,
  Check,
  PencilSimple,
  WarningCircle,
  X,
} from '@phosphor-icons/react';

import {
  BLEACH_STOPS,
  bleachVariant,
  decide,
  groupFamilies,
  GROUP_META,
  lookup,
  riskGroup,
  usageVariants,
  type Decision,
  type RiskGroup,
  type Rules,
  type Variant,
} from './hair-mirror-core';
import { cx } from './ui';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18';
const ASSETS = '/hair-mirror';
const GROUP_ORDER: RiskGroup[] = ['ok', 'bleach1', 'bleach2', 'no'];

/* 亮度保留换色：只替换 YCbCr 色度，保留亮度 Y。发丝纹理/高光/层次全编码在 Y 里。
   recept 让亮的（漂过的）发丝吃色深、暗的发根几乎不上色 —— 即布丁头。
   lift 模拟漂浅：先提亮再上色。mix0=0 时输出原始画面（按住看染前）。 */
const FRAG = `precision mediump float;varying vec2 uv;
uniform sampler2D cam,mask;uniform vec3 target;uniform float strength;uniform float lift;uniform float mix0;
void main(){
  vec3 c=texture2D(cam,uv).rgb; float m=texture2D(mask,uv).r;
  float Y0=dot(c,vec3(.299,.587,.114));
  /* lift 与去饱和必须乘以 mask —— 否则整幅画面（脸、背景）都会被提亮去色，
     表现为漂浅档位上蒙了一层白纱。这是必须保证的：无论换什么发色，
     非头发像素都要原样透传。 */
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
  const tex = (unit: number) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
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
  initialLevel?: number;
  initialFamily?: string;
  onBack?: () => void;
  onSeePlan?: (choice: { family: string; level: number }) => void;
};

export function HairMirror({ initialLevel = 5, initialFamily, onBack, onSeePlan }: HairMirrorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GL | null>(null);
  const segRef = useRef<any>(null);
  const runRef = useRef(false);
  const variantRef = useRef<Variant | null>(null);
  const rawRef = useRef(false);

  const [rules, setRules] = useState<Rules | null>(null);
  const [level, setLevel] = useState(initialLevel);
  const [family, setFamily] = useState<string | undefined>(initialFamily);
  const [stop, setStop] = useState(0);
  /** 是否正在看"翻车效果" —— 这是与施华蔻最本质的差异 */
  const [showBad, setShowBad] = useState(false);
  const [editLevel, setEditLevel] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r: Rules = await (await fetch(`${ASSETS}/rules.json`)).json();
        if (!alive) return;
        setRules(r);
        if (!family) setFamily(Object.keys(r.colors)[0]);
        const { ImageSegmenter, FilesetResolver } = await import(/* webpackIgnore: true */ MP as string);
        const vision = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
        const seg = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${ASSETS}/hair_segmenter.tflite`, delegate: 'GPU' },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => (rules ? groupFamilies(rules, level) : null), [rules, level]);
  const group: RiskGroup | null = rules && family ? riskGroup(rules, family, level) : null;
  const needsBleach = group === 'bleach1' || group === 'bleach2';

  /** 滑块语义跟着分组走：能直接染 → 看用量差异；需要漂 → 看漂几次的效果 */
  const stopLabels = needsBleach ? BLEACH_STOPS.map((s) => s.label) : ['用量偏少', '标准用量', '用量偏多'];

  const state: { variant: Variant; decision: Decision; badVariant?: Variant } | null = useMemo(() => {
    if (!rules || !family) return null;
    const d = decide(rules, family, level);
    if (needsBleach) {
      const b = bleachVariant(rules, family, level, stop);
      return { variant: b.variant, decision: b.decision };
    }
    if (!d.entry) return null;
    const v = usageVariants(d.entry.rgb, d.q);
    const order = [v[1], v[0], v[2]]; // 偏少 / 标准 / 偏多
    return { variant: order[Math.min(stop, 2)], decision: d, badVariant: v[3] };
  }, [rules, family, level, stop, needsBleach]);

  variantRef.current = (showBad && state?.badVariant ? state.badVariant : state?.variant) ?? null;
  rawRef.current = false;

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

  const pickFamily = useCallback((name: string) => { setFamily(name); setStop(needsBleachFor(name)); }, [rules, level]);
  function needsBleachFor(name: string) {
    if (!rules) return 0;
    const g = riskGroup(rules, name, level);
    return g === 'bleach1' ? 1 : g === 'bleach2' ? 2 : 1; // 能染时默认落在"标准用量"
  }

  const verdictTone =
    group === 'ok' && state?.decision.q === 'biased' ? 'warn'
    : group === 'ok' ? 'ok'
    : group === 'no' ? 'bad'
    : 'warn';

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#111014] text-white">
      {/* 顶部：返回 + 底色（可随时改，因为光照会让识别偏 3 度） */}
      <header className="flex shrink-0 items-center gap-2 bg-cream px-3 pb-2.5 pt-[max(12px,env(safe-area-inset-top))] text-ink">
        <button type="button" onClick={onBack} aria-label="返回"
          className="sketch-icon-button tap grid size-9 place-items-center bg-white">
          <ArrowLeft size={18} weight="bold" />
        </button>
        <p className="flex-1 truncate text-center text-sm font-black">实时试色</p>
        <button type="button" onClick={() => setEditLevel((v) => !v)}
          className="tap flex items-center gap-1 rounded-full border border-ink/20 bg-white px-2.5 py-1 text-[11px] font-bold">
          底色 <span className="numerals">{level}</span> 度
          <PencilSimple size={12} weight="bold" />
        </button>
      </header>

      {editLevel && (
        <div className="shrink-0 bg-cream px-3 pb-3 text-ink">
          <p className="mb-1.5 text-[11px] text-ink-3">光线会让自动识别偏差 2~3 度，以你实际发根为准</p>
          <div className="flex gap-1.5">
            {[3, 4, 5, 6, 7, 8, 9].map((lv) => (
              <button key={lv} type="button"
                onClick={() => { setLevel(lv); setEditLevel(false); }}
                aria-pressed={lv === level}
                className={cx('flex-1 rounded-[10px] border py-1.5 text-[13px] font-bold',
                  lv === level ? 'border-pink bg-pink text-white' : 'border-ink/20 bg-white text-ink-2')}>
                {lv}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 摄像头 */}
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
            <p className="leading-6 text-white/85">{err || '正在读取你的底色…'}</p>
          </div>
        )}

        {/* 风险结论——贴着画面底部，让"结论"和"效果"同时进入视野 */}
        {state && group && (
          <div className={cx('absolute inset-x-3 bottom-3 rounded-2xl px-3.5 py-3 backdrop-blur',
            verdictTone === 'ok' ? 'bg-[#1d4b2a]/80'
            : verdictTone === 'bad' ? 'bg-[#5b2320]/85' : 'bg-[#5a4416]/85')}>
            <div className="flex items-center gap-1.5">
              {verdictTone === 'ok' ? <Check size={15} weight="bold" />
                : verdictTone === 'bad' ? <X size={15} weight="bold" />
                : <WarningCircle size={15} weight="bold" />}
              <p className="text-[13px] font-black">
                {group === 'ok' && state.decision.q === 'biased' ? '能染，但会偏色'
                  : group === 'ok' ? '这个色你现在就能染'
                  : GROUP_META[group].label}
              </p>
            </div>
            <p className="mt-1 text-[11px] leading-[1.55] text-white/80">{state.decision.why}</p>
            {state.badVariant && (
              <button type="button"
                onPointerDown={() => setShowBad(true)}
                onPointerUp={() => setShowBad(false)}
                onPointerLeave={() => setShowBad(false)}
                className={cx('tap mt-2 w-full rounded-xl py-2 text-[12px] font-black transition',
                  showBad ? 'bg-white text-ink' : 'bg-white/15')}>
                {showBad ? '这就是翻车的样子 · 松开返回' : '按住看翻车效果 →'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 滑块：能染时是用量差异，需漂时是漂浅档 */}
      <div className="shrink-0 bg-[#1b1a1f] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="w-9 shrink-0 text-[11px] font-bold text-white/60">{needsBleach ? '漂浅' : '用量'}</span>
          <input type="range" min={0} max={stopLabels.length - 1} step={1} value={stop}
            onChange={(e) => setStop(Number(e.target.value))}
            className="flex-1 accent-white" aria-label={needsBleach ? '漂浅次数' : '染膏用量'} />
        </div>
        <div className="ml-12 flex justify-between text-[11px] text-white/55">
          {stopLabels.map((l, i) => (
            <span key={l} className={cx(i === stop && 'font-black text-white')}>{l}</span>
          ))}
        </div>
      </div>

      {/* 色卡：按"能不能染"分组，不按色系 —— 与施华蔻的根本差异 */}
      <div className="shrink-0 bg-[#141317] pt-2.5">
        <div className="flex items-end gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {groups && GROUP_ORDER.map((g) => (groups[g].length ? (
            <div key={g} className="flex shrink-0 items-end gap-3 border-l border-white/12 pl-3 first:border-0 first:pl-0">
              <div className="w-14 shrink-0 pb-1">
                <p className={cx('text-[11px] font-black leading-tight',
                  g === 'ok' ? 'text-[#7fd39a]' : g === 'no' ? 'text-[#e08a84]' : 'text-[#e5c169]')}>
                  {GROUP_META[g].label}
                </p>
                <p className="mt-0.5 text-[10px] leading-tight text-white/40">{groups[g].length} 个</p>
              </div>
              {groups[g].map((name) => {
                const e = rules ? lookup(rules, name, level) : null;
                const on = name === family;
                return (
                  <button key={name} type="button" onClick={() => pickFamily(name)} aria-pressed={on}
                    className="w-14 shrink-0 text-center">
                    <span className={cx('mx-auto block size-12 rounded-full border-2 transition',
                      on ? 'border-pink' : 'border-transparent')}
                      style={{ background: e?.hex ?? '#3a3a3a' }} />
                    <span className={cx('mt-1 block truncate text-[10px]', on ? 'font-black text-white' : 'text-white/55')}>
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null))}
        </div>
      </div>

      <div className="shrink-0 bg-[#141317] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-1">
        <button type="button"
          onClick={() => family && onSeePlan?.({ family, level })}
          className="tap w-full rounded-full bg-pink py-3 text-[14px] font-black text-white">
          看完整方案与商品 →
        </button>
      </div>
    </div>
  );
}
