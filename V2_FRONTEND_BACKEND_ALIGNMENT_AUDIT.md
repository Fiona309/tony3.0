# v2 前端与后端接口对齐梳理

生成时间：2026-07-26

范围：
- 后端：`/Users/bytedance/Documents/tony agent/backend/`
- v1 已联调前端：`/Users/bytedance/Documents/tony agent/frontendv1/莓发前端完整代码-稳定版-20260725/`
- v2 产品前端：`/Users/bytedance/Documents/tony agent/my-tony2.0/`

本文件只做梳理，不包含代码修改。

## 结论概览

v2 不是完全没有接口层。`my-tony2.0/app/tony/api.ts` 已经封装了多数后端接口，并且通过 `NEXT_PUBLIC_API_MODE=real` 可以切换到真实后端。

当前最大问题是：v2 把“真实接口调用”和“产品经理固定流程/本地 Mock 状态”混在了一起。部分页面即使拿到了真实后端数据，也会在组件内部重新覆盖成固定值，或者把应该写回后端的数据只保存在浏览器本地。

优先级最高的问题：
1. 后端返回的 `/media/...` 相对资源 URL 在 v2 没有补后端 origin，部署/直连后端时容易 404。
2. v2 画像确认页覆盖了后端 AI 识别结果，把 `current_hair` 强制改成单色模式。
3. 教程完成记录在 v2 只本地保存，没有调用后端 `completion-record` 接口。
4. v2 类型定义落后于 v1 和后端，缺少 `tutorial_steps`、`awaiting_voice_input`、`replay_current_step`、`queued` 等真实字段/状态。
5. 真实语音链路基本接上了，但后端可能返回的重播动作 v2 没有正确处理。

## 后端真实接口清单

后端入口：`backend/app/main.py`

### 基础与视频入口

`GET /health`
- 用于健康检查。

`GET /api/mock/videos`
- 返回入口视频流。
- 虽然接口名叫 mock，但这是当前产品真实入口数据源。
- 返回字段包括：
  - `video_id`
  - `title`
  - `video_type`
  - `url`
  - `cover_url`
  - `target_frame_url`
  - `trigger_time_ms`
  - `color_name`
  - `color_alias`
  - `accent`
  - `bound_product_id`
  - `bound_tutorial_video_id`

对应后端位置：
- `backend/app/main.py:209`
- `backend/app/mock_data.py:494`

### 图片上传

`POST /api/media/images`
- 表单字段：
  - `file`
  - `media_type`: `current_hair` 或 `after_hair`
- 返回：
  - `image_id`
  - `media_type`
  - `storage_key`
  - `url`

注意：
- 后端返回的 `url` 是 `/media/...` 相对路径。
- 前端如果直连 `http://后端:8000`，必须补成完整后端 origin，否则浏览器会请求前端域名下的 `/media/...`。

对应后端位置：
- `backend/app/main.py:214`
- `backend/app/mock_data.py:515`

### 发色画像识别

`POST /api/hair-profiles`
- JSON 入参：
  - `entry_video_id`
  - `current_image_id`
- 后端会：
  - 根据 `entry_video_id` 找目标参考图
  - 根据 `current_image_id` 找用户上传图
  - 调用真实 AI 识别
  - 生成待确认画像

返回核心字段：
- `profile_id`
- `status`: `need_confirm` 或 `failed`
- `target_color`
- `target_color_options`
- `current_hair`
- `hair_length`
- `hair_volume`
- `dye_history`
- `attribute_confidences`
- `editable_options`
- `vision_error`
- `vision_debug`

对应后端位置：
- `backend/app/main.py:235`
- `backend/app/mock_data.py:543`

### 画像确认

`PATCH /api/hair-profiles/{profile_id}`
- JSON 入参：
  - `target_color`
  - `current_hair`
  - `hair_length`
  - `hair_volume`
  - `dye_history`
- 返回：
  - `profile_id`
  - `status: confirmed`

对应后端位置：
- `backend/app/main.py:270`
- `backend/app/mock_data.py:633`

### 规则引擎方案判读

`POST /api/agent/plan-result`
- JSON 入参：
  - `profile_id`
- 后端会：
  - 读取已确认画像
  - 调用 `ColorRuleKB.evaluate_profile()`
  - 生成方案结果
  - 如果可推荐商品，进入效果图生成任务队列

返回核心字段：
- `profile_id`
- `plan_id`
- `feasibility`
- `summary`
- `reachability_score`
- `risks`
- `preview_status`: `queued`、`generating`、`completed`、`fallback`
- `preview_task_id`
- `preview_images`
- `preview_labels`
- `route_cards`
- `default_route`
- `default_preview_level`
- `can_recommend_product`
- `color_rule`

对应后端位置：
- `backend/app/main.py:275`
- `backend/app/mock_data.py:645`

### 效果图任务轮询

`GET /api/preview-tasks/{preview_task_id}`
- 返回状态：
  - `queued`
  - `generating`
  - `completed`
  - `fallback`

对应后端位置：
- `backend/app/main.py:286`
- `backend/app/mock_data.py:731`

### 商品推荐

`POST /api/agent/product-recommendations`
- JSON 入参：
  - `profile_id`
  - `plan_id`
  - `selected_route`
  - `selected_preview_level`
  - `budget`
- 返回：
  - `recommendation_id`
  - `status`
  - `primary_product`
  - `other_products`
  - `risk_level`
  - `risk_summary`
  - `color_rule`

对应后端位置：
- `backend/app/main.py:538`
- `backend/app/mock_data.py:813`

### 档案

`POST /api/hair-dye-archives`
- JSON 入参：
  - `profile_id`
  - `plan_id`
  - `recommendation_id`
  - `sku_id`
  - `purchase_status`

`GET /api/hair-dye-archives`

`GET /api/hair-dye-archives/{archive_id}`

对应后端位置：
- `backend/app/main.py:546`
- `backend/app/mock_data.py:882`

### 教程会话

`POST /api/tutorial-sessions`
- JSON 入参：
  - `archive_id`
- 返回：
  - `tutorial_session_id`
  - `archive_id`
  - `status`
  - `tutorial_video`
  - `tutorial_steps`
  - `current_step`
  - `step_end_tts`
  - `awaiting_voice_input`
  - `completed_step_count`

`GET /api/tutorial-sessions/{tutorial_session_id}`

对应后端位置：
- `backend/app/main.py:564`
- `backend/app/mock_data.py:953`

### 教程语音

`POST /api/tutorial-sessions/{tutorial_session_id}/voice-input`
- 表单字段：
  - `audio`
  - `current_step_id`
  - `client_event_id`
- 后端会：
  - 保存音频
  - 真实 ASR
  - 意图识别
  - 问答检索/生成
  - 更新教程会话状态

可能返回动作：
- `answer`
- `play_next_step`
- `capture_after_photo`
- `silence`
- `replay_current_step`

对应后端位置：
- `backend/app/main.py:583`
- `backend/app/mock_data.py:1007`
- `backend/app/services/tutorial_service.py:26`

### 教程完成记录

`POST /api/tutorial-sessions/{tutorial_session_id}/completion-record`
- JSON 入参：
  - `qa_summary: string[]`
- 后端会：
  - 标记教程会话完成
  - 生成完成记录
  - 写入对应 archive 的 `completion_record`

返回：
- `completed_at`
- `total_minutes`
- `completed_steps`
- `total_steps`
- `qa_summary`
- `care_notes`

对应后端位置：
- `backend/app/main.py:574`
- `backend/app/mock_data.py:1097`

### 染后照片与转场视频

`POST /api/tutorial-sessions/{tutorial_session_id}/after-photo`
- JSON 入参：
  - `after_image_id`
- 返回：
  - `generation_task_id`
  - `status`: 后端当前可能返回 `queued`
  - `message`

`GET /api/after-video-tasks/{generation_task_id}`
- 返回：
  - `generating`
  - `completed`
  - `failed`

对应后端位置：
- `backend/app/main.py:622`
- `backend/app/mock_data.py:1124`

## v1 已经对齐的关键做法

### 1. 真实 API 与 Mock 分支隔离

v1 的 `app/tony/api.ts` 通过：
- `NEXT_PUBLIC_API_MODE`
- `NEXT_PUBLIC_API_BASE_URL`

决定走真实后端还是本地 Mock。

真实模式下，主要接口都会调用后端；Mock 模式下才走本地 Map/localStorage。

### 2. 资源 URL 会补后端 origin

v1 有：
- `mediaOrigin()`
- `resolveMediaUrls()`

作用：
- 当 `API_BASE_URL` 是完整 URL，例如 `http://localhost:8000/api`
- 后端返回 `/media/...`
- 前端自动转成 `http://localhost:8000/media/...`

这是部署和直连后端时非常关键的兼容逻辑。

位置：
- `frontendv1/.../app/tony/api.ts:69`

### 3. 画像确认页尊重后端识别结果

v1 的 `ProfileScreen`：
- `const [profile, setProfile] = useState(initialProfile);`

也就是说：
- 后端识别出来什么，就展示什么
- 后端返回 `color_options`，就用后端候选项
- 后端返回 `status=failed` 和 `vision_error`，页面能提示

位置：
- `frontendv1/.../app/tony/decision-screens.tsx:683`

### 4. 教程步骤按后端/档案绑定的视频 ID 切换

v1 的 Mock 分支里也保留了视频到教程步骤的绑定：
- `tutorialVideoIdFromEntryVideoId()`
- `TUTORIAL_STEPS_BY_VIDEO_ID`
- `TUTORIAL_VIDEO_META`

真实模式下则以后端 `createTutorialSession()` 返回为准。

### 5. 完成记录已封装后端接口

v1 有 `createCompletionRecord()`：
- real 模式调用后端 `completion-record`
- mock 模式才本地生成

位置：
- `frontendv1/.../app/tony/api.ts:695`

### 6. 类型比 v2 更贴近后端

v1 类型已经包含：
- `HairProfileData.vision_error`
- `TutorialSessionData.tutorial_steps`
- `TutorialSessionData.awaiting_voice_input`
- `TutorialAction.replay_current_step`
- `AfterPhotoData.status: queued | generating | completed | failed`
- `AfterVideoTaskData.storage_key`
- `AfterVideoTaskData.cover_storage_key`

## v2 当前对齐情况

v2 文件：
- `my-tony2.0/app/tony/api.ts`
- `my-tony2.0/app/tony/TonyApp.tsx`
- `my-tony2.0/app/tony/decision-screens.tsx`
- `my-tony2.0/app/tony/archive-tutorial-screens.tsx`
- `my-tony2.0/app/tony/types.ts`

### 已经接上的部分

v2 `api.ts` 在 real 模式下已经接了这些接口：
- `GET /mock/videos`
- `POST /media/images`
- `POST /hair-profiles`
- `PATCH /hair-profiles/{profile_id}`
- `POST /agent/plan-result`
- `GET /preview-tasks/{preview_task_id}`
- `POST /agent/product-recommendations`
- `POST /hair-dye-archives`
- `GET /hair-dye-archives`
- `GET /hair-dye-archives/{archive_id}`
- `POST /tutorial-sessions`
- `GET /tutorial-sessions/{session_id}`
- `POST /tutorial-sessions/{session_id}/voice-input`
- `POST /tutorial-sessions/{session_id}/after-photo`
- `GET /after-video-tasks/{task_id}`

主流程也基本是：
1. 视频入口
2. 打开摄像头
3. 上传当前发色照片
4. 创建发色画像
5. 确认画像
6. 计算方案
7. 商品推荐
8. 保存档案
9. 启动教程
10. 语音问答/下一步
11. 染后照片
12. 转场视频生成

所以 v2 不是完全没接后端，而是接法不完整。

## v2 主要不对齐点

### P0-1：后端媒体 URL 没有补全

问题：
- 后端返回 `/media/...`
- v2 `request()` 直接返回 `envelope.data`
- 没有像 v1 一样递归补全 `url` / `*_url`

影响：
- 入口视频、目标参考图、上传图片、效果图、教程视频、转场视频都可能加载失败。
- 本地 Next.js 代理或部署到公网时尤其容易出问题。

v2 位置：
- `my-tony2.0/app/tony/api.ts:67`

v1 参考：
- `frontendv1/.../app/tony/api.ts:69`

建议：
- 直接把 v1 的 `mediaOrigin()` 和 `resolveMediaUrls()` 迁移到 v2。
- `request()` 最后返回 `resolveMediaUrls(envelope.data)`。

### P0-2：画像确认页覆盖真实 AI 识别结果

问题：
v2 `ProfileScreen` 初始化状态时：
- 展开 `initialProfile`
- 但强制把 `current_hair` 改成：
  - `region_mode: single`
  - `color: currentDisplayColor(initialProfile)`
  - `color_options: HAIR_LEVEL_OPTIONS`

这等于后端返回的 `current_hair` 被页面覆盖。

影响：
- 后端 AI 识别出的候选色丢失。
- 后端返回的 `current_hair.color_options` 丢失。
- 如果后端返回分区发色，v2 会强制变成单色。
- 后续 PATCH 给后端的画像不是 AI 识别结果，而是 v2 页面重写后的固定结构。
- 规则引擎会基于错误画像判断，可能导致方案误判。

v2 位置：
- `my-tony2.0/app/tony/decision-screens.tsx:896`
- `my-tony2.0/app/tony/decision-screens.tsx:909`

v1 参考：
- `frontendv1/.../app/tony/decision-screens.tsx:683`

建议：
- 初始化改回 `useState(initialProfile)`。
- 如果产品想展示“1-10 度色阶选择”，只能作为人工编辑时的辅助选项，不能覆盖后端原始识别。
- `single_color` 的选项优先使用 `profile.current_hair.color_options`，没有时再 fallback 到通用色阶。

### P0-3：完成记录只存在本地，没有写回后端

问题：
v2 `completeTutorial()` 本地构造 `CompletionRecord`。
v2 `saveCompletion()` 调 `saveLocalCompletion()`，只写 localStorage。

后端真实接口：
- `POST /api/tutorial-sessions/{tutorial_session_id}/completion-record`

影响：
- 后端 archive 没有 `completion_record`。
- 用户刷新、换设备、重新拉后端档案时完成记录丢失。
- 后续染后照片/转场视频虽然可能能生成，但档案状态与后端不一致。

v2 位置：
- `my-tony2.0/app/tony/TonyApp.tsx:630`
- `my-tony2.0/app/tony/TonyApp.tsx:650`
- `my-tony2.0/app/tony/api.ts:642`

v1 参考：
- `frontendv1/.../app/tony/api.ts:695`

建议：
- 从 v1 迁移 `createCompletionRecord()`。
- real 模式调用后端。
- mock 模式继续本地生成。
- `saveCompletion()` 应异步调用接口，并更新 `archiveDetail.completion_record`。

### P0-4：v2 类型落后，无法完整表达后端响应

问题：
v2 `types.ts` 缺少多个真实字段/状态。

缺失或不完整项：
- `HairProfileData.vision_error`
- `HairProfileData.vision_debug`
- `TutorialVideo.title`
- `TutorialVideo.color_name`
- `TutorialVideo.brand`
- `TutorialVideo.tutorial_type`
- `TutorialStep.source`
- `TutorialSessionData.tutorial_steps`
- `TutorialSessionData.awaiting_voice_input`
- `TutorialSessionData.last_event_id?: string | null`
- `TutorialAction.replay_current_step`
- `TutorialAction.answer.answer.matched_query`
- `TutorialAction.answer.answer.score`
- `TutorialAction.answer.answer.source`
- `AfterPhotoData.status` 应包含 `queued`
- `AfterVideoTaskData.completed` 应包含 `storage_key`、`cover_storage_key`

影响：
- TypeScript 没法帮忙发现真实接口字段。
- 页面逻辑会自然倾向使用固定字段。
- 后端返回额外状态时，前端处理不完整。

v2 位置：
- `my-tony2.0/app/tony/types.ts:105`
- `my-tony2.0/app/tony/types.ts:357`
- `my-tony2.0/app/tony/types.ts:380`
- `my-tony2.0/app/tony/types.ts:391`
- `my-tony2.0/app/tony/types.ts:431`

v1 参考：
- `frontendv1/.../app/tony/types.ts:105`
- `frontendv1/.../app/tony/types.ts:357`
- `frontendv1/.../app/tony/types.ts:420`

建议：
- 以 v1 `types.ts` 为基准补齐 v2 类型。
- 不要只为了当前 UI 能编译而缩窄类型。

### P1-1：后端 `replay_current_step` 动作没有被 v2 正确处理

问题：
后端语音意图支持 `replay`。
返回 action 是 `replay_current_step`。

v2 当前处理逻辑：
- `answer`
- `play_next_step`
- `capture_after_photo`
- 其他动作统一当成有 `tts_text` 的回答处理

影响：
- 用户说“重播”“再看一遍”时，前端不会触发视频重播当前步骤。
- 类型里也没有这个 action。

后端位置：
- `backend/app/mock_data.py:1039`
- `backend/app/services/model_service.py:21`

v2 位置：
- `my-tony2.0/app/tony/archive-tutorial-screens.tsx:1319`

v1 参考：
- `frontendv1/.../app/tony/types.ts:391`

建议：
- 类型补 `replay_current_step`。
- 处理时：
  - 设置当前 step
  - `setReplaySignal(value => value + 1)`
  - 播放 tts
  - 回到视频/等待状态

### P1-2：教程会话没有充分使用后端返回的 `tutorial_steps` 与 `awaiting_voice_input`

问题：
后端 `create_session()` 返回：
- `tutorial_steps`
- `awaiting_voice_input`
- `tutorial_video.title`
- `tutorial_video.color_name`
- `tutorial_video.brand`
- `tutorial_video.tutorial_type`

v2 类型缺这些字段，页面也没有像 v1 一样根据 `awaiting_voice_input` 恢复等待语音状态。

影响：
- 后端真实保存的教程进度恢复能力变弱。
- 如果后端返回某个视频的个性化步骤，v2 类型层面不完整。

v2 位置：
- `my-tony2.0/app/tony/types.ts:357`
- `my-tony2.0/app/tony/archive-tutorial-screens.tsx:1240`

v1 参考：
- `frontendv1/.../app/tony/archive-tutorial-screens.tsx:923`

建议：
- 补齐类型。
- 初始化 `phase` 时参考 `session.awaiting_voice_input`。
- 展示教程视频标题/品牌/类型时使用后端 `tutorial_video` 元数据。

### P1-3：Mock 分支的视频到教程绑定在 v2 退化

问题：
v2 Mock 分支创建 archive 时固定：
- `tutorial_video_id: 'tutorial_001'`

v1 Mock 分支会根据入口视频绑定到对应教程：
- 蓝色、红色、紫色、粉色、冷茶、冷棕分别对应不同 `tutorial_*`

影响：
- mock 模式下不再模拟真实业务绑定。
- 产品经理固定流程会掩盖真实后端绑定逻辑。

v2 位置：
- `my-tony2.0/app/tony/api.ts:614`
- `my-tony2.0/app/tony/api.ts:666`

v1 参考：
- `frontendv1/.../app/tony/api.ts:186`
- `frontendv1/.../app/tony/api.ts:665`
- `frontendv1/.../app/tony/api.ts:751`

建议：
- 如果仍保留 mock 模式，需要迁移 v1 的：
  - `TUTORIAL_STEPS_BY_VIDEO_ID`
  - `TUTORIAL_VIDEO_META`
  - `tutorialVideoIdFromEntryVideoId()`
  - `tutorialStepsForVideoId()`

### P1-4：v2 确认页删除了“模拟数据继续测试”，但链路仍有 Mock 逻辑

现状：
- v2 UI 没有 v1 的“使用模拟数据继续测试”按钮。
- 但 v2 `api.ts` 内部仍有完整 Mock 分支。

这件事本身不一定错，因为你之前明确要求拍照环节不能提供“演示照片”入口，必须先真实上传和识别。

需要明确的产品策略：
- 真实演示路径：必须走真实拍照、真实上传、真实 AI 识别。
- 调试路径：如果保留“生成模拟数据并继续”，只能在已进入画像确认页之后，并且不能调用后端 PATCH/plan-result。

建议：
- 不要恢复“演示照片”。
- 如需调试按钮，应严格隔离：
  - 真实路径：上传图片 -> AI 画像 -> PATCH -> plan-result
  - 模拟路径：前端生成 mock profile/plan -> 不传 mock profile_id 给后端

### P2-1：目标色展示与后端识别目标色存在轻微混用

v2 确认页展示目标色时使用：
- `target.color_alias ?? profile.target_color.display_name`

问题：
- `target` 来自入口视频。
- `profile.target_color` 来自后端识别/后端绑定。

多数情况下二者一致，但如果后端根据目标参考图识别出更准确目标色，页面展示仍可能优先显示入口视频 alias。

位置：
- `my-tony2.0/app/tony/decision-screens.tsx:1101`

建议：
- 展示主值优先 `profile.target_color.display_name`。
- `target.color_alias` 可作为视频入口名称或副标题。

### P2-2：完成页文案说“系统会使用预设效果生成短视频”

v2 染后拍照页文案：
- “系统会使用预设效果生成短视频”

但真实后端是使用染前图和染后图调用转场视频模型生成。

位置：
- `my-tony2.0/app/tony/archive-tutorial-screens.tsx:1960`

建议：
- 改成“系统会使用你的染前照片和染后照片生成转场视频”。

## 建议修改顺序

### 第一阶段：先让真实链路不丢数据

1. 迁移 v1 的 `resolveMediaUrls()` 到 v2。
2. 修复 `ProfileScreen`，不要覆盖 `initialProfile.current_hair`。
3. 补齐 v2 `types.ts`，以 v1 类型为基准。
4. 迁移 `createCompletionRecord()`，完成记录写回后端。

这一阶段完成后，真实链路数据基本能闭环：
上传照片 -> AI 识别 -> 用户确认 -> 规则判读 -> 商品推荐 -> 档案 -> 教程 -> 完成记录。

### 第二阶段：修教程体验与状态恢复

1. 支持 `replay_current_step`。
2. 使用 `session.awaiting_voice_input` 恢复语音等待状态。
3. 展示后端返回的 `tutorial_video` 元数据。
4. 确保 `tutorial_steps` 使用后端返回值。

### 第三阶段：整理 Mock 与调试链路

1. v2 Mock 分支补回 v1 的视频到教程绑定。
2. 明确模拟路径不调用真实后端 PATCH/plan-result。
3. 保留真实路径强制拍照和 AI 识别。

## 推荐验收用例

### 用例 1：真实拍照识别

步骤：
1. `NEXT_PUBLIC_API_MODE=real`
2. `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api`
3. 进入 v2 首页
4. 选择任意视频
5. 拍照
6. 确认使用

期望：
- `POST /api/media/images` 成功。
- `POST /api/hair-profiles` 成功。
- 确认页展示后端返回的 `current_hair`、`target_color`、置信度、候选项。
- 图片 URL 能正常加载。

### 用例 2：确认画像后规则判读

步骤：
1. 在确认页点击“看看能不能染成”

期望：
- `PATCH /api/hair-profiles/{profile_id}` 成功。
- `POST /api/agent/plan-result` 成功。
- 页面展示后端返回的 `feasibility`、`summary`、`risks`、`color_rule`。
- 如果 `preview_status=queued/generating`，前端开始轮询。
- 如果 `preview_status=fallback`，页面展示 fallback 图和提示。

### 用例 3：商品推荐与档案

步骤：
1. 选择方案路线和预览档位
2. 请求商品推荐
3. 选择商品
4. 保存档案

期望：
- `POST /api/agent/product-recommendations` 成功。
- `POST /api/hair-dye-archives` 成功。
- `GET /api/hair-dye-archives/{archive_id}` 能拿到完整档案。
- 档案中的 `tutorial_video_id` 与入口视频绑定一致。

### 用例 4：教程与语音

步骤：
1. 从档案启动教程
2. 说“下一步”
3. 说一个问题
4. 说“重播”
5. 说“结束了”

期望：
- `POST /api/tutorial-sessions` 成功，返回 `tutorial_steps`。
- `POST /voice-input` 成功。
- `next` 后 current step 更新。
- `question` 后展示答案和 `next_prompt`。
- `replay` 后重播当前步骤。
- `finish` 后进入完成记录页。

### 用例 5：完成记录写回后端

步骤：
1. 教程结束后保存完成记录
2. 重新打开档案详情

期望：
- `POST /completion-record` 成功。
- 后端 archive 有 `completion_record`。
- 刷新页面后完成记录仍存在。

### 用例 6：染后照片与转场视频

步骤：
1. 完成页点击生成转场视频
2. 拍摄染后照片
3. 确认使用

期望：
- `POST /api/media/images` 成功，`media_type=after_hair`。
- `POST /after-photo` 成功，允许返回 `queued`。
- 前端轮询 `GET /after-video-tasks/{task_id}`。
- `completed` 后展示视频。
- `failed` 后展示 fallback message。

## 最小修改清单

只做第一阶段时，建议最小改这些文件：

1. `my-tony2.0/app/tony/api.ts`
   - 增加 `mediaOrigin()`
   - 增加 `resolveMediaUrls()`
   - `request()` 返回前处理资源 URL
   - 增加 `createCompletionRecord()`

2. `my-tony2.0/app/tony/types.ts`
   - 补齐与 v1/后端一致的字段和 action

3. `my-tony2.0/app/tony/decision-screens.tsx`
   - `ProfileScreen` 初始化改为原样使用 `initialProfile`
   - `colorOptionsFor('single_color')` 优先使用后端候选项

4. `my-tony2.0/app/tony/TonyApp.tsx`
   - 完成记录保存改成调用 `createCompletionRecord()`
   - 保存成功后更新 `archiveDetail.completion_record`

第二阶段再改：

5. `my-tony2.0/app/tony/archive-tutorial-screens.tsx`
   - 支持 `replay_current_step`
   - 使用 `awaiting_voice_input`
   - 更完整展示 `tutorial_video` 元数据

## 备注

不要把所有 Mock 逻辑一刀切删掉。更稳的方式是：
- `real` 模式必须完全尊重后端数据和后端状态。
- `mock` 模式可以保留，但必须和真实路径隔离。
- 模拟 profile_id 不能传给后端确认接口。
- 拍照入口不提供“演示照片”，真实路径必须先上传照片并走 AI 识别。

