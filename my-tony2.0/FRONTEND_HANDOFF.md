# 做自己的 Tony 前端联调说明

当前首页已经替换为产品交互流程 V2 定义的完整体验。前端支持两种运行方式：

- `mock`：默认模式，不需要后端即可完整演示。
- `real`：按照最新的 `frontend-backend-api-contract(4).md` 请求真实接口。

## 启动

```bash
cp .env.example .env.local
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`。

## 切换后端联调

同域部署：

```env
NEXT_PUBLIC_API_MODE=real
NEXT_PUBLIC_API_BASE_URL=/api
```

后端独立运行：

```env
NEXT_PUBLIC_API_MODE=real
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
```

后端独立运行时需要允许前端来源的 CORS。图片、视频等媒体统一使用接口返回的 `url`，前端不读取 `storage_key`。

## 已接入的接口

| 用户步骤 | 接口 |
|---|---|
| 视频种草入口 | `GET /api/mock/videos` |
| 现场照片上传 | `POST /api/media/images` |
| 创建和确认发色画像 | `POST /api/hair-profiles`、`PATCH /api/hair-profiles/{id}` |
| 可行性、风险和五档预览 | `POST /api/agent/plan-result`、`GET /api/preview-tasks/{id}` |
| 预算内商品推荐 | `POST /api/agent/product-recommendations` |
| 保存个人染发档案 | `POST /api/hair-dye-archives` |
| 档案列表和详情 | `GET /api/hair-dye-archives`、`GET /api/hair-dye-archives/{id}` |
| 创建、恢复教程 | `POST /api/tutorial-sessions`、`GET /api/tutorial-sessions/{id}` |
| 教程问答和推进 | `POST /api/tutorial-sessions/{id}/voice-input`（录音文件，multipart） |
| 染后照片和短视频 | `POST /api/media/images`、`POST /api/tutorial-sessions/{id}/after-photo`、`GET /api/after-video-tasks/{id}` |

所有请求都会自动携带首次启动生成并持久化的 `X-User-Key`。JSON 响应统一检查 `code`、`message`、`data` 和 `trace_id`；非零 `code` 会进入页面内错误态，不会丢失用户已经填写的数据。

## 代码结构

```text
app/tony/
├── TonyApp.tsx                    # 全链路状态和接口编排
├── api.ts                         # 真实 API 客户端、X-User-Key、mock 适配
├── types.ts                       # 与接口协议对应的 TypeScript 类型
├── mock-data.ts                   # 黑客松演示数据
├── decision-screens.tsx           # 视频、拍摄、识别、方案、商品
├── archive-tutorial-screens.tsx   # 档案、教程、完成记录、转场视频
└── ui.tsx                         # 通用移动端组件
```

旧版首页代码保存在 `app/legacy/LegacyHome.tsx`，不会进入当前首页包。

## 联调注意

1. 摄像头只支持现场拍摄，不提供相册入口。
2. 预算滑条只更新本地状态，点击“按此预算推荐”才请求后端。
3. 商品推荐返回 `status=no_match` 时，前端不会虚构商品或价格。
4. 外链购买不假定成功，由用户手动选择“已购买 / 模拟已购买 / 仅保存”。
5. 识别页读取 `attribute_confidences`，低置信度字段会标红并引导用户确认。
6. 方案结论会立即展示；五档效果图每 2 秒轮询一次，最多 30 次，完成或 fallback 后替换骨架屏。
7. 教程优先播放后端 `tts_audio_url`；没有音频时才使用浏览器 TTS。
8. 教程语音由前端录音并做约 1.5 秒静音检测，音频以 `multipart/form-data` 上传；VAD、ASR 和意图识别由后端完成。
9. 教程进行中会保存当前 `archive_id + tutorial_session_id`。刷新页面会调用会话详情接口恢复当前步骤；用户主动退出教程时不会被强制拉回。
10. 染后视频任务每 2 秒轮询一次，最多 60 次。
11. V2 交互要求保存“教程完成文字记录”，但当前接口协议尚未定义对应写接口。前端在 mock 模式暂存本地；后端补充接口后，只需在 `TonyApp.tsx` 的 `saveCompletion` 中接入，不影响其他链路。

## UI 与旧 Demo 的关系

新版流程沿用 GitHub 仓库 `Fiona309/my-tony` 的视觉资产和设计语言：

- 配色继续使用暖橙、嫩绿、天蓝、奶白、杏粉五色体系。
- 中文正文使用思源黑体，标题使用高字重和轻微错位的手绘感排版。
- `/public/loading/` 下 5 张卡通女孩 PNG 被复用于识别、方案、商品、教程和生成任务。
- 手绘星星、心形、波浪线只做轻量装饰，不遮挡核心信息和操作按钮。
- 抖音视频入口保留深色沉浸式样式；进入产品后统一切换为旧 Demo 的温暖 pastel 风格。
