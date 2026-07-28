import type {
  ArchiveDetailData,
  ArchiveSummary,
  HairColor,
  MockVideo,
  OtherProduct,
  PrimaryProduct,
  RouteType,
  TutorialStep,
} from './types';

interface TargetMeta {
  color: HairColor;
  alias: string;
  accent: string;
  filter: string;
  riskName: string;
}

export const TARGET_META: Record<string, TargetMeta> = {
  red: {
    alias: '海王红',
    accent: '#b95852',
    filter: 'hue-rotate(108deg) saturate(1.28) brightness(.92)',
    riskName: '偏橘红',
    color: {
      tone: 'red',
      level: 6,
      saturation: 'medium',
      display_name: '海王红',
      rgb: { r: 159, g: 55, b: 57 },
      hsv: { h: 359, s: 65, v: 62 },
      lab: { l: 38, a: 43, b: 22 },
      confidence: 0.94,
    },
  },
  orange: {
    alias: '元气橘',
    accent: '#d7854f',
    filter: 'hue-rotate(153deg) saturate(1.22) brightness(1.02)',
    riskName: '偏黄橘',
    color: {
      tone: 'orange',
      level: 8,
      saturation: 'medium',
      display_name: '元气橘',
      rgb: { r: 215, g: 118, b: 56 },
      hsv: { h: 23, s: 74, v: 84 },
      lab: { l: 61, a: 34, b: 49 },
      confidence: 0.91,
    },
  },
  blue: {
    alias: '海盐蓝',
    accent: '#5887a2',
    filter: 'hue-rotate(-35deg) saturate(1.12) contrast(1.03)',
    riskName: '偏青绿',
    color: {
      tone: 'blue',
      level: 8,
      saturation: 'medium',
      display_name: '海盐蓝',
      rgb: { r: 74, g: 113, b: 148 },
      hsv: { h: 208, s: 50, v: 58 },
      lab: { l: 46, a: -3, b: -24 },
      confidence: 0.93,
    },
  },
  purple: {
    alias: '葡萄紫',
    accent: '#79688d',
    filter: 'hue-rotate(36deg) saturate(1.18) brightness(.94)',
    riskName: '偏莓红',
    color: {
      tone: 'purple',
      level: 7,
      saturation: 'medium',
      display_name: '葡萄紫',
      rgb: { r: 111, g: 79, b: 127 },
      hsv: { h: 280, s: 38, v: 50 },
      lab: { l: 38, a: 23, b: -21 },
      confidence: 0.92,
    },
  },
  green: {
    alias: '苔藓绿',
    accent: '#66836d',
    filter: 'hue-rotate(-76deg) saturate(.88) brightness(.9)',
    riskName: '偏黄绿',
    color: {
      tone: 'green',
      level: 7,
      saturation: 'light',
      display_name: '苔藓绿',
      rgb: { r: 83, g: 116, b: 88 },
      hsv: { h: 129, s: 28, v: 45 },
      lab: { l: 45, a: -18, b: 12 },
      confidence: 0.9,
    },
  },
  brown: {
    alias: '榛果灰棕',
    accent: '#856b5c',
    filter: 'sepia(.38) saturate(.68) brightness(.82) contrast(1.08)',
    riskName: '偏暖棕',
    color: {
      tone: 'ash_brown',
      level: 6,
      saturation: 'light',
      display_name: '榛果灰棕',
      rgb: { r: 112, g: 89, b: 78 },
      hsv: { h: 19, s: 30, v: 44 },
      lab: { l: 39, a: 8, b: 10 },
      confidence: 0.95,
    },
  },
};

const presetVideos = [
  ['purple_tutorial', '紫色固色教程', 'purple', 'purple-tutorial.mp4', 'purple.jpg'],
  ['purple_transition', '葡萄紫颜值转场', 'purple', 'purple-transition.mp4', 'purple.jpg'],
  ['brown_tutorial', '冷棕长发染发教程', 'brown', 'cool-brown-tutorial.mp4', 'cool-brown.jpg'],
  ['pink_tutorial', '灰粉色固色教程', 'purple', 'pink-tutorial.mp4', 'pink.jpg'],
  ['tea_tutorial', '冷茶短发染发教程', 'brown', 'cool-tea-tutorial.mp4', 'cool-tea.jpg'],
  ['red_tutorial', '海王红染发教程', 'red', 'red-tutorial.mp4', 'red.jpg'],
  ['red_transition', '海王红颜值转场', 'red', 'red-transition.mp4', 'red.jpg'],
  ['blue_tutorial', '海盐蓝染发教程', 'blue', 'blue-tutorial.mp4', 'blue.jpg'],
  ['blue_transition', '海盐蓝颜值转场', 'blue', 'blue-transition.mp4', 'blue.jpg'],
] as const;

export const MOCK_VIDEOS: MockVideo[] = presetVideos.map(
  ([id, title, tone, video, cover]) => {
    const meta = TARGET_META[tone];
    return {
      video_id: `vid_${tone}_${id}`,
      title,
      video_type: 'dye_related',
      url: `/mock-videos/${video}`,
      cover_url: `/mock-videos/${cover}`,
      target_frame_url: `/mock-videos/${cover}`,
      trigger_time_ms: 2200,
      color_name:
        id === 'pink_tutorial' ? '灰粉色' : id === 'tea_tutorial' ? '冷茶棕' : meta.color.display_name,
      color_alias:
        id === 'pink_tutorial' ? '灰粉色' : id === 'tea_tutorial' ? '冷茶棕' : meta.alias,
      accent: meta.accent,
      bound_product_id: `prod_${tone}_same`,
      bound_tutorial_video_id: id.includes('tutorial') ? id : undefined,
    };
  },
);

export const EDITABLE_OPTIONS = {
  hair_length: [
    { value: 'ear', label: '齐耳短发' },
    { value: 'shoulder', label: '齐肩发' },
    { value: 'chest', label: '齐胸中长发' },
    { value: 'waist', label: '齐腰长发' },
    { value: 'below_waist', label: '腰部以下超长发' },
  ],
  hair_volume: [
    { value: 'low', label: '少' },
    { value: 'medium', label: '适中' },
    { value: 'high', label: '多' },
  ],
  dye_history: [
    { value: 'natural', label: '无漂染史的自然发' },
    { value: 'dyed_no_bleach', label: '染过未漂过' },
    { value: 'bleached_1_2', label: '漂过 1–2 次' },
    { value: 'bleached_3_plus', label: '漂过 3 次以上' },
    { value: 'dyed_black', label: '染过黑色' },
    { value: 'unknown', label: '不确定' },
  ],
};

export const CURRENT_GOLD: HairColor = {
  tone: 'yellow',
  level: 8,
  saturation: 'medium',
  display_name: '8 度暖金',
  rgb: { r: 205, g: 166, b: 96 },
  hsv: { h: 39, s: 53, v: 80 },
  lab: { l: 70, a: 7, b: 42 },
  confidence: 0.76,
};

export const CURRENT_COLOR_OPTIONS: HairColor[] = [
  {
    tone: 'yellow',
    level: 8,
    saturation: 'medium',
    display_name: '8 度暖金',
  },
  {
    tone: 'yellow_orange',
    level: 7,
    saturation: 'medium',
    display_name: '7 度橘金',
  },
  {
    tone: 'yellow',
    level: 9,
    saturation: 'light',
    display_name: '9 度浅金',
  },
];

interface ProductSeed {
  sku: string;
  route: RouteType;
  brand: string;
  name: string;
  shade: string;
  unitPrice: number;
  color: string;
  suitable: string;
  risk: string;
  duration: string;
  method: string;
  wait: number;
  units?: number;
  same?: boolean;
  baseEffect: string;
}

const productSeeds: ProductSeed[] = [
  {
    sku: 'sku_yisiyun_dye',
    route: 'dye',
    brand: '忆丝芸',
    name: '低氨染发膏',
    shade: '榛果灰棕',
    unitPrice: 39,
    color: '#725d51',
    suitable: '有 3、6、9 度底色效果参考，当前发长两支即可覆盖。',
    risk: '布丁头需要分区控制时间，深色发根会比发尾更深。',
    duration: '约维持 5–7 周',
    method: '干发分区涂抹',
    wait: 30,
    units: 2,
    same: true,
    baseEffect: '官方提供 3、6、9 度底色效果图',
  },
  {
    sku: 'sku_zhanghua_brown',
    route: 'dye',
    brand: '章华',
    name: '生态焗油染发霜',
    shade: '冷雾棕',
    unitPrice: 52,
    color: '#6b5147',
    suitable: '预算友好、容量充足，适合想要自然过渡的人。',
    risk: '灰感比目标弱，发尾可能保留暖调。',
    duration: '约维持 4–6 周',
    method: '双剂混合后分区涂抹',
    wait: 30,
    units: 2,
    baseEffect: '适合 4–8 度棕黄底色',
  },
  {
    sku: 'sku_loreal_cool',
    route: 'dye',
    brand: 'L’Oréal Paris',
    name: '卓韵霜',
    shade: '冷茶棕',
    unitPrice: 109,
    color: '#716158',
    suitable: '根尾均匀度更稳，配套染后护理完整。',
    risk: '发根仍需先上色，两盒总价较高。',
    duration: '约维持 6–8 周',
    method: '先发根后发尾',
    wait: 35,
    units: 2,
    baseEffect: '自然黑至 7 度底色均有参考',
  },
  {
    sku: 'sku_schwarzkopf_mist',
    route: 'dye',
    brand: 'Schwarzkopf',
    name: '怡然染发霜',
    shade: '雾茶棕',
    unitPrice: 128,
    color: '#6f5f55',
    suitable: '对深浅不一的底色更包容，染后光泽度较好。',
    risk: '灰调在深发根不明显，气味存在感较强。',
    duration: '约维持 6–8 周',
    method: '根尾分区上色',
    wait: 35,
    units: 2,
    baseEffect: '适合 3–8 度底色',
  },
  {
    sku: 'sku_liese_soft',
    route: 'dye',
    brand: 'Kao Liese',
    name: '泡沫染发剂',
    shade: '软雾棕',
    unitPrice: 139,
    color: '#78675d',
    suitable: '新手更容易覆盖全头，长发操作速度快。',
    risk: '泡沫较难精准控制根尾停留时间。',
    duration: '约维持 5–7 周',
    method: '充分起泡后覆盖',
    wait: 30,
    units: 2,
    baseEffect: '适合自然黑至中浅棕底色',
  },
  {
    sku: 'sku_wella_hazel',
    route: 'dye',
    brand: 'Wella',
    name: 'Illumina Color',
    shade: 'Cool Hazel',
    unitPrice: 218,
    color: '#66574f',
    suitable: '灰棕层次和光泽更细腻，色号体系清楚。',
    risk: '需要单独购买氧化剂，家庭操作门槛较高。',
    duration: '约维持 7–9 周',
    method: '按官方比例调配',
    wait: 35,
    units: 2,
    baseEffect: '官方专业色板覆盖 3–10 度底色',
  },
  {
    sku: 'sku_yisiyun_mask',
    route: 'color_deposit',
    brand: '忆丝芸',
    name: '高显色固色发膜',
    shade: '雾感蓝',
    unitPrice: 49,
    color: '#527894',
    suitable: '8 度金色底发可直接显色，可用护发素调整深浅。',
    risk: '黄色底色叠加蓝色可能偏青，深发根几乎不显色。',
    duration: '约维持 2–3 周',
    method: '干发厚涂',
    wait: 18,
    units: 2,
    same: true,
    baseEffect: '官方展示 6、8、9 度底色实染结果',
  },
  {
    sku: 'sku_colormask_blue',
    route: 'color_deposit',
    brand: 'Schwarzkopf',
    name: 'Color Mask',
    shade: 'Cool Blue',
    unitPrice: 118,
    color: '#506f83',
    suitable: '护理感更好，冲洗后发尾不容易干涩。',
    risk: '显色没有主推荐浓，金底上仍可能出现青感。',
    duration: '约维持 2–3 周',
    method: '洗后擦干再涂抹',
    wait: 10,
    units: 2,
    baseEffect: '建议用于 7 度以上浅色底发',
  },
  {
    sku: 'sku_ui_blue',
    route: 'color_deposit',
    brand: 'UI Color',
    name: '专业固色发膜',
    shade: '深海蓝',
    unitPrice: 96,
    color: '#365e75',
    suitable: '当前金色底发显色稳定，颜色浓度和用量更好控制。',
    risk: '第一次上色可能比目标深，浅色衣物容易被沾染。',
    duration: '约维持 3–4 周',
    method: '直接涂抹或混合护发素',
    wait: 15,
    units: 2,
    baseEffect: '适合 7–10 度浅底色',
  },
  {
    sku: 'sku_maria_blue',
    route: 'color_deposit',
    brand: 'Maria Nila',
    name: 'Colour Refresh',
    shade: 'Vivid Violet Blue',
    unitPrice: 228,
    color: '#4f6281',
    suitable: '护理感和顺滑度最好，大容量一瓶基本够用。',
    risk: '蓝紫感可能比目标明显，价格较高。',
    duration: '约维持 2–3 周',
    method: '洗发后擦干涂抹',
    wait: 10,
    units: 1,
    baseEffect: '建议用于 8 度以上浅色底发',
  },
  {
    sku: 'sku_davines_marine',
    route: 'color_deposit',
    brand: 'Davines',
    name: 'Alchemic Conditioner',
    shade: 'Marine Blue',
    unitPrice: 268,
    color: '#526d78',
    suitable: '对受损发尾更友好，日常补色方便。',
    risk: '显色偏柔和，不适合追求高饱和效果。',
    duration: '约维持 2 周',
    method: '洗后发涂抹',
    wait: 8,
    units: 1,
    baseEffect: '适合 8–10 度浅色底发',
  },
  {
    sku: 'sku_overtone_blue',
    route: 'color_deposit',
    brand: 'Overtone',
    name: 'Coloring Conditioner',
    shade: 'Blue for Brown Hair',
    unitPrice: 319,
    color: '#395a72',
    suitable: '深色区域也能留下冷调，颜色维持时间较长。',
    risk: '总体效果偏深，可能弱化目标色的轻透感。',
    duration: '约维持 3–4 周',
    method: '干发饱和涂抹',
    wait: 15,
    units: 1,
    baseEffect: '适合 5–8 度棕色或浅色底发',
  },
];

function productImage(index: number) {
  const images = [
    '/mock-videos/cool-brown.jpg',
    '/mock-videos/cool-tea.jpg',
    '/mock-videos/red.jpg',
    '/mock-videos/purple.jpg',
    '/mock-videos/pink.jpg',
    '/mock-videos/blue.jpg',
  ];
  return images[index % images.length];
}

function toPrimary(seed: ProductSeed, index: number): PrimaryProduct {
  const units = seed.units ?? 2;
  return {
    sku_id: seed.sku,
    brand: seed.brand,
    product_name: seed.name,
    shade_name: seed.shade,
    product_type: seed.route,
    badge: seed.same ? '视频同款商品' : undefined,
    is_video_same_product: Boolean(seed.same),
    url: productImage(index),
    suitable_reason: seed.suitable,
    possible_risk: seed.risk,
    usage: {
      units_needed: units,
      units_label: `建议购买 ${units} ${units === 1 ? '盒' : '盒'}`,
      method: seed.method,
      waiting_minutes: seed.wait,
      short_instruction: `${seed.method}，均匀覆盖后停留约 ${seed.wait} 分钟。`,
      difficulty: Math.max(1, Math.min(5, Math.ceil((seed.wait + 35) / 20))),
      hair_state: seed.method.includes('湿发') ? 'wet' : 'dry',
      key_steps: ['皮试准备', '头发分区', '均匀涂抹', `等待${seed.wait}分钟`, '冲洗护理'],
      image_urls: [],
    },
    price: {
      unit_price: seed.unitPrice,
      total_price: seed.unitPrice * units,
      currency: 'CNY',
      collected_at: '2026-07-25',
    },
    purchase_url: `https://example.com/products/${seed.sku}`,
    purchase_mode: 'mock',
    duration: seed.duration,
    official_base_effect: seed.baseEffect,
  };
}

function toOther(seed: ProductSeed, index: number): OtherProduct {
  const primary = toPrimary(seed, index);
  return {
    sku_id: primary.sku_id,
    brand: primary.brand,
    product_name: primary.product_name,
    shade_name: primary.shade_name,
    product_type: primary.product_type,
    is_video_same_product: primary.is_video_same_product,
    url: primary.url,
    card_reason: primary.suitable_reason,
    possible_risk: primary.possible_risk,
    units_needed: primary.usage.units_needed,
    units_label: primary.usage.units_label,
    unit_price: primary.price.unit_price,
    total_price: primary.price.total_price,
    currency: primary.price.currency,
    purchase_url: primary.purchase_url,
    purchase_mode: primary.purchase_mode,
    duration: primary.duration,
    official_base_effect: primary.official_base_effect,
  };
}

export function productsForRoute(route: RouteType) {
  return productSeeds
    .filter((seed) => seed.route === route)
    .map((seed, index) => ({
      primary: toPrimary(seed, index),
      other: toOther(seed, index),
      swatch: seed.color,
    }));
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    step_id: 'step_01',
    step_no: 1,
    total_steps: 5,
    start_time_ms: 110400,
    end_time_ms: 119700,
    title: '准备与分区',
    description: '把商品、手套和工具放到手边，再将头发分成四个区域。',
    points: ['戴好手套和围布', '发际线周围薄涂隔离霜', '用发夹固定四个区域'],
    caution: '开始后不要临时离开，先确认全部用具齐全。',
  },
  {
    step_id: 'step_02',
    step_no: 2,
    total_steps: 5,
    start_time_ms: 119700,
    end_time_ms: 129400,
    title: '按商品说明调配',
    description: '只采用当前商品说明中的比例，混合到颜色和质地均匀。',
    points: ['使用非金属容器', '严格按说明配比', '调配完成后立即开始使用'],
    caution: '不同品牌的比例不能互相套用。',
  },
  {
    step_id: 'step_03',
    step_no: 3,
    total_steps: 5,
    start_time_ms: 129400,
    end_time_ms: 140400,
    title: '从深色区域开始上色',
    description: '布丁头先处理更深的发根，再逐缕覆盖发中和发尾。',
    points: ['每次取一小缕头发', '保证每一面都有产品', '请同伴检查后脑区域'],
  },
  {
    step_id: 'step_04',
    step_no: 4,
    total_steps: 5,
    start_time_ms: 140400,
    end_time_ms: 147900,
    title: '等待显色',
    description: '完成覆盖后按商品说明等待，让颜色稳定附着。',
    points: ['不要额外加热', '避免产品接触眼睛', '明显刺痛时立即冲洗'],
    caution: '演示倒计时缩短为 15 秒，实际请以商品说明为准。',
    wait_seconds: 15,
  },
  {
    step_id: 'step_05',
    step_no: 5,
    total_steps: 5,
    start_time_ms: 147900,
    end_time_ms: 168100,
    title: '冲洗与染后护理',
    description: '冲洗到水基本清澈，再使用配套护理完成锁色。',
    points: ['使用偏凉的水冲洗', '第一次不要使用强清洁洗发水', '吹干后检查根尾颜色'],
    caution: '前 48 小时尽量减少洗头。',
  },
];

export const EMPTY_ARCHIVE_DETAIL: ArchiveDetailData = {
  archive_id: '',
  created_at: '',
  purchase_status: 'saved',
  entry_video_id: '',
  profile_snapshot: {
    current_hair: { region_mode: 'single', color: CURRENT_GOLD },
    target_color: TARGET_META.blue.color,
    hair_length: 'chest',
    hair_volume: 'medium',
    dye_history: 'dyed_no_bleach',
  },
  plan_snapshot: {
    plan_id: '',
    feasibility: 'conditional',
    summary: '',
    reachability_score: 0,
    selected_route: 'dye',
    selected_preview_level: 3,
    default_preview_level: 3,
    risks: [],
  },
  product_snapshot: {
    ...toPrimary(productSeeds[0], 0),
    recommendation_id: '',
  },
  tutorial_video_id: 'tutorial_001',
  tutorial_available: true,
  after_video_url: null,
};

export function toArchiveSummary(detail: ArchiveDetailData): ArchiveSummary {
  const currentColor =
    detail.profile_snapshot.current_hair.color?.display_name ??
    detail.profile_snapshot.current_hair.regions?.end.color.display_name ??
    '待确认';
  return {
    archive_id: detail.archive_id,
    target_color_name: detail.profile_snapshot.target_color.display_name,
    current_color_name: currentColor,
    product_name: `${detail.product_snapshot.brand}${detail.product_snapshot.product_name}`,
    shade_name: detail.product_snapshot.shade_name,
    purchase_status: detail.purchase_status,
    created_at: detail.created_at,
    tutorial_available: detail.tutorial_available,
    status: detail.completion_record
      ? 'completed'
      : detail.purchase_status === 'saved'
        ? 'saved'
        : 'ready',
  };
}
