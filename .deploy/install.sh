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
if swapon --show | grep -q swapfile; then ok "已有 swap，跳过"; else
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "已加 4G swap"
fi

say "2/8 装运行环境"
# 系统自带的 Python 是 3.6，太老跑不了这个项目，所以要单独装 3.11。
command -v python3.11 >/dev/null || dnf install -y -q python3.11 python3.11-pip python3.11-devel gcc
ok "Python $(python3.11 -V 2>&1 | awk '{print $2}')"
# 前端框架 Next 16 要求 Node 20 以上
command -v node >/dev/null || { curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >/dev/null 2>&1; dnf install -y -q nodejs; }
ok "Node $(node -v)"
# Caddy 负责对外服务，并自动申请 HTTPS 证书
if ! command -v caddy >/dev/null; then
  dnf install -y -q 'dnf-command(copr)'
  dnf copr enable -y -q @caddy/caddy
  dnf install -y -q caddy
fi
ok "Caddy $(caddy version | head -1)"

say "3/8 拉代码"
mkdir -p "$APP/logs"
if [ -d "$APP/src/.git" ]; then git -C "$APP/src" pull -q; else git clone -q "$REPO" "$APP/src"; fi
mkdir -p "$APP/backend" "$APP/my-tony2.0"
# --exclude data 不能省：backend/data 里是线上数据库和用户上传的照片，
# 同步会把它们整个覆盖掉。
rsync -a --delete --exclude data --exclude data-local --exclude .env --exclude .venv \
  "$APP/src/backend/" "$APP/backend/"
rsync -a --delete --exclude node_modules --exclude .next \
  "$APP/src/my-tony2.0/" "$APP/my-tony2.0/"
# 初次部署时把仓库里的种子数据复制过去；已存在则保留线上数据不动
[ -d "$APP/backend/data" ] || cp -r "$APP/src/backend/data" "$APP/backend/data"
ok "代码就位"

say "4/8 检查密钥文件"
# 这些是调用 AI 服务（识别发色、生图、语音）用的钥匙，属于机密，不能进代码仓库
if [ ! -f "$APP/backend/.env" ]; then
  cp "$APP/src/.env.example" "$APP/backend/.env"; chmod 600 "$APP/backend/.env"
  cat <<'MSG'

  ⚠️  还差最后一件事：填 API 密钥

  请执行：  sudo vi /opt/meifa/backend/.env
  把里面每个 =  后面填上对应的 key（和你本地 backend/.env 里的一样）
  填完保存，再把这个脚本重新跑一遍即可。

MSG
  exit 0
fi
grep -q "OPENROUTER_API_KEY=.\+" "$APP/backend/.env" || {
  echo "  ⚠️  /opt/meifa/backend/.env 里的密钥还是空的，填完再重跑"; exit 0; }
ok "密钥已配置"

say "5/8 装后端依赖"
[ -d "$APP/backend/.venv" ] || python3.11 -m venv "$APP/backend/.venv"
"$APP/backend/.venv/bin/pip" install -q -U pip
"$APP/backend/.venv/bin/pip" install -q -r "$APP/backend/requirements.txt"
ok "后端依赖就绪"

say "6/8 构建前端（最慢的一步，约 3~8 分钟）"
cd "$APP/my-tony2.0"
npm ci --no-audit --no-fund --silent
NODE_OPTIONS=--max-old-space-size=1536 npm run build
ok "前端构建完成"

say "7/8 启动服务"
cp "$APP/src/.deploy"/meifa-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable -q --now meifa-backend meifa-frontend
ok "前后端已启动"

say "8/8 配置对外访问与 HTTPS"
cp "$APP/src/.deploy/Caddyfile" /etc/caddy/Caddyfile
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
