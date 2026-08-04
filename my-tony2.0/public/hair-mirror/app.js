/* 染发魔镜 — 实时试色核心
 *
 * 服务器成本约束（3 Mbps 固定带宽的 2核2G ECS）：
 *   - WASM / JS 走 CDN，不占服务器带宽
 *   - 模型 763KB 走服务器但长缓存，每用户仅一次
 *   - 决策数据是 9KB 静态 JSON，试色全程零 API 调用
 *   - 分割与渲染全在浏览器，服务器 CPU 占用为 0
 */
import { ImageSegmenter, FilesetResolver }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const $ = s => document.querySelector(s);

export const state = {
  rules: null,          // rules.json
  level: null,          // 用户底色度数 3~9
  detected: null,       // 算法识别出的度数（用于提示"已手动修改"）
  family: null,         // 目标色系
  segImage: null,       // IMAGE 模式分割器（拍照用）
  segVideo: null,       // VIDEO 模式分割器（摄像头用）
  vision: null,
};

/* ============================ 色彩工具 ============================ */

// sRGB -> Lab(D65)，与后端 hair_dye_engine.rgb_to_lab 同一套公式
export function rgb2lab([r, g, b]) {
  const f = v => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.00000;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g2 = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
  const [fx, fy, fz] = [g2(X), g2(Y), g2(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// 与后端 hair_dye_engine.get_level 完全一致的阈值表
export function levelFromL(L) {
  L = Math.max(0, Math.min(100, L));
  const th = [15, 25, 35, 45, 55, 65, 75, 85, 95, 100];
  for (let i = 0; i < th.length; i++) if (L <= th[i]) return i + 1;
  return 10;
}

const clamp255 = v => Math.max(0, Math.min(255, Math.round(v)));

// 饱和度缩放（绕 HSL 的 S 分量）
export function scaleSat(rgb, k) {
  const [r, g, b] = rgb.map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  return rgb.map(v => clamp255(l * 255 + (v - l * 255) * k));
}

/* 偏色：低度数底色残留的黄橙色会污染染膏色。
 * 这不是我编的方向 —— 数据库 color_result_rules 里 5 条 biased 记录写明了：
 *   蓝色→偏青绿 / 紫色→偏红棕 / 雾霾灰→偏灰绿 / 橙色→偏暗红棕 / 脏橘色→偏暗棕
 * 全部可由"往黄橙底混合"复现。 */
const RESIDUAL_WARM = [196, 138, 58];
export function biasedColor(rgb, amount = 0.38) {
  return rgb.map((v, i) => clamp255(v * (1 - amount) + RESIDUAL_WARM[i] * amount));
}

/* ============================ 规则查询 ============================ */

/* 取某色系在某底色度数下的呈色。
 * 两种情况需要外推，都会标记 extrapolated，UI 必须提示"模拟效果，仅供参考"：
 *   1. 度数超出官方表的 5~9 范围（比如天生黑发 3~4 度）
 *   2. 该组合是 not_recommended —— 官方效果图对不推荐的组合不给色值（18/65 条）
 * 外推做法：取最近一个有官方色值的度数当"纯染膏色"，交给着色器用真实发丝亮度调制。
 * 深色头发吃不上色是真实物理过程，不是我编的数字。 */
export function lookup(family, level) {
  const fam = state.rules?.colors?.[family];
  if (!fam) return null;
  const exact = fam[String(level)];

  if (exact?.rgb) return { ...exact, level, extrapolated: false };

  const withColor = Object.keys(fam).filter(k => fam[k].rgb).map(Number).sort((a, b) => a - b);
  if (!withColor.length) return null;
  const near = withColor.reduce((p, c) => Math.abs(c - level) < Math.abs(p - level) ? c : p);
  return {
    ...fam[String(near)],                  // 借用最近度数的色值
    q: exact?.q ?? "unknown",              // 但决策仍用本度数的
    why: exact?.why ?? `官方效果矩阵未覆盖 ${level} 度。`,
    level, sourceLevel: near, extrapolated: true,
  };
}

/* 该度数下能不能染。
 * q 永远取自官方数据（normal / biased / not_recommended / unknown），
 * extrapolated 只是"色值是借来的"这一独立标记，不会篡改决策结论。 */
export function decide(family, level) {
  const e = lookup(family, level);
  if (!e) return { can: false, q: "unknown", why: "该色系暂无数据。", extrapolated: false };
  const q = e.q ?? "unknown";
  const note = e.extrapolated
    ? `（${level} 度无官方色值，借用 ${e.sourceLevel} 度色值做物理模拟，仅供参考）`
    : "";
  return { can: q === "normal" || q === "biased", q, entry: e,
           extrapolated: e.extrapolated, why: (e.why || "") + note };
}

/* 根据决策结果算出要同屏渲染的几路变体 */
export function variantsFor(family, level) {
  const d = decide(family, level);
  if (!d.entry) return { decision: d, variants: [] };
  const base = d.entry.rgb;

  if (d.can) {
    // 能染：标准 + 用量/手法导致的饱和度差异 + 偏色风险。都不涉及漂浅，lift=0。
    return { decision: d, variants: [
      { key: "standard", label: "标准效果",  rgb: base,                 lift: 0, note: "按说明书用量" },
      { key: "low",      label: "偏低饱和",  rgb: scaleSat(base, 0.72), lift: 0, note: "用量偏少 / 停留短" },
      { key: "high",     label: "偏高饱和",  rgb: scaleSat(base, 1.30), lift: 0, note: "用量偏多 / 停留久" },
      { key: "biased",   label: "偏色风险",  rgb: biasedColor(base),    lift: 0,
        note: d.q === "biased" ? "底色残留污染" : "底色残留导致" },
    ]};
  }

  /* 不能染：给漂 0 / 1 / 2 次对比。一次漂浅约 +2 度。
   * 关键：光换目标色不够 —— 摄像头里是同一束头发，三格会渲染成一模一样。
   * 漂浅的物理本质是"把发丝提亮"，提亮后才吃得上色。所以每档还要带一个 lift，
   * 在着色器里先抬高亮度再上色，三档才会呈现真实的递进差异。 */
  const steps = [
    { add: 0, lift: 0.00, label: "不漂（当前底色）" },
    { add: 2, lift: 0.20, label: "漂浅 1 次" },
    { add: 4, lift: 0.40, label: "漂浅 2 次" },
  ];
  return { decision: d, variants: steps.map((s, i) => {
    const lv = Math.min(9, level + s.add);
    const e = lookup(family, lv);
    return {
      key: `bleach${i}`,
      label: s.label,
      rgb: e?.rgb || base,
      lift: s.lift,
      note: `底色 ${lv} 度` + (e?.extrapolated ? "（模拟）" : ""),
      warn: i === 0,
    };
  })};
}

/* ============================ MediaPipe ============================ */

export async function ensureVision() {
  if (!state.vision) state.vision = await FilesetResolver.forVisionTasks(CDN);
  return state.vision;
}

async function makeSegmenter(mode) {
  const vision = await ensureVision();
  return ImageSegmenter.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "./hair_segmenter.tflite", delegate: "GPU" },
    runningMode: mode,
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
}

// 在用户拍照/等识别结果时就预热，等他要开摄像头时模型已就绪 —— 体感 0 等待
export async function preload() {
  if (!state.rules) state.rules = await (await fetch("./rules.json")).json();
  if (!state.segImage) state.segImage = await makeSegmenter("IMAGE");
}
export async function ensureVideoSegmenter() {
  if (!state.segVideo) state.segVideo = await makeSegmenter("VIDEO");
  return state.segVideo;
}

/* ============================ 底色识别 ============================ */

/* 与后端 extract_color_from_image 同一套逻辑：
 * 分割拿 mask → 取 mask 内像素中位数 RGB（中位数抗高光/阴影离群值）→ Lab 亮度 → 度数 */
export async function detectBaseLevel(imgEl) {
  await preload();
  const res = state.segImage.segment(imgEl);
  const cm = res.confidenceMasks[res.confidenceMasks.length - 1];
  const mask = cm.getAsFloat32Array();
  const mw = cm.width, mh = cm.height;

  const cv = document.createElement("canvas");
  cv.width = mw; cv.height = mh;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(imgEl, 0, 0, mw, mh);
  const px = ctx.getImageData(0, 0, mw, mh).data;

  const R = [], G = [], B = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] <= 0.6) continue;
    const j = i * 4;
    if (px[j] + px[j+1] + px[j+2] < 30) continue;   // 丢掉纯黑（阴影/边缘）
    R.push(px[j]); G.push(px[j+1]); B.push(px[j+2]);
  }
  cm.close(); res.close?.();

  const coverage = R.length / mask.length;
  if (R.length < 500) return { ok: false, coverage, reason: "没找到足够的头发区域，换一张光线均匀、露出头发的照片" };

  const med = a => { a.sort((x, y) => x - y); return a[a.length >> 1]; };
  const rgb = [med(R), med(G), med(B)];
  const lab = rgb2lab(rgb);
  return { ok: true, rgb, lab, level: levelFromL(lab[0]), coverage };
}
