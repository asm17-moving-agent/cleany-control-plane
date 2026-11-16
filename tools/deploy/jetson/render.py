"""Render a LAN-only DNS zone and same-host dashboard HTTPS proxy."""

import argparse
import ipaddress
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--lan-ip", required=True)
parser.add_argument("--domain", default="cleany.home.arpa")
parser.add_argument("--upstream-dns", required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
ip = str(ipaddress.IPv4Address(args.lan_ip))
upstream = str(ipaddress.IPv4Address(args.upstream_dns))
if not re.fullmatch(r"[a-z0-9-]+\.home\.arpa", args.domain):
    parser.error("use one hostname under home.arpa")
if ip == upstream:
    parser.error("upstream DNS must not point back to this resolver")
args.output.mkdir(parents=True, exist_ok=True)
(args.output / "Corefile").write_text(f""".:53 {{
    bind {ip}
    errors
    hosts {{
        {ip} {args.domain} nav.{args.domain}
        fallthrough
    }}
    forward . {upstream}
    cache 30
}}
""")
(args.output / "Caddyfile").write_text(f"""{{
    admin 127.0.0.1:2019
}}
{args.domain} {{
    bind {ip} 127.0.0.1
    tls internal
    reverse_proxy 127.0.0.1:8080
}}
""")
