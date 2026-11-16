#!/usr/bin/env python3
"""Activate a staged single-worker release after backing up an idle control-plane DB."""
import argparse
import hashlib
import json
import os
import shutil
import signal
import sqlite3
import subprocess
import time
from pathlib import Path
from urllib.request import urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('release')
args = parser.parse_args()
base = Path.home()/'cleany-control-plane'
release = (base/'releases'/args.release).resolve()
if release.parent != (base/'releases').resolve() or not (release/'apps/backend/run.py').is_file():
    raise ValueError('expected an existing staged release')
current = base/'current'
previous = current.resolve()
database = Path.home()/'.local/state/cleany-control-plane/control-plane.db'
unit = Path.home()/'.config/systemd/user/cleany-control-plane.service'
backup = base/'deployment-backups'/time.strftime('%Y%m%d-%H%M%S')
backup.mkdir(parents=True, mode=0o700)
shutil.copy2(unit, backup/'cleany-control-plane.service')
service = 'cleany-control-plane.service'


def systemctl(*args):
    return subprocess.check_output(['systemctl', '--user', *args], text=True).strip()


def idle(db):
    count = db.execute("SELECT count(*) FROM missions WHERE json_extract(payload,'$.phase')!='TERMINAL'").fetchone()[0]
    if count:
        raise RuntimeError(f'{count} unfinished missions; activation aborted')


with sqlite3.connect(f'file:{database}?mode=ro', uri=True) as db:
    idle(db)
    with sqlite3.connect(backup/'control-plane.db') as saved:
        db.backup(saved)
os.chmod(backup/'control-plane.db', 0o600)
started = time.monotonic()
systemctl('stop', '--no-block', service)
# Previous releases may wait indefinitely for SSE; a second interrupt requests graceful exit.
for tick in range(100):
    pid = int(systemctl('show', service, '-p', 'MainPID', '--value'))
    if not pid:
        break
    if tick == 15:
        os.kill(pid, signal.SIGINT)
    time.sleep(.2)
else:
    raise RuntimeError('old backend did not stop; release symlink was not changed')
try:
    with sqlite3.connect(f'file:{database}?mode=ro', uri=True) as db:
        idle(db)
    replacement = base/'.current-next'
    replacement.symlink_to(release)
    replacement.replace(current)
    shutil.copy2(release/'tools/deploy/jetson/cleany-control-plane.service', unit)
    systemctl('daemon-reload')
    systemctl('start', service)
    for _ in range(60):
        try:
            with urlopen('http://127.0.0.1:8080/api/health', timeout=1) as response:
                assert json.load(response)['status'] == 'ok'
            pid = int(systemctl('show', service, '-p', 'MainPID', '--value'))
            assert Path(f'/proc/{pid}/cwd').resolve() == release
            with urlopen('http://127.0.0.1:8080/', timeout=1) as response:
                assert response.read() == (release/'apps/dashboard/dist/index.html').read_bytes()
            break
        except (OSError, AssertionError, ValueError):
            time.sleep(.25)
    else:
        raise RuntimeError('new backend did not pass health/cwd/index checks')
except BaseException:
    systemctl('stop', service)
    # Preserve failed-release writes before restoring the pre-activation schema/payloads.
    with sqlite3.connect(database) as live:
        idle(live)
        with sqlite3.connect(backup/'failed-release.db') as failed:
            live.backup(failed)
    with sqlite3.connect(backup/'control-plane.db') as saved:
        with sqlite3.connect(database) as live:
            saved.backup(live)
    replacement = base/'.current-rollback'
    replacement.symlink_to(previous)
    replacement.replace(current)
    shutil.copy2(backup/'cleany-control-plane.service', unit)
    systemctl('daemon-reload')
    systemctl('start', service)
    raise
result = dict(previous=str(previous), release=str(release), backup=str(backup),
              elapsed_seconds=round(time.monotonic()-started, 2), health='ok', pid=pid,
              index_sha256=hashlib.sha256((release/'apps/dashboard/dist/index.html').read_bytes()).hexdigest(),
              physical_motion=False)
(backup/'activation.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result))
