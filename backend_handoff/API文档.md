# 染发识别接口 - 后端对接文档

## 一、接口定义

### POST /api/v1/vision/hair-color-recognize

**请求：**
`json
{
  "target_image": "base64或URL",    // 目标色图（博主染后效果图）
  "user_image": "base64或URL"       // 用户当前发色图
}
`

**响应：**
`json
{
  "target_color": {
    "family": "粉色",               // 颜色家族
    "level": 8,                     // 度数
    "rgb": [235, 108, 107],         // RGB
    "hex": "#EB6C6B",               // HEX
    "lab": [61.18, 49.0, 25.0]      // LAB
  },
  "user_color": {
    "family": "奶茶金",
    "level": 8,
    "rgb": [195, 161, 131],
    "hex": "#C3A183",
    "lab": [68.63, 8.0, 20.0]
  },
  "feasibility": {
    "can_dye": true,                // 是否可染
    "has_risk": true,               // 是否有偏色风险
    "user_level": 7,                // 用户底色度数
    "target_level": 8,              // 目标度数
    "recommendation": "可以染粉色8度，但有偏色风险（底色差1度），建议先漂浅",
    "neutralization": "奶茶金 + 粉 = 粉色"  // 颜色中和规律
  }
}
`

## 二、核心逻辑（后端需要实现）

### 1. 目标色匹配
- 输入：目标图base64
- 用头发分割模型提取头发区域颜色
- RGB → LAB转换
- CIEDE2000匹配知识库
- 输出：颜色家族 + 度数 + RGB

### 2. 用户发色识别
- 输入：用户图base64
- 同样用头发分割取色
- 匹配知识库得到底色度数

### 3. 可行性判断（两层）
- **第一层：度数对比**
  - 用户底色 >= 目标度数 → 可染
  - 用户底色 = 目标度数 - 1 → 可染但有偏色风险
  - 用户底色 < 目标度数 - 1 → 不推荐
- **第二层：颜色中和**
  - 查规则表：红+蓝=紫，棕+粉=粉棕等
  - 不满足中和规律 → 不可染

## 三、知识库字段

### hairdye_palette_flat.json
`json
{
  "family_zh": "粉色",      // 中文名
  "family_en": "PINK",      // 英文名
  "level": 8,               // 度数(5-9)
  "rgb": [235, 108, 107],   // RGB
  "lab": [61.18, 49.0, 25.0], // LAB
  "hex": "#EB6C6B"          // HEX
}
`

### neutralization_rules.json
`json
{
  "family_to_hue": {
    "红色": "红",
    "粉色": "粉红",
    "紫色": "紫"
  },
  "rules": {
    "红": {"紫": "蓝", "蓝": "蓝"},
    "紫": {"蓝": "蓝"}
  }
}
`
含义：红+蓝=紫，即"红 转 紫 需要加 蓝"

## 四、需要后端做的事

1. **接收图片** → 调用头发分割模型取色
2. **匹配知识库** → CIEDE2000算法
3. **可行性判断** → 度数对比 + 中和规则
4. **返回结果** → 上面的JSON格式
5. **生图部分** → 调用GLM API（由前端/另一服务处理）

## 五、依赖模型（需要部署）
- hair_segmenter.tflite (MediaPipe头发分割)
- hairdye_palette_flat.json (知识库)
- 
eutralization_rules.json (中和规则)

## 六、Python核心代码
见 hair_dye_engine.py，主要函数：
- extract_color_from_image(img, use_hair_segmentation=True) → 取色
- match_to_palette(lab, top_n=5) → 匹配知识库
- check_feasibility(user_level, target_family, target_level, ...) → 可行性判断
- check_neutralization(current_family, target_family) → 中和判断
