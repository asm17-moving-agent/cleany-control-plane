#!/usr/bin/env python3
"""Record operator-supplied field evidence after on-site checks; never move the robot."""
import argparse
import hashlib
import json
import sys
import sqlite3
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps/backend"))
from control_plane.maps import load_map
from control_plane.seat_layouts import read_layout
from control_plane.settings import Settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True)
    parser.add_argument("--site", required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    evidence_bytes = args.evidence.read_bytes()
    evidence = json.loads(evidence_bytes)
    required = {"site_id", "map_id", "source_sha256", "revision", "seat_ids", "home_verified",
                "operator", "checked_at", "navigation", "stopped_pose", "desk_approach", "notes"}
    if set(evidence) != required or not all(evidence[k] is True for k in
            ("home_verified", "navigation", "stopped_pose", "desk_approach")):
        raise ValueError("evidence must record completed on-site checks and the exact layout version")
    for key in ("operator", "checked_at", "notes"):
        if not isinstance(evidence[key], str) or not evidence[key].strip():
            raise ValueError(f"field evidence requires {key}")
    if not Path(args.database).is_file():
        raise ValueError("an existing control-plane database is required")
    if datetime.fromisoformat(evidence["checked_at"]).tzinfo is None:
        raise ValueError("checked_at requires a timezone")
    settings = Settings()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    with db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT customer_id,map_ref FROM sites WHERE site_id=?", (args.site,)).fetchone()
        if not row or evidence["site_id"] != args.site:
            raise ValueError("unknown or mismatched site")
        customer, map_id = row
        metadata = load_map(settings.map_directory, map_id)
        layout = read_layout(db, settings.map_directory, customer, args.site, metadata)
        if any(evidence[key] != getattr(layout, key) for key in ("map_id", "source_sha256", "revision")):
            raise ValueError("evidence belongs to another map or layout revision")
        ids = evidence["seat_ids"]
        if not isinstance(ids, list) or not ids or not set(ids).issubset({s.seat_id for s in layout.seats}):
            raise ValueError("select existing seats that were physically verified")
        if layout.home is None:
            raise ValueError("register the verified home pose before approval")
        if db.execute("SELECT 1 FROM missions WHERE customer_id=? AND site_id=? AND "
                      "json_extract(payload,'$.phase')!='TERMINAL'", (customer, args.site)).fetchone():
            raise ValueError("pending missions prevent target deployment changes")
        for seat in layout.seats:
            seat.verification = "field_verified" if seat.seat_id in ids else "draft"
        layout.home_verified = True
        layout.verification_evidence = json.dumps({"sha256": hashlib.sha256(evidence_bytes).hexdigest(),
                                                  "record": evidence}, ensure_ascii=False)
        layout.revision += 1
        db.execute("INSERT INTO seat_layouts VALUES(?,?,?,?,?)", (
            customer, args.site, map_id, layout.revision, layout.model_dump_json()))
        print(f"Recorded {len(ids)} field-reviewed targets at revision {layout.revision}; "
              "export targets and restart Runtime separately. No robot command sent.")
    db.close()


if __name__ == "__main__":
    main()
