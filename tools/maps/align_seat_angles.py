"""Align selected desk headings without changing any position or approach pose."""
import argparse
import json
import math
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'apps/backend'))
from control_plane.maps import load_map
from control_plane.seat_layouts import read_layout, save_layout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--maps', required=True)
    parser.add_argument('--site', required=True)
    parser.add_argument('--revision', type=int, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('seats', nargs='+')
    args = parser.parse_args()
    if not args.database.is_file():
        raise ValueError('Existing database required')
    args.output.mkdir(parents=True, exist_ok=False)
    db = sqlite3.connect(args.database)
    db.execute('PRAGMA foreign_keys=ON')
    try:
        db.execute('BEGIN IMMEDIATE')
        customer, map_id = db.execute('SELECT customer_id,map_ref FROM sites WHERE site_id=?', (args.site,)).fetchone()
        metadata = load_map(args.maps, map_id)
        current = read_layout(db, args.maps, customer, args.site, metadata)
        if current.revision != args.revision:
            raise ValueError('Layout changed since inspection; refusing stale correction')
        before = current.model_dump()
        (args.output / 'before.json').write_text(json.dumps(before, indent=2))
        proposed = current.model_copy(deep=True)
        selected = set(args.seats)
        if not selected.issubset({s.seat_id for s in proposed.seats}):
            raise ValueError('Unknown seat')
        changes = []
        for seat in proposed.seats:
            if seat.seat_id not in selected:
                continue
            rotation = metadata.presentation.rotation_degrees
            heading = rotation - math.degrees(seat.pose.yaw - metadata.origin[2])
            target = 90 + 180 * round((heading - 90) / 180)
            yaw = metadata.origin[2] + math.radians(rotation - target)
            seat.pose.yaw = math.atan2(math.sin(yaw), math.cos(yaw))
            changes.append({'seat_id': seat.seat_id, 'screen_heading_before': heading, 'screen_heading_after': target})
        saved = save_layout(db, args.maps, customer, args.site, metadata, proposed)
        after = saved.model_dump()
        # Reject even verification or approach changes outside the requested angle edits.
        restored = saved.model_dump()
        restored['revision'] = before['revision']
        for previous, result in zip(before['seats'], restored['seats'], strict=True):
            if previous['seat_id'] in selected:
                result['pose']['yaw'] = previous['pose']['yaw']
        if restored != before:
            raise ValueError('Unexpected change outside selected desk angles')
        persisted = read_layout(db, args.maps, customer, args.site, metadata)
        assert persisted.model_dump() == after
        (args.output / 'after.json').write_text(json.dumps(after, indent=2))
        (args.output / 'changes.json').write_text(json.dumps(changes, indent=2))
        db.commit()
        print(json.dumps({'revision': saved.revision, 'changes': changes, 'all_other_fields_unchanged': True}))
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == '__main__':
    main()
