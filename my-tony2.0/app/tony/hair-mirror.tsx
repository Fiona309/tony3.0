'use client';

/**
 * 染发魔镜 · 实时试色
 * 布局一比一对齐施华蔻染发魔镜：顶部导航 / 全屏单张摄像头 / 商品卡 /
 * 底色档位滑块（自然发色·漂浅1次·漂浅2次）/ 色系分类 + 色卡横滑。
 * 配色沿用 Tony 的 design token（cream / ink / pink），相机区用深色 chrome。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowsLeftRight, Camera, ShoppingCart } from '@phosphor-icons/react';

import {
  BLEACH_STOPS,
  bleachVariant,
  decide,
  levelFromL,
  lookup,
  rgb2lab,
  usageVariants,
  type Decision,
  type Rules,
  type Variant,
} from './hair-mirror-core';
import { cx } from './ui';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18';
const ASSETS = '/hair-mirror';

/* 亮度保留换色：只替换 YCbCr 的色度，保留亮度 Y。
   发丝纹理 / 高光 / 层次全部编码在 Y 里，保住 Y 就保住"还是那束头发"。
   recept 让亮的（漂过的）发丝吃色深、暗的发根几乎不上色 —— 即布丁头。
   lift 模拟漂浅：先把发丝提亮，提亮后才吃得上色。 */
const FRAG = `precision mediump float;varying vec2 uv;
uniform sampler2D cam,mask;uniform vec3 target;uniform float strength;uniform float lift;uniform float mix0;
void main(){
  vec3 c=texture2D(cam,uv).rgb; float m=texture2D(mask,uv).r;
  float Y0=dot(c,vec3(.299,.587,.114));
  float Y=clamp(Y0+lift*(1.0-Y0)*mix(1.4,0.6,Y0),0.,1.);
  float Cb=(c.b-Y0)*.564*mix(1.0,0.35,lift), Cr=(c.r-Y0)*.713*mix(1.0,0.35,lift);
  float tY=dot(target,vec3(.299,.587,.114));
  float tCb=(target.b-tY)*.564, tCr=(target.r-tY)*.713;
  float recept=clamp((Y-.10)/.45,0.,1.);
  float a=m*mix(.30,1.,recept)*strength*mix0;
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
    gl,
    camTex,
    maskTex,
    uT: gl.getUniformLocation(prog, 'target'),
    uS: gl.getUniformLocation(prog, 'strength'),
    uL: gl.getUniformLocation(prog, 'lift'),
    uM: gl.getUniformLocation(prog, 'mix0'),
  };
}

export type HairMirrorProps = {
  /** 拍照识别出的底色度数；未给则默认 5 度，用户可自行调整 */
  initialLevel?: number;
  /** 目标色系，来自方案页选中的商品 */
  initialFamily?: string;
  /** 商品卡展示用 */
  product?: { title: string; subtitle: string; image?: string };
  onBack?: () => void;
  onAddToCart?: () => void;
};

export function HairMirror({
  initialLevel = 5,
  initialFamily,
  product,
  onBack,
  onAddToCart,
}: HairMirrorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GL | null>(null);
  const segRef = useRef<any>(null);
  const runRef = useRef(false);
  const variantRef = useRef<Variant | null>(null);
  const compareRef = useRef(false);

  const [rules, setRules] = useState<Rules | null>(null);
  const [level, setLevel] = useState(initialLevel);
  const [stop, setStop] = useState(0);
  const [family, setFamily] = useState<string | undefined>(initialFamily);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const [compare, setCompare] = useState(false);
  const [fps, setFps] = useState(0);

  /* 载入规则 + 预热模型。用户还在看上一屏时就下好，等他进来已就绪 */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r: Rules = await (await fetch(`${ASSETS}/rules.json`)).json();
        if (!alive) return;
        setRules(r);
        if (!family) setFamily(Object.keys(r.colors)[0]);

        const { ImageSegmenter, FilesetResolver } = await import(
          /* webpackIgnore: true */ MP as string
        );
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
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 当前应该渲染的目标色 */
  const current: { variant: Variant; decision: Decision } | null = (() => {
    if (!rules || !family) return null;
    const d = decide(rules, family, level);
    if (!d.entry) return null;
    if (d.can) {
      // 能染：滑块用来看用量/手法差异
      const v = usageVariants(d.entry.rgb, d.q);
      return { variant: v[Math.min(stop, v.length - 1)], decision: d };
    }
    // 不能染：滑块就是施华蔻那套 自然发色 / 漂浅1次 / 漂浅2次
    const b = bleachVariant(rules, family, level, stop);
    return { variant: b.variant, decision: b.decision };
  })();
  variantRef.current = current?.variant ?? null;
  compareRef.current = compare;

  /* 开摄像头 + 渲染循环 */
  useEffect(() => {
    if (!ready) return;
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    if (!glRef.current) {
      try {
        glRef.current = initGL(canvas);
      } catch (e: any) {
        setErr(e?.message || 'WebGL 初始化失败');
        return;
      }
    }
    const G = glRef.current;
    if (!G) {
      setErr('浏览器不支持 WebGL');
      return;
    }

    let stream: MediaStream | null = null;
    let lastT = -1;
    let frames = 0;
    let clk = performance.now();

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
      gl.uniform1f(uM, compareRef.current || !v ? 0 : 1); // 按住对比 = 显示原始画面
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      frames++;
      const now = performance.now();
      if (now - clk >= 600) {
        setFps(Math.round((frames * 1000) / (now - clk)));
        frames = 0;
        clk = now;
      }
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();
        runRef.current = true;
        loop();
      } catch (e: any) {
        setErr(/NotAllowed|denied|permission/i.test(e?.message || '') ? '需要摄像头权限，请在浏览器里允许后刷新' : e?.message || '摄像头打不开');
      }
    })();

    return () => {
      runRef.current = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [ready]);

  const families = rules ? Object.keys(rules.colors) : [];
  const stopLabels = current?.decision.can
    ? ['标准用量', '用量偏少', '用量偏多']
    : BLEACH_STOPS.map((s) => s.label);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#111014] text-white">
      {/* 顶部导航 */}
      <header className="flex shrink-0 items-center gap-2 bg-cream px-3 pb-2.5 pt-[max(12px,env(safe-area-inset-top))] text-ink">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回"
          className="sketch-icon-button tap grid size-9 place-items-center bg-white"
        >
          <ArrowLeft size={18} weight="bold" />
        </button>
        <p className="flex-1 truncate text-center text-sm font-black">染发魔镜 · 实时试色</p>
        <span className="w-9 text-right text-[10px] font-bold text-ink-3 numerals">{fps || '–'}fps</span>
      </header>

      {/* 摄像头区 */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video ref={videoRef} playsInline muted className="hidden" />
        <canvas ref={canvasRef} className="size-full object-cover" />

        {/* 右上：按住看染前 */}
        <button
          type="button"
          aria-label="按住查看染前"
          onPointerDown={() => setCompare(true)}
          onPointerUp={() => setCompare(false)}
          onPointerLeave={() => setCompare(false)}
          className={cx(
            'absolute right-3 top-3 grid size-11 place-items-center rounded-full backdrop-blur transition',
            compare ? 'bg-pink text-white' : 'bg-black/45 text-white',
          )}
        >
          <ArrowsLeftRight size={20} weight="bold" />
        </button>

        {(!ready || err) && (
          <div className="absolute inset-0 grid place-items-center bg-black/75 px-8 text-center text-sm">
            {err ? <p className="leading-6 text-white/90">{err}</p> : <p className="text-white/70">正在准备模型…</p>}
          </div>
        )}

        {/* 商品卡 + 拍照，浮在画面底部（施华蔻同款位置） */}
        {product && (
          <div className="absolute inset-x-3 bottom-3 flex items-end gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-black/55 px-3 py-2.5 backdrop-blur">
              {product.image ? (
                <img src={product.image} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-black">{product.title}</p>
                <p className="truncate text-[11px] text-white/70">{product.subtitle}</p>
              </div>
              <button type="button" onClick={onAddToCart} aria-label="加入购物车" className="tap shrink-0 p-1">
                <ShoppingCart size={20} weight="bold" />
              </button>
            </div>
            <button
              type="button"
              aria-label="拍照保存"
              className="tap grid size-12 shrink-0 place-items-center rounded-full bg-black/55 backdrop-blur"
            >
              <Camera size={22} weight="bold" />
            </button>
          </div>
        )}
      </div>

      {/* 底色档位滑块 —— 施华蔻同款三档 */}
      <div className="shrink-0 bg-[#1b1a1f] px-4 py-3">
        <div className="flex items-center gap-4">
          <span className="w-11 shrink-0 text-sm font-black numerals">{current ? (current.decision.entry?.level ?? level) : level}度</span>
          <div className="relative flex-1">
            <input
              type="range"
              min={0}
              max={stopLabels.length - 1}
              step={1}
              value={stop}
              onChange={(e) => setStop(Number(e.target.value))}
              className="w-full accent-white"
              aria-label="底色档位"
            />
            <div className="mt-0.5 flex justify-between text-[11px] text-white/60">
              {stopLabels.map((l, i) => (
                <span key={l} className={cx(i === stop && 'font-black text-white')}>{l}</span>
              ))}
            </div>
          </div>
        </div>
        {current && (
          <p className="mt-2 text-[11px] leading-4 text-white/55">{current.decision.why}</p>
        )}
      </div>

      {/* 色卡横滑 */}
      <div className="shrink-0 bg-[#141317] pb-[max(10px,env(safe-area-inset-bottom))] pt-3">
        <div className="flex gap-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {families.map((name) => {
            const e = rules ? lookup(rules, name, level) : null;
            const d = rules ? decide(rules, name, level) : null;
            const on = name === family;
            return (
              <button
                key={name}
                type="button"
                onClick={() => { setFamily(name); setStop(0); }}
                aria-pressed={on}
                className="w-16 shrink-0 text-center"
              >
                <span
                  className={cx(
                    'mx-auto block size-14 rounded-full border-2 transition',
                    on ? 'border-pink' : 'border-transparent',
                    d && !d.can && 'opacity-45',
                  )}
                  style={{ background: e?.hex ?? '#3a3a3a' }}
                />
                <span className={cx('mt-1.5 block truncate text-[11px]', on ? 'font-black text-white' : 'text-white/60')}>
                  {name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
