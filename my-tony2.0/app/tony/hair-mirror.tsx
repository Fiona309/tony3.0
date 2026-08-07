'use client';

/**
 * 屏3 · 实时试色
 *
 * 一件事：看见。所以画面占满剩余空间，文字一律不叠在上面，底部只有一根滑块
 * 和两个按钮。判断结论收在顶部标题栏——那是用户找"我在看什么"的地方，
 * 放底部窄条会被当成装饰，实测没人看；完整判断点 ⓘ 从底部推上来。
 *
 * 能染和不能染共用这一屏，靠三处区分：标题栏的结论、滑块的语义
 * （效果范围 vs 漂几次）、以及不能染那条轴上多出来的门槛线。
 *
 * 与施华蔻的差异都来自定位差异（我们是风险顾问，不是品牌货架）：
 *   1. 换色面板按"能不能染"分组，每张卡自带保色期与判断，不做色系货架
 *   2. 滑块最右端固定是"可能偏色"，不是一个用户永远不会打开的开关
 *   3. 敢展示翻车效果
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowsLeftRight, Check, Info, PencilSimple } from '@phosphor-icons/react';

import {
  bleachThreshold,
  bleachVariants,
  defaultStop,
  holdLabel,
  layer1CanDye,
  lookup,
  minDyeableLevel,
  toneVariants,
  type ColorMatrix,
  type Variant,
  type VideoColor,
} from './hair-mirror-core';
import { FlowProgress } from './flow-progress';
import { VerdictDetail } from './verdict-screen';
import { cx } from './ui';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18';
/* 两个分割模型，渐进加载。
   HAIR_MODEL 763KB，只会回答"是不是头发"——它没有"手"这个概念，
   所以手撩头发时手指会被误染，深色衣服也会被当成头发。
   实测（用户实拍帧）：旧模型把人像解析模型认定为衣服的区域，9.1% 判成了头发。

   MULTI_MODEL 是 selfie_multiclass_256x256，一次推理输出 6 类：
   0背景 1头发 2身体皮肤 3面部皮肤 4衣服 5配饰。
   手 = 身体皮肤，衣服 = 独立类，两个误判从源头消失。
   代价是 16.4MB（官方只提供 float32，没有量化版），首屏不能等它。

   所以：先用小模型让试色立刻可用，大模型在后台下载完成后静默切换。 */
const HAIR_MODEL = '/hair-mirror/hair_segmenter.tflite';
/* 从 Google CDN 拉，不自托管：16MB 放在 3 Mbps 的 ECS 上要传 43 秒，
   而且 16MB 二进制不该进 git。官方桶带 access-control-allow-origin: *，已实测可跨域取。 */
const MULTI_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';
/* multiclass 的通道号：0背景 1头发 2身体皮肤 3面部皮肤 4衣服 5配饰 */
const CH = { hair: 1 } as const;

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
uniform sampler2D cam,mask;uniform vec3 target,targetDark,targetLite;
uniform float strength,liftF,mix0,baseY,specKeep,detailBoost,rootKeep,bloom,chromaVar,wisp,denoise;
uniform vec2 texel,ctexel,hairSpan;

float maskAt(vec2 p){
  float s=texture2D(mask,p).r*.36;
  s+=texture2D(mask,p+vec2(texel.x,0.)).r*.16;
  s+=texture2D(mask,p-vec2(texel.x,0.)).r*.16;
  s+=texture2D(mask,p+vec2(0.,texel.y)).r*.16;
  s+=texture2D(mask,p-vec2(0.,texel.y)).r*.16;
  return s;
}
float lumAt(vec2 p){ return dot(texture2D(cam,p).rgb,vec3(.299,.587,.114)); }
float blurLum(vec2 p,vec2 r){
  float s=lumAt(p)*.2;
  s+=lumAt(p+vec2(r.x,0.))*.2; s+=lumAt(p-vec2(r.x,0.))*.2;
  s+=lumAt(p+vec2(0.,r.y))*.2; s+=lumAt(p-vec2(0.,r.y))*.2;
  return s;
}
void main(){
  vec3 c=texture2D(cam,uv).rgb;
  float Y0=dot(c,vec3(.299,.587,.114));
  float base=blurLum(uv,ctexel);
  float wide=blurLum(uv,ctexel*3.0);

  /* ④ 降噪：黑发在照片里只占 0.05~0.25 的明度，8bit 下约 50 个台阶，
     乘 2.7 倍要撑满 136 个台阶——中间值是插出来的，同时暗部噪声也被同倍放大。
     提亮【之前】先把低频压平一点，色带和噪点就不会跟着放大。
     detail 那一路不动，所以发丝纹理不受影响。 */
  base=mix(base,wide,denoise);
  float detail=Y0-base;

  float mRaw=maskAt(uv);
  float m=smoothstep(.35,.80,mRaw);

  /* ⑤ 碎发补偿（近似，不是真 matting）：mask 的过渡区里，
     比周围暗的细结构大概率是飞散的碎发。真 matting 要换模型，
     这里先用图像信息把它们捞回来一部分，让轮廓不再是一条硬边。 */
  float edgeZone=smoothstep(.05,.35,mRaw)*(1.0-smoothstep(.55,.92,mRaw));
  float darker=smoothstep(0.0,0.12,base-Y0);
  m=clamp(m+edgeZone*darker*wisp,0.,1.);

  float t=clamp((uv.y-hairSpan.x)/max(hairSpan.y-hairSpan.x,1e-3),0.,1.);
  float growth=mix(rootKeep,1.0,smoothstep(0.0,0.5,t));

  /* 漂浅 = 提高发丝反射率，是乘法不是加法：发绺缝隙的暗是几何遮挡，漂多少次都还是暗的。
     亮部用 Reinhard 软肩收住，避免受光面烧成白块。 */
  float F=mix(1.0,liftF,m*growth);
  float W=1.0+F*0.28;
  float x=base*F;
  float baseL=clamp(x*(1.0+x/(W*W))/(1.0+x),0.,1.);
  float dv=((1.0+2.0*x/(W*W))*(1.0+x)-x*(1.0+x/(W*W)))/((1.0+x)*(1.0+x));
  float dScale=clamp(F*dv,0.4,3.0);
  float lm=clamp((F-1.0)/2.5,0.,1.)*m;

  float bright=smoothstep(.03,.15,detail);
  float cb0=(c.b-Y0)*.564*255.+128., cr0=(c.r-Y0)*.713*255.+128.;
  float skinHue=smoothstep(70.,80.,cb0)*(1.-smoothstep(124.,134.,cb0))
               *smoothstep(128.,138.,cr0)*(1.-smoothstep(168.,178.,cr0));
  float scalp=bright*skinHue;          // 发缝/头皮：比邻域亮【且】是肤色
  float spec=bright*(1.-skinHue)*specKeep;

  float Cb=(c.b-Y0)*.564*mix(1.0,0.35,lm), Cr=(c.r-Y0)*.713*mix(1.0,0.35,lm);

  /* ③ 色度随明度走。整头一个色相 = 塑料，现实中不存在。
     黑发本身几乎没有色度信息（R≈G≈B），替换后得到的是"完美均匀"的色度场，
     而真实浅发的色度是有结构的。用我们【有】的明度变化去驱动它：
     暗处偏深色端、亮处偏浅色端。两个端点取自官方六宫格里同色系最深/最浅的变体，
     不是我编的插值。 */
  vec3 tgt=mix(targetDark,targetLite,clamp(baseL*chromaVar+(1.0-chromaVar)*0.5,0.,1.));
  tgt=mix(target,tgt,chromaVar);
  float tY=dot(tgt,vec3(.299,.587,.114));
  float tCb=(tgt.b-tY)*.564, tCr=(tgt.r-tY)*.713;

  /* recept 用【原始】明度：漂后所有像素都超过阈值会一律饱和成 1，全头吃色一样 */
  float recept=clamp((base-.06)/.30,0.,1.);
  float a=m*mix(.05,.90,recept)*strength*growth*(1.0-spec*.85)*(1.0-scalp*.95);
  float nCb=mix(Cb,tCb,a)*(1.0-spec*.60), nCr=mix(Cr,tCr,a)*(1.0-spec*.60);
  float k=clamp(tY/max(baseY,.06),.55,1.5);
  float nY=clamp(baseL*mix(1.0,k,a)+detail*dScale*mix(1.0,detailBoost,a),0.,1.);

  vec3 o=vec3(nY+1.403*nCr, nY-.714*nCr-.344*nCb, nY+1.773*nCb);

  /* ② 次表面散射辉光。黑发把光全吸收，只剩又窄又硬的表面镜面反射；
     漂过的发丝色素没了，光进入内部多次散射再出来，高光【又宽又软、边缘外溢】。
     这是"浅"这个感觉最强的物理信号——只把黑发的窄高光乘以 2.7，
     亮度到位了但质感没到位，看着像被打了灯的黑发，不像浅发。
     用宽半径模糊的亮部往外加光，强度随提亮倍数增长。 */
  float glowSrc=max(0.0,wide*F-0.42);
  o+=tgt*glowSrc*bloom*m*clamp((F-1.0)*0.6,0.,1.);

  gl_FragColor=vec4(clamp(mix(c,o,mix0),0.,1.),1.);
}`;

/* 高光保护强度。1 = 完全按物理（高光几乎不染），0 = 关掉（回到旧行为）。
   这是观感判断不是数学问题，?tune=1 可以现场拖滑块找手感。 */
const SPEC_KEEP = 1.0;
/* 局部均值的采样半径（相机像素）。太小抓不到成片的高光带，太大会把整绺亮发误判成高光 */
const SPEC_RADIUS = 6;
/* 发丝高频的保留倍数。1.0 = 原样，>1 = 增强。
   base 被 k<1 压暗后，同样幅度的 detail 在视觉上会变弱，需要补一点回来。 */
const DETAIL_BOOST = 1.45;
/* 发根保留原色的程度。0 = 发根完全不上色（最强布丁头），1 = 全头均匀（旧行为）。
   0.28 是"看得出发根更深、但不至于像没染到"的位置。 */
/* 默认 1.0 = 不做发根渐变。立体感应该来自阴影明暗关系，不是人为画一条渐变。
   保留可调，想看布丁头效果可以拖低。 */
const ROOT_KEEP = 1.0;
/* ② 次表面散射辉光强度 */
const BLOOM = 0.55;
/* ③ 色度随明度变化的幅度。0 = 整头一个色相（旧行为），1 = 完全按明度在深浅变体间插值 */
const CHROMA_VAR = 0.6;
/* ⑤ 碎发补偿强度 */
const WISP = 0.45;
/* ④ 提亮前的低频降噪强度 */
const DENOISE = 0.35;

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
  uDB: WebGLUniformLocation | null;
  uRK: WebGLUniformLocation | null;
  uHS: WebGLUniformLocation | null;
  uTD: WebGLUniformLocation | null;
  uTL: WebGLUniformLocation | null;
  uBl: WebGLUniformLocation | null;
  uCV: WebGLUniformLocation | null;
  uWi: WebGLUniformLocation | null;
  uDn: WebGLUniformLocation | null;
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
    uL: gl.getUniformLocation(prog, 'liftF'),
    uM: gl.getUniformLocation(prog, 'mix0'),
    uB: gl.getUniformLocation(prog, 'baseY'),
    uTx: gl.getUniformLocation(prog, 'texel'),
    uSK: gl.getUniformLocation(prog, 'specKeep'),
    uDB: gl.getUniformLocation(prog, 'detailBoost'),
    uRK: gl.getUniformLocation(prog, 'rootKeep'),
    uHS: gl.getUniformLocation(prog, 'hairSpan'),
    uTD: gl.getUniformLocation(prog, 'targetDark'),
    uTL: gl.getUniformLocation(prog, 'targetLite'),
    uBl: gl.getUniformLocation(prog, 'bloom'),
    uCV: gl.getUniformLocation(prog, 'chromaVar'),
    uWi: gl.getUniformLocation(prog, 'wisp'),
    uDn: gl.getUniformLocation(prog, 'denoise'),
    uCtx: gl.getUniformLocation(prog, 'ctexel'),
  };
}

export type HairMirrorProps = {
  matrix: ColorMatrix;
  /** 屏1 确认后的底色度数 */
  level: number;
  /** 用户种草进来的那个视频，决定默认选中哪个博主色 */
  entryVideoId?: string;
  /** 屏1 确认的漂染历史，用于风险清单里的"发根发尾不一样" */
  dyeHistory?: string;
  /** 当前发色色相，用于中和矩阵 */
  currentTone?: string;
  onLevelChange?: (level: number) => void;
  /** 在面板里换了色。必须同步回后端，否则商品页推的还是原来那个色 */
  onColorChange?: (videoId: string) => void;
  onBack?: () => void;
  /** 用户接受风险，进入方案与商品。此时才会触发生图（B 方案） */
  onAccept?: (choice: { videoId: string; colorName: string; level: number }) => void;
};

export function HairMirror({
  matrix, level, entryVideoId, dyeHistory, currentTone,
  onLevelChange, onColorChange, onBack, onAccept,
}: HairMirrorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GL | null>(null);
  const segRef = useRef<any>(null);
  const prevMaskRef = useRef<Float32Array | null>(null);
  const runRef = useRef(false);
  const variantRef = useRef<Variant | null>(null);
  const rawRef = useRef(false);
  const specKeepRef = useRef(SPEC_KEEP);
  const detailRef = useRef(DETAIL_BOOST);
  const rootRef = useRef(ROOT_KEEP);
  const [rootKeep, setRootKeep] = useState(ROOT_KEEP);
  useEffect(() => { rootRef.current = rootKeep; }, [rootKeep]);
  /* 头发在画面里的上下边界（uv.y），每帧从 mask 求，做时域平滑 */
  const spanRef = useRef<[number, number]>([0.1, 0.9]);
  /* 该色系最深/最浅的官方变体，供色度随明度插值。缺省时退化成当前目标色 */
  const shadeRef = useRef<[number[], number[]]>([[0, 0, 0], [255, 255, 255]]);
  const [fx, setFx] = useState({ bloom: BLOOM, chromaVar: CHROMA_VAR, wisp: WISP, denoise: DENOISE });
  const fxRef = useRef(fx);
  useEffect(() => { fxRef.current = fx; }, [fx]);
  const [detailBoost, setDetailBoost] = useState(DETAIL_BOOST);
  useEffect(() => { detailRef.current = detailBoost; }, [detailBoost]);
  const [specKeep, setSpecKeep] = useState(SPEC_KEEP);
  const [tune, setTune] = useState(false);
  useEffect(() => { specKeepRef.current = specKeep; }, [specKeep]);
  useEffect(() => {
    setTune(new URLSearchParams(window.location.search).get('tune') === '1');
  }, []);
  /* 渲染循环的闭包只在 ready 变化时重建，level 会变旧，用 ref 传当前值 */
  /* 当前用的是不是多类模型。切换后 mask 的通道语义变了，uploadMask 要走另一条路 */
  const isMultiRef = useRef(false);
  const [upgraded, setUpgraded] = useState(false);
  const levelRef = useRef(level);
  levelRef.current = level;

  const usable = useMemo(() => matrix.videos.filter((v) => v.kb_color), [matrix]);
  const [videoId, setVideoId] = useState(() => entryVideoId ?? usable[0]?.video_id ?? '');
  const [stop, setStop] = useState(0);
  const [editLevel, setEditLevel] = useState(false);
  const [panel, setPanel] = useState(false);
  const [detail, setDetail] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  const picked: VideoColor | undefined = usable.find((v) => v.video_id === videoId) ?? usable[0];
  const kb = picked?.kb_color ?? '';
  const canDye = kb ? layer1CanDye(matrix, kb, level).can : false;

  // 同一根轴，两种含义：能染时是效果范围，不能染时是漂几次。
  // 滑块形态本身就是最强的模式提示——不能染那条多一根门槛线。
  const variants = useMemo<Variant[]>(
    () => (!kb ? [] : canDye ? toneVariants(matrix, kb, level) : bleachVariants(matrix, kb, level)),
    [matrix, kb, level, canDye],
  );

  /** 漂色轴上第一个够染的档位。-1 表示漂 2 次也不够 */
  const threshold = useMemo(() => (canDye ? -1 : bleachThreshold(variants)), [canDye, variants]);

  // 切色/改度数后把滑块落到有意义的位置：能染时停在"和目标色一样"，
  // 不能染时停在门槛档——让用户一进来就看到"漂到这里才行"的那个结果
  useEffect(() => {
    setStop(canDye ? defaultStop(variants) : threshold >= 0 ? threshold : 0);
    // variants 是按 kb/level/canDye 记忆化的，这里跟着它变即可
  }, [variants, canDye, threshold]);

  const active = variants[Math.min(stop, Math.max(0, variants.length - 1))] ?? null;
  variantRef.current = active;

  /* 色度插值的两个端点：同色系官方六宫格里最深和最浅的那两个变体。
     没有变体数据时退化成当前档位色本身（等于关掉这个效果）。 */
  useEffect(() => {
    const lum = (c: number[]) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
    const vs = (matrix.variants?.[kb] ?? []).slice().sort((x, y) => lum(x.rgb) - lum(y.rgb));
    const self = active?.rgb ?? [128, 128, 128];
    shadeRef.current = vs.length >= 2 ? [vs[0].rgb, vs[vs.length - 1].rgb] : [self, self];
  }, [matrix, kb, active]);

  /* 载入 MediaPipe：小模型先上，大模型后台补 */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { ImageSegmenter, FilesetResolver } = await import(/* webpackIgnore: true */ MP as string);
        const vision = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
        const make = (path: string) => ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: path, delegate: 'GPU' },
          runningMode: 'VIDEO',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });

        const seg = await make(HAIR_MODEL);
        if (!alive) { seg.close?.(); return; }
        segRef.current = seg;
        setReady(true);

        /* 16MB 的多类模型后台加载。失败不影响使用——继续用小模型，
           只是手指和衣服会被误染，属于降级不是故障，所以不弹错误。 */
        try {
          const multi = await make(MULTI_MODEL);
          if (!alive) { multi.close?.(); return; }
          const old = segRef.current;
          segRef.current = multi;
          isMultiRef.current = true;
          prevMaskRef.current = null;   // 两个模型的 mask 尺寸/语义不同，EMA 必须重置
          setUpgraded(true);
          old?.close?.();
        } catch { /* 保持小模型 */ }
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
      const masks = res.confidenceMasks;
      if (!masks?.length) return;
      const multi = isMultiRef.current && masks.length >= 5;
      const cm = multi ? masks[CH.hair] : masks[masks.length - 1];
      if (!cm) return;
      /* 多类模型的 6 个通道实测逐像素和恰为 1.000（softmax 输出），
         头发通道本身就是概率，直接用即可。
         曾试过拿头发通道和皮肤/衣服通道再做一次归一化竞争，是错的：
         漏掉背景通道会让背景像素也算出"可能是头发"，
         阈值附近模棱两可的像素从 7.4% 涨到 12.8%，反而更闪。 */
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
      /* 顺带求头发的上下边界，供着色器算"沿发丝长度"的渐变。
         在已有的 EMA 循环里做，不额外遍历一遍。 */
      const w = cm.width;
      let top = cm.height, bot = -1;
      for (let i = 0; i < f.length; i++) {
        const v = prev[i] * MASK_EMA + f[i] * (1 - MASK_EMA);
        prev[i] = v;
        b[i] = v * 255;
        if (v > 0.5) {
          const row = (i / w) | 0;
          if (row < top) top = row;
          if (row > bot) bot = row;
        }
      }
      if (bot > top) {
        /* mask 的行序与 uv.y 一致（都是画面从上到下），直接归一化即可。
           跟着 EMA 一起做时域平滑，否则边界会随 mask 抖动而上下跳。 */
        const t0 = top / cm.height;
        const b0 = bot / cm.height;
        const s0 = spanRef.current;
        spanRef.current = [s0[0] * 0.8 + t0 * 0.2, s0[1] * 0.8 + b0 * 0.2];
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
      const { gl, camTex, uT, uS, uL, uM, uB, uSK, uCtx, uDB, uRK, uHS: uCtx2,
              uTD, uTL, uBl, uCV, uWi, uDn } = G;
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
      gl.uniform1f(uL, v?.liftF ?? 1);
      gl.uniform1f(uM, rawRef.current || !v ? 0 : 1);
      /* baseY 要和 shader 里的 Y 处于同一状态：Y 是漂浅之后的，所以这里也要过一遍
         同样的 lift 公式，否则漂色档的明度缩放系数会算错 */
      /* baseY 要和着色器里的明度处于同一状态：Y 是漂浅之后的，
         所以基准也要过一遍同样的 gamma 曲线 */
      const by0 = baseLumaOf(levelRef.current);
      const F = v?.liftF ?? 1;
      const W = 1 + F * 0.28;
      const bx = by0 * F;
      gl.uniform1f(uB, Math.min(1, (bx * (1 + bx / (W * W))) / (1 + bx)));
      gl.uniform1f(uSK, specKeepRef.current);
      gl.uniform1f(uDB, detailRef.current);
      gl.uniform1f(uRK, rootRef.current);
      gl.uniform2f(uCtx2, spanRef.current[0], spanRef.current[1]);
      const [dk, lt] = shadeRef.current;
      gl.uniform3f(uTD, dk[0] / 255, dk[1] / 255, dk[2] / 255);
      gl.uniform3f(uTL, lt[0] / 255, lt[1] / 255, lt[2] / 255);
      gl.uniform1f(uBl, fxRef.current.bloom);
      gl.uniform1f(uCV, fxRef.current.chromaVar);
      gl.uniform1f(uWi, fxRef.current.wisp);
      gl.uniform1f(uDn, fxRef.current.denoise);
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

  /* 顶部只讲一件事：我现在在看哪个色、它能不能染。
     放顶部而不是底部窄条——那是用户找"我在看什么"的地方，而且不和滑块抢注意力。
     底部的窄信息条会被当成装饰，实测没人看。 */
  const headline = `${picked?.color_name ?? ''} · ${canDye ? '能直接染' : '需要先漂浅'}`;
  const activeNote = active?.note ?? '';
  /* 品牌自己写的偏色方向：蓝色偏绿、粉色偏橘。其余色系没写就不编 */
  const biasWord = kb === '蓝色' ? '绿' : kb === '粉色' ? '橘' : '色';

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#111014] text-white">
      <header className="shrink-0 bg-[#141317] pt-[max(10px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 px-3">
          <button type="button" onClick={onBack} aria-label="返回"
            className="tap grid size-9 shrink-0 place-items-center rounded-full bg-white/10">
            <ArrowLeft size={17} weight="bold" />
          </button>
          <button type="button" onClick={() => setDetail(true)}
            className="tap flex min-w-0 flex-1 items-center justify-center gap-1.5">
            <span className={cx('size-2 shrink-0 rounded-full', canDye ? 'bg-[#7fd39a]' : 'bg-[#e5c169]')} />
            <span className="truncate text-[13px] font-black">{headline}</span>
            <Info size={14} weight="bold" className="shrink-0 text-white/55" />
          </button>
          <button type="button" onClick={() => setEditLevel((v) => !v)}
            className="tap shrink-0 rounded-full bg-white/10 px-2.5 py-1.5 text-[11px] font-bold">
            <span className="numerals">{level}</span> 度
            <PencilSimple size={11} weight="bold" className="ml-0.5 inline" />
          </button>
        </div>
        <FlowProgress stage="mirror" dark />
      </header>

      {editLevel && (
        <div className="shrink-0 bg-[#141317] px-3 pb-3">
          <p className="mb-1.5 text-[11px] text-white/50">光线会让自动识别偏 2~3 度，以你实际发根为准</p>
          <div className="flex gap-1.5">
            {[3, 4, 5, 6, 7, 8, 9].map((lv) => (
              <button key={lv} type="button" onClick={() => { onLevelChange?.(lv); setEditLevel(false); }}
                aria-pressed={lv === level}
                className={cx('flex-1 rounded-[10px] border py-1.5 text-[13px] font-bold',
                  lv === level ? 'border-pink bg-pink text-white' : 'border-white/20 text-white/70')}>
                {lv}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 画面是这一屏的全部价值，占满剩余空间。文字一律不叠在上面 */}
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
            <p className="mb-1 text-[10px] text-white/60">
              分割模型：{upgraded ? '多类（手/衣服已分离）' : '单类头发（多类模型下载中…）'}
            </p>
            <div className="flex items-center justify-between text-[11px] font-bold text-white/90">
              <span>高光保护 specKeep</span>
              <span className="tabular-nums">{specKeep.toFixed(2)}</span>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={specKeep}
              onChange={(e) => setSpecKeep(Number(e.target.value))} className="mt-1 w-full" />
            <p className="mt-1 text-[10px] leading-4 text-white/55">
              0 = 高光也染色（旧行为，颜色像浮在表面）· 1 = 高光保持原样（物理正确）
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-white/90">
              <span>毛流感 detailBoost</span>
              <span className="tabular-nums">{detailBoost.toFixed(2)}</span>
            </div>
            <input
              type="range" min={0.5} max={2.5} step={0.05} value={detailBoost}
              onChange={(e) => setDetailBoost(Number(e.target.value))}
              className="mt-1 w-full" />
            <p className="mt-1 text-[10px] leading-4 text-white/55">
              发丝高频的保留倍数。1 = 原样，&gt;1 = 增强发丝对比
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-white/90">
              <span>发根保留 rootKeep</span>
              <span className="tabular-nums">{rootKeep.toFixed(2)}</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.04} value={rootKeep}
              onChange={(e) => setRootKeep(Number(e.target.value))}
              className="mt-1 w-full" />
            <p className="mt-1 text-[10px] leading-4 text-white/55">
              0 = 发根完全不上色 · 1 = 全头均匀（旧行为）
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-white/90">
              <span>辉光 bloom</span>
              <span className="tabular-nums">{fx.bloom.toFixed(2)}</span>
            </div>
            <input type="range" min={0} max={1.5} step={0.05} value={fx.bloom}
              onChange={(e) => setFx((v) => ({ ...v, bloom: Number(e.target.value) }))}
              className="mt-1 w-full" />
            <p className="mt-1 text-[10px] leading-4 text-white/55">次表面散射。浅发的高光又宽又软，黑发的又窄又硬 —— 这是「浅」最强的信号</p>
            <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-white/90">
              <span>色度随明度 chromaVar</span>
              <span className="tabular-nums">{fx.chromaVar.toFixed(2)}</span>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={fx.chromaVar}
              onChange={(e) => setFx((v) => ({ ...v, chromaVar: Number(e.target.value) }))}
              className="mt-1 w-full" />
            <p className="mt-1 text-[10px] leading-4 text-white/55">0 = 整头一个色相（塑料感）· 1 = 按明度在同色系最深/最浅变体间插值</p>
            <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-white/90">
              <span>碎发补偿 wisp</span>
              <span className="tabular-nums">{fx.wisp.toFixed(2)}</span>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={fx.wisp}
              onChange={(e) => setFx((v) => ({ ...v, wisp: Number(e.target.value) }))}
              className="mt-1 w-full" />
            <p className="mt-1 text-[10px] leading-4 text-white/55">把 mask 过渡区里比周围暗的细结构捞回来。近似，不是真 matting</p>
            <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-white/90">
              <span>提亮前降噪 denoise</span>
              <span className="tabular-nums">{fx.denoise.toFixed(2)}</span>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={fx.denoise}
              onChange={(e) => setFx((v) => ({ ...v, denoise: Number(e.target.value) }))}
              className="mt-1 w-full" />
            <p className="mt-1 text-[10px] leading-4 text-white/55">黑发只有约 50 个明度台阶，提亮 2.7 倍会同时放大色带和噪点</p>
          </div>
        )}

        {(!ready || err) && (
          <div className="absolute inset-0 grid place-items-center bg-black/75 px-8 text-center text-sm">
            <p className="leading-6 text-white/85">{err || '正在准备实时试色…'}</p>
          </div>
        )}

        {/* 换色面板：半屏浮层，不是一个页面。
            点色卡时上面的画面立刻变、面板不关，用户可以一个一个点过去边点边看，
            看到满意的再收起。做成独立页面就会变成 试色→换色→判断→试色 的三跳往返，
            换三次就晕了；做成浮层则永远没有往返。 */}
        {panel ? (
          <ColorPanel
            matrix={matrix} level={level} pickedId={picked?.video_id ?? ''}
            onPick={(id) => { setVideoId(id); onColorChange?.(id); }}
            onClose={() => setPanel(false)}
          />
        ) : null}

        {detail && picked ? (
          <VerdictDetail
            matrix={matrix} level={level} video={picked}
            dyeHistory={dyeHistory} currentTone={currentTone}
            onClose={() => setDetail(false)}
          />
        ) : null}
      </div>

      {/* 效果档位。能染 = 偏浅/一样/偏深/偏色；不能染 = 不漂/漂1次/漂2次 + 门槛线 */}
      <div className="shrink-0 bg-[#1b1a1f] px-4 pb-2 pt-2.5">
        <p className={cx('mb-1.5 text-center text-[12px] font-bold',
          active?.risk && canDye ? 'text-[#e08a84]' : active?.ok ? 'text-[#7fd39a]' : 'text-white/85')}>
          {activeNote}
        </p>
        {/* 两条小字。刻意用最低的视觉权重：实拍屏的主角是脸和颜色，
            真正的风险警示留给「能不能染」那一屏，这里只做脚注不抢注意力。
            去黄那句是品牌原话，不是我们的推断。 */}
        {!canDye && active?.ok ? (
          <p className="mb-1 text-center text-[10px] leading-4 text-white/40">
            官方提示：需漂至 8 度及以上并去黄，偏黄底色上色后会偏{biasWord}
            <span className="mx-1.5 text-white/25">·</span>
            漂 2 次损伤较大，建议去店里做
          </p>
        ) : null}
        <div className="relative">
          <input type="range" min={0} max={Math.max(0, variants.length - 1)} step={1} value={stop}
            onChange={(e) => setStop(Number(e.target.value))}
            className={cx('w-full', active?.risk && canDye ? 'accent-[#e08a84]' : 'accent-white')}
            aria-label={canDye ? '效果档位' : '漂浅次数'} />
          {/* 门槛线：过了这条线才染得上。用户拖动时自己发现"得漂两次"，
              比任何一句文案说教都有效——结论是她自己得出来的。 */}
          {threshold > 0 && threshold < variants.length ? (
            <span aria-hidden className="pointer-events-none absolute -top-0.5 h-5 w-0.5 bg-[#e5c169]"
              style={{ left: `calc(${(threshold / (variants.length - 1)) * 100}% - 1px)` }} />
          ) : null}
        </div>
        <div className="mt-0.5 flex justify-between text-[11px]">
          {variants.map((v, i) => (
            <span key={v.key} className={cx(
              i === stop ? 'font-black' : 'text-white/45',
              i === stop && v.risk && canDye ? 'text-[#e08a84]' : i === stop ? 'text-white' : '',
            )}>{v.label}</span>
          ))}
        </div>
      </div>

      <div className="shrink-0 bg-[#141317] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
        <div className="flex gap-2.5">
          <button type="button" onClick={() => setPanel(true)}
            className="tap shrink-0 rounded-full border border-white/25 px-4 py-3 text-[13px] font-bold">
            换个颜色
          </button>
          <button type="button"
            onClick={() => picked && onAccept?.({ videoId: picked.video_id, colorName: picked.color_name, level })}
            className="tap flex-1 rounded-full bg-pink py-3 text-[14px] font-black text-white">
            就要这个 →
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 换色面板。引导住在色卡本身上——每张卡自带保色期与一句判断，
 * 这就是引导，不需要额外一根信息条，也不会被忽略，因为它就是用户正在读的东西。
 */
function ColorPanel({
  matrix, level, pickedId, onPick, onClose,
}: {
  matrix: ColorMatrix; level: number; pickedId: string;
  onPick: (id: string) => void; onClose: () => void;
}) {
  const usable = matrix.videos.filter((v) => v.kb_color);
  const ok = usable.filter((v) => layer1CanDye(matrix, v.kb_color!, level).can);
  const need = usable.filter((v) => !layer1CanDye(matrix, v.kb_color!, level).can);

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end" onClick={onClose}>
      <div className="flex max-h-[64%] flex-col rounded-t-[24px] bg-[#17161b] pb-[max(14px,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center gap-2 px-5 pb-1 pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-black">换个颜色</p>
            <p className="mt-0.5 text-[11px] text-white/50">
              按你的 <span className="numerals">{level}</span> 度底色 · 点一下上面的画面立刻变
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="tap shrink-0 rounded-full bg-pink px-4 py-2 text-[12.5px] font-black text-white">
            用这个色
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2">
          {ok.length > 0 ? (
            <>
              <p className="mb-2 text-[11.5px] font-black text-[#7fd39a]">现在能直接染</p>
              <div className="space-y-2">
                {ok.map((v) => (
                  <ColorCard key={v.video_id} matrix={matrix} level={level} video={v}
                    on={v.video_id === pickedId} onPick={onPick} />
                ))}
              </div>
            </>
          ) : null}

          {need.length > 0 ? (
            <>
              <p className="mb-2 mt-4 text-[11.5px] font-black text-[#e5c169]">要先漂才能染</p>
              <div className="space-y-2">
                {need.map((v) => (
                  <ColorCard key={v.video_id} matrix={matrix} level={level} video={v}
                    on={v.video_id === pickedId} onPick={onPick} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ColorCard({
  matrix, level, video, on, onPick,
}: {
  matrix: ColorMatrix; level: number; video: VideoColor; on: boolean; onPick: (id: string) => void;
}) {
  const kb = video.kb_color!;
  const can = layer1CanDye(matrix, kb, level).can;
  const min = minDyeableLevel(matrix, kb);
  // 真实呈色，不是色卡色：色卡是印刷/渲染的理想效果，鲜艳色系饱和度普遍是
  // 真实染后色的两倍，用它当色球会让用户对效果产生错误预期
  const rgb = lookup(matrix, kb, can ? level : Math.max(level, min ?? level))?.rgb;

  return (
    <button type="button" onClick={() => onPick(video.video_id)} aria-pressed={on}
      className={cx('tap flex w-full items-center gap-3 rounded-[16px] border-2 p-2.5 text-left',
        on ? 'border-pink bg-white/[0.07]' : 'border-white/10')}>
      <span className={cx('size-11 shrink-0 rounded-full border border-white/20', can ? '' : 'opacity-45')}
        style={{ background: rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : video.accent ?? '#555' }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-black">{video.color_name}</span>
        <span className="mt-0.5 block text-[11px] text-white/55">
          {can
            ? `保色 ${holdLabel(matrix, kb)}`
            : min !== null
              ? `还差 ${min - level} 度，要先漂浅`
              : '这个底色不建议自己染'}
        </span>
      </span>
      {on ? <Check size={16} weight="bold" className="shrink-0 text-pink" /> : null}
    </button>
  );
}
