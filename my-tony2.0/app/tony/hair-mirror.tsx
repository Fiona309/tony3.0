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
  groupVideos,
  lookup,
  riskGroup,
  SIMPLE_GROUP_LABEL,
  toneVariants,
  undertoneOf,
  type ColorMatrix,
  type Decision,
  type RiskGroup,
  type SimpleGroup,
  type Variant,
  type VideoColor,
} from './hair-mirror-core';
import { cx } from './ui';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18';
const MODEL = '/hair-mirror/hair_segmenter.tflite';

/* 换色 shader。四条关键设计，每条都对应一个实际翻车过的问题：

   ① 明度水平对齐（baseY / k）
   纯保留明度做不出深色：相机里头发的 Y 是亮的，只叠色度上去，得到的必然是浅色调
   ——红色会渲染成粉色。参考图里红发本身明度就低（V62），而 7 度底色的头发 Y≈0.66。
   所以把 Y 按 k=tY/baseY 做【乘法】缩放：乘法保留相对对比（纹理是明暗的比例关系），
   只把整体亮度拉到目标色的水平。旧版用加法 mix(Y,Y*.72+tY*.28,·) 是错的，
   等效 Y*0.818+tY*0.182，把发丝对比压到 81.8%，直接表现为"没有纹理感"。
   baseY 由用户的底色度数推出（Lab L≈10×度数），不是拍脑袋的常数。

   ② mask 五点模糊 + 缓坡阈值
   MediaPipe mask 分辨率远低于相机，直接放大边缘是锯齿状的硬边，看起来像抠图。
   十字五点模糊把边缘摊开，smoothstep(.35,.80) 既砍掉低置信度的背景误判，
   又给出一段渐变而不是一刀切。阈值太窄（如 .45~.75）会把边缘重新变硬。

   ③ recept 下限 0.05
   施华蔻魔镜的真实感主要来自发根保留原生黑色。旧版下限 0.30 会让最暗的发根
   也吃 30% 的色，整片发根变蓝，一眼假。

   ④ a 上限 0.90
   留 10% 原始色度，头发本身的色彩细微变化不会被抹平成一块死板的纯色。

   ⑤ 高光保护（spec）—— 治"颜色浮在表面上"
   真实头发的反光分两种，物理上完全不同：
     · 漫反射 diffuse：光进入发丝内部被色素吸收后散射出来 —— 这才是头发的颜色，染发改的是它
     · 镜面高光 specular：光在发丝表面直接弹走，压根没进去 —— 它是【光源的颜色】，通常是白的
   专业毛发渲染器（Redshift Principled Hair 等）明确要求 tint 保持白色，
   就是为了不让高光被染色；要改发色应该改 albedo。
   我们之前对所有像素一视同仁地换色度，把本该是白色的高光也染成了粉/蓝，
   人眼对此极其敏感，直接读作"这是盖在头发上的一层膜"。

   检测方式：高光 = 该像素明显亮于它的邻域。用相机纹理做一次宽半径十字采样得到
   局部均值，Y0 减去它就是高光强度。这个判据与头发深浅无关（深色发和漂过的浅色发
   都适用），比拿绝对亮度阈值鲁棒。
   高光处双重处理：既降低上色强度 a，又把最终色度往 0 推（0 色度 = 白色高光）。

   lift 模拟漂浅：先提亮再上色；必须乘 mask，否则整幅画面会蒙一层白纱。
   mix0=0 时输出原始画面（按住看染前）。 */
const FRAG = `precision mediump float;varying vec2 uv;
uniform sampler2D cam,mask;uniform vec3 target;
uniform float strength,lift,mix0,baseY,specKeep;uniform vec2 texel,ctexel;
float maskAt(vec2 p){
  float s=texture2D(mask,p).r*.36;
  s+=texture2D(mask,p+vec2(texel.x,0.)).r*.16;
  s+=texture2D(mask,p-vec2(texel.x,0.)).r*.16;
  s+=texture2D(mask,p+vec2(0.,texel.y)).r*.16;
  s+=texture2D(mask,p-vec2(0.,texel.y)).r*.16;
  return s;
}
float lumAt(vec2 p){ return dot(texture2D(cam,p).rgb,vec3(.299,.587,.114)); }
float localLum(vec2 p){
  float s=lumAt(p)*.2;
  s+=lumAt(p+vec2(ctexel.x,0.))*.2;
  s+=lumAt(p-vec2(ctexel.x,0.))*.2;
  s+=lumAt(p+vec2(0.,ctexel.y))*.2;
  s+=lumAt(p-vec2(0.,ctexel.y))*.2;
  return s;
}
void main(){
  vec3 c=texture2D(cam,uv).rgb;
  float m=smoothstep(.35,.80,maskAt(uv));
  float Y0=dot(c,vec3(.299,.587,.114));
  float spec=smoothstep(.03,.15,Y0-localLum(uv))*specKeep;
  float lm=lift*m;
  float Y=clamp(Y0+lm*(1.0-Y0)*mix(1.4,0.6,Y0),0.,1.);
  float Cb=(c.b-Y0)*.564*mix(1.0,0.35,lm), Cr=(c.r-Y0)*.713*mix(1.0,0.35,lm);
  float tY=dot(target,vec3(.299,.587,.114));
  float tCb=(target.b-tY)*.564, tCr=(target.r-tY)*.713;
  float recept=clamp((Y-.10)/.45,0.,1.);
  float a=m*mix(.05,.90,recept)*strength*(1.0-spec*.85);
  float nCb=mix(Cb,tCb,a)*(1.0-spec*.60), nCr=mix(Cr,tCr,a)*(1.0-spec*.60);
  float k=clamp(tY/max(baseY,.06),.55,1.5);
  float nY=clamp(Y*mix(1.0,k,a),0.,1.);
  vec3 o=vec3(nY+1.403*nCr, nY-.714*nCr-.344*nCb, nY+1.773*nCb);
  gl_FragColor=vec4(clamp(mix(c,o,mix0),0.,1.),1.);
}`;

/* 高光保护强度。1 = 完全按物理（高光几乎不染），0 = 关掉（回到旧行为）。
   这是观感判断不是数学问题，?tune=1 可以现场拖滑块找手感。 */
const SPEC_KEEP = 1.0;
/* 局部均值的采样半径（相机像素）。太小抓不到成片的高光带，太大会把整绺亮发误判成高光 */
const SPEC_RADIUS = 6;

/** 该底色度数下头发的预期明度（sRGB 编码域）。
 *  度数本质是明度：levelFromL 的阈值表给出 Lab L 每 10 一档，故 L≈10×度数。
 *  Lab L → 线性亮度 → sRGB 域，供 shader 算明度缩放系数 k。 */
function baseLumaOf(level: number) {
  const L = Math.max(5, Math.min(100, level * 10));
  const linear = Math.pow((L + 16) / 116, 3);
  return Math.pow(Math.max(linear, 0.001), 1 / 2.2);
}
/* mask 时域平滑系数：上一帧占比。越大越稳但越迟滞，0.55 是消抖与跟手的折中 */
const MASK_EMA = 0.55;

/* uv.y 翻转：texImage2D 上传视频帧时第 0 行在顶部，而 WebGL 纹理原点在左下，必需。
   uv.x 翻转：前置摄像头出的是非镜像画面（别人看你的样子），直接显示会导致
   人往左移、画面里的人往右移，自拍预览必须跟手，所以要翻成镜子。
   曾经试过去掉这个翻转，实测立刻出现动作反向，已确认必须保留。 */
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
  uB: WebGLUniformLocation | null;
  uTx: WebGLUniformLocation | null;
  uSK: WebGLUniformLocation | null;
  uCtx: WebGLUniformLocation | null;
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
    uB: gl.getUniformLocation(prog, 'baseY'),
    uTx: gl.getUniformLocation(prog, 'texel'),
    uSK: gl.getUniformLocation(prog, 'specKeep'),
    uCtx: gl.getUniformLocation(prog, 'ctexel'),
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
  const prevMaskRef = useRef<Float32Array | null>(null);
  const runRef = useRef(false);
  const variantRef = useRef<Variant | null>(null);
  const rawRef = useRef(false);
  const specKeepRef = useRef(SPEC_KEEP);
  const [specKeep, setSpecKeep] = useState(SPEC_KEEP);
  const [tune, setTune] = useState(false);
  useEffect(() => { specKeepRef.current = specKeep; }, [specKeep]);
  useEffect(() => {
    setTune(new URLSearchParams(window.location.search).get('tune') === '1');
  }, []);
  /* 渲染循环的闭包只在 ready 变化时重建，level 会变旧，用 ref 传当前值 */
  const levelRef = useRef(level);
  levelRef.current = level;

  const usable = useMemo(() => matrix.videos.filter((v) => v.kb_color), [matrix]);
  const groups = useMemo(() => groupVideos(matrix, level), [matrix, level]);
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
    return { variants: toneVariants(matrix, kb, level), decision: d };
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
      /* 时域平滑：MediaPipe 模型内部本有"上一帧 mask 作为第 4 输入通道"的机制，
         但 Web 版没暴露这个接口，逐帧独立推理会让 mask 抖动、发际线闪烁。
         这里自己做一阶 EMA 补上。尺寸变化（切换摄像头/分辨率）时重置。 */
      let prev = prevMaskRef.current;
      if (!prev || prev.length !== f.length) {
        prev = new Float32Array(f);
        prevMaskRef.current = prev;
      }
      const b = new Uint8Array(f.length);
      for (let i = 0; i < f.length; i++) {
        const v = prev[i] * MASK_EMA + f[i] * (1 - MASK_EMA);
        prev[i] = v;
        b[i] = v * 255;
      }
      const { gl, maskTex } = G;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, cm.width, cm.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, b);
      // 五点模糊的采样步长必须按 mask 自身分辨率算，不是画布分辨率
      gl.uniform2f(G.uTx, 1.5 / cm.width, 1.5 / cm.height);
      cm.close();
    };

    const loop = () => {
      if (!runRef.current) return;
      requestAnimationFrame(loop);
      if (video.readyState < 2 || video.currentTime === lastT) return;
      lastT = video.currentTime;
      const { gl, camTex, uT, uS, uL, uM, uB, uSK, uCtx } = G;
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
      /* baseY 要和 shader 里的 Y 处于同一状态：Y 是漂浅之后的，所以这里也要过一遍
         同样的 lift 公式，否则漂色档的明度缩放系数会算错 */
      const by0 = baseLumaOf(levelRef.current);
      const lf = v?.lift ?? 0;
      gl.uniform1f(uB, Math.min(1, by0 + lf * (1 - by0) * (1.4 + (0.6 - 1.4) * by0)));
      gl.uniform1f(uSK, specKeepRef.current);
      // 局部均值采样半径按相机实际分辨率折算成 uv 步长
      gl.uniform2f(uCtx, SPEC_RADIUS / (video.videoWidth || 1280), SPEC_RADIUS / (video.videoHeight || 720));
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

        {/* 调参面板：?tune=1 才出现。高光保护强度是观感判断，现场拖比来回猜快 */}
        {tune && (
          <div className="absolute left-3 right-3 top-3 rounded-2xl bg-black/70 px-3 py-2 backdrop-blur">
            <div className="flex items-center justify-between text-[11px] font-bold text-white/90">
              <span>高光保护 specKeep</span>
              <span className="tabular-nums">{specKeep.toFixed(2)}</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.05} value={specKeep}
              onChange={(e) => setSpecKeep(Number(e.target.value))}
              className="mt-1 w-full" />
            <p className="mt-1 text-[10px] leading-4 text-white/55">
              0 = 高光也染色（旧行为，颜色像浮在表面）· 1 = 高光保持原样（物理正确）
            </p>
          </div>
        )}

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

      {/* 6 个博主色常驻可见，只分两组——分组标题本身就是引导语。
          隐藏起来用户根本不会主动点开，所以不做折叠。 */}
      <div className="shrink-0 bg-[#141317] pt-2.5">
        <div className="flex items-start gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(['ok', 'bleach'] as SimpleGroup[]).map((g) =>
            groups[g].length ? (
              <div key={g} className="flex shrink-0 items-start gap-3 border-l border-white/12 pl-3 first:border-0 first:pl-0">
                <p className={cx('w-12 shrink-0 pt-3 text-[11px] font-black leading-tight',
                  g === 'ok' ? 'text-[#7fd39a]' : 'text-[#e5c169]')}>
                  {SIMPLE_GROUP_LABEL[g]}
                </p>
                {groups[g].map((v) => {
                  const e = lookup(matrix, v.kb_color!, level);
                  const on = v.video_id === picked?.video_id;
                  return (
                    <button key={v.video_id} type="button" onClick={() => setVideoId(v.video_id)}
                      aria-pressed={on} className="w-14 shrink-0 text-center">
                      <span className={cx('mx-auto block size-12 rounded-full border-2 transition',
                        on ? 'border-pink' : 'border-transparent')}
                        style={{ background: e?.hex ?? v.accent ?? '#3a3a3a' }} />
                      <span className={cx('mt-1 block truncate text-[11px]',
                        on ? 'font-black text-white' : 'text-white/60')}>
                        {v.color_name}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null,
          )}
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
