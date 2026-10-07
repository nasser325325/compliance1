#!/bin/bash
# =============================================================================
# cloud-init / user-data / startup-script for the 90-Day CISSP Challenge server
#
# Works unchanged as:
#   AWS EC2        --user-data file://cloud-init.sh      (Amazon Linux 2023 or Ubuntu)
#   Azure VM       --custom-data cloud-init.sh           (Ubuntu 24.04)
#   Google GCE     --metadata-from-file startup-script=cloud-init.sh (Debian 12 / Ubuntu)
#
# What it does
#   1. installs git + Node.js 22
#   2. clones the repo into /opt/cissp-90-day
#   3. creates an unprivileged service user
#   4. installs a hardened systemd unit that listens on port 80
#
# Edit the three variables below before uploading if needed.
# =============================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/nasser325325/compliance1.git}"
BRANCH="${BRANCH:-main}"
APP_PASSWORD="${APP_PASSWORD:-}"      # leave empty for no login prompt

APP_DIR=/opt/cissp-90-day
DATA_DIR=/var/lib/cissp-90-day
SVC_USER=cissp

log() { echo "[cissp-init] $*"; }

# ---------- 1. packages ----------
if command -v dnf >/dev/null 2>&1; then            # Amazon Linux 2023 / RHEL family
  dnf install -y git
  dnf install -y nodejs22 2>/dev/null || dnf install -y nodejs20 2>/dev/null || dnf install -y nodejs
elif command -v apt-get >/dev/null 2>&1; then      # Ubuntu / Debian
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y git curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
else
  log "unsupported distro"; exit 1
fi
log "node $(node --version)"

# ---------- 2. code ----------
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH" && git -C "$APP_DIR" reset --hard FETCH_HEAD
else
  rm -rf "$APP_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# ---------- 3. service user + data dir ----------
id -u "$SVC_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$SVC_USER"
mkdir -p "$DATA_DIR"
chown -R "$SVC_USER":"$SVC_USER" "$DATA_DIR"
chown -R root:root "$APP_DIR"          # code is read-only for the service user

install -m 600 /dev/null /etc/cissp-90-day.env
cat > /etc/cissp-90-day.env <<EOF
PORT=80
HOST=0.0.0.0
DATA_DIR=$DATA_DIR
APP_PASSWORD=$APP_PASSWORD
EOF

# ---------- 4. systemd ----------
cat > /etc/systemd/system/cissp-90-day.service <<EOF
[Unit]
Description=90-Day CISSP Challenge web server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SVC_USER
Group=$SVC_USER
EnvironmentFile=/etc/cissp-90-day.env
WorkingDirectory=$APP_DIR/cissp-90-day
ExecStart=$(command -v node) $APP_DIR/cissp-90-day/server.js
Restart=always
RestartSec=3

# Least privilege: only the capability needed to bind port 80, nothing else.
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectControlGroups=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now cissp-90-day
sleep 2
systemctl --no-pager --lines=5 status cissp-90-day || true
log "done — open http://<this-machine-public-ip>/"
