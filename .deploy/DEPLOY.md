# 部署到 tony.xin

**目标机器**：阿里云 ECS `123.56.17.229`（华北2 北京）
Alibaba Cloud Linux 3.2104 · 2 核 2 GiB · 40 GiB · 出口 3 Mbps

单机部署：Caddy + Next.js(3000) + FastAPI(8000) 全在这一台。
备案已通过，所以不需要「海外节点做门面反代回国内」那套绕备案的架构。

---

## ⚠️ 先解决 2 GiB 内存的问题

`next build` 峰值要 2~3 GB 内存。这台机器只有 2 GiB，**直接构建几乎必然被 OOM Killer 杀掉**，
而且失败信息经常只是一句 `Killed`，很难看出是内存问题。

**必须先加 swap，否则后面第三步会挂：**

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h        # 确认 Swap 那一行有 4.0Gi
```

> 更好的长期做法是**在本地构建、只把 `.next` 传上去**（见末尾「更快的发布方式」），
> 服务器就完全不用装构建依赖。但第一次部署先用 swap 打通，省事。

---

## 一、DNS 解析

阿里云控制台 → 域名 → tony.xin → 解析：

| 类型 | 主机记录 | 记录值 |
|---|---|---|
| A | `@` | `123.56.17.229` |
| A | `www` | `123.56.17.229` |

```bash
dig +short tony.xin        # 应返回 123.56.17.229
```

## 二、安全组

ECS → 安全组 → 入方向，放行 **80** 和 **443**。

**不要放行 3000 和 8000** —— 这两个服务只绑了 `127.0.0.1`，本来就进不来；
即使误绑了 `0.0.0.0`，不放行端口也能兜住一层。

## 三、装运行时（Alibaba Cloud Linux 3 = RHEL 8 系，用 dnf）

```bash
# Python：AL3 自带的是 3.6，太老
sudo dnf install -y python3.11 python3.11-pip python3.11-devel gcc

# Node 20（Next 16 的最低要求）
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Caddy
sudo dnf install -y 'dnf-command(copr)'
sudo dnf copr enable -y @caddy/caddy
sudo dnf install -y caddy

node -v && python3.11 -V && caddy version
```

## 四、拉代码

```bash
sudo mkdir -p /opt/meifa/logs && sudo chown -R $USER:$USER /opt/meifa
git clone https://github.com/Fiona309/tony3.0.git /opt/meifa/src
cp -r /opt/meifa/src/backend /opt/meifa/backend
cp -r /opt/meifa/src/my-tony2.0 /opt/meifa/my-tony2.0
```

## 五、后端

```bash
cd /opt/meifa/backend
python3.11 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -r requirements.txt

cp /opt/meifa/src/.env.example /opt/meifa/backend/.env
vi /opt/meifa/backend/.env      # 填 API key
chmod 600 /opt/meifa/backend/.env
```

> `ASR_PROVIDER` 保持 `siliconflow`（HTTP 调同一个 SenseVoiceSmall 模型）。
> 改成 `sensevoice` 要额外装 funasr/torch 约 2GB——这台机器装不下，也跑不动。

## 六、前端（内存最吃紧的一步）

```bash
cd /opt/meifa/my-tony2.0
npm ci
NODE_OPTIONS=--max-old-space-size=1536 npm run build
```

构建产物约 400MB。如果仍然 `Killed`，说明 swap 没生效，回到最上面检查。

## 七、启动服务

```bash
sudo cp /opt/meifa/src/.deploy/meifa-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now meifa-backend meifa-frontend
sudo systemctl status meifa-backend meifa-frontend
```

## 八、Caddy

```bash
sudo cp /opt/meifa/src/.deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

Caddy 会自动申请并续期 Let's Encrypt 证书。

> **证书签发失败时**：大陆访问 Let's Encrypt 偶有超时。改用阿里云免费 SSL 证书
> （控制台可申请 1 年期），下载 nginx 格式后在 Caddyfile 域名块里加：
> `tls /etc/caddy/cert.pem /etc/caddy/key.pem`

## 九、验证

```bash
curl -I  https://tony.xin
curl -s  https://tony.xin/api/health
curl -sI https://tony.xin/media/mock-assets/blue/after.jpg | head -3
```

**最后一定要用手机浏览器打开 https://tony.xin 实测摄像头。**
`getUserMedia` 只在 HTTPS 下工作，这是实时试色的命脉。
本地 localhost 被浏览器当作安全上下文，所以本地永远测不出这个问题。

---

## 更新部署

```bash
cd /opt/meifa/src && git pull
rsync -a --delete --exclude data --exclude .env backend/ /opt/meifa/backend/
rsync -a --delete --exclude node_modules --exclude .next my-tony2.0/ /opt/meifa/my-tony2.0/
cd /opt/meifa/my-tony2.0 && npm ci && NODE_OPTIONS=--max-old-space-size=1536 npm run build
sudo systemctl restart meifa-backend meifa-frontend
```

> `--exclude data` 不能省：`backend/data/` 是线上数据库和用户上传的媒体，
> 同步会把它们整个覆盖掉。

## 更快的发布方式（推荐尽早切过去）

在本地构建，只把产物传上去。服务器不再需要 node_modules 和构建内存：

```bash
# 本地
cd my-tony2.0 && npm run build
rsync -az --delete .next/ root@123.56.17.229:/opt/meifa/my-tony2.0/.next/
ssh root@123.56.17.229 'sudo systemctl restart meifa-frontend'
```

## 已知瓶颈：3 Mbps 出口

≈ 375 KB/s。实测过：

| 场景 | 数据量 | 耗时 |
|---|---|---|
| 1 人看 4 张效果图 | 1.2 MB | 3.2 秒 |
| 20 人同时 | 24 MB | **64 秒** |
| 种草视频（1.3~2.8 Mbps 码率） | — | **1~2 人就打满** |

Caddy 直发媒体 + 30 天强缓存能缓解重复访问，**但首次访问的带宽是硬上限**。
现场活动前必须把 `backend/data/media` 和 `public/mock-videos` 挪到 OSS + CDN：
100 人 × 1.2MB = 120MB，CDN 流量费约 ¥0.03，比升带宽便宜两个数量级。
