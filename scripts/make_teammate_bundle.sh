#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rsync >/dev/null 2>&1; then
  echo "缺少 rsync，无法生成队友包。"
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "缺少 zip，无法生成队友包。"
  exit 1
fi

ENV_SOURCE=""
if [ -f "$ROOT_DIR/.env" ]; then
  ENV_SOURCE="$ROOT_DIR/.env"
elif [ -f "$ROOT_DIR/backend/.env" ]; then
  ENV_SOURCE="$ROOT_DIR/backend/.env"
else
  echo "缺少 .env 或 backend/.env。队友包需要内置真实环境变量。"
  exit 1
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
DIST_DIR="$ROOT_DIR/dist"
BUNDLE_NAME="meifa-v1-docker-teammate-$STAMP"
BUNDLE_DIR="$DIST_DIR/$BUNDLE_NAME"
ZIP_PATH="$DIST_DIR/$BUNDLE_NAME.zip"

rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR" "$BUNDLE_DIR/seed-data" "$DIST_DIR"

rsync -a \
  --exclude '.git' \
  --exclude '.gh-config' \
  --exclude '.DS_Store' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.venv' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '*.log' \
  --exclude '*.zip' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude 'runtime-data' \
  --exclude 'seed-data' \
  --exclude 'backend/data' \
  --exclude 'backend_handoff' \
  --exclude 'docs/mock图片视频素材' \
  --exclude 'docs/mock图片视频素材.zip' \
  --exclude 'hair_full_pipeline/models' \
  ./ "$BUNDLE_DIR/"

cp "$ENV_SOURCE" "$BUNDLE_DIR/.env.teammate"

if [ -f backend/data/meifa.db ]; then
  cp backend/data/meifa.db "$BUNDLE_DIR/seed-data/meifa.db"
fi

if [ -d backend/data/chroma_data ]; then
  rsync -a backend/data/chroma_data "$BUNDLE_DIR/seed-data/"
fi

if [ -d backend/data/media ]; then
  rsync -a backend/data/media "$BUNDLE_DIR/seed-data/"
fi

cat > "$BUNDLE_DIR/队友先看我.txt" <<'TEXT'
莓发 v1 Docker 演示包

第一次使用：
1. 安装 Docker Desktop，并启动 Docker Desktop。
2. 解压这个 zip。
3. macOS 可以双击“一键启动.command”；也可以在终端执行：
   ./start.sh
4. 浏览器打开：
   http://localhost:3000

说明：
- 环境变量已经内置在 .env.teammate，启动脚本会自动复制为 .env。
- 知识库、SQLite 数据库、演示视频和媒体资源已经内置在 seed-data。
- 首次启动会复制 seed-data 到 runtime-data，后续运行数据都会写入 runtime-data。
- 如果想从初始数据重新开始，删除 runtime-data 后重新运行 start.sh。
TEXT

chmod +x "$BUNDLE_DIR/start.sh"
if [ -f "$BUNDLE_DIR/一键启动.command" ]; then
  chmod +x "$BUNDLE_DIR/一键启动.command"
fi

(
  cd "$DIST_DIR"
  rm -f "$ZIP_PATH"
  zip -qr "$ZIP_PATH" "$BUNDLE_NAME"
)

echo "队友包已生成：$ZIP_PATH"
du -sh "$ZIP_PATH"
