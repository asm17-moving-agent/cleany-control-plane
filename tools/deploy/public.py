#!/usr/bin/env python3
"""Enable authenticated HTTPS without changing the running Backend or its data."""

import argparse
import ipaddress
import json
import os
import re
import secrets
import shlex
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True)
    parser.add_argument("--ssh-key", required=True, type=Path)
    parser.add_argument("--domain", required=True)
    args = parser.parse_args()
    ipaddress.IPv4Address(args.host)
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", args.domain):
        parser.error("domain must be a hostname")
    key = args.ssh_key.expanduser().resolve()
    if not key.is_file() or key.stat().st_mode & 0o077:
        parser.error("provide an existing SSH key with chmod 400 permissions")
    state = Path.home() / ".local/state/cleany/ec2/ssh" / args.host
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(state, 0o700)
    options = [
        "-i",
        str(key),
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        f"UserKnownHostsFile={state / 'known_hosts'}",
        "-o",
        "ConnectTimeout=10",
    ]
    target = f"ubuntu@{args.host}"
    credential_file = state / "public-credentials.json"
    if not credential_file.exists():
        # Do not silently rotate live accounts if the original local state was lost.
        managed = subprocess.run(
            ["ssh", *options, target, "test -f /etc/cleany/public-host"], check=False
        )
        if managed.returncode == 0:
            parser.error(
                "public service exists but local credentials are missing; recover credentials before reconfiguring"
            )
        if managed.returncode != 1:
            parser.error("cannot check existing server configuration")
        credentials = {
            role: {"username": f"cleany-{role}", "password": secrets.token_urlsafe(24)}
            for role in ["robot"]
        }
        credentials["domain"] = args.domain
        descriptor = os.open(
            credential_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
        )
        with os.fdopen(descriptor, "w") as output:
            json.dump(credentials, output, indent=2)
    else:
        credentials = json.loads(credential_file.read_text())
    token = secrets.token_hex(8)
    script = f"/tmp/cleany-public-{token}.py"
    template = f"/tmp/cleany-public-{token}.caddy"
    subprocess.run(
        [
            "scp",
            *options,
            str(ROOT / "tools/deploy/configure-public-remote.py"),
            f"{target}:{script}",
        ],
        check=True,
    )
    subprocess.run(
        [
            "scp",
            *options,
            str(ROOT / "tools/deploy/Caddyfile.public"),
            f"{target}:{template}",
        ],
        check=True,
    )
    try:
        command = shlex.join(["sudo", "python3", script, args.domain, template])
        subprocess.run(
            ["ssh", *options, target, command],
            input=json.dumps(credentials),
            text=True,
            check=True,
        )
    finally:
        subprocess.run(
            ["ssh", *options, target, shlex.join(["rm", "-f", script, template])],
            check=False,
        )
    credentials["domain"] = args.domain
    credential_file.write_text(json.dumps(credentials, indent=2) + "\n")
    os.chmod(credential_file, 0o600)
    print(f"Public address: https://{args.domain}")
    print(f"Private credentials: {credential_file}")
    print(
        "Cloud rules were not changed. Users sign in through the app; robot WebSockets require separate credentials."
    )


if __name__ == "__main__":
    main()
