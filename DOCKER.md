# Docker 一键启动

当前 Docker 配置使用 v1 前端：

```text
frontendv1/莓发前端完整代码-稳定版-20260725
```

## 启动

先复制环境变量模板，并填写真实 AI 服务密钥：

```bash
cp .env.example .env
```

启动前后端：

```bash
docker compose up -d --build
```

访问：

```text
http://localhost:3000
```

后端接口：

```text
http://localhost:8000
```

## 数据持久化

后端运行数据挂载在 Docker volume `meifa_backend_data` 中，包括：

- SQLite 数据库
- 上传图片、音频
- 生成图片、生成视频
- Chroma/模型缓存

## 停止

```bash
docker compose down
```

如需连数据一起清理：

```bash
docker compose down -v
```

## 公网演示

如果别人通过公网域名访问并需要摄像头、麦克风权限，需要额外配置 HTTPS 反向代理，例如 Caddy 或 Nginx。浏览器通常不允许在普通 HTTP 公网页面中调用摄像头和麦克风。

## 生成队友傻瓜包

如果要直接发给队友使用，并且希望环境变量、知识库和演示媒体都内置好，运行：

```bash
./scripts/make_teammate_bundle.sh
```

生成的 zip 在：

```text
dist/meifa-v1-docker-teammate-*.zip
```

队友解压后只需要运行：

```bash
./start.sh
```

macOS 也可以直接双击：

```text
一键启动.command
```

这个队友包会包含：

- v1 前端源码和 Dockerfile
- FastAPI 后端源码和 Dockerfile
- 当前 `backend/.env` 复制出的 `.env.teammate`
- 当前 `backend/data/meifa.db`
- 当前 `backend/data/chroma_data`
- 当前 `backend/data/media`

注意：队友包会包含真实密钥，只适合私下发给可信队友，不要上传 GitHub、飞书公开群或公开网盘。
