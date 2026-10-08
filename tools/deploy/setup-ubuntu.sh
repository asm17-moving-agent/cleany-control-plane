#!/usr/bin/env bash
set -euo pipefail
archive=${1:?release archive required}
domain=${2:-}
[[ "$archive" =~ ^cleany-[a-f0-9]+\.tar\.gz$ ]] || exit 2
[[ -z "$domain" || "$domain" =~ ^[a-z0-9][a-z0-9.-]*$ ]] || exit 2
if [[ -n "$domain" ]]; then
  if [[ ! -f /etc/cleany/public-host || "$domain" != "$(cat /etc/cleany/public-host)" ]]; then
    echo 'Configure authenticated HTTPS with tools/deploy/public.py before deploying with --domain.'
    exit 2
  fi
fi
export DEBIAN_FRONTEND=noninteractive
cloud-init status --wait
apt-get update -q
apt-get install -y -q -o Dpkg::Lock::Timeout=300 python3-venv caddy curl
id cleany >/dev/null 2>&1 || useradd --system --home /var/lib/cleany --shell /usr/sbin/nologin cleany
install -d -m 0755 /opt/cleany/releases /etc/cleany
install -d -m 0700 -o cleany -g cleany /var/lib/cleany
release=$(mktemp -d /opt/cleany/releases/release-XXXXXXXX)
chmod 0755 "$release"
tar -xzf "/tmp/$archive" -C "$release"
rm "/tmp/$archive"
if [[ ! -x /opt/cleany/tools/bin/uv ]]; then
  python3 -m venv /opt/cleany/tools
  /opt/cleany/tools/bin/pip install --disable-pip-version-check uv==0.12.3
fi
/opt/cleany/tools/bin/uv sync --project "$release/apps/backend" --locked --no-dev --python /usr/bin/python3
if [[ ! -f /etc/cleany/backend.env ]]; then
cat >/etc/cleany/backend.env <<'ENV'
CLEANY_HOST=127.0.0.1
CLEANY_PORT=8080
CLEANY_ROBOT_MODE=gateway
CLEANY_DATABASE_PATH=/var/lib/cleany/control-plane.db
CLEANY_LOG_LEVEL=INFO
CLEANY_OBSERVATION_DIRECTORY=/var/lib/cleany/observations
ENV
fi
chmod 0600 /etc/cleany/backend.env
cat >/etc/systemd/system/cleany-backend.service <<'UNIT'
[Unit]
Description=Cleany control-plane backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=cleany
Group=cleany
WorkingDirectory=/opt/cleany/current/apps/backend
EnvironmentFile=/etc/cleany/backend.env
ExecStart=/opt/cleany/current/apps/backend/.venv/bin/python /opt/cleany/current/apps/backend/run.py
Restart=on-failure
RestartSec=3
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/cleany
UMask=0077

[Install]
WantedBy=multi-user.target
UNIT
previous=""
if [[ -L /opt/cleany/current ]]; then
  previous=$(readlink -f /opt/cleany/current)
fi
ln -s "$release" /opt/cleany/next
mv -Tf /opt/cleany/next /opt/cleany/current
systemctl daemon-reload
systemctl enable cleany-backend
systemctl stop cleany-backend
schema_before=$(python3 - <<'PYDB'
import sqlite3
from pathlib import Path
from datetime import datetime, timezone
path = Path('/var/lib/cleany/control-plane.db')
if not path.exists():
    print(0)
else:
    with sqlite3.connect(path) as source:
        print(source.execute('PRAGMA user_version').fetchone()[0])
        backup = path.with_name('before-deploy-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.db')
        with sqlite3.connect(backup) as destination:
            source.backup(destination)
        backup.chmod(0o600)
PYDB
)
systemctl start cleany-backend
healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:8080/api/health >/dev/null; then
    healthy=true
    break
  fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  journalctl -u cleany-backend -n 30 --no-pager
  schema_after=$(python3 - <<'PYDB'
import sqlite3
with sqlite3.connect('/var/lib/cleany/control-plane.db') as db:
    print(db.execute('PRAGMA user_version').fetchone()[0])
PYDB
)
  if [[ -n "$previous" && -d "$previous" && "$schema_before" == "$schema_after" ]]; then
    ln -s "$previous" /opt/cleany/rollback
    mv -Tf /opt/cleany/rollback /opt/cleany/current
    systemctl restart cleany-backend
  fi
  exit 1
fi
cat >/etc/cleany/backup.py <<'PY'
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3

directory = Path('/var/lib/cleany/backups')
directory.mkdir(mode=0o700, exist_ok=True)
now = datetime.now(timezone.utc)
target = directory / ('control-' + now.strftime('%Y%m%dT%H%M%S%fZ') + '.db')
source = sqlite3.connect('file:/var/lib/cleany/control-plane.db?mode=ro', uri=True)
destination = sqlite3.connect(target)
try:
    source.backup(destination)
    if destination.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
        raise RuntimeError('backup integrity check failed')
finally:
    destination.close()
    source.close()
for old in directory.glob('control-*.db'):
    if old.stat().st_mtime < (now - timedelta(days=7)).timestamp():
        old.unlink()
PY
chmod 0644 /etc/cleany/backup.py
cat >/etc/systemd/system/cleany-backup.service <<'UNIT'
[Unit]
Description=Cleany SQLite backup

[Service]
Type=oneshot
User=cleany
Group=cleany
ExecStart=/usr/bin/python3 /etc/cleany/backup.py
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/cleany
UMask=0077
UNIT
cat >/etc/systemd/system/cleany-backup.timer <<'UNIT'
[Unit]
Description=Daily Cleany SQLite backup

[Timer]
OnCalendar=daily
RandomizedDelaySec=5m
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now cleany-backup.timer
systemctl start cleany-backup.service
if [[ -f /etc/cleany/public-host ]]; then
  # App deployment must never replace authentication or disable the public proxy.
  caddy validate --config /etc/caddy/Caddyfile
  systemctl enable --now caddy
else
  # Without a hostname, use SSH forwarding; expose no unauthenticated HTTP listener.
  systemctl disable --now caddy
fi
echo 'Backend is healthy; /var/lib/cleany and previous releases were preserved.'
