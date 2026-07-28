import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const sourcePath = path.join(
  projectRoot,
  "knowledge-base/products/product-recommendation-rag-source.json",
);
const outputPath = path.join(
  projectRoot,
  "knowledge-base/products/product-recommendation-rag.json",
);

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const quantityPolicies = Object.fromEntries(
  source.quantity_policies.map((policy) => [policy.id, policy]),
);

function compact(values) {
  return values.filter(Boolean).join("；");
}

function masterPageContent(product) {
  const price =
    product.listing_price.min === product.listing_price.max
      ? `公开价¥${product.listing_price.min}`
      : `公开价¥${product.listing_price.min}–${product.listing_price.max}`;
  const colorText = product.colors.length
    ? `已确认颜色：${product.colors.map((color) => color.color_name).join("、")}`
    : "公开页面尚未确认可用于颜色检索的SKU";

  return compact([
    `品牌：${product.brand_name}`,
    `商品：${product.product_name}`,
    `商品类型：${product.product_type}`,
    price,
    product.capacity_text ? `规格：${product.capacity_text}` : null,
    colorText,
    product.merchant_claims.length
      ? `商家页面信息：${product.merchant_claims.join("、")}`
      : null,
    product.known_risks.length
      ? `注意：${product.known_risks.join("、")}`
      : null,
  ]);
}

function variantPageContent(product, color) {
  const aliases = color.aliases?.length
    ? `相关名称：${color.aliases.join("、")}`
    : null;
  const levels = color.levels?.length
    ? `已记录底色度数：${color.levels.join("、")}度`
    : "商品页未公开底色度数";
  const recommendedMinLevel = color.recommended_min_level
    ? `商家图建议至少${color.recommended_min_level}度`
    : null;

  return compact([
    `品牌：${product.brand_name}`,
    `商品：${product.product_name}`,
    `颜色：${color.color_name}`,
    `标准色系：${color.color_family}`,
    aliases,
    levels,
    recommendedMinLevel,
    product.known_risks.length
      ? `商品注意：${product.known_risks.join("、")}`
      : null,
  ]);
}

const records = [];

for (const product of source.products) {
  const policy = quantityPolicies[product.quantity_policy_id];
  const exactPrice =
    product.listing_price.min === product.listing_price.max;

  records.push({
    id: `${product.product_id}__master`,
    page_content: masterPageContent(product),
    metadata: {
      record_type: "product_master",
      product_id: product.product_id,
      brand_name: product.brand_name,
      brand_aliases: product.brand_aliases,
      product_name: product.product_name,
      product_type: product.product_type,
      shop_name: product.shop_name,
      product_image_url: product.product_image_url,
      product_image_path: product.product_image_path,
      product_image_source_screenshot:
        product.product_image_source_screenshot,
      purchase_url: product.douyin_url,
      price_min: product.listing_price.min,
      price_max: product.listing_price.max,
      price_scope: product.listing_price.scope,
      price_is_exact: exactPrice,
      eligible_for_exact_budget_recommendation: exactPrice,
      budget_filter_reason: exactPrice
        ? "原价为单一值，可参加价格硬过滤"
        : "页面只提供多规格原价区间；可按颜色召回，但在价格与具体SKU对应前不参加精确预算排序",
      price_captured_at: source.captured_at,
      sales_count: product.sales_count,
      capacity_text: product.capacity_text,
      quantity_policy_id: product.quantity_policy_id,
      quantity_policy_source: policy.source_type,
      quantity_by_hair_length: policy.purchase_quantity_by_hair_length,
      color_variant_count: product.colors.length,
      color_retrieval_status:
        product.colors.length > 0 ? "active" : "catalog_only",
      source_platform: source.source_platform,
      price_basis: product.listing_price.basis,
      discount_prices_ignored: product.discount_prices_ignored,
      source_screenshots: product.source_screenshots,
      usage_text: product.usage_guide?.text ?? null,
      usage_image_paths: product.usage_guide?.image_paths ?? [],
      usage_source_screenshots:
        product.usage_guide?.source_screenshots ?? [],
    },
  });

  for (const [index, color] of product.colors.entries()) {
    records.push({
      id: `${product.product_id}__color_${String(index + 1).padStart(2, "0")}`,
      page_content: variantPageContent(product, color),
      metadata: {
        record_type: "color_variant",
        parent_product_id: product.product_id,
        brand_name: product.brand_name,
        product_name: product.product_name,
        product_type: product.product_type,
        color_name: color.color_name,
        color_family: color.color_family,
        color_aliases: color.aliases ?? [],
        levels: color.levels ?? [],
        level_status: color.level_status,
        recommended_min_level: color.recommended_min_level ?? null,
        price_min: product.listing_price.min,
        price_max: product.listing_price.max,
        price_is_exact: exactPrice,
        eligible_for_exact_budget_recommendation: exactPrice,
        budget_filter_reason: exactPrice
          ? "原价为单一值，可参加价格硬过滤"
          : "页面只提供多规格原价区间；可按颜色召回，但在价格与具体SKU对应前不参加精确预算排序",
        product_image_url: product.product_image_url,
        product_image_path:
          color.product_image_path ?? product.product_image_path,
        product_image_source_screenshot:
          color.source_screenshot ??
          product.product_image_source_screenshot,
        purchase_url: product.douyin_url,
        quantity_policy_id: product.quantity_policy_id,
        source_platform: source.source_platform,
        captured_at: source.captured_at,
        price_basis: product.listing_price.basis,
        discount_prices_ignored: product.discount_prices_ignored,
        usage_text: product.usage_guide?.text ?? null,
        usage_image_paths: product.usage_guide?.image_paths ?? [],
      },
    });
  }
}

const output = {
  schema_version: source.schema_version,
  collection_name: source.ingestion_rule.collection,
  generated_at: new Date().toISOString(),
  source_file: path.relative(projectRoot, sourcePath),
  record_count: records.length,
  product_master_count: source.products.length,
  color_variant_count: records.filter(
    (record) => record.metadata.record_type === "color_variant",
  ).length,
  records,
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      output: path.relative(projectRoot, outputPath),
      records: output.record_count,
      product_masters: output.product_master_count,
      color_variants: output.color_variant_count,
    },
    null,
    2,
  ),
);
