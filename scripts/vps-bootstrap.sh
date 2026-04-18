#!/usr/bin/env bash
# Mizan Law — one-shot VPS bootstrap (IP-only HTTP)
# Run as root on a fresh Ubuntu 22.04 / Debian 12 box:
#   curl -fsSL https://raw.githubusercontent.com/ayoubsiyari/mizan/main/scripts/vps-bootstrap.sh | bash
# Or SCP this file and:  bash vps-bootstrap.sh
set -euo pipefail

REPO_URL="https://github.com/ayoubsiyari/mizan.git"
APP_USER="mizan"
APP_DIR="/home/${APP_USER}/app"
SERVICE="/etc/systemd/system/mizan.service"
NGX_SITE="/etc/nginx/sites-available/mizan"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo -i)." >&2
  exit 1
fi

echo "==> Updating OS + installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt update
apt install -y curl git ufw nginx sqlite3 ca-certificates

echo "==> Installing Node.js 20 LTS"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi
node -v && npm -v

echo "==> Configuring UFW firewall (22, 80 only)"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx HTTP' >/dev/null || ufw allow 80 >/dev/null
ufw --force enable

echo "==> Creating '${APP_USER}' user"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$APP_USER"
fi

echo "==> Cloning / pulling repo"
if [ -d "${APP_DIR}/.git" ]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
else
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
fi

echo "==> Installing production deps"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm ci --omit=dev"

echo "==> Generating .env (if missing)"
if [ ! -f "${APP_DIR}/.env" ]; then
  JWT=$(openssl rand -hex 48)
  cat > "${APP_DIR}/.env" <<EOF
PORT=3000
NODE_ENV=production
FRONTEND_URL=http://$(hostname -I | awk '{print $1}')
DB_FILE=${APP_DIR}/database/mizan.db
JWT_SECRET=${JWT}
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=200
PASSWORD_MIN_LENGTH=8
UPLOAD_DIR=${APP_DIR}/assets/uploads
MAX_FILE_SIZE=10485760
EOF
  chown "$APP_USER:$APP_USER" "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
  echo "    .env written (JWT_SECRET randomly generated)"
else
  echo "    .env already exists, keeping it"
fi

echo "==> Preparing data dirs"
sudo -u "$APP_USER" mkdir -p "${APP_DIR}/database" "${APP_DIR}/assets/uploads"

echo "==> Writing systemd unit"
cat > "$SERVICE" <<EOF
[Unit]
Description=Mizan Law App
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node backend/server.js
Restart=always
RestartSec=5
StandardOutput=append:/var/log/mizan.log
StandardError=append:/var/log/mizan.err.log

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${APP_DIR}/database ${APP_DIR}/assets/uploads /var/log
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

touch /var/log/mizan.log /var/log/mizan.err.log
chown "$APP_USER:$APP_USER" /var/log/mizan.log /var/log/mizan.err.log

systemctl daemon-reload
systemctl enable mizan >/dev/null
systemctl restart mizan

echo "==> Writing nginx reverse-proxy config"
cat > "$NGX_SITE" <<'EOF'
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
rm -f /etc/nginx/sites-enabled/default
ln -sf "$NGX_SITE" /etc/nginx/sites-enabled/mizan
nginx -t
systemctl reload nginx

echo "==> Daily SQLite backup cron"
sudo -u "$APP_USER" mkdir -p "/home/${APP_USER}/backups"
CRON_LINE="0 3 * * * sqlite3 ${APP_DIR}/database/mizan.db \".backup /home/${APP_USER}/backups/mizan-\$(date +\\%F).db\" && find /home/${APP_USER}/backups -type f -mtime +30 -delete"
(sudo -u "$APP_USER" crontab -l 2>/dev/null | grep -Fv "${APP_DIR}/database/mizan.db" ; echo "$CRON_LINE") | sudo -u "$APP_USER" crontab -

echo
echo "========================================================"
echo "  Deployment complete."
echo "  URL:     http://$(hostname -I | awk '{print $1}')"
echo "  Status:  systemctl status mizan --no-pager"
echo "  Logs:    tail -f /var/log/mizan.log /var/log/mizan.err.log"
echo "  Update:  bash ${APP_DIR}/scripts/vps-update.sh"
echo "========================================================"
echo "  First visit needs an admin account — register at /pages/register.html"
echo "  (or create via API: POST /api/auth/register)"
echo "========================================================"
