"""Switch existing Jetson user services to the staged global units with one SQLite writer."""

import fcntl
import filecmp
import os
import sqlite3
import subprocess
import time
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

HOME = Path.home()
STATE = Path("/var/opt/cleany")
LOCAL = HOME / ".config/systemd/user"
GLOBAL = Path("/etc/systemd/user")
UNITS = (
    "cleany-control-plane.service", "cleany-dashboard-camera.service",
    "cleany-dashboard-observe@.service", "cleany-display.service", "cleany-display-kiosk.service",
    "cleany-camera-privacy.service",
)
SERVICES = tuple(name.replace("@.", "@robot.") for name in UNITS)


def manager(*args: str) -> None:
    subprocess.run(["systemctl", "--user", *args], check=True)


def verify_db(path: Path, backup: Path | None = None) -> None:
    with closing(sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA quick_check").fetchone() != ("ok",):
            raise RuntimeError("SQLite integrity check failed")
        active = db.execute("SELECT 1 FROM missions WHERE json_extract(payload,'$.phase') != 'TERMINAL' LIMIT 1").fetchone()
        if active:
            raise RuntimeError("Mission in progress")
        if backup:
            with closing(sqlite3.connect(backup)) as dest:
                db.backup(dest)


def wait_for(url: str) -> None:
    for _ in range(30):
        try:
            with urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(1)
    raise RuntimeError(f"Service did not respond at {url}")


def main() -> None:
    os.umask(0o077)
    lock = (STATE / "backups/switch.lock").open("a")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    source = HOME / ".local/state/cleany-control-plane"
    dest = STATE / "control-plane"
    for unit in UNITS:
        staged = Path("/opt/cleany/current/systemd-user") / unit
        if not (GLOBAL / unit).is_file() or not filecmp.cmp(staged, GLOBAL / unit, shallow=False):
            raise RuntimeError(f"Install the staged global unit first: {unit}")
    for service in SERVICES:
        target = "graphical-session" if "kiosk" in service else "default"
        if not (GLOBAL / f"{target}.target.wants" / service).exists():
            raise RuntimeError(f"Missing global auto-start for {service}")
    migrated = source.is_symlink() and source.resolve() == dest
    if migrated and not any((LOCAL / name).exists() for name in UNITS):
        verify_db(dest / "control-plane.db")
        print("Global units and production state already switched")
        return
    if not migrated and (source.is_symlink() or source.stat().st_dev != dest.stat().st_dev or any(dest.iterdir())):
        raise RuntimeError("Expected the legacy database and empty same-filesystem destination")
    verify_db(source / "control-plane.db")
    backup = STATE / "backups" / datetime.now(timezone.utc).strftime("switch-%Y%m%dT%H%M%SZ")
    backup.mkdir()
    print(f"Rollback files: {backup}", flush=True)
    old_entries = [LOCAL / unit for unit in UNITS]
    old_entries.extend(LOCAL / "default.target.wants" / service for service in SERVICES)
    old_entries.append(HOME / ".config/autostart/cleany-display.desktop")
    relocated = []
    try:
        manager("stop", SERVICES[2], SERVICES[0])
        verify_db(source / "control-plane.db", backup / "before.db")
        if not migrated:
            source.rename(dest)
            source.symlink_to(dest, target_is_directory=True)
        dest.chmod(0o700)
        for entry in old_entries:
            if entry.exists() or entry.is_symlink():
                saved = backup / entry.relative_to(HOME)
                saved.parent.mkdir(parents=True, exist_ok=True)
                entry.rename(saved)
                relocated.append((entry, saved))
        manager("daemon-reload")
        manager("start", SERVICES[0])
        wait_for("http://127.0.0.1:8080/api/health")
        manager("restart", SERVICES[1], SERVICES[2], SERVICES[3])
        wait_for("http://127.0.0.1:8769/api/cameras")
        wait_for("http://127.0.0.1:8770/healthz")
        manager("restart", SERVICES[4])
        time.sleep(3)
        for service in SERVICES:
            manager("is-active", service)
    except BaseException:
        if not source.exists() and dest.is_dir():
            source.symlink_to(dest, target_is_directory=True)
        for entry, saved in reversed(relocated):
            saved.rename(entry)
        manager("daemon-reload")
        # The original face installation may already have moved to Backup. Keep
        # working face processes alive during a rollback of dashboard state.
        manager("restart", SERVICES[0], SERVICES[1], SERVICES[2])
        raise


if __name__ == "__main__":
    main()
