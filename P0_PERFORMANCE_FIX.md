# P0 性能优化修改说明

> **日期**：2026-08-04
> **范围**：`backend/` 后端，共 4 个文件
> **目标**：解决"运行非常慢"的两个根因 —— FastAPI event loop 被阻塞、语音链路存在冗余网络调用
> **未涉及**：没有替换任何模型，没有改动任何业务逻辑、数据结构、接口出入参，**没有新增任何 mock / 假数据**

---

## 0. 先说结论：慢的原因不是"本地模型"

排查后发现，仓库其实**已经几乎全部是 API 调用**。主请求路径上真正在本机跑推理的神经网络模型只有一个：SenseVoice ASR。

`hair_full_pipeline/models/weights/` 下的三个权重文件（`hair_seg_smp.onnx` 8.3M、`hair_segmenter.tflite` 763K、`blaze_face.tflite` 224K）实际是**死代码**，三重证据：

1. `model_service.py:130` 调用时写死 `use_hair_segmentation=False`
2. `backend/requirements.txt` 里没有 `mediapipe`，也没有 `onnxruntime`
3. `hair_dye_engine.py:162` 的 `from services.segmentation import ...` 路径本身就是错的（文件实际在 `hair_full_pipeline/segmentation.py`，不存在 `services/` 目录），import 必然失败并被 `except` 静默吞掉

所以真正的瓶颈是**并发架构**，不是模型。本次 P0 只修架构。

---

## 1. 效果验证（真实压测，非估算）

在真实 app 上挂载两个探针路由，各执行 1 秒阻塞操作（模拟 ffmpeg + ASR + LLM 往返），发起 5 个并发请求，同时测量一个无关的 `/health` 请求的响应时间：

| 模式 | 5 并发总耗时 | 期间 `/health` 响应 |
|---|---|---|
| **修改前**（`async def` 内直接阻塞） | 5.05 s（完全串行） | **4948 ms**（整个服务冻结） |
| **修改后**（`def` + 线程池） | **1.02 s**（完全并行） | **2.6 ms** |

结论：吞吐提升 **5 倍**（并发数越高倍数越大），无关请求的响应时间从 ~5 秒降到 **2.6 毫秒**。

> 探针代码只存在于临时目录，**未进入仓库**。

---

## 2. 逐项修改说明

### 【修改 1】阻塞型端点 `async def` → `def`

**文件**：`backend/app/main.py`
**影响范围**：15 个端点

```
debug_state              update_hair_profile      create_archive
create_hair_profile      create_demo_profile      get_archives
get_plan_result          get_preview_task         get_archive
get_product_recommendations                       create_tutorial_session
get_tutorial_session     complete_tutorial        submit_after_photo
get_after_video_task
```

**改了什么**：函数签名从 `async def xxx(...)` 改为 `def xxx(...)`，**函数体一行未动**。

**为什么**：
原本 23 个端点全部声明为 `async def`，但函数体里全是同步阻塞调用（SQLite 读写、`urllib` 同步 HTTP、torch 推理、ffmpeg 子进程），且全仓库**零处** `run_in_executor` / `to_thread`。

在 asyncio 里，`async def` 函数体内的同步阻塞代码会**独占整个 event loop**。这意味着任意一个用户触发一次发色识别（vision API，超时上限 30 秒），**服务器上所有其他请求全部排队等待** —— 这就是"非常非常慢"的直接原因，而且人越多越严重，属于雪崩式劣化。

FastAPI 对 `def`（非 async）端点会自动丢进 anyio 线程池执行，不占用 event loop。所以这是**改一个关键字就能解决**的问题。

**风险**：无。这些函数体内本来就没有 `await`，本来就不该声明为 async。接口行为、出入参、返回结构完全不变。

---

### 【修改 2】`voice_input` 重活移出 event loop

**文件**：`backend/app/main.py`

**改了什么**：该端点因为有 `await audio_storage.save_upload(...)`，必须保持 `async def`。所以把它后半段的阻塞逻辑抽成新函数 `_process_voice_input()`，通过 `run_in_threadpool()` 调用。

```python
# 修改前：三个重操作直接跑在 event loop 上
asr_input_path = audio_converter.to_sensevoice_wav(...)   # ffmpeg 子进程
transcribe_result = model_service.transcribe_audio(...)   # torch CPU 推理
return ok(tutorial_service.handle_voice_input(...))       # 多次 LLM/embedding API

# 修改后
return ok(await run_in_threadpool(_process_voice_input, ...))
```

**为什么**：这是全仓库最重的一条路径 —— ffmpeg 转码 + 本地 ASR 推理 + 最多 4 次串行网络往返。放在 event loop 上，一个人说话就能让整个服务停摆数秒。

**风险**：无。`_process_voice_input` 是原代码的**逐行搬移**，逻辑零改动。

---

### 【修改 3】`upload_image` 磁盘写入移出 event loop

**文件**：`backend/app/main.py`

**改了什么**：`store.save_image(...)` 改为 `await run_in_threadpool(store.save_image, ...)`。

**为什么**：单张图片上限 10 MB，同步写盘会阻塞 event loop。

**风险**：无。参数与返回值不变。

---

### 【修改 4】提高 anyio 线程池容量

**文件**：`backend/app/main.py`（`lifespan`）、`backend/app/config.py`

```python
anyio.to_thread.current_default_thread_limiter().total_tokens = settings.request_worker_threads
```

**为什么**：修改 1~3 之后，所有阻塞端点都跑在 anyio 线程池里。该池**默认只有 40 个线程**。而单个 vision 请求最长可占用线程 30 秒（`VISION_TIMEOUT_SECONDS`），40 个线程很容易被慢请求占满，导致轻量请求重新排队 —— 等于把瓶颈从 event loop 挪到了线程池。因此提到 64，并做成可配置。

**风险**：低。线程本身开销很小（这些线程绝大部分时间在等网络 I/O，不吃 CPU）。

---

### 【修改 5】后台生成任务并发数可配置

**文件**：`backend/app/main.py`、`backend/app/config.py`

**改了什么**：`preview_executor` 和 `after_video_executor` 的 `max_workers` 从**硬编码 1** 改为读取配置，默认值 **2**。

**为什么**：原先两个后台生成器各只有 1 个 worker，意味着**所有用户的生图/生视频请求全局串行**。第 3 个用户要等前两个各自完整跑完（每个是一次 OpenRouter 生图 / wan 视频生成，动辄十几到几十秒）才轮到自己。

**⚠️ 这一项需要你确认**：这是本次唯一会改变**默认运行行为**的修改。提高并发会同比提高对 OpenRouter / draw API 的并发压力。如果这两家有速率限制（429），请调回 1：

```bash
PREVIEW_WORKER_COUNT=1
AFTER_VIDEO_WORKER_COUNT=1
```

---

### 【修改 6】语音路径：删掉一次被浪费的 LLM 调用

**文件**：`backend/app/services/tutorial_service.py`

**改了什么**：把 `rewrite_operation_question()`（一次 LLM 调用）从 `_looks_like_question()` 判断**之前**移到 `else` 分支**之内**。

```python
# 修改前
query = self.model_service.rewrite_operation_question(...)   # 总是调用
if not _looks_like_question(transcript):
    answer_text = "我没太理解你的问题…"                        # ← query 在这条分支上根本没被用到
else:
    hit = self._best_kb_hit(queries=[transcript, query], ...)

# 修改后
query = ""
if not _looks_like_question(transcript):
    answer_text = "我没太理解你的问题…"                        # 不再触发 LLM 调用
else:
    query = self.model_service.rewrite_operation_question(...)
    hit = self._best_kb_hit(queries=[transcript, query], ...)
```

**为什么**：当用户说的话没通过"像不像一个问题"的判断时，代码走 clarify 分支返回固定话术，**`query` 变量完全没被使用**。但改写的 LLM 调用已经发出去了 —— 纯浪费一次网络往返（含最长 30 秒超时风险）。

**风险**：无。`query` 只在 else 分支和其下游的 `answer_meta["matched_query"]` 中使用，clarify 分支的 `answer_meta` 本来就不含该字段。返回结构完全一致。

---

### 【修改 7】KB 检索：N 次 embedding API 调用合并为 1 次

**文件**：`backend/app/kb/operation_qa_kb.py`、`backend/app/services/tutorial_service.py`

**改了什么**：新增 `OperationQAKB.search_many(queries=[...])`。原 `search()` 保留，内部委托给 `search_many([query])`，对外签名和行为不变。

**为什么**：语音问答会用两个 query 检索知识库（用户原话 + LLM 改写后的问题）。原实现对每个 query 各调一次 `search()`，而每次 `_search_chroma()` 内部都会单独调一次 embedding API —— **2 个 query = 2 次网络往返**。

但 `model_service.embed_texts()` 的签名本来就是 `(texts: list[str])`，**天然支持批量**。所以现在一次性把两个 query 都传进去，**1 次 API 调用拿回 2 个向量**，chroma 查询本身是本地操作，可以直接跑两次。

**语义完全保持一致**（这点很重要，请重点 review）：
- 每个 query 依旧是「先查 chroma，没命中再退回 SQLite 关键词」的顺序
- 依旧是「取所有 query 里得分最高的那条」
- 去重规则依旧是「先 strip 再去重」（已用测试用例逐条比对验证）
- embedding API 失败时依旧完整退回 SQLite 关键词检索

**风险**：低。这是本次改动中唯一动了内部逻辑结构的一处，建议重点看 `search_many()` 那个 for 循环。

---

## 3. 新增环境变量（全部可选，有默认值）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `REQUEST_WORKER_THREADS` | `64` | anyio 线程池大小。慢上游多、并发高时可上调 |
| `PREVIEW_WORKER_COUNT` | `2` | 生图并发。**遇到 OpenRouter 429 就设为 1** |
| `AFTER_VIDEO_WORKER_COUNT` | `2` | 生视频并发。**遇到 draw API 429 就设为 1** |

不设置这些变量时代码照常运行，用上表默认值。

---

## 4. 明确没有改动的部分

为了方便对接，列清楚**没碰**的东西：

- ❌ 没有替换任何模型（SenseVoice 仍在本地跑，vision 仍是 `gpt-4o-mini`）
- ❌ 没有改任何 API 的路径、请求体、响应体、字段名
- ❌ 没有改数据库 schema、表结构、写入逻辑
- ❌ 没有改 `mock_data.py`，**没有新增任何 mock / 假数据 / 占位数据**
- ❌ 没有改前端 `my-tony2.0/`
- ❌ 没有删除那三个死代码权重文件（等你确认后再删）
- ❌ 没有动 `MOCK_MODELS` 的默认值和相关分支

---

## 5. 如何回滚

全部改动集中在 4 个文件，可整体回滚：

```bash
git checkout -- backend/app/main.py backend/app/config.py backend/app/kb/operation_qa_kb.py backend/app/services/tutorial_service.py
```

只想回滚风险最高的那一项（修改 5，后台并发）：设环境变量 `PREVIEW_WORKER_COUNT=1` 和 `AFTER_VIDEO_WORKER_COUNT=1` 即可，无需改代码。

---

## 6. 本次未做，建议排入 P1

按收益从高到低：

| 项 | 说明 | 预期收益 |
|---|---|---|
| `urllib` → `httpx` 连接池 | 8 处同步 HTTP 调用无 keep-alive，每次重新 TCP+TLS 握手，跨境走 openai-next 中转尤其明显 | 中 |
| 超时分级 | 所有 LLM 调用共用 `VISION_TIMEOUT_SECONDS=30`。意图分类（10 token）不该和双图 vision 用同一个超时，建议短调用降到 5~8 秒 | 中 |
| SenseVoice → SiliconFlow API | 同模型、SiliconFlow 上免费、`SILICONFLOW_API_KEY` 已配置。换掉后可从 `requirements.txt` 删除 `torch` + `torchaudio` + `funasr` + `modelscope`，部署包和冷启动大幅改善 | 中（部署收益大） |
| vision 图片瘦身 | 目前传两张 base64 且 `detail: "high"`，payload 极大。压缩后再传 | 中小 |
| 视频轮询间隔 | `transition_video_service.py:177` 的 `time.sleep(30)` 导致最坏情况多等 30 秒，建议改 3~5 秒 | 中小 |
| 删除死代码 | 三个权重文件 + `segmentation.py`（约 9 MB） | 仓库清爽 |
| KB 的 N+1 查询 | `_search_chroma` 每个候选调一次 `_row_by_id`；KB 初始化后是静态的，可一次性载入内存字典 | 小 |
| 语音链路推测执行 | 让 KB 检索与意图分类并行发起，再按意图结果取舍。可再省一个往返，但会引入少量无效 embedding 调用，需权衡 | 小 |
