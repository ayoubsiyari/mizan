#!/usr/bin/env bash
# Redeploy latest main on the VPS. Run as root:
#   bash /home/mizan/app/scripts/vps-update.sh
set -euo pipefail
APP_USER="mizan"
APP_DIR="/home/${APP_USER}/app"

if [ "$(id -u)" -ne 0 ]; then echo "Run as root." >&2; exit 1; fi

echo "==> git pull"
sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only

echo "==> npm ci --omit=dev"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm ci --omit=dev"

echo "==> restart service"
systemctl restart mizan
sleep 2
systemctl --no-pager status mizan | head -12
echo "Done. tail -f /var/log/mizan.log"
