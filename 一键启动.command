#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
./start.sh

echo
echo "按任意键关闭窗口..."
read -r -n 1 _
