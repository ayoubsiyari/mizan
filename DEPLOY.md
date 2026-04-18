# VPS Deployment — Mizan Law

## 1. First-time server setup (Ubuntu 22.04 / Debian 12)

```bash
# As root or with sudo
apt update && apt upgrade -y
apt install -y git curl ufw nginx certbot python3-certbot-nginx

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v && npm -v

# Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable

# Dedicated user (no root for the app)
adduser --disabled-password --gecos "" mizan
```

## 2. Clone & install

```bash
sudo -iu mizan
git clone https://github.com/ayoubsiyari/mizan.git app
cd app
npm ci --omit=dev

# Generate a strong JWT secret
cp .env.example .env
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 48)|" .env
sed -i "s|NODE_ENV=.*|NODE_ENV=production|" .env
sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://your-domain.com|" .env
chmod 600 .env

# Prepare data dirs
mkdir -p database assets/uploads
```

## 3. systemd service (run as root)

Create `/etc/systemd/system/mizan.service`:

```ini
[Unit]
Description=Mizan Law App
After=network.target

[Service]
Type=simple
User=mizan
WorkingDirectory=/home/mizan/app
EnvironmentFile=/home/mizan/app/.env
ExecStart=/usr/bin/node backend/server.js
Restart=always
RestartSec=5
StandardOutput=append:/var/log/mizan.log
StandardError=append:/var/log/mizan.err.log

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/mizan/app/database /home/mizan/app/assets/uploads /var/log
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Then:

```bash
touch /var/log/mizan.log /var/log/mizan.err.log
chown mizan:mizan /var/log/mizan.log /var/log/mizan.err.log
systemctl daemon-reload
systemctl enable --now mizan
systemctl status mizan
```

## 4. Nginx reverse proxy + HTTPS

`/etc/nginx/sites-available/mizan`:

```nginx
server {
    server_name your-domain.com;
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 80;
}
```

```bash
ln -s /etc/nginx/sites-available/mizan /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d your-domain.com   # auto-issues TLS + redirects http->https
```

## 5. Updates / redeploy

```bash
sudo -iu mizan
cd app
git pull
npm ci --omit=dev
sudo systemctl restart mizan
```

## 6. Backups

The entire application state is in one SQLite file.

```bash
# Daily backup via cron (as mizan user)
crontab -e
# Add:
0 3 * * * sqlite3 /home/mizan/app/database/mizan.db ".backup /home/mizan/backups/mizan-$(date +\%F).db" && find /home/mizan/backups -type f -mtime +30 -delete
mkdir -p /home/mizan/backups
```

Also back up `/home/mizan/app/assets/uploads/` if users upload files.

## 7. Security checklist

- [x] `.env` is in `.gitignore` — never committed
- [x] `*.db`, `*.db-shm`, `*.db-wal` excluded from git
- [x] Server refuses to boot in `NODE_ENV=production` without a strong `JWT_SECRET` (>=32 chars)
- [x] Passwords hashed with bcrypt (10 rounds)
- [x] Rate limiting on all API routes
- [x] `helmet` HTTP security headers
- [x] CORS restricted to `FRONTEND_URL` in production
- [x] Nginx + Let's Encrypt TLS
- [x] UFW firewall (only 22, 80, 443 open)
- [x] App runs as unprivileged `mizan` user
- [x] systemd hardening (`ProtectSystem=strict`, `NoNewPrivileges`, `PrivateTmp`)
- [ ] Rotate `JWT_SECRET` periodically (invalidates all sessions)
- [ ] Monitor `/var/log/mizan.err.log`
- [ ] Set up off-site backup of SQLite file

## 8. Default test account (dev only)

```
Email:    admin@mizan.test
Password: Mizan@2026
```

**Delete this account (or change the password) before going live:**

```bash
sqlite3 database/mizan.db "DELETE FROM users WHERE email='admin@mizan.test';"
```
