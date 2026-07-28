#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "未检测到 Docker Compose。请先安装 Docker Desktop，然后重新运行 start.sh。"
  exit 1
fi

if [ ! -f .env ]; then
  if [ -f .env.teammate ]; then
    cp .env.teammate .env
  else
    echo "缺少 .env 或 .env.teammate，无法启动真实 AI 链路。"
    exit 1
  fi
fi

if [ ! -d runtime-data ]; then
  if [ -d seed-data ]; then
    echo "首次启动：正在复制内置知识库和演示媒体..."
    cp -R seed-data runtime-data
  else
    mkdir -p runtime-data
  fi
fi

"${COMPOSE[@]}" -f docker-compose.teammate.yml up -d --build

echo
echo "启动完成。"
echo "前端地址：http://localhost:3000"
echo "后端地址：http://localhost:8000"
