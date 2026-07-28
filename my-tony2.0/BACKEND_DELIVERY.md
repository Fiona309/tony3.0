# 做自己的 Tony 前端交付与后端联调说明

## 1. 交付内容

本压缩包包含可直接运行的 Next.js 16 移动端交互原型、Mock 数据、前端接口客户端、TypeScript 接口类型、联调说明和前后端接口协议。

产品名称统一为“做自己的 Tony”。

## 2. 当前用户流程

```text
抖音式发色视频
→ 自动出现“试试染同款” / 收藏触发 / 评论触发
→ 独立染同款介绍页
→ 打开摄像头现场拍摄
→ 确认当前头发信息
→ 生成可达性、风险和五档预览
→ 选择染色或固色方案
→ 按预算推荐商品
→ 保存方案或标记已购买
→ 我的染发档案
→ 染发前准备
→ 分步骤视频、语音和计时教程
→ 染后拍照
→ 前后对比视频和完成记录
```

视频页目前支持三种前端交互入口：

1. 视频播放到触发时间后自动出现“试试染同款”。
2. 点击收藏后出现“发色灵感已收藏”卡片。
3. 打开评论区并发送评论后，先显示用户评论，再显示“发色已锁定”的推荐卡。

三种入口最终都进入同一个染同款介绍页，不会提前调用分析接口。

## 3. 本地启动

```bash
npm install
cp .env.example .env.local
npm run dev
```

浏览器访问：

```text
http://localhost:3000/?entry=douyin
```

默认使用 Mock 模式，可以在没有后端的情况下走通完整演示。

## 4. 连接真实后端

后端独立运行：

```env
NEXT_PUBLIC_API_MODE=real
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
```

前后端同域：

```env
NEXT_PUBLIC_API_MODE=real
NEXT_PUBLIC_API_BASE_URL=/api
```

后端独立部署时需要允许前端域名的 CORS 请求。

## 5. 接口映射

| 用户步骤 | 接口 |
|---|---|
| 获取发色视频 | `GET /api/mock/videos` |
| 上传现场照片 | `POST /api/media/images` |
| 创建头发画像 | `POST /api/hair-profiles` |
| 修改并确认头发画像 | `PATCH /api/hair-profiles/{id}` |
| 生成可行性方案 | `POST /api/agent/plan-result` |
| 获取五档预览 | `GET /api/preview-tasks/{id}` |
| 获取商品推荐 | `POST /api/agent/product-recommendations` |
| 保存染发档案 | `POST /api/hair-dye-archives` |
| 获取档案列表 | `GET /api/hair-dye-archives` |
| 获取档案详情 | `GET /api/hair-dye-archives/{id}` |
| 创建教程会话 | `POST /api/tutorial-sessions` |
| 恢复教程会话 | `GET /api/tutorial-sessions/{id}` |
| 教程语音输入 | `POST /api/tutorial-sessions/{id}/voice-input` |
| 提交染后照片 | `POST /api/tutorial-sessions/{id}/after-photo` |
| 查询视频生成状态 | `GET /api/after-video-tasks/{id}` |

前端不会改变接口字段，也不会为缺失数据虚构商品、价格或分析结果。

## 6. 请求约定

- 所有业务请求由 `app/tony/api.ts` 统一发出。
- 首次启动会生成并持久化 `X-User-Key`。
- JSON 响应统一读取 `code`、`message`、`data`、`trace_id`。
- 图片与视频只读取接口返回的可访问 `url`。
- 教程语音使用 `multipart/form-data` 上传。
- 请求失败会保留当前页面信息，并显示页面内错误与重试入口。

## 7. 核心代码

```text
app/tony/TonyApp.tsx
  页面状态、流程跳转和接口编排

app/tony/api.ts
  真实接口客户端、Mock 适配、X-User-Key

app/tony/types.ts
  与接口协议对应的 TypeScript 类型

app/tony/decision-screens.tsx
  视频、评论、收藏、相机、识别、方案、商品页面

app/tony/home-screens.tsx
  染同款介绍页和回访首页

app/tony/archive-tutorial-screens.tsx
  档案、染前准备、教程、染后记录

app/tony/ui.tsx
  移动端通用组件
```

## 8. 后端联调重点

1. `POST /api/media/images` 必须返回可继续创建画像的 `image_id`。
2. 画像创建结果需要包含识别值和字段置信度，低置信度字段由前端提醒用户确认。
3. 五档预览允许异步生成，前端每 2 秒轮询一次。
4. 商品无匹配时返回协议定义的 `no_match`，前端不会生成假商品。
5. 教程会话需要返回当前步骤，保证页面刷新后可以恢复。
6. 教程语音的 VAD、ASR 和意图识别由后端完成。
7. 染后视频允许异步生成，前端每 2 秒查询任务状态。
8. 接口协议暂未定义“教程完成文字记录”的写接口，Mock 模式暂存本地。

## 9. 交付前验证

- TypeScript 类型检查通过。
- 当前前端目录 ESLint 通过。
- Next.js 生产构建通过。
- 已在 375 × 812 手机视口验证。
- 已点测视频自动入口、收藏入口、评论发送、评论后推荐卡和介绍页跳转。

