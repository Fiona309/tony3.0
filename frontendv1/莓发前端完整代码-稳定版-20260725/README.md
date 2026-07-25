# 莓发前端完整代码（稳定交付版）

这是一个可独立运行的 Next.js 前端项目，已包含页面代码、Mock 数据、图片、视频和前后端接口协议。

## 启动

要求 Node.js 20.9 或更高版本。

```bash
npm install
cp .env.example .env.local
npm run dev
```

访问：

```text
http://localhost:3000
```

## 运行模式

默认使用 Mock 模式，不连接后端也可以演示：

```env
NEXT_PUBLIC_API_MODE=mock
NEXT_PUBLIC_API_BASE_URL=/api
```

需要连接后端时修改 `.env.local`：

```env
NEXT_PUBLIC_API_MODE=real
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
```

## 主要目录

```text
app/tony/      完整前端流程、页面、类型和 API 适配
public/        演示使用的图片、动画和视频
docs/          前后端接口协议
FRONTEND_HANDOFF.md  联调说明
```

不要把 `node_modules` 发给其他成员。对方收到本文件夹后运行 `npm install` 即可。
