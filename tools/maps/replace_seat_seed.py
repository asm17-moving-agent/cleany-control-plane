#!/usr/bin/env python3
"""Replace an untouched draft seed with a reviewed correction, retaining all revisions."""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'apps/backend'))
from control_plane.maps import load_map
from control_plane.persistence import SQLiteRepository
from control_plane.seat_layouts import SeatLayout, read_layout, save_layout


def replace_seed(db, root, site, previous, replacement):
    row = db.execute('SELECT customer_id,map_ref FROM sites WHERE site_id=?', (site,)).fetchone()
    if not row:
        raise ValueError('unknown site')
    customer, map_id = row
    metadata = load_map(root, map_id)
    current = read_layout(db, root, customer, site, metadata)
    if current.model_dump(exclude={'revision'}) != previous.model_dump(exclude={'revision'}):
        raise ValueError('The stored layout has user edits; automatic seed replacement refused')
    proposed = replacement.model_copy(update={'revision': current.revision})
    return save_layout(db, root, customer, site, metadata, proposed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True)
    parser.add_argument('--site', required=True)
    parser.add_argument('--maps', required=True)
    parser.add_argument('--previous', type=Path, required=True)
    parser.add_argument('--replacement', type=Path, required=True)
    args = parser.parse_args()
    if not Path(args.database).is_file():
        raise ValueError('existing database required')
    previous = SeatLayout.model_validate_json(args.previous.read_text())
    replacement = SeatLayout.model_validate_json(args.replacement.read_text())
    repository = SQLiteRepository(args.database)
    db = repository.connection
    try:
        db.execute('BEGIN IMMEDIATE')
        saved = replace_seed(db, args.maps, args.site, previous, replacement)
        db.execute('COMMIT')
        print(f'{args.site}: retained old revision, saved correction v{saved.revision}, {len(saved.seats)} seats')
    except BaseException:
        db.execute('ROLLBACK')
        raise
    finally:
        repository.close()


if __name__ == '__main__':
    main()
