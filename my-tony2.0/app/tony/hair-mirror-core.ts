/**
 * 染发魔镜 · 实时试色核心逻辑（纯计算，不碰 DOM / React）
 *
 * 数据全部来自后端 GET /api/color-matrix，前端不持有任何副本或写死的色值。
 * 服务器成本：MediaPipe WASM/JS 走 CDN，模型 763KB 长缓存每用户一次，
 * 分割与渲染都在浏览器，试色阶段服务器 CPU 与带宽占用为 0。
 */

export type Quality = 'normal' | 'biased' | 'not_recommended' | 'unknown';

export type MatrixEntry = {
  q: Quality;
  why: string;
  rec: boolean;
  rgb?: [number, number, number];
  hex?: string;
  /** 该结论由「单点凹陷平滑」推断而来，非官方矩阵原值。UI 需注明 */
  smoothed?: boolean;
};

/** 种草视频里的目标色。kb_color 是后端用 TARGET_COLOR_ALIASES 归一化后的知识库色系 */
export type VideoColor = {
  video_id: string;
  title: string;
  color_name: string;
  accent: string | null;
  cover_url: string | null;
  kb_color: string | null;
};

export type ColorMatrix = {
  videos: VideoColor[];
  matrix: Record<string, Record<string, MatrixEntry>>;
  /** 底色度数 -> 漂浅过程中残留的底色，决定偏色方向 */
  undertone: Record<string, { rgb: [number, number, number]; name: string }>;
};

export type Resolved = MatrixEntry & {
  rgb: [number, number, number];
  level: number;
  sourceLevel?: number;
  extrapolated: boolean;
};

export type Decision = {
  can: boolean;
  q: Quality;
  why: string;
  extrapolated: boolean;
  entry?: Resolved;
};

export type Variant = {
  key: string;
  label: string;
  note: string;
  rgb: [number, number, number];
  /** 上色强度 */
  str: number;
  /** 漂浅提亮量：漂浅的物理本质是把发丝提亮，提亮后才吃得上色 */
  lift: number;
  risk?: boolean;
};

/* ============================ 色彩工具 ============================ */

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const lum = (a: number[]) => a[0] * 0.299 + a[1] * 0.587 + a[2] * 0.114;

export function rgb2lab([r, g, b]: number[]): [number, number, number] {
  const f = (v: number) => {
    const x = v / 255;
    return x > 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92;
  };
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g2 = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [g2(X), g2(Y), g2(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** 与后端 hair_dye_engine.get_level 完全一致的阈值表。度数本质就是明度 */
export function levelFromL(L: number) {
  const l = Math.max(0, Math.min(100, L));
  const th = [15, 25, 35, 45, 55, 65, 75, 85, 95, 100];
  for (let i = 0; i < th.length; i++) if (l <= th[i]) return i + 1;
  return 10;
}

export function scaleSat(rgb: number[], k: number): [number, number, number] {
  const l = (Math.max(...rgb) + Math.min(...rgb)) / 2;
  return rgb.map((v) => clamp255(l + (v - l) * k)) as [number, number, number];
}

/**
 * 偏色 = 染膏色与「该底色度数残留的暖色」做减色混合。
 *
 * 染膏与底色残留属颜料混合（减色），必须用乘法；线性 RGB 平均是加色模型，
 * 蓝+黄只会得到灰蓝，那是错的。乘完亮度会掉，再按原亮度拉回。
 *
 * 残留色随度数变化（后端 undertone 表：深棕→橙棕→橙→橙黄→黄→浅黄），
 * 所以同一支染膏在不同底色上偏色方向不同：
 *   蓝色 + 8度黄底  → 偏绿
 *   蓝色 + 6度橙底  → 蓝橙互补，中和为灰浊
 * 这正是"不同底色染同一个色，偏色结果不一样"的物理来源。
 *
 * amount/desat 由真机调参确定：amount 越大越偏向残留色，desat 压住饱和度，
 * 使偏色呈现"发闷"而不是"鲜艳"——真实偏色的观感是脏，不是艳。
 */
export const bias = { amount: 0.97, desat: 0.3 };

export function biasedColor(
  base: number[],
  residual: number[],
  amount = bias.amount,
  desat = bias.desat,
): [number, number, number] {
  const b = base.map((v) => v / 255);
  const w = residual.map((v) => v / 255);
  const mixed = b.map((v, i) => v * w[i]);
  const k = lum(b) / Math.max(lum(mixed), 1e-3);
  const full = mixed.map((v) => v * k);
  const part = b.map((v, i) => clamp255((v + (full[i] - v) * amount) * 255));
  return scaleSat(part, desat);
}

/** 取某度数的残留底色；超出表范围时夹到最近端 */
export function undertoneOf(cm: ColorMatrix, level: number): [number, number, number] {
  const keys = Object.keys(cm.undertone).map(Number).sort((a, b) => a - b);
  if (!keys.length) return [196, 138, 58];
  const near = keys.reduce((p, c) => (Math.abs(c - level) < Math.abs(p - level) ? c : p));
  return cm.undertone[String(near)].rgb;
}

/* ============================ 规则查询 ============================ */

/**
 * 取某色系在某底色度数下的呈色。两种情况需要外推，都标记 extrapolated：
 *   1. 度数超出官方矩阵的 5~9（比如天生黑发 3~4 度）
 *   2. 该组合是 not_recommended —— 官方效果图对不推荐的组合不给色值
 * 外推 = 借最近一个有官方色值的度数当"纯染膏色"，交给着色器用真实发丝亮度调制。
 */
export function lookup(cm: ColorMatrix, kbColor: string, level: number): Resolved | null {
  const fam = cm.matrix?.[kbColor];
  if (!fam) return null;
  const exact = fam[String(level)];
  if (exact?.rgb) return { ...exact, rgb: exact.rgb, level, extrapolated: false };

  const withColor = Object.keys(fam).filter((k) => fam[k].rgb).map(Number).sort((a, b) => a - b);
  if (!withColor.length) return null;
  const near = withColor.reduce((p, c) => (Math.abs(c - level) < Math.abs(p - level) ? c : p));
  const src = fam[String(near)];
  return {
    ...src,
    rgb: src.rgb as [number, number, number],
    q: exact?.q ?? 'unknown',
    why: exact?.why ?? `官方效果矩阵未覆盖 ${level} 度。`,
    level,
    sourceLevel: near,
    extrapolated: true,
  };
}

/** q 永远取自官方数据；extrapolated 只是"色值是借来的"的独立标记，不篡改结论 */
export function decide(cm: ColorMatrix, kbColor: string, level: number): Decision {
  const e = lookup(cm, kbColor, level);
  if (!e) return { can: false, q: 'unknown', why: '该色暂未录入官方底色效果矩阵。', extrapolated: false };
  const q = (e.q ?? 'unknown') as Quality;
  const note = e.extrapolated
    ? `（${level} 度无官方色值，借 ${e.sourceLevel} 度做物理模拟，仅供参考）`
    : '';
  return { can: q === 'normal' || q === 'biased', q, entry: e, extrapolated: e.extrapolated, why: (e.why || '') + note };
}

/* ============================ 分组与变体 ============================ */

/** 按"能不能染"分组——与施华蔻按色系分类的根本差异：它是品牌货架，我们是风险顾问 */
export type RiskGroup = 'ok' | 'bleach1' | 'bleach2' | 'no';

export const GROUP_META: Record<RiskGroup, { label: string; short: string }> = {
  ok: { label: '现在就能染', short: '能染' },
  bleach1: { label: '需要先漂 1 次', short: '漂1次' },
  bleach2: { label: '需要先漂 2 次', short: '漂2次' },
  no: { label: '不建议自己染', short: '不建议' },
};

/** 屏2 的色卡只分两组——分组标题本身就是引导语，用户不必理解更细的层级 */
export type SimpleGroup = 'ok' | 'bleach';
export const SIMPLE_GROUP_LABEL: Record<SimpleGroup, string> = {
  ok: '现在就能染',
  bleach: '需要先漂浅',
};

export function simpleGroup(cm: ColorMatrix, kbColor: string, level: number): SimpleGroup {
  return decide(cm, kbColor, level).can ? 'ok' : 'bleach';
}

/** 把 6 个博主色按能不能染分两组，组内保持视频原顺序 */
export function groupVideos(cm: ColorMatrix, level: number) {
  const out: Record<SimpleGroup, VideoColor[]> = { ok: [], bleach: [] };
  for (const v of cm.videos) {
    if (!v.kb_color) continue;
    out[simpleGroup(cm, v.kb_color, level)].push(v);
  }
  return out;
}

export function riskGroup(cm: ColorMatrix, kbColor: string, level: number): RiskGroup {
  if (decide(cm, kbColor, level).can) return 'ok';
  if (decide(cm, kbColor, Math.min(9, level + 2)).can) return 'bleach1';
  if (decide(cm, kbColor, Math.min(9, level + 4)).can) return 'bleach2';
  return 'no';
}

/** 一次漂浅约 +2 度 */
export const BLEACH_STOPS = [
  { add: 0, lift: 0, label: '不漂' },
  { add: 2, lift: 0.2, label: '漂浅 1 次' },
  { add: 4, lift: 0.4, label: '漂浅 2 次' },
] as const;

/**
 * 能染时的四档。中间那档就是"和博主一样"。
 *
 * 措辞上刻意不写"用量多少"——真实成因是底色深浅不均、发质吸色快慢（受损发吸色快）、
 * 水温、停留时间、光线等多因素叠加，归因到单一原因会误导用户。
 * 所以只描述结果范围，不解释成因。
 */
export function toneVariants(
  base: [number, number, number],
  residual: number[],
  q: Quality,
): Variant[] {
  return [
    { key: 'light', label: '比博主浅', note: '显色偏淡', rgb: scaleSat(base, 0.5), str: 0.58, lift: 0 },
    { key: 'same', label: '和博主一样', note: '官方标准效果', rgb: base, str: 1, lift: 0 },
    { key: 'deep', label: '比博主深', note: '显色偏浓', rgb: scaleSat(base, 1.65), str: 1, lift: 0.06 },
    {
      key: 'biased',
      label: '可能偏色',
      note: q === 'biased' ? '官方标注该底色易偏色' : '底色残留会影响呈色',
      rgb: biasedColor(base, residual),
      str: 1,
      lift: 0,
      risk: true,
    },
  ];
}

/** 不能染时的三档：不漂 / 漂1次 / 漂2次 */
export function bleachVariants(cm: ColorMatrix, kbColor: string, level: number): Variant[] {
  return BLEACH_STOPS.map((s, i) => {
    const lv = Math.min(9, level + s.add);
    const e = lookup(cm, kbColor, lv);
    const d = decide(cm, kbColor, lv);
    return {
      key: `bleach${i}`,
      label: s.label,
      note: `底色 ${lv} 度` + (d.can ? '' : '·仍不推荐'),
      rgb: (e?.rgb ?? [60, 60, 60]) as [number, number, number],
      str: 1,
      lift: s.lift,
      risk: i === 0 && !d.can,
    };
  });
}
