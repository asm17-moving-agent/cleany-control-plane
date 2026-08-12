from __future__ import annotations

import json
from pathlib import Path

from control_plane.server import create_app


def main() -> None:
    contract_root = Path(__file__).resolve().parents[1]
    output = contract_root / "openapi.json"
    document = create_app().openapi()
    output.write_text(
        json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
