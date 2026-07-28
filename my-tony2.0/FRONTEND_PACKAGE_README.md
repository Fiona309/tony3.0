# 做自己的 Tony 前端完整代码

这是用于前后端联调和黑客松演示的独立前端交付包。代码已经按最新版 `frontend-backend-api-contract(4).md` 接入，同时保留 GitHub 旧 Demo 的 pastel 配色、手绘装饰和卡通女孩美术资产。

## 本地启动

```bash
npm install
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。

默认是 `mock` 模式，不启动后端也能走完整流程。需要联调时修改 `.env.local`：

```env
NEXT_PUBLIC_API_MODE=real
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
```

如果前后端同域部署，`NEXT_PUBLIC_API_BASE_URL` 保持 `/api`。

## 主要目录

```text
app/tony/             完整前端业务代码
public/loading/       旧 Demo 的 5 张卡通女孩 PNG
public/video-mock/    预览图和教程关键帧
public/video-uploads/ mock 演示视频
docs/                 最新前后端接口协议
FRONTEND_HANDOFF.md   接口映射、联调方式和已知缺口
```

## 交付前验证

- ESLint 通过。
- TypeScript 类型检查通过。
- Next.js 生产构建通过。
- 已实际走查：视频入口、现场拍照、识别确认、方案与异步五档图、染色/固色切换、预算商品推荐、档案保存、教程问答、步骤推进和刷新恢复。

更详细的接口说明请看 `FRONTEND_HANDOFF.md`。
