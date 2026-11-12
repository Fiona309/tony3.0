# Tony 3.0 · 居家染发助手

Tony 帮助用户在家染发时判断目标发色是否可达、比较可选方案，并在操作过程中获得分步骤指导。项目基于 [Tony 2.0](https://github.com/codedog678/tony-agent) 独立演进。

## 从哪里开始体验

1. 打开首页，使用示例档案或上传照片，确认当前发色与目标色。
2. 查看可达性判断、方案和效果预览，再查看产品参考。
3. 进入染发教程，按步骤操作。配置语音服务后可在教程内提问。
4. 完成后记录染后照片，在染发档案中回顾结果。

效果图用于比较方案，实际结果受底色、发质和操作条件影响。

## 本地运行

建议使用 Node.js 22 和 Python 3.11。先在仓库根目录启动前端的模拟模式，无需 API 密钥或后端服务。

```bash
npm --prefix my-tony2.0 ci
NEXT_PUBLIC_API_MODE=mock npm --prefix my-tony2.0 run dev -- --port 3100
```

打开 [本地首页](http://localhost:3100)。模拟数据适合浏览界面和交互，部分示例图片或视频需要额外素材。

### 联调 FastAPI

在仓库根目录另开终端。

```bash
cd backend
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
MOCK_MODELS=true CORS_ORIGINS=http://localhost:3100,http://127.0.0.1:3100 \
  .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

停止之前的前端进程，然后在仓库根目录重新启动前端。

```bash
NEXT_PUBLIC_API_MODE=real NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api \
  npm --prefix my-tony2.0 run dev -- --port 3100
```

后端提供 [健康检查](http://127.0.0.1:8000/health) 和 [OpenAPI 接口文档](http://127.0.0.1:8000/docs)。调用真实模型时，在 `backend/.env` 中填写所需服务的密钥，并将启动命令中的 `MOCK_MODELS` 改为 `false`。发色识别、语音、图片预览和转场视频的配置见 [本地运行指南](LOCAL_DEV.md) 与 [后端配置示例](backend/.env.example)。真实效果预览还需把 [发色管线依赖](hair_full_pipeline/requirements.txt) 装入同一个 Python 环境。

## 代码入口

| 路径 | 职责 |
| --- | --- |
| [my-tony2.0/app/page.tsx](my-tony2.0/app/page.tsx) | Next.js 首页，加载 Tony 应用 |
| [my-tony2.0/app/tony/](my-tony2.0/app/tony/) | 主流程、页面组件、接口客户端和前端模拟数据 |
| [backend/app/main.py](backend/app/main.py) | FastAPI 路由、服务生命周期和后台任务调度 |
| [backend/app/services/](backend/app/services/) 与 [backend/app/kb/](backend/app/kb/) | 模型、语音与教程服务，以及发色、产品与操作问答知识库 |
| [backend/app/database.py](backend/app/database.py) 与 [backend/data/](backend/data/) | SQLite 持久化和后端数据资源 |
| [hair_full_pipeline/](hair_full_pipeline/) | 头发分割和发色模拟，可独立运行，也供后端预览调用 |
| [frontendv1/](frontendv1/) 与 [backend_handoff/](backend_handoff/) | 历史前端和后端交接材料 |
| [.deploy/](.deploy/) | 部署脚本和服务配置 |

指导老师可从首页入口、前端接口客户端 `app/tony/api.ts` 和 FastAPI 入口依次阅读，沿「照片 → 发色档案 → 方案与预览 → 教程 → 染后档案」追踪主流程。
