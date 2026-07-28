import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const productDir = path.join(root, 'knowledge-base', 'products');
const sourcePath = path.join(productDir, 'product-recommendation-rag-source.json');
const ocrPath = path.join(productDir, 'source-assets', 'ocr-pages.json');
const derivedRoot = path.join(productDir, 'derived-assets');
const variantRoot = path.join(derivedRoot, 'color-variants');
const usageRoot = path.join(derivedRoot, 'usage');
const publicAssetRoot = path.join(root, 'public', 'product-assets');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const pages = JSON.parse(await readFile(ocrPath, 'utf8'));

const PRODUCT_SPECIFIC_QUANTITY_POLICIES = [
  {
    id: 'official_kao_bubble_box_count',
    scope: '仅花王Liese泡泡染',
    source_type: 'merchant_detail',
    purchase_quantity_by_hair_length: {
      齐耳短发: 1,
      齐肩发: 2,
      齐胸中长发: 3,
      齐腰长发: 3,
      腰部以下超长发: 3,
    },
    notes:
      '官方详情图给出短发1盒、中发2盒、长发3盒。齐腰及超长发按“长发3盒”映射；发量很大时应额外预留，不把推测写成官方精确值。',
  },
  {
    id: 'official_schwarzkopf_cream_box_count',
    scope: '仅施华蔻斐丝丽黑发直染染发霜',
    source_type: 'merchant_detail',
    purchase_quantity_by_hair_length: {
      齐耳短发: 1,
      齐肩发: 2,
      齐胸中长发: 3,
      齐腰长发: 3,
      腰部以下超长发: 3,
    },
    notes:
      '官方详情图给出头发及耳1盒、及肩2盒、过肩3盒。齐胸及更长统一映射到“过肩3盒”，超长或发量大应另行提醒多备。',
  },
  {
    id: 'official_schwarzkopf_bubble_box_count',
    scope: '仅施华蔻斐丝丽泡泡染',
    source_type: 'merchant_detail',
    purchase_quantity_by_hair_length: {
      齐耳短发: 1,
      齐肩发: 2,
      齐胸中长发: 3,
      齐腰长发: 3,
      腰部以下超长发: 3,
    },
    notes:
      '官方详情图给出头发及耳1盒、及肩2盒、过肩3盒及以上，并建议可多加1盒补染。超长发返回3盒时必须同时展示“3盒及以上”。',
  },
];

for (const policy of PRODUCT_SPECIFIC_QUANTITY_POLICIES) {
  const index = source.quantity_policies.findIndex((item) => item.id === policy.id);
  if (index >= 0) source.quantity_policies[index] = policy;
  else source.quantity_policies.push(policy);
}

const PRODUCT_RULES = {
  douyin_3761010079294423154: {
    prefix: '01-uyee/',
    price: [85, 89],
    ignored: ['抖音商城App专享¥79'],
  },
  douyin_3798662807734583533: {
    prefix: '02-俪缇/',
    price: [44, 44],
    ignored: ['券后价¥36', '抖音商城App专享¥30'],
  },
  douyin_3704045569417806103: {
    prefix: '03-施华蔻固色/',
    price: [99, 99],
    ignored: ['页面成交价¥58', '抖音商城App专享¥52'],
    addColors: ['蓝色', '粉色', '红色', '紫色', '灰色', '去黄色'],
    risks: [
      '已从商品图录入蓝、粉、红、紫、灰和去黄方向，但具体网红色名、底色度数和容量仍待确认',
      '属于固色护色商品，不应与永久染发膏混合推荐',
    ],
  },
  douyin_3806625202599756215: {
    prefix: '04-蕾纳塔/',
    price: [89, 89],
    ignored: ['页面成交价¥79', '抖音商城App专享¥73'],
  },
  douyin_3801276422086066263: {
    prefix: '05-探色/',
    price: [49.9, 119.9],
    ignored: ['抖音商城App专享¥43.9'],
  },
  douyin_3776220798440833130: {
    prefix: '06-花王/',
    price: [33.8, 138],
    ignored: ['抖音商城App专享¥27.8', '会员立减'],
    quantityPolicyId: 'official_kao_bubble_box_count',
    addColors: [
      '雾霾棕',
      '鎏金可可',
      '普罗旺斯玫瑰棕',
      '米兰烟灰',
      '维也纳醇棕',
      '赫尔辛基雾霾棕',
      '哈瓦那烟蓝',
      '巴黎青灰',
      '琥珀闪棕',
      '英国灰咖',
      '璀璨翡绿',
      '柏林闷青',
      '罗马暖棕',
      '星光玫瑰',
      '晶石透粉',
      '纽约灰棕',
      '自然棕',
      '冷感烟灰',
    ],
    risks: [
      '已从商品图录入18个色号，但页面价格是多规格区间，尚不能把某个色号绑定到精确单价',
      '官方用量已按短发1盒、中发2盒、长发3盒录入；发量很大时需要额外预留',
    ],
  },
  douyin_3573258288193747022: {
    prefix: '07-欧莱雅/',
    price: [65, 65],
    ignored: ['抖音商城App专享¥59'],
  },
  douyin_3612223167361359924: {
    prefix: '08-忆丝芸/',
    price: [69.9, 129.9],
    ignored: ['实付价¥59.9', '抖音商城App专享¥53.9'],
  },
  douyin_3746023263504040089: {
    prefix: '09-染鲤/',
    price: [54, 114],
    ignored: ['券后价¥49起', '抖音商城App专享¥43'],
    addColors: [
      '烟冷棕',
      '锦鲤红',
      '甘橘棕',
      '杏仁棕',
      '竹绿青',
      '珊瑚橘',
      '锦鲤玫粉',
      '亚麻香槟',
      '奶茶雾棕',
      '鸢尾蓝绿',
      '黑加仑紫',
    ],
    risks: [
      '已从商品图录入11个色号，但容量、底色度数和色号对应精确价格仍待确认',
      '用量采用MVP通用估算，不是品牌官方建议',
    ],
  },
  douyin_3627232676299311931: {
    prefix: '10-nv/',
    price: [99, 129],
    ignored: ['抖音商城App专享¥93'],
  },
  douyin_3683606309598527682: {
    prefix: '11-施华蔻/',
    price: [109, 109],
    ignored: ['实付价/优惠价¥89', '抖音商城App专享¥83'],
    quantityPolicyId: 'official_schwarzkopf_cream_box_count',
    addColors: [
      '树莓红棕',
      '榛果米棕',
      '蜜橘粉棕',
      '黑加仑紫',
      '南瓜焦糖',
      '远山青雾',
      '深海蓝鲸',
      '冷萃灰棕',
    ],
    risks: [
      '已从商品图录入8个色号，官方用量已按及耳1盒、及肩2盒、过肩3盒录入，但底色度数仍待确认',
      '黑发直染的显色深浅会受当前底色和既往染黑影响',
    ],
  },
  douyin_3661006633414322112: {
    prefix: '12-施华蔻泡泡染/',
    price: [99, 99],
    ignored: ['实付价/优惠价¥66', '抖音商城App专享¥60'],
    quantityPolicyId: 'official_schwarzkopf_bubble_box_count',
    risks: [
      '官方用量已按及耳1盒、及肩2盒、过肩3盒及以上录入；发量大时可多备1盒',
      '部分网红发色需先漂后染，不属于本产品链路的居家漂发指导',
    ],
  },
  douyin_3832247538640093617: {
    prefix: '13-玫丽盼/',
    price: [79, 79],
    ignored: ['新人/实付价¥78', '抖音商城App专享¥72'],
    addColors: ['绿色', '驼色', '薰衣草紫', '草莓粉', '奶茶灰', '蓝色', '橙色'],
    risks: [
      '已从商品图录入7个补色方向，但具体底色度数和各色使用频率仍待确认',
      '属于彩色洗发水，不能替代染发膏完成明显提浅',
    ],
  },
  douyin_3763760159604736414: {
    prefix: '15-首品/',
    price: [41, 41],
    ignored: ['券后价¥38', '抖音商城App专享¥32'],
    exclude: ['15-首品/016-'],
  },
  douyin_3532983050122197537: {
    prefix: '15-首品/016-',
    price: [89.1, 89.1],
    ignored: [],
    extraUsageFiles: [
      'colorlomo-user-evidence/usage-method.png',
      'colorlomo-user-evidence/quantity-frequency.png',
    ],
    extraUsageText:
      '湿发日常固色：洗发后略微擦干，将发膜在手心揉开后均匀涂抹并梳匀，停留约3分钟后洗净。干发补色：佩戴手套，将头发分成4区，把发膜覆盖全部干发并梳匀，停留15分钟以上，无需加热；用温水冲洗，建议当次不用洗发水。官方用量图：干发补色时齐耳/男士短发1支180ml、齐肩中发1–1.5支、过肩长发2–3支；湿发固色按棒子/丘丘球大小取量。湿发固色建议染后开始使用、每周2–3次、约3分钟；干发补色在严重掉色或漂后直接染色时按需使用、约15分钟。',
  },
  douyin_3648409433551280580: {
    prefix: '16-okcs/',
    price: [39, 79],
    ignored: ['抖音商城App专享¥33'],
    addColors: [
      '莫奈肉桂',
      '亚麻灰棕',
      '伦敦奶咖',
      '哥特冷黑',
      '熔岩榛巧',
      '英式早茶',
      '乌木褐棕',
      '沙漠玫瑰',
      '星空紫藤',
      '雅典娜紫',
      '法式藤棕',
      '榛子松露',
      '红陌樱花',
      '边境红枫',
      '海盐薄荷',
      '焦糖奶茶',
      '浅海鸢尾',
      '元气粉橘',
      '罗马曼波红',
      '莫桑比克粉',
      '诺达雨林绿',
    ],
    risks: [
      '已从商品图录入23个色号，但短发装、中发装和长发装对应原价仍是区间，尚不能把单个色号绑定到精确单价',
      '黑色染发史需先漂发才可能正常上色，本产品不提供居家漂发指导',
      '发量多且浓密或发质粗硬时应按官方提示多备1盒',
    ],
  },
};

const familyMatchers = [
  ['pink', /粉|玫瑰|樱花/],
  ['red', /红|酒/],
  ['purple', /紫|藤/],
  ['blue', /蓝|鸢尾/],
  ['green', /绿|青|橄榄|翡/],
  ['gray_brown', /灰棕|灰咖|烟灰|雾霾棕/],
  ['gray', /灰|银/],
  ['orange', /橘|橙|焦糖|南瓜/],
  ['brown', /棕|茶|咖|可可|黑|榛|栗|摩卡|驼/],
  ['yellow', /黄/],
];

function colorFamily(name) {
  return familyMatchers.find(([, expression]) => expression.test(name))?.[0] ?? 'other';
}

function normalize(text) {
  return text.toLowerCase().replace(/[\s【】（）()·*#/_-]/g, '');
}

function relativeAssetPath(absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

async function publishAsset(libraryPath) {
  const relative = path.relative(derivedRoot, libraryPath);
  const publicPath = path.join(publicAssetRoot, relative);
  await mkdir(path.dirname(publicPath), { recursive: true });
  await copyFile(libraryPath, publicPath);
  return `/${path.relative(path.join(root, 'public'), publicPath).split(path.sep).join('/')}`;
}

function matchingPages(rule) {
  return pages.filter((page) => {
    if (!page.path.startsWith(rule.prefix)) return false;
    if (rule.exclude?.some((prefix) => page.path.startsWith(prefix))) return false;
    return true;
  });
}

function pageText(page) {
  return page.lines.map((line) => line.text).join(' ');
}

function findColorPage(productPages, color) {
  const queries = [color.color_name, ...(color.aliases ?? [])]
    .map(normalize)
    .filter((query) => query.length >= 2);
  return (
    productPages.find((page) => {
      const text = normalize(pageText(page));
      return queries.some((query) => text.includes(query));
    }) ?? productPages[0]
  );
}

function usagePages(productPages) {
  return productPages.filter((page) =>
    /使用方法|如何使用|简单[三四3-4]步|step\s*[1-4]|染发步骤|教程在手|认真阅读使用说明/i.test(
      pageText(page),
    ),
  );
}

function cleanUsageText(page) {
  const ignored = /美团|客服|加购|立即购买|抖音商城|商品|评价|推荐|运费险|旗舰店|专享价/;
  return page.lines
    .map((line) => line.text.trim())
    .filter((text) => text && !ignored.test(text))
    .join('；');
}

async function makeSquareCrop(page, targetPath) {
  const sourceImage = path.join(productDir, 'source-assets', page.path);
  const metadata = await sharp(sourceImage).metadata();
  const width = metadata.width ?? 1080;
  const height = metadata.height ?? 2412;
  const size = Math.min(width, 960);
  const top = Math.min(Math.max(220, Math.round(height * 0.13)), height - size);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await sharp(sourceImage)
    .extract({
      left: Math.max(0, Math.round((width - size) / 2)),
      top,
      width: size,
      height: size,
    })
    .resize(720, 720, { fit: 'cover' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(targetPath);
}

source.captured_at = '2026-07-26T01:18:00+08:00';
source.source_document = {
  platform: 'feishu_wiki',
  url: 'https://my.feishu.cn/wiki/T4ZAwePFXim4AxkhsNEckFCdnqd',
  document_token: 'R3fpdKidmo1FSFxv2EZcNnEMnCg',
  revision_id: 98,
  screenshot_count: 214,
  extra_user_evidence_count: 2,
};
source.ingestion_rule.price_rule =
  'regular_price 为截图中未使用优惠券、会员折扣、App专享、直播满减或新人优惠前的原价/售价；所有 discount_prices_ignored 仅作审计，不参与推荐预算。';

for (const product of source.products) {
  const rule = PRODUCT_RULES[product.product_id];
  if (!rule) throw new Error(`Missing rule for ${product.product_id}`);
  const productPages = matchingPages(rule);
  if (!productPages.length) throw new Error(`No pages for ${product.product_id}`);

  product.listing_price = {
    min: rule.price[0],
    max: rule.price[1],
    scope: rule.price[0] === rule.price[1] ? 'regular_original_price' : 'regular_original_price_range',
    basis: 'regular_price_before_discount',
  };
  product.discount_prices_ignored = rule.ignored;
  if (rule.risks) product.known_risks = rule.risks;
  if (rule.quantityPolicyId) product.quantity_policy_id = rule.quantityPolicyId;
  product.source_screenshots = productPages.map((page) =>
    `knowledge-base/products/source-assets/${page.path}`,
  );

  for (const colorName of rule.addColors ?? []) {
    if (!product.colors.some((color) => normalize(color.color_name) === normalize(colorName))) {
      product.colors.push({
        color_name: colorName,
        color_family: colorFamily(colorName),
        aliases: [],
        levels: [],
        level_status: 'visible_in_source_screenshot',
      });
    }
  }

  const masterPage = productPages[0];
  const masterTarget = path.join(
    derivedRoot,
    'product-masters',
    `${product.product_id}.jpg`,
  );
  await makeSquareCrop(masterPage, masterTarget);
  product.product_image_library_path = relativeAssetPath(masterTarget);
  product.product_image_path = await publishAsset(masterTarget);
  product.product_image_source_screenshot =
    `knowledge-base/products/source-assets/${masterPage.path}`;

  for (const [index, color] of product.colors.entries()) {
    const page = findColorPage(productPages, color);
    const target = path.join(
      variantRoot,
      product.product_id,
      `${String(index + 1).padStart(2, '0')}-${normalize(color.color_name)}.jpg`,
    );
    await makeSquareCrop(page, target);
    color.product_image_library_path = relativeAssetPath(target);
    color.product_image_path = await publishAsset(target);
    color.source_screenshot =
      `knowledge-base/products/source-assets/${page.path}`;
  }

  const instructions = usagePages(productPages);
  const extraUsageFiles = rule.extraUsageFiles ?? [];
  product.usage_guide = {
    text: [
      ...instructions.map(cleanUsageText).filter(Boolean),
      rule.extraUsageText,
    ]
      .filter(Boolean)
      .join('\n'),
    image_paths: [],
    source_screenshots: [
      ...instructions.map(
        (page) => `knowledge-base/products/source-assets/${page.path}`,
      ),
      ...extraUsageFiles.map(
        (relativePath) =>
          `knowledge-base/products/source-assets/${relativePath}`,
      ),
    ],
  };

  const usageSourcePaths = [
    ...instructions.map((page) => page.path),
    ...extraUsageFiles,
  ];
  for (const [index, relativePath] of usageSourcePaths.entries()) {
    const sourceImage = path.join(productDir, 'source-assets', relativePath);
    const target = path.join(
      usageRoot,
      product.product_id,
      `${String(index + 1).padStart(2, '0')}.jpg`,
    );
    await mkdir(path.dirname(target), { recursive: true });
    await sharp(sourceImage).jpeg({ quality: 90, mozjpeg: true }).toFile(target);
    product.usage_guide.image_paths.push(await publishAsset(target));
  }
}

await writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`, 'utf8');
console.log(
  JSON.stringify(
    {
      products: source.products.length,
      color_variants: source.products.reduce(
        (sum, product) => sum + product.colors.length,
        0,
      ),
      products_with_usage_images: source.products.filter(
        (product) => product.usage_guide.image_paths.length > 0,
      ).length,
    },
    null,
    2,
  ),
);
