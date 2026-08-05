/**
 * 染发魔镜 · 实时试色核心逻辑（纯计算，不碰 DOM / React）
 *
 * 服务器成本约束（2核2G / 3Mbps 固定带宽的 ECS）：
 *   - MediaPipe WASM 与 JS 走 CDN，不占服务器带宽
 *   - 模型 763KB 由服务器发出但长缓存，每用户仅一次
 *   - 决策数据是 8.5KB 静态 JSON，试色全程零 API 调用
 *   - 分割与渲染全部在浏览器，服务器 CPU 占用为 0
 */

export type Quality = 'normal' | 'biased' | 'not_recommended' | 'unknown';

export type ColorEntry = {
  rgb?: [number, number, number];
  hex?: string;
  rec?: boolean;
  q?: Quality;
  why?: string;
};

export type Rules = {
  colors: Record<string, Record<string, ColorEntry>>;
  tone: Record<string, string>;
  levels: number[];
};

export type Resolved = ColorEntry & {
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
  /** 上色强度：用量少 / 停留短意味着染料上得少，露出更多原发色 */
  str: number;
  /** 漂浅提亮量：漂浅的物理本质是把发丝提亮，提亮后才吃得上色 */
  lift: number;
  warn?: boolean;
};

/* ============================ 色彩工具 ============================ */

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const lum = (a: number[]) => a[0] * 0.299 + a[1] * 0.587 + a[2] * 0.114;

/** sRGB → Lab(D65)，与后端 hair_dye_engine.rgb_to_lab 同一套公式 */
export function rgb2lab([r, g, b]: number[]): [number, number, number] {
  const f = (v: number) => {
    v /= 255;
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
  };
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g2 = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [g2(X), g2(Y), g2(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** 与后端 hair_dye_engine.get_level 完全一致的阈值表 */
export function levelFromL(L: number) {
  const l = Math.max(0, Math.min(100, L));
  const th = [15, 25, 35, 45, 55, 65, 75, 85, 95, 100];
  for (let i = 0; i < th.length; i++) if (l <= th[i]) return i + 1;
  return 10;
}

/** 饱和度缩放（绕 HSL 的 S 分量） */
export function scaleSat(rgb: number[], k: number): [number, number, number] {
  const l = ((Math.max(...rgb) + Math.min(...rgb)) / 2);
  return rgb.map((v) => clamp255(l + (v - l) * k)) as [number, number, number];
}

/**
 * 偏色：低度数底色残留的黄橙会污染染膏色。
 * 方向取自数据库 color_result_rules 的 5 条 biased 记录：
 *   蓝色→偏青绿 / 紫色→偏红棕 / 雾霾灰→偏灰绿 / 橙色→偏暗红棕 / 脏橘色→偏暗棕
 *
 * 染膏与底色残留是【颜料混合】，属减色过程，必须用乘法。线性 RGB 平均是加色
 * 模型，蓝+黄只会得到灰蓝——那是错的。乘完亮度会掉，再按原亮度拉回。
 *
 * amount / desat 由真机调参确定（用户对着自己头发拖滑块定的）：
 *   amount 越大越绿，desat 越小越淡；desat 压住饱和度上限，
 *   所以往绿走不会变艳。判定标准是"与偏浅偏淡拉开足够色相差"。
 */
const RESIDUAL_WARM = [196, 138, 58];
export const bias = { amount: 0.97, desat: 0.30 };

export function biasedColor(
  rgb: number[],
  amount = bias.amount,
  desat = bias.desat,
): [number, number, number] {
  const b = rgb.map((v) => v / 255);
  const w = RESIDUAL_WARM.map((v) => v / 255);
  const mixed = b.map((v, i) => v * w[i]);
  const k = lum(b) / Math.max(lum(mixed), 1e-3);
  const full = mixed.map((v) => v * k);
  const part = b.map((v, i) => clamp255((v + (full[i] - v) * amount) * 255));
  return scaleSat(part, desat);
}

/* ============================ 规则查询 ============================ */

/**
 * 取某色系在某底色度数下的呈色。两种情况需要外推，都标记 extrapolated：
 *   1. 度数超出官方表的 5~9 范围（比如天生黑发 3~4 度）
 *   2. 该组合是 not_recommended —— 官方效果图对不推荐的组合不给色值（18/65 条）
 * 外推 = 借最近一个有官方色值的度数当"纯染膏色"，交给着色器用真实发丝亮度调制。
 */
export function lookup(rules: Rules, family: string, level: number): Resolved | null {
  const fam = rules?.colors?.[family];
  if (!fam) return null;
  const exact = fam[String(level)];
  if (exact?.rgb) return { ...exact, rgb: exact.rgb, level, extrapolated: false };

  const withColor = Object.keys(fam)
    .filter((k) => fam[k].rgb)
    .map(Number)
    .sort((a, b) => a - b);
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
export function decide(rules: Rules, family: string, level: number): Decision {
  const e = lookup(rules, family, level);
  if (!e) return { can: false, q: 'unknown', why: '该色系暂无数据。', extrapolated: false };
  const q = (e.q ?? 'unknown') as Quality;
  const note = e.extrapolated
    ? `（${level} 度无官方色值，借用 ${e.sourceLevel} 度做物理模拟，仅供参考）`
    : '';
  return {
    can: q === 'normal' || q === 'biased',
    q,
    entry: e,
    extrapolated: e.extrapolated,
    why: (e.why || '') + note,
  };
}

/** 能染时的四种呈现：标准 + 用量/手法差异 + 偏色风险 */
export function usageVariants(base: [number, number, number], q: Quality): Variant[] {
  return [
    { key: 'standard', label: '标准效果', note: '按说明书用量', rgb: base, str: 1, lift: 0 },
    { key: 'low', label: '偏浅偏淡', note: '用量偏少 / 停留短', rgb: scaleSat(base, 0.5), str: 0.58, lift: 0 },
    { key: 'high', label: '偏深偏艳', note: '用量偏多 / 停留久', rgb: scaleSat(base, 1.65), str: 1, lift: 0.06 },
    {
      key: 'biased',
      label: '偏色风险',
      note: q === 'biased' ? '底色残留污染' : '底色残留导致',
      rgb: biasedColor(base),
      str: 1,
      lift: 0,
    },
  ];
}

/** 按"能不能染"给色系分组——这是与施华蔻按色系分类的根本差异：
 *  施华蔻是品牌货架逻辑（要卖全色卡），我们是风险顾问逻辑（帮用户避免翻车）。
 *  用户不需要理解"冷棕色系"是什么，只需要看懂"我现在能不能染"。 */
export type RiskGroup = 'ok' | 'bleach1' | 'bleach2' | 'no';

export const GROUP_META: Record<RiskGroup, { label: string; hint: string }> = {
  ok:      { label: '你现在就能染', hint: '底色符合，可直接上色' },
  bleach1: { label: '需要先漂 1 次', hint: '漂浅约 2 度后可染' },
  bleach2: { label: '需要先漂 2 次', hint: '漂浅约 4 度后可染' },
  no:      { label: '不建议自己染', hint: '漂 2 次仍达不到，建议去发廊' },
};

/** 某色系在当前底色下属于哪一组 */
export function riskGroup(rules: Rules, family: string, level: number): RiskGroup {
  if (decide(rules, family, level).can) return 'ok';
  if (decide(rules, family, Math.min(9, level + 2)).can) return 'bleach1';
  if (decide(rules, family, Math.min(9, level + 4)).can) return 'bleach2';
  return 'no';
}

/** 全部色系按风险分组，组内保持原顺序 */
export function groupFamilies(rules: Rules, level: number) {
  const out: Record<RiskGroup, string[]> = { ok: [], bleach1: [], bleach2: [], no: [] };
  for (const name of Object.keys(rules.colors)) out[riskGroup(rules, name, level)].push(name);
  return out;
}

/** 施华蔻式的底色档位：自然发色 / 漂浅1次 / 漂浅2次。一次漂浅约 +2 度 */
export const BLEACH_STOPS = [
  { add: 0, lift: 0, label: '自然发色' },
  { add: 2, lift: 0.2, label: '漂浅1次' },
  { add: 4, lift: 0.4, label: '漂浅2次' },
] as const;

/** 某个漂浅档位下要渲染的目标色与提亮量 */
export function bleachVariant(
  rules: Rules,
  family: string,
  baseLevel: number,
  stopIndex: number,
): { variant: Variant; level: number; decision: Decision } {
  const stop = BLEACH_STOPS[Math.max(0, Math.min(BLEACH_STOPS.length - 1, stopIndex))];
  const level = Math.min(9, baseLevel + stop.add);
  const d = decide(rules, family, level);
  const rgb = d.entry?.rgb ?? [0, 0, 0];
  return {
    level,
    decision: d,
    variant: {
      key: `bleach${stopIndex}`,
      label: stop.label,
      note: `底色 ${level} 度` + (d.extrapolated ? '（模拟）' : ''),
      rgb: rgb as [number, number, number],
      str: 1,
      lift: stop.lift,
      warn: stopIndex === 0 && !d.can,
    },
  };
}
