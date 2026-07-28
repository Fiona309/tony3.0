# 飞书商品截图入库审计

## 范围

- 来源：飞书 Wiki《商品知识库素材来源》
- 文档版本：revision 98
- 原始截图：214 张
- 用户补充的卡洛美操作/用量图：2 张
- 文档标题分组：15 个
- 实际商品：16 个
- RAG 色号记录：189 条

## 特殊分组情况

飞书文档的标题编号由 `13.玫丽盼` 直接跳到 `15.首品`，没有 `14.` 标题。  
卡洛美并未缺失：其截图位于 `15.首品` 分组最后一张，已经单独映射为
`COLORLOMO卡洛美`，没有并入首品。

## 价格规则

写入 `listing_price` 的价格口径统一为
`regular_price_before_discount`。以下价格不进入预算计算：

- 券后价
- 会员价或入会立减
- 抖音商城 App 专享价
- 直播间满减价
- 新人价
- 实付价

每个商品的被排除优惠价保存在 `discount_prices_ignored`，用于后续人工复核。

16 个商品中，9 个商品有单一原价证据，可以参加预算硬过滤；7 个商品页面只
提供多规格原价区间。区间价商品仍可按颜色召回，但在具体规格与价格绑定前，
不参加精确预算排序，也不用于计算确定总价。

## 链接规则

推荐跳转字段只使用原始 `v.douyin.com` 商城链接。  
旧版 XML 中的其他电商或品牌官网链接不进入 v5 主表。

## 图片与操作说明

- `product_image_path`：商品级本地图片。
- `colors[].product_image_path`：色号级 720×720 本地图片。
- `colors[].source_screenshot`：该色号对应的原始长截图。
- `usage_guide.text`：操作图示 OCR 后的文字。
- `usage_guide.image_paths`：保留的完整操作图示。
- `usage_guide.source_screenshots`：图示原始证据截图。

14 个商品在截图中发现明确的操作图示并已同时保存文字和图片，其中卡洛美使用
用户此前补充的湿发/干发方法图及用量频率图。没有操作图示的
商品不做推测，字段保持空数组或空文本。

## 产物

- `product-recommendation-rag-source.json`：可编辑事实源。
- `product-recommendation-rag.json`：后端召回文件。
- `feishu-product-kb-sku-v5.xml`：一行一个色号 SKU 的飞书版本；因单表最多
  2000 个单元格，按 16 个商品拆成 16 张子表。
- `source-assets/`：214 张原始证据截图和 OCR 坐标结果。
- `derived-assets/color-variants/`：色号商品/发色图。
- `derived-assets/usage/`：操作图示。
