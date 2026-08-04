# 本地运行指南

两个服务：后端 FastAPI（:8000）+ 前端 Next.js（:3100）。

## 首次准备

```bash
# 后端（不含 torch，装得很快）
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cd ..

# 前端
npm --prefix my-tony2.0 install
```

## 配置

`backend/.env`（此文件被 gitignore，不会进仓库）：

```bash
MOCK_MODELS=false
CORS_ORIGINS=http://localhost:3100,http://127.0.0.1:3100

OPENAI_NEXT_API_KEY=      # 发色识别 + 语音问答
SILICONFLOW_API_KEY=      # embedding + 云端 ASR
OPENROUTER_API_KEY=       # 染后生图
DRAW_API_KEY=             # 转场视频
```

`my-tony2.0/.env.local`：

```bash
NEXT_PUBLIC_API_MODE=real
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
```

## 启动

```bash
cd backend && ./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

另开一个终端：

```bash
npm --prefix my-tony2.0 run dev -- --port 3100
```

打开 http://localhost:3100

## 已知情况

- **视频和图片是空的**。`backend/data/media/mock-assets/` 下的 jpg/mp4 从未进过仓库（根 `.gitignore` 第 15-17 行排除了 `*.jpg` / `*.mp4` / `*.png`），2.0 仓库里也没有。需要从原始素材来源补齐才能看到画面，页面结构和接口调用本身是正常的。
- **不填 API key 也能跑**：发色识别会走本地色彩提取兜底；生图 / 转场视频 / 语音问答会返回失败状态，属预期。
- **想用本地 ASR**（默认走云端）：
  ```bash
  ./.venv/bin/pip install -r requirements-local-asr.txt   # 约 2 GB
  # 然后在 backend/.env 里设 ASR_PROVIDER=sensevoice
  ```
- **独立跑 hair pipeline**：
  ```bash
  pip install -r hair_full_pipeline/requirements.txt
  python hair_full_pipeline/run_pipeline.py
  ```

## 性能相关的可调项

改完 `backend/.env` 需重启后端。完整列表见 [`P0_PERFORMANCE_FIX.md`](./P0_PERFORMANCE_FIX.md) 和 [`P1_PERFORMANCE_FIX.md`](./P1_PERFORMANCE_FIX.md)。

| 变量 | 默认 | 遇到什么问题时调 |
|---|---|---|
| `PREVIEW_WORKER_COUNT` | 2 | OpenRouter 返回 429 → 设为 1 |
| `AFTER_VIDEO_WORKER_COUNT` | 2 | draw API 返回 429 → 设为 1 |
| `LLM_FAST_TIMEOUT_SECONDS` | 8 | 意图识别经常超时 → 上调 |
| `VISION_IMAGE_MAX_EDGE` | 1024 | 发色识别不准 → 调到 1536 / 2048 |
| `ASR_PROVIDER` | siliconflow | 网络差 → 改 sensevoice 用本地 |
