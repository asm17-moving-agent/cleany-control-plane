from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

from control_plane.gateway_protocol import BACKEND_MESSAGE, ROBOT_MESSAGE
from control_plane.server import create_app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    contract_root = Path(__file__).resolve().parents[1]
    outputs = {
        contract_root / "openapi.json": create_app().openapi(),
        contract_root
        / "schemas/gateway-robot-message.schema.json": ROBOT_MESSAGE.json_schema(),
        contract_root
        / "schemas/gateway-backend-message.schema.json": BACKEND_MESSAGE.json_schema(),
    }
    for path, document in outputs.items():
        content = (
            json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        )
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                raise SystemExit(
                    f"contract snapshot differs: {path}; run pnpm contracts"
                )
        else:
            path.write_text(content, encoding="utf-8")
    if args.check:
        with tempfile.TemporaryDirectory(prefix="cleany-contracts-") as scratch:
            output = Path(scratch) / "openapi.ts"
            subprocess.run(
                [
                    "pnpm",
                    "--filter",
                    "@cleany/dashboard",
                    "exec",
                    "openapi-typescript",
                    str(contract_root / "openapi.json"),
                    "--default-non-nullable",
                    "false",
                    "-o",
                    str(output),
                ],
                check=True,
            )
            committed = (
                contract_root.parents[1] / "apps/dashboard/src/api/generated/openapi.ts"
            )
            if output.read_bytes() != committed.read_bytes():
                raise SystemExit("generated TypeScript differs; run pnpm contracts")
        print("OpenAPI, Gateway schemas and TypeScript contracts match.")


if __name__ == "__main__":
    main()
