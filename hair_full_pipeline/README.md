# AI染发全流程

## 流程
1. 目标色图 → 头发分割取色 → RGB/LAB
2. CIEDE2000匹配知识库 → 颜色家族 + 度数
3. 可行性判断（度数对比 + 颜色中和）
4. GLM生成标准染后图（1次API）
5. 本地HSV微调生成4张变体（零API）
6. 输出6宫格对比图

## 文件结构
`
hair_full_pipeline/
├── hair_dye_engine.py      # 颜色匹配 + 可行性判断 + 头发分割取色
├── glm_hair_generator.py   # GLM生图 + HSV变体 + 6宫格布局
├── hair_color_transfer.py  # LAB颜色迁移（本地）
├── segmentation.py         # 头发分割（MediaPipe/SMP）
├── color_utils.py          # RGB/LAB/HSV转换
├── config.py               # 配置（API Key等）
├── .env                    # API Key配置
├── run_pipeline.py         # 全流程测试脚本
├── data/                   # 知识库
│   ├── hairdye_palette_flat.json    # 13色家族×5度数
│   ├── neutralization_rules.json    # 颜色中和规则
│   └── hairdye_palette_mapping.json # 底色度数映射
├── models/                 # 本地模型
│   ├── hair_segmenter.tflite        # MediaPipe头发分割
│   ├── hair_seg_smp.onnx            # SMP头发分割
│   └── blaze_face.tflite            # 人脸检测
`

## 运行
`ash
python run_pipeline.py <目标图> <用户图>
`

## 依赖
- Python 3.8+
- opencv-python
- numpy
- Pillow
- mediapipe
- onnxruntime
- requests
