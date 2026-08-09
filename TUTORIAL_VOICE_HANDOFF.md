# 教程语音与视频分段对接说明

本文档给接手同学使用，用于把本分支里的“教程播放、语音交互、TTS 提示、固定视频分段”迁移到你当前最新代码中，尽量避免整仓覆盖造成冲突。

本地参考提交：

```bash
e1bbc49 Improve tutorial voice flow and fixed segments
```

## 目标

这次改动主要解决 4 件事：

1. 教程视频分段必须严格使用旧版 `tony-agent` 中已经写死的分段，不再用当前自动生成/缩放分段覆盖。
2. 每一段视频播完后，TTS 固定说同一句：`你在这一步有什么问题，可以随时问我～`
3. 用户既可以语音说“下一步”，也可以直接点击“下一步”进入下一段。
4. VAD 降低误触发，键盘声/环境声不应频繁上传 ASR，也不应反复触发“我没有听清”。

## 推荐迁移顺序

不要直接覆盖整个文件。建议按下面顺序合：

1. 后端固定分段数据
2. 后端手动下一步接口
3. 后端 TTS 接入和 ASR 幻听过滤
4. 前端 tutorial step map 和 mock id 映射
5. 前端教程页 VAD、听觉状态、手动下一步

这样即使你当前最新代码里 UI 或 API 有改动，也能逐块合并。

## 后端改动

### 1. `backend/app/mock_data.py`

核心改动：

- 新增 `MANUAL_TUTORIAL_STEPS_BY_VIDEO_ID`
- 新增 `_manual_tutorial_step()`
- 新增 `_format_time_range()`
- `_tutorial_steps_for_video_id()` 优先返回手写固定分段
- `MockStore.session()` 会同步已有 session 的步骤，避免旧 session 还显示旧分段
- 新增 `MockStore.next_tutorial_step()`

固定分段来自旧版 `tony-agent/frontendv1/.../app/tony/mock-data.ts`。

当前应保留的分段结果：

```text
tutorial_blue       4 steps: 0-24078, 24078-46370, 46370-70112, 70112-101266
tutorial_red        4 steps: 0-20138, 20138-43454, 43454-81567, 81567-128637
tutorial_purple     3 steps: 0-25271, 25271-53888, 53888-98833
tutorial_pink       3 steps: 0-32888, 32888-56190, 56190-98682
tutorial_cold_tea   5 steps: 0-46173, 46173-95532, 95532-143007, 143007-189049, 189049-238630
tutorial_cold_brown 4 steps: 0-32125, 32125-64049, 64049-97971, 97971-144193
```

注意：

- `step_id` 使用 `${tutorial_id}_step_01` 这种形式，不要恢复成通用 `step_01`，否则多教程/旧 session 容易串。
- 如果最新代码里已经有数据库真实教程表，可以把这批数据作为 seed/override，但仍应保证这 6 个 `tutorial_video_id` 优先用固定分段。

### 2. `backend/app/main.py`

新增接口：

```http
POST /api/tutorial-sessions/{tutorial_session_id}/next-step
```

用途：

- 前端点击“下一步”时调用
- 不依赖 ASR
- 返回结构和语音识别出“下一步”一致，通常是 `play_next_step` 或最后一步后的 `capture_after_photo`

同时 `create_tutorial_session()` 和 `get_tutorial_session()` 会调用 `_hydrate_step_end_tts()`，给每步结束提示补 server TTS 音频。

### 3. `backend/app/services/model_service.py`

新增 OpenAI-compatible TTS：

- `TTS_PROVIDER=openai_next` 或 `openai_compatible`
- 请求 `{TTS_BASE_URL}/v1/audio/speech`
- 使用 `TTS_MODEL`、`TTS_VOICE`
- 返回 `data:<content-type>;base64,...`

环境变量只写变量名，不要把真实 key 提交：

```env
TTS_PROVIDER=openai_next
TTS_BASE_URL=https://api.openai-next.com
TTS_API_KEY=...
TTS_MODEL=qwen3-tts-flash
TTS_VOICE=Cherry
```

如果 key 不存在或 provider 不支持，后端会返回 `audio_url=null`，前端可继续走浏览器 fallback。

### 4. `backend/app/services/tutorial_service.py`

核心逻辑：

- 没听到声音时 TTS：`我没有听清，你再说一次。`
- 增加 `_looks_like_asr_hallucination()`，过滤纯英文 ASR 幻听，例如环境声被识别成英文句子。
- 如果用户在非最后一步说“结束了”，后端按 `next` 处理，避免误结束教程。
- `_tts_text_for_intent("next")` 固定返回：`你在这一步有什么问题，可以随时问我～`

### 5. `backend/app/scripts/generate_tutorial_segments.py`

只同步默认 `step_end_tts` 文案：

```text
你在这一步有什么问题，可以随时问我～
```

即使后面重新生成分段，TTS 提示文案也一致。

## 前端改动

### 1. `my-tony2.0/app/tony/mock-data.ts`

新增：

- `tutorialStep()`
- `TUTORIAL_STEPS_BY_VIDEO_ID`
- `TUTORIAL_STEPS` 默认指向 `tutorial_blue`

这保证 mock 模式和真实后端模式的分段结构一致。

### 2. `my-tony2.0/app/tony/api.ts`

新增：

- import `TUTORIAL_STEPS_BY_VIDEO_ID`
- `normalizeTutorialVideoId()`
- `tutorialVideoIdForMockArchive()`
- `MOCK_TUTORIAL_URL_BY_ID`
- `advanceTutorialStep(sessionId)`

迁移时注意旧 id 映射：

```ts
blue_tutorial   -> tutorial_blue
red_tutorial    -> tutorial_red
purple_tutorial -> tutorial_purple
pink_tutorial   -> tutorial_pink
tea_tutorial    -> tutorial_cold_tea
brown_tutorial  -> tutorial_cold_brown
```

如果你当前最新代码中已有更准确的商品/教程绑定关系，请优先用真实绑定关系；这个函数主要是 mock fallback。

### 3. `my-tony2.0/app/tony/TonyApp.tsx`

新增 `advanceTutorial()`，传给教程页：

```tsx
onNextStep={advanceTutorial}
```

它调用 `advanceTutorialStep(tutorialSession.tutorial_session_id)`。

### 4. `my-tony2.0/app/tony/archive-tutorial-screens.tsx`

教程页主要改动：

- `TutorialScreen` 新增 prop：`onNextStep`
- phase 从 `uploading` 改为 `thinking`
- 新增 `voiceLevel`，让用户说话时波形有反馈
- 新增 `handleManualNext()`，点击按钮即可进入下一步
- 底部主按钮固定显示 `下一步`
- 每段播完后的提示统一为：`你在这一步有什么问题，可以随时问我～`

VAD 关键参数：

```ts
volume > 0.035          // 认为有人声
1500ms silence          // 说完后停止录音
5000ms no speech        // 没说话则丢弃录音并继续监听
15000ms hard timeout    // 最长录音时间
450ms minimum speech    // 避免短促键盘声触发
blob.size < 900         // 太短音频不上传
```

重要行为：

- `noSpeechTimeout` 和没有人声的 `hardTimeout` 会设置 `discardRecordingRef.current = true`，不上传 ASR。
- 避免重复 transcript 在 4.5 秒内重复处理。
- silence 提示 9 秒内最多播一次，避免反复“我没有听清”。

## 类型改动

`my-tony2.0/app/tony/types.ts`

`TutorialAction` 的 `play_next_step` 分支新增可选字段：

```ts
tts_text?: string;
```

用于兼容后端/前端 mock 返回下一步提示文案。

## 验证方式

后端编译：

```bash
PYTHONPYCACHEPREFIX=/private/tmp/tony3-pycache python3 -m compileall backend/app
```

前端类型检查：

```bash
cd my-tony2.0
./node_modules/.bin/tsc --noEmit
```

后端分段检查：

```bash
cd backend
./.venv/bin/python - <<'PY'
from app.mock_data import _tutorial_steps_for_video_id
for tutorial_id in ['tutorial_blue','tutorial_red','tutorial_purple','tutorial_pink','tutorial_cold_tea','tutorial_cold_brown']:
    steps = _tutorial_steps_for_video_id(tutorial_id)
    print(tutorial_id, len(steps), [(s['step_no'], s['total_steps'], s['start_time_ms'], s['end_time_ms']) for s in steps])
PY
```

期望输出：

```text
tutorial_blue 4 [(1, 4, 0, 24078), (2, 4, 24078, 46370), (3, 4, 46370, 70112), (4, 4, 70112, 101266)]
tutorial_red 4 [(1, 4, 0, 20138), (2, 4, 20138, 43454), (3, 4, 43454, 81567), (4, 4, 81567, 128637)]
tutorial_purple 3 [(1, 3, 0, 25271), (2, 3, 25271, 53888), (3, 3, 53888, 98833)]
tutorial_pink 3 [(1, 3, 0, 32888), (2, 3, 32888, 56190), (3, 3, 56190, 98682)]
tutorial_cold_tea 5 [(1, 5, 0, 46173), (2, 5, 46173, 95532), (3, 5, 95532, 143007), (4, 5, 143007, 189049), (5, 5, 189049, 238630)]
tutorial_cold_brown 4 [(1, 4, 0, 32125), (2, 4, 32125, 64049), (3, 4, 64049, 97971), (4, 4, 97971, 144193)]
```

## 手动验收清单

1. 进入红发教程，顶部应显示 `第 1 步 / 共 4 步`，而不是 5 步。
2. 点击底部 `下一步`，应进入下一段视频，并显示对应第几步。
3. 每段视频播完，TTS 只说：`你在这一步有什么问题，可以随时问我～`
4. 用户说“下一步”，效果应与点击 `下一步` 一致。
5. 用户问“后脑勺怎么染”，页面应进入“听到了，正在思考/正在回答”状态，并播回答。
6. 不说话、敲键盘、环境声不应频繁触发 ASR 请求，也不应一直播“我没有听清”。
7. 蓝/红/紫/粉/冷茶/冷棕分别检查 step 总数是否为 4/4/3/3/5/4。

## 冲突处理建议

- 如果 `archive-tutorial-screens.tsx` 冲突很大，优先迁移行为而不是覆盖 UI：
  - `onNextStep`
  - `handleManualNext`
  - VAD discard/noSpeech/hardTimeout 逻辑
  - `voiceLevel` 和 `thinking` 状态
- 如果 `mock_data.py` 冲突很大，优先把固定分段抽成独立常量或 seed 文件，然后保证 `_tutorial_steps_for_video_id()` 优先读固定表。
- 如果最新后端已经有真实 TTS 服务，只需要保留统一文案和 `step_end_tts.audio_url` 返回结构，不必照搬 `model_service.py` 的 OpenAI-compatible 实现。
- 不要提交 `backend/data/meifa.db`。这是本地运行后端产生的测试数据库，当前 commit 没有包含它。

