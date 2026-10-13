#!/usr/bin/env python3
"""Deploy this checkout to an existing Ubuntu EC2 over SSH."""

import argparse
import ipaddress
import json
import os
import re
import shlex
import shutil
import subprocess
import tarfile
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run(argv, **kwargs):
    return subprocess.run(argv, check=True, **kwargs)


def deploy_release(host, key, state, domain, local_port):
    ssh_options = [
        "-i",
        str(key),
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        f"UserKnownHostsFile={state / 'known_hosts'}",
        "-o",
        "ConnectTimeout=5",
    ]
    target = f"ubuntu@{host}"
    deadline = time.monotonic() + 600
    while subprocess.run(
        ["ssh", *ssh_options, target, "true"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode:
        if time.monotonic() > deadline:
            raise RuntimeError(
                f"SSH not ready at {host}; inspect its state and security-group rules; rerun to reuse"
            )
        time.sleep(5)
    with tempfile.TemporaryDirectory(prefix="cleany-ec2-") as scratch:
        archive = Path(scratch) / "release.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            for relative in [
                "apps/backend/control_plane",
                "apps/backend/run.py",
                "apps/backend/pyproject.toml",
                "apps/backend/uv.lock",
                "apps/dashboard/dist",
            ]:
                tar.add(
                    ROOT / relative,
                    arcname=relative,
                    filter=lambda entry: (
                        None if "__pycache__" in Path(entry.name).parts else entry
                    ),
                )
        remote_name = f"cleany-{os.urandom(6).hex()}.tar.gz"
        run(["scp", *ssh_options, str(archive), f"{target}:/tmp/{remote_name}"])
        command = "sudo bash -s -- " + " ".join(
            shlex.quote(value) for value in [remote_name, domain]
        )
        with (ROOT / "tools/deploy/setup-ubuntu.sh").open("rb") as source:
            run(["ssh", *ssh_options, target, command], stdin=source)
    print(f"\nDeployed to {host}. Local state: {state}")
    if not domain:
        domain = subprocess.check_output(
            [
                "ssh",
                *ssh_options,
                target,
                "if test -f /etc/cleany/public-host; then cat /etc/cleany/public-host; fi",
            ],
            text=True,
        ).strip()
    if domain:
        print(f"Open https://{domain}; keep its DNS A record pointing to {host}.")
        print(
            "HTTPS requires DNS and allowed security-group ports. Existing cloud rules are not changed here."
        )
    else:
        socket = state / f"tunnel-{local_port}.sock"
        check = subprocess.run(
            ["ssh", "-S", str(socket), "-O", "check", target],
            capture_output=True,
            check=False,
        )
        if check.returncode:
            run(
                [
                    "ssh",
                    *ssh_options,
                    "-o",
                    "ExitOnForwardFailure=yes",
                    "-o",
                    "ServerAliveInterval=30",
                    "-o",
                    "ServerAliveCountMax=3",
                    "-M",
                    "-S",
                    str(socket),
                    "-f",
                    "-N",
                    "-L",
                    f"127.0.0.1:{local_port}:127.0.0.1:8080",
                    target,
                ]
            )
        print(f"Open http://127.0.0.1:{local_port} (SSH tunnel is running).")
        print(
            "Close tunnel: "
            + shlex.join(["ssh", "-S", str(socket), "-O", "exit", target])
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, help="Existing Ubuntu EC2 public IPv4")
    parser.add_argument(
        "--ssh-key", type=Path, required=True, help="Private key; never uploaded"
    )
    parser.add_argument(
        "--domain",
        default="",
        help="HTTPS hostname; requires DNS and security-group setup",
    )
    parser.add_argument(
        "--local-port", type=int, default=18088, help="Local SSH tunnel port"
    )
    parser.add_argument(
        "--plan", action="store_true", help="Print configuration without connecting"
    )
    args = parser.parse_args()
    ipaddress.IPv4Address(args.host)
    if not 1024 <= args.local_port <= 65535:
        parser.error("local port must be between 1024 and 65535")
    if args.domain and not re.fullmatch(
        r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", args.domain
    ):
        parser.error("domain must be a hostname without scheme, path or port")
    key = args.ssh_key.expanduser().resolve()
    if not key.is_file():
        parser.error("SSH key does not exist")
    if args.plan:
        print(
            json.dumps(
                {
                    **vars(args),
                    "backend": "single worker, gateway mode",
                    "database": "/var/lib/cleany/control-plane.db",
                    "access": "HTTPS (cloud settings unchanged)"
                    if args.domain
                    else "SSH tunnel only",
                },
                indent=2,
                default=str,
            )
        )
        return
    for command in ["ssh", "scp", "pnpm"]:
        if not shutil.which(command):
            parser.error(f"required command missing: {command}")
    if key.stat().st_mode & 0o077:
        parser.error("SSH key permissions are too open; run chmod 400 on the key")
    state = Path.home() / ".local/state/cleany/ec2/ssh" / args.host
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(state, 0o700)
    run(["pnpm", "build"], cwd=ROOT)
    deploy_release(args.host, key, state, args.domain, args.local_port)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, ValueError) as error:
        raise SystemExit(str(error)) from error
