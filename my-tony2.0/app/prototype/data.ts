export type TargetId = 'red' | 'orange' | 'blue' | 'purple' | 'green' | 'brown';
export type RouteType = 'dye' | 'toning';
export type PriceTier = 'low' | 'mid' | 'high';

export interface TargetColor {
  id: TargetId;
  label: string;
  shortLabel: string;
  visualLevel: number;
  videoSrc: string;
  accent: string;
  deepAccent: string;
  filter: string;
  videoFilter: string;
  riskColor: string;
  riskName: string;
  hook: string;
}

export interface Product {
  id: string;
  route: RouteType;
  tier: PriceTier;
  brand: string;
  name: string;
  shade: string;
  price: number;
  quantity: number;
  size: string;
  score: number;
  duration: string;
  difficulty: string;
  color: string;
  pros: string[];
  cons: string[];
  usage: string;
}

export interface TutorialChapter {
  id: number;
  title: string;
  summary: string;
  points: string[];
  tip?: string;
  start: number;
  end: number;
  frame: string;
  timerSeconds?: number;
}

export const TARGETS: TargetColor[] = [
  {
    id: 'red',
    label: '海王红',
    shortLabel: '红发',
    visualLevel: 6,
    videoSrc: '/video-uploads/a2431c5c23e6/video.mp4',
    accent: '#B95752',
    deepAccent: '#763536',
    filter: 'hue-rotate(115deg) saturate(1.35) brightness(.88)',
    videoFilter: 'hue-rotate(65deg) saturate(1.35) brightness(.9)',
    riskColor: '#A64C37',
    riskName: '偏橘红',
    hook: '显白又有存在感的浓郁红',
  },
  {
    id: 'orange',
    label: '元气橘',
    shortLabel: '橙发',
    visualLevel: 8,
    videoSrc: '/video-uploads/a2431c5c23e6/video.mp4',
    accent: '#DD844D',
    deepAccent: '#95502E',
    filter: 'hue-rotate(155deg) saturate(1.25) brightness(1.05)',
    videoFilter: 'hue-rotate(105deg) saturate(1.25) brightness(1.02)',
    riskColor: '#C89042',
    riskName: '偏黄橘',
    hook: '阳光下很通透的活力橘',
  },
  {
    id: 'blue',
    label: '海盐蓝',
    shortLabel: '蓝发',
    visualLevel: 8,
    videoSrc: '/video-uploads/a2431c5c23e6/video.mp4',
    accent: '#568AA8',
    deepAccent: '#31576F',
    filter: 'saturate(1.08) contrast(1.03)',
    videoFilter: 'hue-rotate(-38deg) saturate(1.08) contrast(1.03)',
    riskColor: '#4D8D7A',
    riskName: '偏青绿',
    hook: '清冷但不荧光的雾感蓝',
  },
  {
    id: 'purple',
    label: '葡萄紫',
    shortLabel: '紫发',
    visualLevel: 7,
    videoSrc: '/video-uploads/a2431c5c23e6/video.mp4',
    accent: '#7A668E',
    deepAccent: '#4E3C62',
    filter: 'hue-rotate(38deg) saturate(1.2) brightness(.96)',
    videoFilter: 'saturate(1.15) brightness(.96)',
    riskColor: '#8A5D72',
    riskName: '偏莓红',
    hook: '衔接黑发根也自然的深葡萄紫',
  },
  {
    id: 'green',
    label: '苔藓绿',
    shortLabel: '绿发',
    visualLevel: 7,
    videoSrc: '/video-uploads/a2431c5c23e6/video.mp4',
    accent: '#66856D',
    deepAccent: '#3E5945',
    filter: 'hue-rotate(-78deg) saturate(.9) brightness(.88)',
    videoFilter: 'hue-rotate(148deg) saturate(.82) brightness(.86)',
    riskColor: '#77854C',
    riskName: '偏黄绿',
    hook: '低饱和、日常也能驾驭的绿',
  },
  {
    id: 'brown',
    label: '榛果灰棕',
    shortLabel: '棕发',
    visualLevel: 6,
    videoSrc: '/video-uploads/a2431c5c23e6/video.mp4',
    accent: '#8B6C5A',
    deepAccent: '#5B4135',
    filter: 'sepia(.35) saturate(.62) brightness(.78) contrast(1.08)',
    videoFilter: 'sepia(.55) saturate(.55) brightness(.72) contrast(1.08)',
    riskColor: '#A06F52',
    riskName: '偏暖棕',
    hook: '不挑肤色的温柔低调灰棕',
  },
];

const toningBase: Omit<Product, 'id' | 'route'>[] = [
  { tier: 'low', brand: '忆丝芸', name: '高显色固色发膜', shade: '雾感蓝', price: 49, quantity: 2, size: '200 ml', score: 91, duration: '约2–3周', difficulty: '简单', color: '#4F7592', pros: ['对8度金色底发显色直接', '深浅可用护发素调整'], cons: ['黄色底色上可能偏青', '手套和护具不能省'], usage: '干发分区涂抹，停留15–20分钟' },
  { tier: 'low', brand: '卡乐梦', name: '彩色护理发膜', shade: '海盐蓝', price: 58, quantity: 2, size: '220 ml', score: 84, duration: '约10–15天', difficulty: '简单', color: '#678CA0', pros: ['质地容易涂匀', '预算内用量充足'], cons: ['鲜艳度下降较快', '发根深色区域不明显'], usage: '湿发擦至不滴水后均匀涂抹' },
  { tier: 'low', brand: 'DYE LAB', name: '半永久固色泥', shade: '冷湖蓝', price: 69, quantity: 2, size: '180 ml', score: 82, duration: '约2周', difficulty: '中等', color: '#487D8F', pros: ['冷色感明显', '适合局部补色'], cons: ['膏体较厚', '超长发不容易涂匀'], usage: '少量多次梳开，停留20分钟' },
  { tier: 'mid', brand: 'UI Color', name: '专业固色发膜', shade: '深海蓝', price: 96, quantity: 2, size: '250 ml', score: 96, duration: '约3–4周', difficulty: '简单', color: '#365E75', pros: ['最适合当前金色底发', '颜色浓度和用量更稳'], cons: ['初次上色会比目标更深', '浅色衣物容易被染色'], usage: '直接涂抹或按1:3加入护发素' },
  { tier: 'mid', brand: 'Schwarzkopf', name: 'Color Mask', shade: 'Cool Blue', price: 118, quantity: 2, size: '200 ml', score: 89, duration: '约2–3周', difficulty: '简单', color: '#4D6E82', pros: ['护理感更好', '冲洗后不容易干涩'], cons: ['显色没有推荐款浓', '单次总价稍高'], usage: '洗后毛巾擦干，均匀涂抹10分钟' },
  { tier: 'mid', brand: 'Colorista', name: 'Washout 护色膏', shade: 'Denim Blue', price: 129, quantity: 2, size: '150 ml', score: 86, duration: '约8–12次洗发', difficulty: '中等', color: '#55728C', pros: ['掉色路径相对柔和', '适合想频繁换色'], cons: ['齐胸发需要两盒', '单位容量价格高'], usage: '干发厚涂，停留20–30分钟' },
  { tier: 'high', brand: 'Maria Nila', name: 'Colour Refresh', shade: 'Vivid Violet Blue', price: 228, quantity: 1, size: '300 ml', score: 92, duration: '约2–3周', difficulty: '简单', color: '#4F6281', pros: ['护理感和顺滑度最好', '大容量一瓶基本够用'], cons: ['价格较高', '蓝紫感可能强于目标'], usage: '洗发后擦干，涂抹10分钟' },
  { tier: 'high', brand: 'Davines', name: 'Alchemic Conditioner', shade: 'Marine Blue', price: 268, quantity: 1, size: '250 ml', score: 87, duration: '约2周', difficulty: '简单', color: '#526D78', pros: ['发尾受损区更友好', '日常补色方便'], cons: ['显色偏柔和', '不适合追求高饱和'], usage: '洗后发涂抹5–8分钟，可重复补色' },
  { tier: 'high', brand: 'Overtone', name: 'Coloring Conditioner', shade: 'Blue for Brown Hair', price: 319, quantity: 1, size: '236 ml', score: 85, duration: '约3–4周', difficulty: '简单', color: '#385A72', pros: ['深色区域也能留下冷调', '维持时间较长'], cons: ['总体颜色偏深', '超出多数体验预算'], usage: '干发饱和涂抹，停留15分钟' },
];

const dyeBase: Omit<Product, 'id' | 'route'>[] = [
  { tier: 'low', brand: '忆丝芸', name: '低氨染发膏', shade: '榛果灰棕', price: 39, quantity: 2, size: '100 ml', score: 90, duration: '约5–7周', difficulty: '中等', color: '#6C554A', pros: ['有3、6、9度底色效果参考', '当前发长两支即可'], cons: ['布丁头需要分区控制时间', '深发根会比发尾更深'], usage: '根尾分区上色，按说明调配氧化剂' },
  { tier: 'low', brand: '章华', name: '生态焗油染发霜', shade: '自然棕', price: 52, quantity: 2, size: '140 ml', score: 80, duration: '约4–6周', difficulty: '简单', color: '#6B5041', pros: ['预算低、容量足', '暖棕显色稳定'], cons: ['灰感不强', '更接近自然棕'], usage: '按1:1调配后全头均匀涂抹' },
  { tier: 'low', brand: '温雅', name: '植物染发焗油', shade: '栗棕色', price: 68, quantity: 2, size: '120 ml', score: 78, duration: '约4–6周', difficulty: '简单', color: '#74513F', pros: ['操作步骤少', '自然发底色接受度高'], cons: ['目标灰感会减弱', '发尾可能偏暖'], usage: '混合双剂后分区涂抹30分钟' },
  { tier: 'mid', brand: 'L’Oréal Paris', name: '卓韵霜', shade: '冷茶棕', price: 109, quantity: 2, size: '172 ml', score: 95, duration: '约6–8周', difficulty: '中等', color: '#6E5B50', pros: ['整体均匀度最稳', '附带染后护理'], cons: ['布丁头仍需先涂发根', '两盒总价进入中档'], usage: '先处理深色发根，再带到发尾' },
  { tier: 'mid', brand: 'Schwarzkopf', name: '怡然染发霜', shade: '雾茶棕', price: 128, quantity: 2, size: '180 ml', score: 91, duration: '约6–8周', difficulty: '中等', color: '#715E53', pros: ['对深浅不一底色更包容', '染后光泽度较好'], cons: ['灰调在深发根不明显', '气味存在感较强'], usage: '发根停留后再均匀带至发尾' },
  { tier: 'mid', brand: 'Kao Liese', name: '泡沫染发剂', shade: '软雾棕', price: 139, quantity: 2, size: '108 ml', score: 85, duration: '约5–7周', difficulty: '简单', color: '#766257', pros: ['新手更容易覆盖全头', '长发操作速度快'], cons: ['精准控制根尾时间较难', '布丁头均匀度一般'], usage: '充分起泡后从深色区域开始覆盖' },
  { tier: 'high', brand: 'Wella', name: 'Illumina Color', shade: 'Cool Hazel', price: 218, quantity: 2, size: '60 ml', score: 93, duration: '约7–9周', difficulty: '专业', color: '#67574F', pros: ['灰棕层次和光泽更细腻', '色号体系清晰'], cons: ['需要单独购买氧化剂', '调配和分区要求高'], usage: '严格按官方比例调配，建议两人协作' },
  { tier: 'high', brand: 'Goldwell', name: 'Topchic', shade: 'Ash Brown', price: 259, quantity: 2, size: '60 ml', score: 89, duration: '约7–9周', difficulty: '专业', color: '#62554F', pros: ['冷棕控制力较好', '颜色维持稳定'], cons: ['家庭操作门槛高', '总成本高'], usage: '按色号说明选择双氧并分区涂抹' },
  { tier: 'high', brand: 'Shiseido Professional', name: 'Primience', shade: 'Beige Ash', price: 329, quantity: 2, size: '80 g', score: 88, duration: '约6–8周', difficulty: '专业', color: '#75665D', pros: ['色泽柔和、发尾质感好', '灰感自然不发闷'], cons: ['超出多数预算', '建议由有经验者操作'], usage: '精确称量后分区涂抹并观察显色' },
];

export const PRODUCTS: Product[] = [
  ...toningBase.map((item, index) => ({ ...item, id: `toning-${index + 1}`, route: 'toning' as const })),
  ...dyeBase.map((item, index) => ({ ...item, id: `dye-${index + 1}`, route: 'dye' as const })),
];

export const TONING_CHAPTERS: TutorialChapter[] = [
  { id: 1, title: '准备固色发膜与护具', summary: '先把会用到的东西一次放到手边。', points: ['戴好手套和披肩', '准备发夹、梳子和计时器', '在发际线周围薄涂隔离霜'], tip: '蓝、红、紫等颜色容易沾染浅色衣物。', start: 110.4, end: 119.7, frame: '/video-mock/frames/step-1-2.jpg' },
  { id: 2, title: '调出想要的颜色深浅', summary: '先做一小碗，再根据目标鲜艳度调整。', points: ['推荐款可直接使用', '想更浅可按1:3加入护发素', '充分搅匀至没有色块'], tip: '这一步决定最终鲜艳度，宁可先浅再补。', start: 119.7, end: 129.4, frame: '/video-mock/frames/step-2-2.jpg' },
  { id: 3, title: '分区后逐缕涂抹', summary: '从后脑开始，让每一缕都被发膜包裹。', points: ['以耳朵为线分成四区', '每次取一小缕头发', '用量宁多不少，避免花色'], start: 129.4, end: 140.4, frame: '/video-mock/frames/step-3-2.jpg' },
  { id: 4, title: '检查根尾衔接与漏色', summary: '重点检查发根交界和后脑看不到的位置。', points: ['揉匀发根与发尾交界', '请同伴检查后脑', '干燥区域补足产品'], tip: '黑色发根不会变蓝，重点是让交界自然。', start: 140.4, end: 144.5, frame: '/video-mock/frames/step-4-1.jpg' },
  { id: 5, title: '停留15分钟', summary: '让色素充分附着，时间到后再冲洗。', points: ['盘起头发避免摩擦衣物', '不要额外加热', '时间到后用凉水冲洗'], start: 144.5, end: 147.9, frame: '/video-mock/frames/step-5-1.jpg', timerSeconds: 15 * 60 },
  { id: 6, title: '冲洗并完成锁色', summary: '冲洗到水基本清澈，再完成护理。', points: ['使用偏凉的水冲洗', '第一次不要用强清洁洗发水', '后续用固色洗发水延缓掉色'], tip: '前48小时尽量减少洗头。', start: 147.9, end: 168.1, frame: '/video-mock/frames/step-6-3.jpg' },
];

export const DYE_CHAPTERS: TutorialChapter[] = [
  { id: 1, title: '准备染膏与护具', summary: '确认色号、数量和全部工具齐全。', points: ['戴手套和披肩', '准备非金属碗与染发刷', '发际线薄涂隔离霜'], start: 110.4, end: 119.7, frame: '/video-mock/frames/step-1-2.jpg' },
  { id: 2, title: '按商品说明完成调配', summary: '严格使用选定商品给出的比例。', points: ['挤出两剂并精确配比', '搅匀到颜色和质地一致', '调配后立即开始使用'], tip: '不同产品比例不同，不要套用其他品牌经验。', start: 119.7, end: 129.4, frame: '/video-mock/frames/step-2-2.jpg' },
  { id: 3, title: '先处理深色发根', summary: '布丁头先从颜色更深的位置开始。', points: ['头发分成四区', '距离头皮约1厘米开始涂', '每缕完全覆盖染膏'], start: 129.4, end: 140.4, frame: '/video-mock/frames/step-3-2.jpg' },
  { id: 4, title: '带到发尾并检查', summary: '发根显色后再将产品带到较浅发尾。', points: ['减少发尾停留时间', '检查后脑和耳后', '轻轻梳开保证均匀'], start: 140.4, end: 144.5, frame: '/video-mock/frames/step-4-1.jpg' },
  { id: 5, title: '按说明等待显色', summary: '保持头发自然放置，并观察颜色变化。', points: ['不额外加热', '皮肤明显不适立即冲洗', '时间到后先乳化再冲洗'], start: 144.5, end: 147.9, frame: '/video-mock/frames/step-5-1.jpg', timerSeconds: 30 * 60 },
  { id: 6, title: '冲洗并完成染后护理', summary: '冲洗干净后使用配套护理。', points: ['冲洗到水基本清澈', '使用配套染后发膜', '吹干后检查根尾颜色'], start: 147.9, end: 168.1, frame: '/video-mock/frames/step-6-3.jpg' },
];

export const HISTORY_OPTIONS = ['无漂染史的自然发', '染过未漂过', '漂过1–2次', '漂过3次以上', '染过黑色', '不确定'];
export const LENGTH_OPTIONS = ['齐耳短发', '齐肩发', '齐胸中长发', '齐腰长发', '腰部以下超长发'];
export const VOLUME_OPTIONS = ['少', '适中', '多'];
