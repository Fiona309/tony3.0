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
  /** 渲染与接近度用的呈色。后端优先给实测标定的真实染后色，缺失时回落到色卡值 */
  rgb?: [number, number, number];
  hex?: string;
  /** 官方效果图切出来的发丝小图。带光泽和走向，色卡用它而不是纯色块 */
  swatch?: string;
  /** 色卡原值。真实染后色饱和度普遍只有它的一半，仅供商品页展示色号用，不要拿来渲染 */
  rgb_chart?: [number, number, number];
  /** rgb 的来源标记，存在即说明是实测标定值 */
  rgb_source?: string;
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

export type TransitionRule = {
  decision: string;
  q: Quality;
  add: string | null;
  why: string;
};

/** 掉色过程。后端只给周数与中文阶段名，色值由前端算——见 fadeStages */
export type FadeRule = {
  hold_min: number;
  hold_max: number;
  /** industry_reference = 行业通识参考值，非实测。UI 必须注明 */
  source: string;
  stages: { week: number; name: string }[];
};

/** 「固色适用发色」六宫格里的命名变体，用于矩阵缺档时替补 */
export type ColorVariant = {
  name: string;
  rgb: [number, number, number];
  hex: string;
  swatch: string | null;
  /** ideal=该色系的理想主色（去黄后的样子）
   *  lighter/deeper/bias=矩阵缺档时替补对应档位  null=仅作色卡展示 */
  slot: 'ideal' | 'lighter' | 'deeper' | 'bias' | null;
};

export type ColorMatrix = {
  videos: VideoColor[];
  /** 色系 -> 命名变体列表 */
  variants?: Record<string, ColorVariant[]>;
  matrix: Record<string, Record<string, MatrixEntry>>;
  /** 底色度数 -> 漂浅过程中残留的底色，决定偏色方向 */
  undertone: Record<string, { rgb: [number, number, number]; name: string }>;
  /** 目标色 -> 当前发色色相 -> 中和判定 */
  transitions: Record<string, Record<string, TransitionRule>>;
  /** 色系 -> 保色期 + 第1~5周的阶段名 */
  fade: Record<string, FadeRule>;
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
  /** 漂色档专用：这一档对应的底色度数 */
  level?: number;
  /** 漂色档专用：到这一档是否已经够染目标色。滑块用它画门槛线 */
  ok?: boolean;
  /** 该档位对应的官方效果图切片 */
  swatch?: string;
  /** 漂浅的提亮曲线指数 Y^gamma。1 = 不漂，越小提得越亮。见 gammaFor */
  gamma?: number;
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

/* ==================== 三层判断 ====================
 *
 * 这三层回答的是三个不同的问题，互相独立，任何一层有问题都单独告诉用户，
 * 不互相否决。此前把第二层塞进第一层（拿 biased 当否决权），是错的。
 *
 *   第一层  能不能染      底色度数 vs 该色所需度数
 *   第二层  会不会偏色    ①底色残留色相 + 染膏色  ②当前发色 × 目标色中和矩阵
 *   第三层  出来多鲜艳    该度数下的真实呈色饱和度
 */

/** 某色系在某度数下的官方呈色。没有色值 = 官方不给样本 = 不建议染 */
export function entryAt(cm: ColorMatrix, kbColor: string, level: number): MatrixEntry | null {
  return cm.matrix?.[kbColor]?.[String(level)] ?? null;
}

/* -------- 第一层：能不能染 -------- */

export type Layer1 = {
  can: boolean;
  why: string;
  /** 结论由相邻度数推断而来，非官方原始标注 */
  smoothed: boolean;
};

export function layer1CanDye(cm: ColorMatrix, kbColor: string, level: number): Layer1 {
  const e = entryAt(cm, kbColor, level);
  if (!e) {
    return { can: false, why: `官方效果矩阵未覆盖 ${level} 度底色，无法判断。`, smoothed: false };
  }
  // 没有色值意味着官方效果图没给这个组合出样本——即不建议染。
  // 例外：补录的 3~4 度只录了结论没录色值，靠 q 明确表态。
  const blocked = e.q === 'not_recommended' || e.q === 'unknown';
  return { can: !blocked, why: e.why || '', smoothed: Boolean(e.smoothed) };
}

/** 该色系最低可染的底色度数，直接取自知识库。
 *  用于告诉用户"要漂到几度"——此前 UI 里写死 max(8, 当前度数+4)，
 *  与知识库无关，导致 6 度用户被告知要漂到 10 度，而蓝色其实 6 度起就能染。 */
export function minDyeableLevel(cm: ColorMatrix, kbColor: string): number | null {
  const fam = cm.matrix?.[kbColor] ?? {};
  const ok = Object.entries(fam)
    .filter(([, e]) => e.q === 'normal' || e.q === 'biased')
    .map(([lv]) => Number(lv));
  return ok.length ? Math.min(...ok) : null;
}

/* -------- 第二层：会不会偏色 -------- */

export type Layer2 = {
  risky: boolean;
  /** 偏色后的实际色值，用于渲染 */
  biasedRgb: [number, number, number] | null;
  /** 底色残留色的名字，如"橙黄" */
  undertoneName: string;
  /** 来自官方矩阵的偏色标注 */
  officialNote: string;
  /** 来自中和矩阵：当前发色能否直接往目标色染、需要补什么 */
  transition: TransitionRule | null;
};

export function layer2BiasRisk(
  cm: ColorMatrix,
  kbColor: string,
  level: number,
  /** 用户当前发色的中文色相，如"棕""金"。取自 vision 识别结果 */
  currentTone?: string,
): Layer2 {
  const e = entryAt(cm, kbColor, level);
  const residual = undertoneOf(cm, level);
  const uName = undertoneNameOf(cm, level);
  const transition = currentTone ? cm.transitions?.[kbColor]?.[currentTone] ?? null : null;

  const officialBiased = e?.q === 'biased';
  const transitionBiased = Boolean(transition && transition.q !== 'normal');

  return {
    risky: officialBiased || transitionBiased,
    biasedRgb: e?.rgb ? biasedColor(e.rgb, residual) : null,
    undertoneName: uName,
    officialNote: officialBiased ? e?.why ?? '' : '',
    transition,
  };
}

export function undertoneNameOf(cm: ColorMatrix, level: number): string {
  const keys = Object.keys(cm.undertone).map(Number).sort((a, b) => a - b);
  if (!keys.length) return '';
  const near = keys.reduce((p, c) => (Math.abs(c - level) < Math.abs(p - level) ? c : p));
  return cm.undertone[String(near)].name;
}

/* -------- 第三层：出来多鲜艳 -------- */

export type Layer3 = {
  /** 当前度数的真实呈色饱和度，0~100 */
  saturation: number;
  /** 该色系所有有色值的度数里，饱和度最高的那个 */
  best: { level: number; saturation: number } | null;
};

function satOf(rgb: [number, number, number]) {
  const [r, g, b] = rgb.map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx ? ((mx - mn) / mx) * 100 : 0;
}

export function layer3Vibrancy(cm: ColorMatrix, kbColor: string, level: number): Layer3 {
  const fam = cm.matrix?.[kbColor] ?? {};
  const here = fam[String(level)]?.rgb;
  let best: { level: number; saturation: number } | null = null;
  for (const [lv, e] of Object.entries(fam)) {
    if (!e.rgb) continue;
    const s = satOf(e.rgb);
    if (!best || s > best.saturation) best = { level: Number(lv), saturation: s };
  }
  return { saturation: here ? satOf(here) : 0, best };
}

/* ==================== 掉色过程 ====================
 *
 * 掉色的物理过程 = 染膏色素流失、底色残留逐渐暴露。所以：
 *   起点（第1周）= 官方呈色                 —— matrix 已有
 *   终点（第5周）= 该度数的残留底色          —— undertone 已有
 *   中间       = 两者按比例做减色混合        —— biasedColor 已有
 *
 * 这正是偏色计算做的事，只是把 amount 从 0 连续拉到 1。因此掉色色带与实时试色的
 * 「可能偏色」档共用同一个函数，两处结果物理上必然一致，不会自相矛盾。
 * 后端只需要提供无法推导的两样：中文阶段名与保色期。
 */

export type FadeStage = {
  week: number;
  name: string;
  rgb: [number, number, number];
  /** 该周是否仍在保色期内 */
  within: boolean;
};

export function fadeStages(cm: ColorMatrix, kbColor: string, level: number): FadeStage[] {
  const rule = cm.fade?.[kbColor];
  const base = entryAt(cm, kbColor, level)?.rgb ?? lookup(cm, kbColor, level)?.rgb;
  if (!rule || !base) return [];
  const residual = undertoneOf(cm, level);
  const last = Math.max(1, rule.stages.length - 1);

  return rule.stages.map((s, i) => {
    const t = i / last;
    // 两段合成，缺一不可：
    //   ① 减色混合负责【色相怎么变】——蓝色配黄底会经过绿，这是掉色最有观感的一段
    //   ② 向残留底色收敛负责【最后退成什么】——染膏彻底洗掉后剩的就是底色本身。
    // 只做 ① 的话末周会停在一个被 desat 压扁的浑浊色，五格看上去几乎一样；
    // 只做 ② 的话就是一条直线渐变，中间那段绿会消失。
    const shifted = i === 0 ? base : biasedColor(base, residual, t * bias.amount, 1 - (1 - bias.desat) * t);
    const w = t * t; // 前期掉色慢、后期加速，与色素流失的实际曲线一致
    const rgb = shifted.map((v, k) => Math.round(v + (residual[k] - v) * w)) as [number, number, number];
    return { week: s.week, name: s.name, rgb, within: s.week <= rule.hold_max };
  });
}

export function holdLabel(cm: ColorMatrix, kbColor: string): string {
  const rule = cm.fade?.[kbColor];
  if (!rule) return '';
  return rule.hold_min === rule.hold_max
    ? `${rule.hold_min} 周`
    : `${rule.hold_min}-${rule.hold_max} 周`;
}

/* ==================== 风险清单 ====================
 *
 * 只收「配得出具体动作」的风险——说不出该做什么的提示对用户没有指导意义，
 * 「染发会损伤发质」就是典型：所有人都知道，且给不出可执行的下一步。
 *
 * 且只放【判断类】风险（影响"我要不要染"）。过敏测试、凡士林这类【操作类】
 * 注意事项属于决定要染之后的事，放在决策屏是干扰。
 */

export type JudgeRisk = { key: string; text: string; action: string };

export function judgeRisks(
  cm: ColorMatrix,
  kbColor: string,
  level: number,
  dyeHistory: string | undefined,
  currentTone?: string,
): JudgeRisk[] {
  const out: JudgeRisk[] = [];

  // 偏色与显色淡同因（底色没处理干净 / 不够浅），对用户是同一件事：
  // 「染出来跟博主不一样」。拆成两条是拿技术分类去切用户感受。
  const l2 = layer2BiasRisk(cm, kbColor, level, currentTone);
  const l3 = layer3Vibrancy(cm, kbColor, level);
  const min = minDyeableLevel(cm, kbColor);
  const onEdge = min !== null && level === min;

  if (l2.risky || onEdge || (l3.best && l3.saturation < l3.best.saturation * 0.7)) {
    const why = l2.risky && l2.undertoneName
      ? `你的 ${level} 度底色还残留${l2.undertoneName}，颜色盖上去会被带偏`
      : onEdge
        ? `你正好卡在这个色的最低门槛上，颜色会比博主淡`
        : `你的底色偏深，颜色出来会比博主闷一些`;
    out.push({
      key: 'color-gap',
      text: `颜色会和博主有差距 —— ${why}`,
      action: '试色屏拖到最右边可以看到偏色的样子，先看清楚再决定',
    });
  }

  // 布丁头：发根新生发与已漂染的发尾吸色速度不同，是家用染发最常见的翻车
  if (dyeHistory && dyeHistory !== 'natural') {
    const times = dyeHistory === 'bleached_3_plus' ? '3 次以上'
      : dyeHistory === 'bleached_2' ? '2 次' : '1 次';
    out.push({
      key: 'uneven',
      text: `发根和发尾会不一样 —— 你漂过 ${times}，发尾吃色快、发根慢`,
      action: '先涂发尾停 10 分钟，再涂发根一起冲，两段颜色才接得上',
    });
  }

  return out;
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
/** 漂色轴。用户只认「漂几次」，不认度数——度数是我们内部的说法。
 *  映射按家用漂发的常见结果定：漂 1 次到 6 度，漂 2 次到 8 度。 */
export const BLEACH_STOPS = [
  { label: '不漂', toLevel: null },
  { label: '漂浅 1 次', toLevel: 6 },
  { label: '漂浅 2 次', toLevel: 8 },
] as const;

/**
 * 能染时的效果档位 —— 第三层（显色程度）+ 第二层（偏色）。
 *
 * 关键：浅/深两档用【相邻度数的真实呈色】，不是人为缩放饱和度。
 * 真实数据本来就带着这个差异（蓝色 6度饱和 46%、8度 96%），
 * 编一个 scaleSat(0.5) 去覆盖真数据是错的。
 *
 * 相邻度数没有官方色值时不造数据——按"没有色值即不建议"的原则直接不出这一档。
 */
export function toneVariants(
  cm: ColorMatrix,
  kbColor: string,
  level: number,
): Variant[] {
  /* 必须用 lookup 而不是 entryAt：entryAt 只查精确档位、不外推。
     冷棕色（奶茶灰棕）官方矩阵只有 5~9 度，但知识库说它 3 度就能直染——
     3~4 度用户走到这里，entryAt 返回无色值，整个函数返回空数组，
     滑块只剩一个空档、着色器拿到 null，画面留着上一个颜色的残留。
     任何度数、任何颜色都必须给得出效果，这是产品底线。 */
  const resolved = lookup(cm, kbColor, level);
  if (!resolved) return [];
  const here = resolved;

  if (resolved.extrapolated) {
    /* 官方没有这个底色的样本，只能借最近档位当参考。
       此时"偏浅/偏深/偏色"会全部外推到同一个值，四档变成四个一样的颜色，
       没有意义——直接只给一档，并如实说明这是参考不是实测。 */
    return [{
      key: 'same',
      label: '参考效果',
      note: `官方没有 ${level} 度底色的样本，这是按 ${resolved.sourceLevel} 度推的参考`,
      rgb: resolved.rgb, str: 1, lift: 0, swatch: resolved.swatch,
    }];
  }

  const out: Variant[] = [];
  /* 四档全部直接查官方效果矩阵，不再算系数：
       偏浅 = 高一度   一样 = 本档   偏深 = 低一度   偏色 = 低两度

     「偏色」改用低两度的官方实拍，而不是减色混合算出来的值。
     低两度就是"实际底色比你以为的深、没漂匀"的真实结果，有官方照片支撑，
     比我们算的可信。品牌自己也这么描述——蓝色页写"偏黄底色上色后会偏绿"，
     而官方矩阵里蓝色 6 度采出来正是 H165 的绿色。

     缺档时用同色系的命名变体替补：粉色在矩阵里只有 8、9 两档，
     8 度用户没有偏深和偏色可看；玫瑰金是暖橙调，正好对应官方警告的
     "粉色在偏黄底色上会偏橘"。 */
  const vs = cm.variants?.[kbColor] ?? [];
  const bySlot = (slot: ColorVariant['slot']) => vs.find((v) => v.slot === slot);

  const push = (
    key: string, label: string, lv: number,
    noteAt: (l: number) => string, slot: ColorVariant['slot'], risk?: boolean,
  ) => {
    const e = entryAt(cm, kbColor, lv);
    if (e?.rgb) {
      out.push({ key, label, note: noteAt(lv), rgb: e.rgb, str: 1, lift: 0, risk, swatch: e.swatch });
      return;
    }
    const v = bySlot(slot);
    if (v) {
      out.push({
        key, label, note: `${v.name}（同色系，官方矩阵未覆盖这个底色）`,
        rgb: v.rgb, str: 1, lift: 0, risk, swatch: v.swatch ?? undefined,
      });
    }
  };

  push('light', '偏浅', level + 1, (l) => `底色偏浅时的呈色（${l} 度实测）`, 'lighter');
  out.push({
    key: 'same', label: '和目标色一样', note: `你的 ${level} 度底色的官方呈色`,
    rgb: here.rgb, str: 1, lift: 0, swatch: here.swatch,
  });
  push('deep', '偏深', level - 1, (l) => `底色偏深时的呈色（${l} 度实测）`, 'deeper');

  const un = undertoneNameOf(cm, level);
  const before = out.length;
  push('biased', '可能偏色', level - 2,
    (l) => (un
      ? `底色没漂匀、还残留${un}时的样子（${l} 度实测）`
      : `底色比你以为的深时的样子（${l} 度实测）`),
    'bias', true);
  if (out.length === before) {
    /* 低两度官方没给色值、也没有可替补的变体时（如蓝色 7 度，低两度是 5 度），
       退回减色混合算。偏色是必须让用户看到的一档，宁可用算的也不能整档消失。 */
    const b2 = layer2BiasRisk(cm, kbColor, level);
    if (b2.biasedRgb) {
      out.push({
        key: 'biased', label: '可能偏色',
        note: b2.undertoneName
          ? `${b2.undertoneName}底残留会把颜色带偏（推算，官方无该底色样本）`
          : '底色残留会影响呈色（推算，官方无该底色样本）',
        rgb: b2.biasedRgb, str: 1, lift: 0, risk: true,
      });
    }
  }
  return out;
}

/** 「和目标色一样」这一档在轴上的位置。切色后滑块要落在这里，不是落在 0 */
export function defaultStop(variants: Variant[]) {
  const i = variants.findIndex((v) => v.key === 'same');
  return i < 0 ? 0 : i;
}

/** 不能染时的三档：不漂 / 漂1次 / 漂2次 */
/** 该底色度数下头发的预期明度（sRGB 编码域）。度数本质是明度：
 *  levelFromL 的阈值表每 10 一档，故 Lab L≈10×度数。 */
export function baseLumaOf(level: number) {
  const L = Math.max(5, Math.min(100, level * 10));
  return Math.pow(Math.max(((L + 16) / 116) ** 3, 0.001), 1 / 2.2);
}

/**
 * 从 from 度漂到 to 度的提亮曲线指数（Y^gamma）。1.0 = 不漂。
 *
 * 旧版用加法 Y + lm*(1-Y)*(1.4-0.8Y)，对 Y 求导是 1 + lm*(1.6Y-2.2)：
 * 3 度黑发（Y≈0.15）漂到 8 度需要 lm=0.58，导数是【负的 -0.137】——
 * 原本亮一点的发丝漂完反而更暗，整个动态范围从 0.20 塌成 0.019 还翻了向。
 * 这就是"一坨颜色糊上去、毫无毛流感"的根因。
 *
 * gamma 曲线单调、永不翻转：同样 3→8 度，0.10→0.624、0.30→0.782，
 * 动态范围保留 79%。
 */
function gammaFor(from: number, to: number) {
  const a = baseLumaOf(from);
  const b = baseLumaOf(to);
  if (b <= a || a >= 0.999) return 1;
  return Math.max(0.12, Math.min(1, Math.log(b) / Math.log(a)));
}

/**
 * 不能直染时的漂色轴。三档：不漂 / 漂 1 次 / 漂 2 次。
 *
 * 三档【用同一个理想色】，变的只是显色程度：底色越浅吃色越足，
 * 这一层由着色器的 lift + recept 自然完成，不需要换颜色。
 *
 * 理想色取「固色适用发色」六宫格里的主色，而不是「使用后」那一行——
 * 那一行的「使用前」全是金黄色底，粉+黄=珊瑚红、蓝+黄=绿，
 * 它描述的是"漂了但没去黄"的结果，不是理想效果。
 * 官方文案自己写着「务必漂至 8 度及以上并去黄后使用，偏黄底色上色后会偏橘/偏绿」。
 *
 * 现场体验的用户基本都是黑发，默认必须落在漂 2 次那一档，
 * 让她一进来就看到漂完的好效果；想看真相往左拖。
 */
export function bleachVariants(cm: ColorMatrix, kbColor: string, level: number): Variant[] {
  const ideal = cm.variants?.[kbColor]?.find((v) => v.slot === 'ideal');
  const fallback = lookup(cm, kbColor, 8) ?? lookup(cm, kbColor, level);
  const rgb = (ideal?.rgb ?? fallback?.rgb) as [number, number, number] | undefined;
  if (!rgb) return [];
  const swatch = ideal?.swatch ?? fallback?.swatch ?? undefined;
  const name = ideal?.name ?? '';

  return BLEACH_STOPS.map((s, i) => {
    const to = s.toLevel;
    if (to === null) {
      return {
        key: 'bleach0', label: s.label,
        note: `你现在的底色直接染，几乎显不出颜色`,
        rgb, str: 1, lift: 0, gamma: 1, risk: true, level, ok: false, swatch,
      };
    }
    const enough = to >= 8;
    return {
      key: `bleach${i}`, label: s.label,
      note: enough
        ? `漂到位了，这就是${name}该有的样子`
        : `颜色出得来了，但比${name}闷一些`,
      rgb, str: 1, lift: 0, gamma: gammaFor(level, to), risk: !enough,
      level: to, ok: enough, swatch,
    };
  });
}

/** 漂色轴上第一个够染的档位；滑块用它画门槛线，没有则返回 -1 */
export function bleachThreshold(variants: Variant[]) {
  return variants.findIndex((v) => v.ok);
}
