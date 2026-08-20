# 部署到 tony.xin

单机部署：Caddy + Next.js(3000) + FastAPI(8000) 全部在同一台国内服务器。
备案已通过，所以不再需要「海外节点做门面反代回国内」那套绕备案的架构。

## 前置检查

```bash
# 1. 域名解析已生效（应返回你的服务器 IP）
dig +short tony.xin

# 2. 阿里云安全组放行 80 / 443
#    控制台 → 云服务器 ECS → 安全组 → 入方向 → 添加 80、443

# 3. 运行时版本
node -v      # 需要 ≥ 20（Next 16 的要求）
python3 -V   # 需要 ≥ 3.10
```

## 一、拉代码

```bash
sudo mkdir -p /opt/meifa /opt/meifa/logs
sudo chown -R $USER:$USER /opt/meifa
git clone https://github.com/Fiona309/tony3.0.git /opt/meifa/src
cp -r /opt/meifa/src/backend /opt/meifa/backend
cp -r /opt/meifa/src/my-tony2.0 /opt/meifa/my-tony2.0
```

## 二、后端

```bash
cd /opt/meifa/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 密钥单独放，不进 git。systemd 已配 EnvironmentFile 指向它
cp /opt/meifa/src/.env.example /opt/meifa/backend/.env
vi /opt/meifa/backend/.env      # 填 9 个 API key
chmod 600 /opt/meifa/backend/.env
```

> `ASR_PROVIDER` 保持默认的 `siliconflow`（走 HTTP 调同一个 SenseVoiceSmall 模型）。
> 改成 `sensevoice` 会额外装 ~2GB 依赖并拖慢冷启动，只有在需要完全离线时才值得。

## 三、前端

```bash
cd /opt/meifa/my-tony2.0
npm ci
npm run build
```

## 四、系统服务

```bash
sudo cp /opt/meifa/src/.deploy/meifa-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now meifa-backend meifa-frontend
sudo systemctl status meifa-backend meifa-frontend
```

## 五、Caddy

```bash
sudo cp /opt/meifa/src/.deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy 会自动向 Let's Encrypt 申请证书并续期。

> **如果证书签发失败**：大陆访问 Let's Encrypt 偶有超时。改用阿里云免费 SSL 证书
> （控制台可申请 1 年期），下载 nginx 格式后在 Caddyfile 里显式指定：
> `tls /path/cert.pem /path/key.pem`

## 六、验证

```bash
curl -I https://tony.xin                    # 200，且证书有效
curl -s https://tony.xin/api/health         # 后端健康检查
curl -sI https://tony.xin/media/mock-assets/blue/after.jpg | head -3
```

**最后一定要用手机浏览器打开 https://tony.xin 实测摄像头** —— `getUserMedia`
只在 HTTPS 下工作，这是实时试色的命脉，本地 localhost 测不出这个问题。

## 更新部署

```bash
cd /opt/meifa/src && git pull
rsync -a --delete --exclude data --exclude .env backend/ /opt/meifa/backend/
rsync -a --delete --exclude node_modules --exclude .next my-tony2.0/ /opt/meifa/my-tony2.0/
cd /opt/meifa/my-tony2.0 && npm ci && npm run build
sudo systemctl restart meifa-backend meifa-frontend
```

> `--exclude data` 不能省：`backend/data/` 里是运行时数据库和用户上传的媒体，
> 同步会把线上数据覆盖掉。

## 已知瓶颈

出口带宽 3 Mbps ≈ 375 KB/s。实测过：

| 场景 | 数据量 | 耗时 |
|---|---|---|
| 1 人看 4 张效果图 | 1.2 MB | 3.2 秒 |
| 20 人同时 | 24 MB | **64 秒** |
| 种草视频（1.3~2.8 Mbps 码率） | — | **1~2 人就打满** |

Caddy 直发媒体 + 30 天强缓存能缓解重复访问，但**首次访问的带宽是硬上限**。
现场活动前必须把 `data/media` 和 `public/mock-videos` 挪到 OSS + CDN——
100 人 × 1.2MB = 120MB，CDN 流量费约 ¥0.03，比升带宽便宜两个数量级。
