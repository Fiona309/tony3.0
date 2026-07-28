import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kb = path.join(root, 'knowledge-base');
const read = (file) => JSON.parse(fs.readFileSync(path.join(kb, file), 'utf8'));
const errors = [];
const warnings = [];

const sources = read('sources/source-registry.json').sources;
const sourceIds = new Set(sources.map((source) => source.id));
const products = read('products/products.json').products;
const productIds = new Set(products.map((product) => product.id));
const prices = read('products/prices.json').prices;
const claims = read('evidence/community-claims.json').items;
const cases = read('cases/dye-cases.json').cases;
const colors = read('colors/canonical-colors.json').colors;
const aliases = read('colors/trend-aliases.json').aliases;
const officialFacts = read('ingestion/official-facts.batch-1.json').facts;
const colorIds = new Set(colors.map((color) => color.id));

const duplicateIds = (items, label) => {
  const seen = new Set();
  for (const item of items) {
    if (!item.id) errors.push(`${label}: item missing id`);
    else if (seen.has(item.id)) errors.push(`${label}: duplicate id ${item.id}`);
    seen.add(item.id);
  }
};

duplicateIds(sources, 'sources');
duplicateIds(products, 'products');
duplicateIds(prices, 'prices');
duplicateIds(claims, 'claims');
duplicateIds(cases, 'cases');
duplicateIds(colors, 'colors');
duplicateIds(aliases, 'aliases');
duplicateIds(officialFacts, 'official facts');

for (const claim of claims) {
  if (!sourceIds.has(claim.source_id)) errors.push(`claim ${claim.id}: missing source ${claim.source_id}`);
  if (!claim.quote) warnings.push(`claim ${claim.id}: missing verbatim evidence`);
  if (claim.evidence_type === 'community_claim' && claim.confidence !== 'low') {
    errors.push(`claim ${claim.id}: community claim cannot be promoted automatically`);
  }
}
for (const price of prices) {
  if (!productIds.has(price.product_id)) errors.push(`price ${price.id}: missing product ${price.product_id}`);
  if (!sourceIds.has(price.source_id)) errors.push(`price ${price.id}: missing source ${price.source_id}`);
  if (!price.captured_at) warnings.push(`price ${price.id}: missing captured_at`);
}
for (const item of cases) {
  if (!sourceIds.has(item.source_id)) errors.push(`case ${item.id}: missing source ${item.source_id}`);
  if (item.completeness.score < 0.8) warnings.push(`case ${item.id}: incomplete (${item.completeness.score})`);
}
for (const color of colors) {
  for (const sourceId of color.source_ids ?? []) {
    if (!sourceIds.has(sourceId)) errors.push(`color ${color.id}: missing source ${sourceId}`);
  }
  if (color.recommended_base_level.min > color.recommended_base_level.max) {
    errors.push(`color ${color.id}: invalid recommended base range`);
  }
}
for (const alias of aliases) {
  if (!alias.trend_name) errors.push(`alias ${alias.id}: missing trend_name`);
  for (const colorId of alias.canonical_color_candidates ?? []) {
    if (!colorIds.has(colorId)) errors.push(`alias ${alias.id}: missing color ${colorId}`);
  }
}
for (const fact of officialFacts) {
  if (!sourceIds.has(fact.source_id)) errors.push(`official fact ${fact.id}: missing source ${fact.source_id}`);
  if (!fact.conditions?.length) errors.push(`official fact ${fact.id}: missing applicability conditions`);
  if (fact.review_status === 'approved' && !fact.promoted_to_rule_id) {
    errors.push(`official fact ${fact.id}: approved but not linked to a rule`);
  }
}

console.log(`Knowledge base: ${sources.length} sources, ${products.length} products, ${claims.length} claims, ${cases.length} cases, ${colors.length} colors, ${aliases.length} aliases, ${officialFacts.length} official facts.`);
if (warnings.length) console.warn(`Warnings (${warnings.length}):\n- ${warnings.join('\n- ')}`);
if (errors.length) {
  console.error(`Errors (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('Validation passed.');
}
