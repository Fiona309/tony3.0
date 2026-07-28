/**
 * 将旧版“小红书知识合集”迁移成可审计的 V3 决策知识库。
 *
 * 迁移原则：
 * - 社媒内容默认只是 evidence，不自动成为专业事实；
 * - 产品身份、价格、使用参数分开保存；
 * - 每条内容必须能追溯到 source-registry；
 * - 旧数据不删除，迁移结果可重复生成。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyDir = path.join(root, 'scripts', 'knowledge-base');
const outDir = path.join(root, 'knowledge-base');

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(legacyDir, name), 'utf8'));
const writeJson = (relativePath, value) => {
  const file = path.join(outDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const stableId = (prefix, input) => {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
};
const cleanUrl = (url = '') => {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    return parsed.toString();
  } catch {
    return url;
  }
};
const sourceType = (url) => url.includes('xiaohongshu.com') ? 'social_post'
  : url.includes('taobao.com') || url.includes('tmall.com') ? 'marketplace_listing'
    : 'unknown';
const riskTerms = /致癌|过敏|孕|头皮|灼热|刺痛|漂发|棉化|断裂|氨水|对苯二胺|PPD/i;

const legacyKnowledge = readJson('knowledge.json').all_items ?? [];
const legacyProducts = readJson('products.json').products ?? [];
const legacyTutorials = readJson('tutorials.json').tutorials ?? [];

const sourceMap = new Map();
function registerSource(url, title = '') {
  if (!url) return null;
  const canonicalUrl = cleanUrl(url);
  const id = stableId('src', canonicalUrl);
  if (!sourceMap.has(id)) {
    sourceMap.set(id, {
      id,
      url: canonicalUrl,
      title: title || null,
      source_type: sourceType(canonicalUrl),
      authority_level: sourceType(canonicalUrl) === 'social_post' ? 'community' : 'commercial',
      trust_tier: 'lead_only',
      verification_status: 'unverified',
      captured_at: null,
      last_reviewed_at: null,
    });
  }
  return id;
}

function registerProfessionalSource(url, title) {
  const id = registerSource(url, title);
  const source = sourceMap.get(id);
  Object.assign(source, {
    source_type: 'professional_brand_education',
    authority_level: 'manufacturer_education',
    trust_tier: 'reference',
    verification_status: 'verified_primary_source',
    last_reviewed_at: '2026-07-14',
  });
  return id;
}

const evidence = legacyKnowledge.map((item) => {
  const sourceId = registerSource(item.source_url, item.summary);
  const needsSafetyReview = riskTerms.test(`${item.summary} ${item.content} ${item.evidence}`);
  return {
    id: stableId('ev', `${sourceId}:${item.category}:${item.summary}`),
    evidence_type: 'community_claim',
    category: item.category,
    summary: item.summary,
    claim: item.content,
    quote: item.evidence,
    source_id: sourceId,
    applicability: [],
    confidence: 'low',
    review_status: needsSafetyReview ? 'safety_review_required' : 'needs_review',
    usable_for: ['user_language', 'case_lead', 'hypothesis'],
    prohibited_uses: needsSafetyReview
      ? ['medical_conclusion', 'universal_safety_rule', 'automatic_formula']
      : ['universal_rule', 'automatic_formula'],
  };
});

const productMap = new Map();
for (const product of legacyProducts) {
  const normalizedName = product.name.trim().toLocaleLowerCase('zh-CN');
  const id = stableId('prd', `${product.brand ?? ''}:${normalizedName}`);
  const mentionSourceIds = (product.mentions ?? [])
    .map((mention) => registerSource(mention.source_url, product.name))
    .filter(Boolean);
  const existing = productMap.get(id);
  if (existing) {
    existing.aliases = [...new Set([...existing.aliases, product.name])];
    existing.evidence_source_ids = [...new Set([...existing.evidence_source_ids, ...mentionSourceIds])];
    continue;
  }
  productMap.set(id, {
    id,
    canonical_name: product.name,
    aliases: [product.name],
    brand: product.brand && product.brand !== '未指明' ? product.brand : null,
    product_type: product.type ?? '其他',
    line: null,
    volume_ml: null,
    official_status: 'unverified',
    evidence_source_ids: mentionSourceIds,
  });
}

const prices = legacyProducts
  .filter((product) => product.taobao_price || product.taobao_url)
  .map((product) => {
    const productId = stableId('prd', `${product.brand ?? ''}:${product.name.trim().toLocaleLowerCase('zh-CN')}`);
    const sourceId = registerSource(product.taobao_url, product.taobao_title || product.name);
    const amount = Number.parseFloat(String(product.taobao_price ?? '').replace(/[^\d.]/g, ''));
    return {
      id: stableId('price', `${productId}:${sourceId}`),
      product_id: productId,
      amount_cny: Number.isFinite(amount) ? amount : null,
      listing_title: product.taobao_title ?? null,
      sales_text: product.taobao_sale ?? null,
      seller_type: 'unknown',
      source_id: sourceId,
      captured_at: readJson('products.json').updatedAt ?? null,
      status: 'historical_unverified',
    };
  });

const cases = legacyTutorials.map((tutorial) => {
  const sourceId = registerSource(tutorial.source_url, tutorial.title);
  const fields = {
    before_base: Boolean(tutorial.hair_type),
    history: false,
    products: (tutorial.products_used ?? []).length > 0,
    formula: (tutorial.steps ?? []).some((step) => /\d+\s*[:：]\s*\d+|毫升|ml/i.test(step.action)),
    process: (tutorial.steps ?? []).length > 0,
    result: Boolean(tutorial.result_desc),
  };
  const completeness = Object.values(fields).filter(Boolean).length / Object.keys(fields).length;
  return {
    id: stableId('case', `${sourceId}:${tutorial.title}`),
    title: tutorial.title,
    source_id: sourceId,
    before: { description: tutorial.hair_type ?? null, base_level: null, dye_history: null },
    method: tutorial.method ?? null,
    products_mentioned: tutorial.products_used ?? [],
    steps: tutorial.steps ?? [],
    tips: tutorial.tips ?? [],
    result: { description: tutorial.result_desc ?? null, canonical_color_id: null },
    completeness: { fields, score: Number(completeness.toFixed(2)) },
    review_status: completeness >= 0.8 ? 'needs_review' : 'incomplete',
    confidence: 'low',
  };
});

const wellaToneSource = registerProfessionalSource(
  'https://education.wella.com/pluginfile.php/285203/mod_resource/content/7/Color%20Touch%20Technical%20E%20Book%20%281%29.pdf',
  'Wella Color Touch Technical E-Book — shade numbering system',
);
const lorealToneSource = registerProfessionalSource(
  'https://us.lorealprofessionnel.com/pro-resources/-/media/project/loreal/brand-sites/lp/americas/us/shade-charts/diacolor_colorchart_2025_r2.pdf',
  'L’Oréal Professionnel Dia Color 2025 shade chart',
);
const schwarzkopfToneSource = registerProfessionalSource(
  'https://www.schwarzkopf-professional.com/us/en/color/igora/royal.html',
  'Schwarzkopf Professional IGORA ROYAL shade overview',
);
const taxonomySources = [wellaToneSource, lorealToneSource, schwarzkopfToneSource];

const wellaColorTouchSource = registerProfessionalSource(
  'https://education.wella.com/pluginfile.php/231352/mod_resource/content/4/Color%20Touch%20Technical%20E%20Book%20%281%29.pdf',
  'Wella Color Touch Technical E-Book — current technical guide',
);
const lorealMajirelSource = registerProfessionalSource(
  'https://us.lorealprofessionnel.com/-/media/project/loreal/brand-sites/lp/americas/us/hair-color/majirel/majirel-how-to-use.pdf',
  'L’Oréal Professionnel Majirel How To Use',
);
const lorealInoaSource = registerProfessionalSource(
  'https://us.lorealprofessionnel.com/pro-resources/-/media/project/loreal/brand-sites/lp/americas/us/french-blending/lpinoaapr03_frenchblending_techguide_desktop_r3-%281%29.pdf',
  'L’Oréal Professionnel iNOA French Blending Technical Guide',
);
const fdaHairDyeSource = registerProfessionalSource(
  'https://www.fda.gov/cosmetics/resources-consumers-cosmetics/cosmetics-safety-qa-hair-dyes',
  'FDA Cosmetics Safety Q&A: Hair Dyes',
);
Object.assign(sourceMap.get(fdaHairDyeSource), {
  source_type: 'government_safety_guidance',
  authority_level: 'regulator',
  trust_tier: 'authoritative',
});

const officialFactCandidates = [
  {
    id: 'fact_wella_color_touch_ratio', domain: 'product_usage', subject: 'Wella Color Touch',
    claim: 'Color Touch 与 Color Touch Emulsion 的官方调配比例为 1:2。',
    structured_value: { ratio: '1:2', developer: 'Color Touch Emulsion' },
    conditions: ['仅限 Wella Color Touch 产品线'], source_id: wellaColorTouchSource,
  },
  {
    id: 'fact_wella_color_touch_time', domain: 'product_usage', subject: 'Wella Color Touch',
    claim: 'Color Touch 官方技术指南列出的标准作用时间为 20 分钟。',
    structured_value: { processing_minutes: 20 },
    conditions: ['仅限 Wella Color Touch 产品线', '具体操作仍以当地包装说明为准'], source_id: wellaColorTouchSource,
  },
  {
    id: 'fact_wella_color_touch_emulsion', domain: 'product_usage', subject: 'Wella Color Touch',
    claim: 'Color Touch 官方指南指定搭配 1.9% 或 4% Color Touch Emulsion。',
    structured_value: { developer_percent_options: [1.9, 4] },
    conditions: ['仅限 Wella Color Touch 产品线'], source_id: wellaColorTouchSource,
  },
  {
    id: 'fact_loreal_majirel_ratio', domain: 'product_usage', subject: 'L’Oréal Professionnel Majirel',
    claim: 'Majirel 常规系列的官方调配比例为 1:1.5。',
    structured_value: { ratio: '1:1.5', color_oz: 2, developer_oz: 3 },
    conditions: ['Majirel、Majirel Cool Inforced、Majirouge 常规系列', '不适用于 Majirel High Lift'], source_id: lorealMajirelSource,
  },
  {
    id: 'fact_loreal_majirel_time', domain: 'product_usage', subject: 'L’Oréal Professionnel Majirel',
    claim: 'Majirel 常规系列官方作用时间为 35 分钟。',
    structured_value: { processing_minutes: 35 },
    conditions: ['常规 Majirel 系列', '不适用于 Majirel High Lift'], source_id: lorealMajirelSource,
  },
  {
    id: 'fact_loreal_majirel_highlift', domain: 'product_usage', subject: 'L’Oréal Professionnel Majirel High Lift',
    claim: 'Majirel High Lift 官方调配比例为 1:2，作用时间为 50 分钟。',
    structured_value: { ratio: '1:2', processing_minutes: 50, developer_vol_options: [30, 40] },
    conditions: ['仅限 Majirel High Lift 或 Majiblond Ultra', '属于专业高提浅产品信息'], source_id: lorealMajirelSource,
  },
  {
    id: 'fact_loreal_inoa_ratio', domain: 'product_usage', subject: 'L’Oréal Professionnel iNOA',
    claim: 'iNOA 官方要求与专用 iNOA Oil Developer 按 1:1 调配。',
    structured_value: { ratio: '1:1', color_g: 60, developer_g: 60 },
    conditions: ['仅限 iNOA 与专用 iNOA Oil Developer'], source_id: lorealInoaSource,
  },
  {
    id: 'fact_loreal_inoa_time', domain: 'product_usage', subject: 'L’Oréal Professionnel iNOA',
    claim: 'iNOA 官方技术指南给出的作用时间为 35 分钟。',
    structured_value: { processing_minutes: 35 },
    conditions: ['仅限 iNOA 产品线'], source_id: lorealInoaSource,
  },
  {
    id: 'fact_loreal_inoa_lift', domain: 'product_usage', subject: 'L’Oréal Professionnel iNOA',
    claim: 'iNOA 官方指南区分 10、20、30 vol：分别用于至多约 1、2、3 级提浅的不同目标。',
    structured_value: { lift_by_developer: [{ vol: 10, levels_up_to: 1 }, { vol: 20, levels_up_to: 2 }, { vol: 30, levels_up_to: 3 }] },
    conditions: ['仅限 iNOA 官方体系', '实际结果受起始底色和发质影响'], source_id: lorealInoaSource,
  },
  {
    id: 'fact_color_opposites_neutralize', domain: 'color_theory', subject: '互补色中和',
    claim: '欧莱雅专业色卡说明，色轮上的相对色可相互中和。',
    structured_value: { principle: 'opposite_colors_neutralize' },
    conditions: ['作为色彩原理使用', '具体用量必须绑定产品线与配方'], source_id: lorealToneSource,
  },
  {
    id: 'fact_fda_follow_package', domain: 'safety', subject: '染发剂包装说明',
    claim: 'FDA 建议严格遵循包装说明，并注意所有警告信息。',
    structured_value: { action: 'follow_product_label' }, conditions: ['所有家用染发产品'], source_id: fdaHairDyeSource,
  },
  {
    id: 'fact_fda_patch_test', domain: 'safety', subject: '染发前皮肤测试',
    claim: 'FDA 建议每次染发前都按说明进行皮肤测试；出现皮疹则不要使用该染发剂。',
    structured_value: { action: 'patch_test_each_use', stop_if: 'rash' },
    conditions: ['遵循具体产品包装规定的测试方法和等待时间'], source_id: fdaHairDyeSource,
  },
  {
    id: 'fact_fda_processing_time', domain: 'safety', subject: '染发剂停留时间',
    claim: 'FDA 提醒不要让染发剂停留超过产品说明规定的时间。',
    structured_value: { action: 'do_not_exceed_label_time' }, conditions: ['所有家用染发产品'], source_id: fdaHairDyeSource,
  },
  {
    id: 'fact_fda_gloves_rinse', domain: 'safety', subject: '染发操作防护',
    claim: 'FDA 建议涂抹染发剂时戴手套，并在染后用水充分冲洗头皮。',
    structured_value: { actions: ['wear_gloves', 'rinse_scalp_thoroughly'] }, conditions: ['所有家用染发产品'], source_id: fdaHairDyeSource,
  },
  {
    id: 'fact_fda_no_mixing_products', domain: 'safety', subject: '不同染发产品混用',
    claim: 'FDA 建议不要混合不同的染发产品，以免伤害头发和头皮。',
    structured_value: { prohibited_action: 'mix_different_hair_dye_products' },
    conditions: ['除非产品制造商的同一体系官方说明明确允许组合'], source_id: fdaHairDyeSource,
  },
].map((fact) => ({
  ...fact,
  evidence_type: 'official_fact_candidate',
  confidence: 'high_source_quality',
  review_status: 'awaiting_schema_and_locale_review',
  collected_at: '2026-07-14',
  promoted_to_rule_id: null,
}));

const fadeHypotheses = {
  natural_black: ['深棕'],
  soft_black_tea: ['自然棕', '暖棕'],
  deep_chocolate_brown: ['暖棕', '浅棕'],
  neutral_brown: ['浅棕', '偏暖棕'],
  cool_brown: ['自然棕', '偏暖棕'],
  ash_brown: ['自然棕', '偏黄棕'],
  milk_tea_brown: ['浅金棕', '偏黄'],
  rose_pink_brown: ['暖棕', '浅棕'],
  warm_copper_brown: ['橙棕', '浅暖棕'],
  deep_wine_red: ['红棕', '暖棕'],
  cool_cherry_red: ['红紫', '粉红', '暖棕'],
  vivid_warm_red: ['橙红', '暖棕'],
  soft_rose_pink: ['浅粉', '暖金'],
  vivid_barbie_pink: ['浅粉', '粉紫', '暖金'],
  smoky_violet: ['浅紫', '灰', '偏黄'],
  blue_violet: ['紫', '灰蓝', '偏绿风险'],
  blue_black: ['黑茶', '深棕'],
  smoky_blue: ['灰蓝', '灰绿', '偏黄'],
  vivid_cobalt_blue: ['浅蓝', '蓝绿', '偏绿风险'],
  mint_green: ['浅绿', '灰绿', '偏黄'],
};

function describeAppearance(primaryTone, secondaryTone, lightness) {
  const tones = secondaryTone ? `${primaryTone}中带${secondaryTone}` : `以${primaryTone}为主`;
  const isDeep = lightness === '深';
  return {
    indoor: isDeep ? `整体较深，${tones}可能只呈现为反光` : `可见${tones}，视觉上比强光环境更深`,
    daylight: `自然光下${tones}通常更容易分辨`,
    warm_light: `暖光可能增强其中的红、橙、金感，并削弱冷感`,
    cool_light: `冷光可能增强其中的蓝、紫、灰感，并削弱暖感`,
    evidence_status: 'general_optical_hypothesis_needs_image_validation',
  };
}

// 内部标准色不是产品配方。它们把用户语言转成可检索的深浅、冷暖和色调维度。
// recommended_base_level 是待 Tony/案例验证的展示条件，不代表任何产品可直接达到。
const canonicalColors = [
  ['natural_black', '自然黑', '中性', '黑', null, [1, 2], [1, 3], '低', '深'],
  ['soft_black_tea', '柔和黑茶', '中性偏冷', '棕', '灰', [2, 4], [2, 5], '低', '深'],
  ['deep_chocolate_brown', '深巧克力棕', '偏暖', '棕', '红', [3, 5], [3, 6], '中低', '深'],
  ['neutral_brown', '自然棕', '中性', '棕', null, [4, 6], [4, 7], '中低', '中深'],
  ['cool_brown', '冷棕', '偏冷', '棕', '灰', [4, 7], [5, 8], '中低', '中'],
  ['ash_brown', '灰棕', '偏冷', '棕', '灰', [5, 8], [6, 9], '低', '中浅'],
  ['milk_tea_brown', '奶茶棕', '中性偏冷', '棕', '金灰', [6, 9], [7, 10], '低', '浅'],
  ['rose_pink_brown', '玫瑰粉棕', '中性偏暖', '棕', '粉红', [5, 8], [6, 9], '中', '中浅'],
  ['warm_copper_brown', '暖铜棕', '偏暖', '棕', '铜橙', [5, 8], [5, 9], '中高', '中浅'],
  ['deep_wine_red', '深酒红', '偏冷', '红', '紫', [3, 6], [4, 7], '中高', '深'],
  ['cool_cherry_red', '冷调樱桃红', '偏冷', '红', '紫', [5, 8], [6, 9], '高', '中浅'],
  ['vivid_warm_red', '鲜暖红', '偏暖', '红', '橙', [5, 8], [6, 9], '高', '中浅'],
  ['soft_rose_pink', '柔和玫瑰粉', '中性偏冷', '粉', '红紫', [7, 10], [8, 10], '中', '浅'],
  ['vivid_barbie_pink', '高饱和芭比粉', '偏冷', '粉', '紫', [8, 10], [9, 10], '高', '浅'],
  ['smoky_violet', '烟灰紫', '偏冷', '紫', '灰', [7, 10], [8, 10], '中低', '浅'],
  ['blue_violet', '蓝紫', '偏冷', '紫', '蓝', [6, 9], [8, 10], '高', '中浅'],
  ['blue_black', '蓝黑', '偏冷', '黑', '蓝', [2, 5], [3, 6], '中', '深'],
  ['smoky_blue', '雾霾蓝', '偏冷', '蓝', '灰', [7, 10], [9, 10], '中低', '浅'],
  ['vivid_cobalt_blue', '高饱和钴蓝', '偏冷', '蓝', null, [7, 10], [9, 10], '高', '浅'],
  ['mint_green', '薄荷绿', '偏冷', '绿', '蓝', [8, 10], [9, 10], '中', '浅'],
].map(([id, displayName, temperature, primaryTone, secondaryTone, depthRange, recommendedBase, saturation, lightness]) => ({
  id,
  display_name: displayName,
  family: `${primaryTone}色系`,
  technical_profile: {
    primary_tone: primaryTone,
    secondary_tone: secondaryTone,
    temperature,
    saturation,
    lightness,
    target_depth_range: { min: depthRange[0], max: depthRange[1] },
  },
  recommended_base_level: { min: recommendedBase[0], max: recommendedBase[1] },
  appearance: describeAppearance(primaryTone, secondaryTone, lightness),
  typical_fade_direction: fadeHypotheses[id] ?? [],
  fade_evidence_status: 'community_hypothesis_needs_case_validation',
  source_ids: taxonomySources,
  taxonomy_status: 'internal_v1',
  feasibility_status: 'provisional_needs_case_validation',
}));

const trendAliases = [
  ['黑茶', ['soft_black_tea']],
  ['黑茶色', ['soft_black_tea']],
  ['冷棕', ['cool_brown', 'ash_brown']],
  ['灰棕', ['ash_brown', 'cool_brown']],
  ['璀璨灰棕', ['ash_brown']],
  ['奶茶棕', ['milk_tea_brown', 'neutral_brown']],
  ['玫瑰粉棕', ['rose_pink_brown']],
  ['粉棕', ['rose_pink_brown', 'soft_rose_pink']],
  ['海王红', ['cool_cherry_red', 'vivid_warm_red', 'deep_wine_red']],
  ['樱桃红', ['cool_cherry_red', 'deep_wine_red']],
  ['酒红', ['deep_wine_red', 'cool_cherry_red']],
  ['女团红', ['cool_cherry_red', 'vivid_warm_red']],
  ['樱花粉', ['soft_rose_pink']],
  ['薄藤粉', ['soft_rose_pink', 'smoky_violet']],
  ['蜜桃粉', ['soft_rose_pink', 'rose_pink_brown']],
  ['杏粉', ['soft_rose_pink', 'rose_pink_brown']],
  ['芭比粉', ['vivid_barbie_pink']],
  ['玫瑰粉', ['soft_rose_pink', 'vivid_barbie_pink']],
  ['灰紫', ['smoky_violet']],
  ['蓝紫', ['blue_violet', 'smoky_violet']],
  ['蓝黑', ['blue_black']],
  ['雾霾蓝', ['smoky_blue']],
  ['克莱因蓝', ['vivid_cobalt_blue']],
  ['薄荷绿', ['mint_green']],
  ['抹茶绿', ['mint_green']],
].map(([trendName, candidates]) => ({
  id: stableId('alias', trendName),
  trend_name: trendName,
  canonical_color_candidates: candidates,
  mapping_confidence: candidates.length === 1 ? 'medium' : 'low',
  requires_image_confirmation: true,
  disambiguation_dimensions: ['目标图片', '室内或自然光', '期望深浅', '期望冷暖'],
  source_basis: 'project_vocabulary_and_internal_taxonomy',
  review_status: 'needs_image_examples',
}));

const baseLevels = Array.from({ length: 10 }, (_, index) => {
  const level = index + 1;
  return {
    level,
    name: `${level}度底色`,
    visible_tone: null,
    underlying_pigments: [],
    reference_images: [],
    review_status: 'awaiting_professional_source',
  };
});

writeJson('sources/source-registry.json', { schema_version: 3, sources: [...sourceMap.values()] });
writeJson('evidence/community-claims.json', { schema_version: 3, items: evidence });
writeJson('ingestion/official-facts.batch-1.json', { schema_version: 3, facts: officialFactCandidates });
writeJson('products/products.json', { schema_version: 3, products: [...productMap.values()] });
writeJson('products/prices.json', { schema_version: 3, prices });
writeJson('products/official-usage.json', { schema_version: 3, usage_rules: [] });
writeJson('products/shades.json', { schema_version: 3, shades: [] });
writeJson('cases/dye-cases.json', { schema_version: 3, cases });
writeJson('hair/base-levels.json', { schema_version: 3, levels: baseLevels });
writeJson('hair/history-effects.json', { schema_version: 3, effects: [] });
writeJson('colors/trend-aliases.json', { schema_version: 3, aliases: trendAliases });
writeJson('colors/canonical-colors.json', { schema_version: 3, colors: canonicalColors });
writeJson('rules/feasibility-rules.json', { schema_version: 3, rules: [] });
writeJson('rules/color-theory-rules.json', { schema_version: 3, rules: [] });
writeJson('rules/safety-rules.json', { schema_version: 3, rules: [] });
writeJson('meta/migration-report.json', {
  schema_version: 3,
  generated_at: new Date().toISOString(),
  migrated: {
    community_claims: evidence.length,
    products: productMap.size,
    prices: prices.length,
    cases: cases.length,
    sources: sourceMap.size,
    canonical_colors: canonicalColors.length,
    trend_aliases: trendAliases.length,
    official_fact_candidates: officialFactCandidates.length,
  },
  safety_review_required: evidence.filter((item) => item.review_status === 'safety_review_required').length,
  notes: [
    '旧文件未删除，应用仍可继续读取 V2 数据。',
    'V3 社媒内容均为低置信证据，不可直接生成安全结论或配方。',
    '空规则库需要用官方资料、专业教材或 Tony 审核结果填充。',
  ],
});

console.log(`V3 migration complete: ${evidence.length} claims, ${productMap.size} products, ${cases.length} cases, ${sourceMap.size} sources.`);
