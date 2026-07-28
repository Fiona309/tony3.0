# 做自己的 Tony — 前端交接说明

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址，通常为：

```text
http://localhost:3000
```

## 生产构建

```bash
npm run build
npm run start
```

## 主要目录

- `app/tony/`：APP 前端页面、交互状态与接口调用
- `public/mock-videos/`：9 个预置原始视频及封面
- `public/hair-level-guide.jpg`：1–10 度发色色度参考图
- `knowledge-base/`：本地商品知识库数据
- `scripts/`：知识库整理脚本

## 环境变量

压缩包不会包含 `.env.local`，避免泄露本地密钥。需要真实后端或第三方能力时，请根据团队环境重新创建该文件。

当前前端支持 mock 模式；真实接口的数据结构定义集中在：

- `app/tony/types.ts`
- `app/tony/api.ts`

