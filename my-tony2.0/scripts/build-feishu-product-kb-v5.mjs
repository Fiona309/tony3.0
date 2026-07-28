import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(
  root,
  'knowledge-base/products/product-recommendation-rag-source.json',
);
const outputPath = path.join(
  root,
  'knowledge-base/products/feishu-product-kb-sku-v5.xml',
);
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const quantityPolicies = Object.fromEntries(
  source.quantity_policies.map((policy) => [policy.id, policy]),
);

const productTypeLabels = {
  color_deposit_care_set: '固色洗发水＋固色护发/发膜套装',
  color_deposit_shampoo: '固色/补色洗发水',
  color_deposit_conditioner: '固色/补色护发素或发膜',
  color_deposit_mask: '固色/补色发膜',
  color_deposit_care: '固色/补色护理',
  color_protect_care: '通用护色护理',
  color_care: '护色护理',
  hair_dye_cream: '染发膏/染发霜',
  hair_dye_bubble: '泡泡染',
};

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function priceText(product) {
  const { min, max } = product.listing_price;
  return min === max ? `¥${min}` : `¥${min}–${max}`;
}

function paragraph(value) {
  return `<p>${escapeXml(value || '待核实')}</p>`;
}

function link(url, label) {
  return `<p><a href="${escapeXml(url)}">${escapeXml(label)}</a></p>`;
}

function exactPrice(product) {
  return product.listing_price.min === product.listing_price.max;
}

function imagePaths(paths) {
  return (paths || []).length ? paths.join('\n') : '未提供图示';
}

function quantityText(product) {
  const policy = quantityPolicies[product.quantity_policy_id];
  const rows = Object.entries(policy.purchase_quantity_by_hair_length)
    .map(([length, count]) => `${length}${count}${/(color_deposit|color_care|color_protect)/.test(product.product_type) ? '瓶/支' : '盒'}`)
    .join('；');
  const sourceLabel =
    policy.source_type === 'merchant_detail'
      ? '商品官方图'
      : 'MVP通用估算（不是品牌官方事实）';
  return `${sourceLabel}：${rows}。${policy.notes}`;
}

const productRows = source.products.map((product) => [
  '<tr>',
  `<td>${paragraph(product.brand_name)}</td>`,
  `<td>${paragraph(product.product_name)}</td>`,
  `<td>${paragraph(productTypeLabels[product.product_type] || product.product_type)}</td>`,
  `<td>${paragraph(priceText(product))}</td>`,
  `<td>${paragraph(exactPrice(product) ? '精确原价：参加预算硬过滤' : '多规格原价区间：不参加精确预算排序')}</td>`,
  `<td>${paragraph(product.capacity_text)}</td>`,
  `<td>${paragraph(`${product.colors.length} 个`)}</td>`,
  `<td>${paragraph(product.product_image_path)}</td>`,
  `<td>${paragraph(product.discount_prices_ignored?.join('；') || '无')}</td>`,
  `<td>${link(product.douyin_url, '原抖音商城链接')}</td>`,
  `<td>${paragraph(product.known_risks?.join('；'))}</td>`,
  '</tr>',
].join(''));

function skuRowsForProduct(product) {
  return product.colors.map((color, index) => {
    return [
      '<tr>',
      `<td>${paragraph(`${product.product_id}__color_${String(index + 1).padStart(2, '0')}`)}</td>`,
      `<td>${paragraph(product.brand_name)}</td>`,
      `<td>${paragraph(product.product_name)}</td>`,
      `<td>${paragraph(productTypeLabels[product.product_type] || product.product_type)}</td>`,
      `<td>${paragraph(color.color_name)}</td>`,
      `<td>${paragraph(color.color_family)}</td>`,
      `<td>${paragraph(color.aliases?.join('、'))}</td>`,
      `<td>${paragraph(color.levels?.length ? `${color.levels.join('、')}度` : '页面未明确')}</td>`,
      `<td>${paragraph(priceText(product))}</td>`,
      `<td>${paragraph(exactPrice(product) ? '精确原价，可参加预算过滤' : '多规格区间，不参加精确预算排序')}</td>`,
      `<td>${paragraph(color.product_image_path || product.product_image_path)}</td>`,
      `<td>${link(product.douyin_url, '抖音商城')}</td>`,
      `<td>${paragraph(color.source_screenshot)}</td>`,
      '</tr>',
    ].join('');
  });
}

const skuRows = source.products.flatMap(skuRowsForProduct);
const skuTableHeadings = [
  'SKU ID',
  '品牌',
  '商品',
  '类型',
  '颜色/色号',
  '标准色系',
  '别名',
  '底色',
  '原价',
  '预算状态',
  '色号商品图',
  '抖音商城',
  '证据截图',
];
const skuTables = source.products.map((product, productIndex) => [
  `<h3>3.${productIndex + 1} ${escapeXml(product.brand_name)}（${product.colors.length} 个色号）</h3>`,
  '<table><thead><tr>',
  skuTableHeadings
    .map((heading) => `<th>${paragraph(heading)}</th>`)
    .join(''),
  '</tr></thead>',
  `<tbody>${skuRowsForProduct(product).join('')}</tbody>`,
  '</table>',
].join('\n'));

const usageRows = source.products.map((product) => [
  '<tr>',
  `<td>${paragraph(product.brand_name)}</td>`,
  `<td>${paragraph(product.product_name)}</td>`,
  `<td>${paragraph(quantityText(product))}</td>`,
  `<td>${paragraph(product.usage_guide?.text)}</td>`,
  `<td>${paragraph(imagePaths(product.usage_guide?.image_paths))}</td>`,
  `<td>${paragraph(imagePaths(product.usage_guide?.source_screenshots))}</td>`,
  '</tr>',
].join(''));

const xml = [
  '<h1>商品知识库（RAG 入库版 v5）</h1>',
  '<callout background-color="rgb(240,246,255)" border-color="rgb(78,131,253)" emoji="✅">',
  `<p><b>本次已入库：</b>${source.products.length} 个商品、${skuRows.length} 个颜色/色号、${source.source_document.screenshot_count} 张原始截图。每条色号记录均能追溯到商品、品牌、底色信息、商品图、价格口径和证据截图。</p>`,
  '<p><b>价格规则：</b>仅记录截图中的原价/售价。券后价、会员价、App 专享价、直播满减价和新人价不参与推荐预算。页面只有多规格区间价时，不假装成某个色号的精确价格。</p>',
  '<p><b>链接规则：</b>购买跳转仅保留原始抖音商城链接，不提供其他电商平台购买链接。</p>',
  '<p><b>图片规则：</b>每个商品和色号均有后端可读取的商品图路径；有官方操作图示的商品同时保存操作图路径和 OCR 文字。</p>',
  '</callout>',
  '<h2>1. 后端应该怎样调用</h2>',
  '<p>输入：目标颜色（如蓝色）、用户预算范围、发长。先按 color_family／color_name／aliases 召回同色商品，再只保留精确原价落入预算的记录；最后按该商品自己的用量规则计算购买数量和总价。价格仍是区间的商品可以作为补充候选，但不能参加精确预算排序。</p>',
  '<p>输出：1 个最佳推荐和最多 3 个次推荐。每张卡返回品牌、商品名、商品类型、准确色号、商品图、单价、数量、总价、优点、风险、推荐理由和原抖音商城链接。符合条件不足 4 个时按实际数量返回，不用错误商品凑数。</p>',
  '<h2>2. 商品主表（一个商品一行）</h2>',
  '<table><thead><tr>',
  [
    '品牌',
    '商品',
    '类型',
    '原价',
    '价格状态',
    '规格/容量',
    '已确认色号数',
    '商品主图路径',
    '已排除优惠价',
    '抖音商城',
    '风险/缺失项',
  ].map((heading) => `<th>${paragraph(heading)}</th>`).join(''),
  '</tr></thead>',
  `<tbody>${productRows.join('')}</tbody></table>`,
  '<h2>3. 色号 SKU 主表（一个颜色一行）</h2>',
  '<p>飞书单张表有单元格数量限制，因此按商品拆成子表；后端 JSON 中仍是同一个集合。</p>',
  skuTables.join('\n'),
  '<h2>4. 每个商品的用量与官方操作方法</h2>',
  '<p>“商品官方图”可以作为商品事实；“MVP通用估算”只是黑客松兜底，前端必须写明是估算，不能冒充品牌官方建议。没有官方用量时保留“未知”，比编造精确用量更安全。</p>',
  '<table><thead><tr>',
  ['品牌', '商品', '发长与购买数量', '官方操作文字/OCR', '操作图路径', '操作证据截图']
    .map((heading) => `<th>${paragraph(heading)}</th>`)
    .join(''),
  '</tr></thead>',
  `<tbody>${usageRows.join('')}</tbody></table>`,
  '<h2>5. RAG 过滤顺序</h2>',
  '<ol>',
  '<li><p><b>颜色硬过滤：</b>查询 color_family、color_name 和 aliases；例如“蓝色”可召回宝蓝、雾霾蓝、蓝黑等已映射记录。</p></li>',
  '<li><p><b>商品形态过滤：</b>用户选择染发或固色后，只保留对应 product_type，不把染发膏和固色发膜混在一起。</p></li>',
  '<li><p><b>价格硬过滤：</b>只对 price_is_exact=true 的 SKU 按预算筛选。区间价记录不能用于精确总价。</p></li>',
  '<li><p><b>数量计算：</b>按 quantity_policy_id 找到该商品的发长用量；官方规则优先，没有官方规则时才使用带标识的 MVP 估算。</p></li>',
  '<li><p><b>排序与去重：</b>颜色匹配优先，其次预算匹配、资料完整度和品牌多样性；同一品牌不重复占满推荐位。</p></li>',
  '</ol>',
  '<h2>6. 数据边界</h2>',
  '<p>图片路径以 /product-assets/ 开头，对应前端 public/product-assets/。这些路径是后端资源字段，不是让用户阅读的文案。</p>',
  '<p>本版不把折扣价当作长期价格；也不把商品页“起售价”或多规格区间强行分配给每个颜色。后续拿到具体规格与色号的价格截图后，再拆成真正可预算过滤的 SKU 行。</p>',
  `<p>采集时间：${escapeXml(source.captured_at)}。素材来源：<a href="${escapeXml(source.source_document.url)}">16 品牌商品详情与价格截图</a>。</p>`,
].join('\n');

await writeFile(outputPath, `${xml}\n`, 'utf8');
console.log(
  JSON.stringify({
    output: path.relative(root, outputPath),
    products: source.products.length,
    sku_rows: skuRows.length,
  }),
);
