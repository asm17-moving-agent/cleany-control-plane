#!/usr/bin/env python3
"""Invoked as root on EC2; receive passwords only on stdin over SSH."""

import grp
import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def main():
    domain, template_name = sys.argv[1:]
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", domain):
        raise ValueError("invalid hostname")
    credentials = json.load(sys.stdin)
    content = Path(template_name).read_text().replace("__DOMAIN__", domain)
    for role in ["robot"]:
        hashed = subprocess.check_output(
            ["caddy", "hash-password", "--algorithm", "bcrypt"],
            input=credentials[role]["password"] + "\n",
            text=True,
        ).strip()
        if not hashed.startswith("$2"):
            raise ValueError("password hash failed")
        content = content.replace(f"__{role.upper()}_HASH__", hashed)
    with tempfile.NamedTemporaryFile(
        mode="w", dir="/etc/caddy", delete=False
    ) as temporary:
        temporary.write(content)
        candidate = Path(temporary.name)
    try:
        shutil.chown(candidate, group=grp.getgrnam("caddy").gr_name)
        candidate.chmod(0o640)
        subprocess.run(
            ["caddy", "validate", "--config", str(candidate), "--adapter", "caddyfile"],
            check=True,
        )
        current = Path("/etc/caddy/Caddyfile")
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        previous = Path(f"/etc/cleany/Caddyfile-before-public-{timestamp}")
        if current.exists():
            shutil.copyfile(current, previous)
            previous.chmod(0o600)
        candidate.replace(current)
        active = (
            subprocess.run(
                ["systemctl", "is-active", "--quiet", "caddy"], check=False
            ).returncode
            == 0
        )
        subprocess.run(["systemctl", "enable", "caddy"], check=True)
        subprocess.run(
            ["systemctl", "reload" if active else "start", "caddy"], check=True
        )
        Path("/etc/cleany/public-host").write_text(domain + "\n")
        print(
            f"Caddy configured for {domain}. HTTPS still requires reachable ports 80/443."
        )
    finally:
        candidate.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
