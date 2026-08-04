# P1 性能优化修改说明

> **日期**：2026-08-04
> **前置**：本文档接续 [`P0_PERFORMANCE_FIX.md`](./P0_PERFORMANCE_FIX.md)，P0 已合并
> **范围**：`backend/`，7 个文件修改 + 3 个文件新增
> **主题**：网络层（连接复用、超时分级、payload 瘦身）+ ASR 上云 + 依赖瘦身
> **同样没有新增任何 mock / 假数据**

---

## 0. 实测结果

### 连接池（真实 HTTPS 端点，6 次串行请求，含跨境 TLS 握手）

| 实现 | 总耗时 | 平均 |
|---|---|---|
| `urllib`（原实现，每次重新握手） | 8439 ms | 1407 ms/次 |
| `httpx` 连接池（复用连接） | **3101 ms** | **517 ms/次** |

**省下 63%**。语音问答一次要打 3~4 个上游请求，这个收益是叠加的。

> 注：在**本机 HTTP**（无 TLS）的对照测试里，连接池反而比 `urllib` 慢（68.9ms vs 13.7ms）——
> 因为没有握手可省，只剩 httpx 更高的 Python 开销。收益完全来自跨境 HTTPS 握手，
> 而你的上游（openai-next / siliconflow）正是这种场景。本地起 mock server 压测会得出相反结论，
> 别被误导。

### vision 图片瘦身（3600×4800 高噪点照片，接近真实手机照）

| | base64 体积 |
|---|---|
| 原实现（原图直传） | 2.92 MB |
| 瘦身后（长边限 1024，JPEG q85） | **0.10 MB** |

上传体积降到 **3.3%**，同时减少 vision 模型的图像 tile 计费。

---

## 1. 逐项修改说明

### 【P1-1】新增共享 HTTP 客户端，连接复用

**新增文件**：`backend/app/services/http_client.py`
**改动文件**：`model_service.py`、`transition_video_service.py`、`main.py`

**改了什么**：全部 8 处 `urllib.request.urlopen` 调用改为走一个模块级单例 `httpx.Client`（`max_connections=64`，`keepalive_expiry=60s`）。新增统一的 `post_json()` helper。应用关闭时在 `lifespan` 里 `close_client()`。

**为什么**：`urllib` 每次调用都新建 TCP 连接并重做 TLS 握手。上游全是跨境中转（openai-next / siliconflow），一次握手就是几百毫秒。语音问答单次要打 3~4 个上游请求，等于白白多付 3~4 次握手。

**错误格式保持不变**：`post_json` 抛出的错误字符串沿用原来的 `<label>_http_<code>:<detail>` 形状，因为这些字符串会被写进 `fallback_reason` 存库。下游解析逻辑无需改动。

**风险**：低。新增依赖 `httpx==0.28.1`（FastAPI 生态内的标准库，无额外传递依赖负担）。

---

### 【P1-2】超时分级

**改动文件**：`config.py`、`model_service.py`

**改了什么**：原本所有 LLM 调用共用 `VISION_TIMEOUT_SECONDS=30`，embedding 则是硬编码 `timeout=20`。现在拆成四档：

| 用途 | 新配置 | 默认 | 原值 |
|---|---|---|---|
| 意图分类（输出 ~10 token）、问题改写（~80 token） | `LLM_FAST_TIMEOUT_SECONDS` | **8s** | 30s |
| 答案润色、兜底回答（~180~220 token） | `LLM_ANSWER_TIMEOUT_SECONDS` | **15s** | 30s |
| embedding | `EMBEDDING_TIMEOUT_SECONDS` | **10s** | 20s（硬编码） |
| 双图 vision 识别 | `VISION_TIMEOUT_SECONDS` | 30s（不变） | 30s |

**为什么**：一次只输出 10 个 token 的意图分类，没有任何理由等满 30 秒。上游偶发抖动时，原设计会把一次几百毫秒的小请求变成半分钟的卡死 —— 而这些调用全在语音路径上，用户是在染发过程中**站着等**。分级后最坏情况从 30 秒降到 8 秒。

`_chat_completion()` 新增必填的 `timeout` 参数，三个调用点分别传入对应档位。

**风险**：低。若上游确实慢导致 8 秒不够，调用会走既有的 fallback 分支（返回关键词兜底答案），不会报错给用户。真遇到就上调 `LLM_FAST_TIMEOUT_SECONDS`。

---

### 【P1-3】vision 图片瘦身

**改动文件**：`config.py`、`model_service.py`（`_image_data_url`）

**改了什么**：`_image_data_url` 从「读原始字节直接 base64」改为「先用 Pillow 缩放到长边 ≤1024 并重编码为 JPEG q85，再 base64」。解码失败时回退到原始字节。

新增三个配置：`VISION_IMAGE_MAX_EDGE`(1024)、`VISION_IMAGE_QUALITY`(85)、`VISION_IMAGE_DETAIL`(high)。

**为什么**：手机照片普遍 3000~4000px。原实现把两张这样的图 base64 后塞进 JSON body，请求体轻松到几 MB，上传本身就要好几秒；而且 `detail: "high"` 下模型按图块计费，图越大 tile 越多、越慢越贵。1024px 对于「判断发色和发长」完全够用。

**注意**：`detail` 默认值仍是 `"high"`，我**没有**降级它 —— 发色识别的准确度比省 token 重要。瘦身收益全部来自缩放。如果后续想再省，可以设 `VISION_IMAGE_DETAIL=low` 但需要先验证识别准确率。

**风险**：中低。这是唯一可能影响**识别质量**的改动。1024px 理论上绰绰有余，但建议你上线前用几张真实用户照片对比一下识别结果。不满意就把 `VISION_IMAGE_MAX_EDGE` 调到 1536 或 2048。

---

### 【P1-4】ASR 改走 SiliconFlow 云端（同模型）

**新增文件**：`backend/app/services/siliconflow_asr_service.py`
**改动文件**：`config.py`、`model_service.py`、`requirements.txt`、新增 `requirements-local-asr.txt`

**改了什么**：
- 新增 `ASR_PROVIDER=siliconflow`，调用 `POST /v1/audio/transcriptions`，模型 `FunAudioLLM/SenseVoiceSmall`
- **默认值从 `sensevoice` 改为 `siliconflow`**
- 本地路径完整保留，设 `ASR_PROVIDER=sensevoice` 即可切回
- `torch` / `torchaudio` / `funasr` / `modelscope` 从 `requirements.txt` 移到 `requirements-local-asr.txt`

**为什么**：
- **同一个模型**（`FunAudioLLM/SenseVoiceSmall`），识别质量不变
- SiliconFlow 上该模型**免费**
- **复用你已有的 `SILICONFLOW_API_KEY`**（当前用于 embedding），无需新账号
- 主要收益是**部署重量**：省掉约 2 GB 依赖和多秒级的模型冷启动，Docker 构建、内存占用、启动时间全面改善

**双重兜底**（不会因为上云而变脆弱）：
1. 没配 `SILICONFLOW_API_KEY` → 记 warning，自动回退本地 SenseVoice
2. 云端调用抛 `UpstreamError` → 记日志，自动回退本地 SenseVoice

所以即使你暂时不装 `requirements-local-asr.txt`，只要 key 正常就能跑；key 出问题且装了本地依赖，也能继续服务。

**⚠️ 需要你确认**：这是本次改变默认行为最大的一项。
- 如果部署环境**已经装好** torch 全家桶且运行正常，想维持原状：设 `ASR_PROVIDER=sensevoice`
- 如果想拿到部署瘦身收益：保持默认，并确认 `SILICONFLOW_API_KEY` 已配置

**风险**：中。ASR 从本机变成了一次网络往返（受 `ASR_TIMEOUT_SECONDS=8` 约束）。网络差的环境下，本地推理反而可能更稳 —— 这点需要你在真实部署环境实测后决定。

---

### 【P1-5】视频轮询间隔

**改动文件**：`config.py`、`transition_video_service.py`

**改了什么**：`time.sleep(30 if self._is_wan else 5)` 改为读配置 `TRANSITION_VIDEO_POLL_INTERVAL_SECONDS`，默认 **5 秒**。

**为什么**：wan 模式原本每 30 秒才查一次任务状态。任务在轮询后一秒完成的话，用户还要再干等 29 秒。改成 5 秒，最坏多等时间从 30 秒降到 5 秒。

**风险**：低。轮询变密会略微增加对 draw API 的请求数（一个 3 分钟的任务从 6 次查询变成 36 次），如果对方限流就上调这个值。

---

### 【P1-6】知识库 N+1 查询消除

**改动文件**：`kb/operation_qa_kb.py`

**改了什么**：`_rows()` 增加内存缓存，`_row_by_id()` 改为查缓存字典而非每次开 SQLite 连接。

**为什么**：原本每次 chroma 检索会对每个候选调一次 `_row_by_id()`，每次都新建一个 SQLite 连接（典型 10 个候选 = 10 次连接）；关键词检索则每次全表扫描。

**为什么可以安全缓存**：`operation_qa` 表只在 `Database.initialize()` 里由 `_seed_operation_qa()` 写入一次（`main.py` 的 `lifespan` 中，早于 `operation_qa_kb.initialize()`），运行时**没有任何写入路径**（已 grep 确认）。

**风险**：低。但如果**将来**新增了运行时修改知识库的功能，必须记得让缓存失效 —— 这一点请技术同学留意。

---

## 2. 新增/变更的环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `ASR_PROVIDER` | **`siliconflow`**（原 `sensevoice`） | 改回本地填 `sensevoice` |
| `SILICONFLOW_ASR_MODEL` | `FunAudioLLM/SenseVoiceSmall` | 与本地同模型 |
| `LLM_FAST_TIMEOUT_SECONDS` | `8` | 意图分类 / 问题改写 |
| `LLM_ANSWER_TIMEOUT_SECONDS` | `15` | 答案润色 / 兜底回答 |
| `EMBEDDING_TIMEOUT_SECONDS` | `10` | 原为硬编码 20 |
| `VISION_IMAGE_MAX_EDGE` | `1024` | 识别不准就调到 1536/2048 |
| `VISION_IMAGE_QUALITY` | `85` | JPEG 质量 |
| `VISION_IMAGE_DETAIL` | `high` | 未降级，保持原值 |
| `TRANSITION_VIDEO_POLL_INTERVAL_SECONDS` | `5` | 原为硬编码 30 |

`.env.example` 已同步更新。

---

## 3. 依赖变化

```bash
# 默认安装（云端 ASR，不含 torch）
pip install -r backend/requirements.txt

# 只有当你要用本地 ASR 时才额外装（约 2 GB）
pip install -r backend/requirements-local-asr.txt
```

- **新增**：`httpx==0.28.1`
- **移出主依赖**：`torch` / `torchaudio` / `funasr` / `modelscope` → `requirements-local-asr.txt`

---

## 4. 明确没有改动的部分

- ❌ 没有改任何 API 的路径、请求体、响应体、字段名
- ❌ 没有改数据库 schema 和写入逻辑
- ❌ **没有新增任何 mock / 假数据**（`mock_data.py` 未触碰）
- ❌ 没有改前端 `my-tony2.0/`
- ❌ 没有改 vision / answer / embedding 的**模型选择**（仍是 `gpt-4o-mini` + `bge-large-zh-v1.5`）
- ❌ 没有降级 `detail: "high"`
- ❌ **没有删除**那三个权重文件和 `segmentation.py`（见下）

---

## 5. 关于「删除死代码」——这一项我没做，需要你决定

P0 文档里我把三个权重文件列为死代码建议删除。**深入排查后发现不能直接删**：

`hair_full_pipeline/run_pipeline.py:13,17` 会以 `use_hair_segmentation=True` 调用分割逻辑。也就是说**独立运行的 pipeline 脚本是想用这些模型的**，只是因为 `hair_dye_engine.py:162` 的 import 路径写错了（`from services.segmentation import` —— 但文件实际在 `hair_full_pipeline/segmentation.py`，没有 `services/` 目录），一直静默 fallback 到中心裁剪。

所以有三个选择，**请你决定**：

| 选项 | 后果 |
|---|---|
| **A. 保持现状**（当前状态） | 后端不受影响；独立脚本继续用中心裁剪取色，精度较低 |
| **B. 修好 import 路径** | 独立脚本真正启用分割，取色更准，但需装 `mediapipe`/`onnxruntime`，且会变慢 |
| **C. 删除文件** | 省 9 MB 仓库体积；后端零影响，但独立脚本永久失去分割能力 |

后端主路径（`use_hair_segmentation=False`）三种选项下**完全不受影响**，纯粹是独立脚本的取舍。因为涉及删除且影响另一条使用路径，我没有替你决定。

---

## 6. 如何回滚

```bash
# 整体回滚 P1（保留 P0）
git revert <P1 commit hash>
```

按项回滚，无需改代码：

| 想回滚 | 设置 |
|---|---|
| ASR 回本地 | `ASR_PROVIDER=sensevoice` + 装 `requirements-local-asr.txt` |
| 超时回 30s | `LLM_FAST_TIMEOUT_SECONDS=30 LLM_ANSWER_TIMEOUT_SECONDS=30` |
| 图片不瘦身 | `VISION_IMAGE_MAX_EDGE=99999` |
| 轮询回 30s | `TRANSITION_VIDEO_POLL_INTERVAL_SECONDS=30` |

---

## 7. 剩余可做项（P2）

| 项 | 说明 |
|---|---|
| 语音链路推测执行 | KB 检索与意图分类并行发起，按意图结果取舍。可再省一个往返，代价是少量无效 embedding 调用 |
| TTS 服务端实现 | `synthesize_speech()` 目前只返回 `tts_provider_not_implemented`，前端在用浏览器兜底。前端已有 `qwen3-tts-flash` 可复用 |
| 流式 ASR | 若要做「边说边出字」，需换 WebSocket 方案（阿里云 `paraformer-realtime-v2` 或 ElevenLabs Scribe v2 RT，<150ms） |
| vision 结果缓存 | 同一张图重复分析时可按文件 hash 缓存 |
| 直连替代中转 | openai-next 是第三方中转，直连官方 API 通常更快更稳 |
| 前端并行化 | `my-tony2.0` 的 `claude-opus-4-7` 调用未审查，可能存在同类串行问题 |
