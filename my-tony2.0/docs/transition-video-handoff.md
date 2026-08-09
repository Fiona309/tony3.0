# 染发转场视频接入文档（无美颜版）

## 交付范围

本分支只交付前端转场跟拍能力，不包含 DeepAR、美颜 SDK、后端视频生成模型或 Mock 数据。

用户流程：

1. 先完整观看红发动作模板。
2. 进入画中画跟拍：用户摄像头全屏，参考视频位于左上角。
3. 点击开始后倒计时，模板音乐与参考动作同步播放。
4. 前 5 秒显示用户原发；第 5 秒起开启现有 `HairMirror` 实时染发效果。
5. 录制结束后循环播放成片，可重拍或保存到手机。

## 需要移植的文件

- `app/tony/transition-recorder-screen.tsx`
  - 转场时间轴、模板播放、音乐混流、MediaRecorder 录制、回看、重拍和保存。
- `app/tony/hair-mirror.tsx`
  - 新增 `renderMode="surface"`、`effectEnabled`、`onSurfaceReady`，让转场页复用实时试色画布。
- `app/tony/TonyApp.tsx`
  - 从教程完成页和“我的”页面进入转场录制器，并传入真实档案与色卡数据。
- `app/tony/main-tabs.tsx`
  - “我的转场视频”入口。
- `next.config.ts`
  - 本地联调时将 `/media/*` 代理到后端媒体服务。

## `TransitionRecorderScreen` 入参

```ts
type TransitionRecorderProps = {
  matrix: ColorMatrix;
  level: number;
  entryVideoId?: string;
  simulatedNineDegree: boolean;
  onBack: () => void;
};
```

- `matrix`：后端真实颜色矩阵，不能传占位数据。
- `level`：当前底色等级；不能直接染时由上层传 `9`，用于模拟漂至 9 度后的效果。
- `entryVideoId`：用户选中的目标发色视频 ID。
- `simulatedNineDegree`：仅控制“模拟漂至 9 度”提示。

## `HairMirror` 新增接口

```ts
type HairMirrorSurface = {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
};

type HairMirrorProps = {
  renderMode?: 'interactive' | 'surface';
  effectEnabled?: boolean;
  onSurfaceReady?: (surface: HairMirrorSurface) => void;
};
```

转场页使用方式：

```tsx
<HairMirror
  matrix={matrix}
  level={level}
  entryVideoId={entryVideoId}
  renderMode="surface"
  effectEnabled={effectEnabled}
  onSurfaceReady={handleSurfaceReady}
/>
```

不要再复制到第二张 Canvas；录制必须直接使用 `surface.canvas.captureStream(30)`，否则容易出现黑屏或闪烁。

## 模板视频和后端约定

默认模板地址：

```text
/media/mock-assets/red/transition.mp4
```

模板需满足：

- 竖屏 MP4，浏览器可直接播放。
- 音频轨存在且允许同源读取。
- 第 5 秒为遮镜转场点。
- 推荐总时长约 10–15 秒。

开发环境可配置：

```env
NEXT_PUBLIC_API_BASE_URL=/backend-api
BACKEND_ORIGIN=http://127.0.0.1:8001
```

如果队友的最新版已有统一媒体域名或 CDN，请直接修改 `TEMPLATE_PATH`，不必移植 `next.config.ts` 的 rewrite。

## 接入注意事项

- 摄像头录制需要 HTTPS；`localhost` 可用于本机调试。
- 音频必须在用户点击事件中初始化，否则 iOS/Safari 会阻止播放。
- `MediaRecorder` 会按浏览器能力选择 MP4 或 WebM，下载扩展名随实际 MIME 类型生成。
- 参考视频只用于画中画提示，不会合成进用户成片。
- 本版本没有任何美颜、妆容或 DeepAR 依赖，因此没有 DeepAR 水印。
- 不要改后端接口来补假数据；档案或矩阵加载失败时直接提示重试。

## 验收清单

1. 首次进入可完整播放红发参考模板。
2. 点击开始后参考视频与音乐同步启动，摄像头画面不闪烁。
3. 0–5 秒为原发，5 秒后才出现实时染后发色。
4. 录制结束自动进入回看并循环播放，无黑屏。
5. “重拍”可重新录制，“保存到手机”可导出真实视频文件。
6. 成片中没有参考画面、DeepAR 水印或美颜效果。

