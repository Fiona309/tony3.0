#!/usr/bin/env bash
# tony.xin 一键部署。在服务器上执行：
#   curl -fsSL https://raw.githubusercontent.com/Fiona309/tony3.0/main/.deploy/install.sh | sudo bash
#
# 可重复执行：每一步都会先检查是否已完成，跳过已做过的部分。
set -euo pipefail

APP=/opt/meifa
REPO=https://github.com/Fiona309/tony3.0.git
say() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }
ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "请用 sudo 运行"; exit 1; }

say "1/8 加交换内存（swap）"
# 这台机器只有 2 GiB 内存，而前端构建峰值要 2~3 GB。
# 不加 swap，构建会被系统直接杀掉，而且只报一句 Killed，根本看不出是内存不够。
if swapon --show 2>/dev/null | grep -q swapfile; then
  ok "已有 swap，跳过"
else
  rm -f /swapfile
  # fallocate 在部分文件系统上不可用，退回 dd
  fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null      # 不能加 -q，这个系统的 util-linux 版本不认这个参数
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# 无论新建还是已有，都以系统的真实读数为准，不凭执行成功就报成功
SWAP_NOW=$(free -h | awk '/Swap/{print $2}')
[ "$SWAP_NOW" != "0B" ] || { echo "  ✗ swap 未生效，第 6 步构建会因内存不足失败"; exit 1; }
ok "swap 可用：$SWAP_NOW"

say "2/8 装运行环境"
# 系统自带的 Python 是 3.6，太老跑不了这个项目，所以要单独装 3.11。
command -v git >/dev/null || dnf install -y -q git
command -v rsync >/dev/null || dnf install -y -q rsync
command -v python3.11 >/dev/null || dnf install -y -q python3.11 python3.11-pip python3.11-devel gcc
ok "Python $(python3.11 -V 2>&1 | awk '{print $2}')"
# 前端框架 Next 16 要求 Node 20 以上
command -v node >/dev/null || { curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >/dev/null 2>&1; dnf install -y -q nodejs; }
ok "Node $(node -v)"
# Caddy 负责对外服务，并自动申请 HTTPS 证书
if ! command -v caddy >/dev/null; then
  dnf install -y -q 'dnf-command(copr)'
  # Alibaba Cloud Linux 3 基于 RHEL 8，但 copr 认不出它，会去找不存在的 epel-3，
  # 必须显式指定 epel-8-x86_64
  dnf copr enable -y @caddy/caddy epel-8-x86_64
  dnf install -y -q caddy
fi
ok "Caddy $(caddy version | head -1)"

say "3/8 拉代码"
# 国内服务器直连 GitHub 时通时不通，所以依次试几个入口。
clone_or_pull() {
  if [ -d "$APP/src/.git" ]; then
    if timeout 120 git -C "$APP/src" pull -q 2>/dev/null; then ok "代码已更新"; return 0; fi
    echo "  拉取更新失败，尝试镜像…"
  fi
  for url in \
    "https://github.com/Fiona309/tony3.0.git" \
    "https://ghfast.top/https://github.com/Fiona309/tony3.0.git" \
    "https://gitclone.com/github.com/Fiona309/tony3.0.git"
  do
    echo "  尝试：${url%%/Fiona309*}"
    # 下到临时目录，成功了才替换旧代码。
    # 之前这里是先 rm -rf 再 clone，结果三个入口都不通时把已有代码一起删了。
    rm -rf "$APP/src.new"
    if timeout 180 git clone -q --depth 1 "$url" "$APP/src.new" 2>/dev/null; then
      rm -rf "$APP/src"; mv "$APP/src.new" "$APP/src"
      ok "代码已下载"; return 0
    fi
  done
  rm -rf "$APP/src.new"
  if [ -d "$APP/src/.git" ]; then
    echo "  ⚠ GitHub 暂时不通，沿用服务器上已有的代码"
    return 0
  fi
  return 1
}
mkdir -p "$APP/logs" "$APP/backend" "$APP/my-tony2.0"
if clone_or_pull; then
  # --exclude data 不能省：backend/data 里是线上数据库和用户上传的照片，
  # 同步会把它们整个覆盖掉。
  rsync -a --delete --exclude data --exclude data-local --exclude .env --exclude .venv \
    "$APP/src/backend/" "$APP/backend/"
  rsync -a --delete --exclude node_modules --exclude .next \
    "$APP/src/my-tony2.0/" "$APP/my-tony2.0/"
  [ -d "$APP/backend/data" ] || cp -r "$APP/src/backend/data" "$APP/backend/data"
  ok "代码就位"
elif [ -f "$APP/backend/app/main.py" ] && [ -f "$APP/my-tony2.0/package.json" ]; then
  # 下载全挂，但上一轮已经把代码同步到运行目录了，直接用它，别让网络问题卡住部署
  echo "  ⚠ GitHub 所有入口不通，但上次同步好的代码还在，直接用它继续"
  ok "代码就位（沿用已有）"
else
  echo "  ✗ 所有下载入口都不通，服务器上也没有可用代码。请把这条信息发给我。"
  exit 1
fi

say "4/8 检查密钥文件"
# 这些是调用 AI 服务（识别发色、生图、语音）用的钥匙，属于机密，不能进代码仓库
if [ ! -f "$APP/backend/.env" ]; then
  [ -f "$APP/src/.env.example" ] && cp "$APP/src/.env.example" "$APP/backend/.env" || : > "$APP/backend/.env"
  chmod 600 "$APP/backend/.env"
  echo "  ⚠️  还缺 API 密钥，填好 /opt/meifa/backend/.env 再重跑本脚本"
  exit 0
fi
grep -q "OPENROUTER_API_KEY=.\+" "$APP/backend/.env" || {
  echo "  ⚠️  /opt/meifa/backend/.env 里的密钥还是空的，填完再重跑"; exit 0; }
ok "密钥已配置"

say "5/8 装后端依赖"
[ -d "$APP/backend/.venv" ] || python3.11 -m venv "$APP/backend/.venv"
# PyPI 官方源在国外，国内服务器拉包极慢甚至超时，换阿里云镜像
PIP_MIRROR="https://mirrors.aliyun.com/pypi/simple/"
"$APP/backend/.venv/bin/pip" install -q -U pip -i "$PIP_MIRROR" --trusted-host mirrors.aliyun.com
"$APP/backend/.venv/bin/pip" install -q -r "$APP/backend/requirements.txt" \
  -i "$PIP_MIRROR" --trusted-host mirrors.aliyun.com
ok "后端依赖就绪"

say "6/8 构建前端（最慢的一步，5~15 分钟，屏幕会长时间不动）"
cd "$APP/my-tony2.0"
# npm 官方源同理，换成国内镜像，否则 npm ci 会挂在下载上
npm config set registry https://registry.npmmirror.com >/dev/null
npm ci --no-audit --no-fund --silent
NODE_OPTIONS=--max-old-space-size=1536 npm run build
ok "前端构建完成"

say "7/8 启动服务"
# 配置直接写在脚本里，不从 $APP/src 复制——GitHub 拉不下来时那个目录可能不存在
cat > /etc/systemd/system/meifa-backend.service <<'UNIT_BE'
[Unit]
Description=Meifa FastAPI backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/meifa/backend
EnvironmentFile=-/opt/meifa/backend/.env
# 只绑回环：Caddy 在同一台机器上反代，没有任何理由把明文端口暴露到公网。
# 绑 0.0.0.0 的话，只要安全组漏放行一个端口，别人就能绕过 HTTPS 直连。
Environment=HOST=127.0.0.1
Environment=PORT=8000
Environment=DATA_DIR=/opt/meifa/backend/data
Environment=MEDIA_DIR=/opt/meifa/backend/data/media
Environment=DB_PATH=/opt/meifa/backend/data/meifa.db
Environment=CHROMA_DIR=/opt/meifa/backend/data/chroma_data
Environment=MODEL_CACHE_DIR=/opt/meifa/backend/data/models
Environment=MOCK_MODELS=false
# ASR 走 siliconflow：HTTP 调同一个 SenseVoiceSmall 模型，不需要本地权重。
# 改成 sensevoice 必须先装 requirements-local-asr.txt（funasr/torch 等约 2GB），
# 否则语音输入会在运行时报 ImportError——而 requirements.txt 里没有这几个包。
Environment=ASR_PROVIDER=siliconflow
ExecStart=/opt/meifa/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
StandardOutput=append:/opt/meifa/logs/backend.log
StandardError=append:/opt/meifa/logs/backend.err.log

[Install]
WantedBy=multi-user.target
UNIT_BE
cat > /etc/systemd/system/meifa-frontend.service <<'UNIT_FE'
[Unit]
Description=Meifa Next.js frontend v2
After=network-online.target meifa-backend.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/meifa/my-tony2.0
Environment=NODE_ENV=production
# 只绑回环：Caddy 在同一台机器上反代，没有任何理由把明文端口暴露到公网。
# 绑 0.0.0.0 的话，只要安全组漏放行一个端口，别人就能绕过 HTTPS 直连。
Environment=HOSTNAME=127.0.0.1
Environment=PORT=3000
Environment=NEXT_PUBLIC_API_MODE=real
Environment=NEXT_PUBLIC_API_BASE_URL=/api
Environment=NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
ExecStart=/usr/local/bin/npm start
Restart=always
RestartSec=5
StandardOutput=append:/opt/meifa/logs/frontend.log
StandardError=append:/opt/meifa/logs/frontend.err.log

[Install]
WantedBy=multi-user.target
UNIT_FE
systemctl daemon-reload
systemctl enable -q --now meifa-backend meifa-frontend
ok "前后端已启动"

say "8/8 配置对外访问与 HTTPS"
cat > /etc/caddy/Caddyfile <<'CADDY_CONF'
# 生产环境反向代理。备案通过后前后端都收在同一台国内服务器上，
# 不再需要「海外节点做门面反代回国内」那套绕备案的架构——
# 那样每个请求都要跨境往返，延迟至少多 300ms，还要吃两边的带宽。
tony.xin, www.tony.xin {
	encode zstd gzip

	# 媒体文件直接由 Caddy 发，不经过 FastAPI。
	# 196MB 的图片和视频走 Python 是纯浪费：多一次进程转发、多一份内存拷贝，
	# 还占着 uvicorn 的 worker。静态文件交给 Caddy 是它最擅长的事。
	handle_path /media/* {
		root * /opt/meifa/backend/data/media
		header Cache-Control "public, max-age=2592000"
		file_server
	}

	handle /api/* {
		reverse_proxy 127.0.0.1:8000
	}

	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
CADDY_CONF
systemctl enable -q --now caddy
systemctl reload caddy
ok "Caddy 已生效"

say "完成，正在自检"
sleep 5
for u in meifa-backend meifa-frontend caddy; do
  printf '  %-16s %s\n' "$u" "$(systemctl is-active "$u")"
done
printf '  %-16s %s\n' "https://tony.xin" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 https://tony.xin || echo '暂不可达')"

cat <<'DONE'

  下一步：用【手机浏览器】打开 https://tony.xin，试一下实时试色的摄像头。

  摄像头只在 https 下才能用，这是这个 App 的命脉，
  而电脑上的本地测试是测不出这个问题的，必须用手机在真实域名下试。

DONE
