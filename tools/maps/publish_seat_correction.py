#!/usr/bin/env python3
"""Publish a reviewed frontend and untouched-seed correction without restarting robot services."""
import argparse
import json
import os
import shutil
import sqlite3
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'apps/backend'))
from control_plane.persistence import SQLiteRepository
from control_plane.seat_layouts import SeatLayout
from replace_seat_seed import replace_seed

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--stage',type=Path,required=True)
parser.add_argument('--database',type=Path,required=True)
parser.add_argument('--site',required=True)
args=parser.parse_args()
stage=args.stage.resolve()
assert args.database.is_file() and (stage/'dist/index.html').is_file()
backup=stage/'before-publication'
backup.mkdir(mode=0o700)
with sqlite3.connect(f'file:{args.database}?mode=ro',uri=True) as source:
    with sqlite3.connect(backup/'control-plane.db') as target:
        source.backup(target)
os.chmod(backup/'control-plane.db',0o600)
shutil.copy2(ROOT/'apps/dashboard/dist/index.html',backup/'index.html')
shutil.copy2(ROOT/'apps/backend/maps/slam-20261108/seat-layout.json',backup/'seat-layout.json')
previous=SeatLayout.model_validate_json((stage/'before-layout.json').read_text())
replacement=SeatLayout.model_validate_json((stage/'seat-layout.json').read_text())
# Hashed assets are additive, so existing browser sessions keep their old modules.
shutil.copytree(stage/'dist/assets',ROOT/'apps/dashboard/dist/assets',dirs_exist_ok=True)
repository=SQLiteRepository(str(args.database))
db=repository.connection
try:
    db.execute('BEGIN IMMEDIATE')
    saved=replace_seed(db,str(ROOT/'apps/backend/maps'),args.site,previous,replacement)
    db.execute('COMMIT')
except BaseException:
    db.execute('ROLLBACK')
    raise
finally:
    repository.close()
for source,target in [(stage/'seat-layout.json',ROOT/'apps/backend/maps/slam-20261108/seat-layout.json'),
                      (stage/'dist/index.html',ROOT/'apps/dashboard/dist/index.html')]:
    temporary=target.with_suffix(target.suffix+'.next')
    shutil.copy2(source,temporary)
    temporary.replace(target)
result={'revision':saved.revision,'seats':len(saved.seats),'backup':str(backup),'service_restart':False,
        'dhub_width_m':saved.seats[0].width,'dhub_depth_m':saved.seats[0].depth}
(stage/'publication.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
