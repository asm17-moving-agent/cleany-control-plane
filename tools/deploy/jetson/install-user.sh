#!/usr/bin/env bash
set -euo pipefail
release=${1:?absolute release path required}
[[ "$release" == "$HOME/cleany-control-plane/releases/"* ]] || exit 2
cd "$release"
tar -xzf source.tar.gz
"$HOME/.local/bin/uv" sync --project apps/backend --locked --python 3.12 --extra dev
state="$HOME/.local/state/cleany-control-plane"
config="$HOME/.config/cleany-control-plane"
mkdir -p "$state" "$config" "$HOME/.config/systemd/user"
if [[ ! -f "$state/control-plane.db" ]]; then
  test -f "$state/imported.sqlite"
  cp -n "$state/imported.sqlite" "$state/control-plane.db"
  chmod 600 "$state/control-plane.db"
fi
if [[ ! -f "$config/backend.env" ]]; then
  umask 077
  cat >"$config/backend.env" <<ENV
CLEANY_HOST=127.0.0.1
CLEANY_PORT=8080
CLEANY_ROBOT_MODE=gateway
CLEANY_DATABASE_PATH=$state/control-plane.db
CLEANY_COOKIE_SECURE=true
CLEANY_ALLOWED_ORIGINS=["https://cleany.home.arpa"]
CLEANY_OBSERVATION_DIRECTORY=$state/observations
ENV
fi
python3 - "$state/control-plane.db" <<'CHECK'
import sqlite3, sys
from datetime import datetime, timezone
from pathlib import Path
path = Path(sys.argv[1])
with sqlite3.connect(path) as db:
    if db.execute("SELECT 1 FROM missions WHERE json_extract(payload,'$.phase')!='TERMINAL'").fetchone():
        raise SystemExit("unfinished missions; deployment stopped")
    backup = path.with_name("before-deploy-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".db")
    with sqlite3.connect(backup) as target:
        db.backup(target)
    backup.chmod(0o600)
CHECK
ln -sfn "$release" "$HOME/cleany-control-plane/current"
cp tools/deploy/jetson/cleany-control-plane.service "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable cleany-control-plane.service
systemctl --user restart cleany-control-plane.service
