#!/usr/bin/env python3
"""Reproduce the 82-seat draft from measured D-HUB geometry and reviewed display anchors."""
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'apps/backend'))
from control_plane.maps import load_map
from control_plane.mock.fixtures import SEATS
from control_plane.seat_layouts import SeatLayout

DIRECTORY = ROOT / 'apps/backend/maps/slam-20261108'
metadata = load_map(str(DIRECTORY.parent), DIRECTORY.name)
a, b, c, d, e, f = metadata.presentation.transform
geometry = json.loads((ROOT / 'apps/dashboard/src/features/facility-map/seat-geometry.json').read_text())
units_per_meter = geometry['reference_room_width_units'] / geometry['reference_room_width_m']
room_m_per_unit = geometry['room']['scale'] / units_per_meter
pixels_per_meter = 1 / metadata.resolution


def pose(x, y, heading):
    determinant = a*d-b*c
    px, py = (d*(x-e)-c*(y-f))/determinant, (-b*(x-e)+a*(y-f))/determinant
    yaw = metadata.origin[2] - math.radians(heading-metadata.presentation.rotation_degrees)
    yaw = math.atan2(math.sin(yaw), math.cos(yaw))
    rx, ry = px*metadata.resolution, (metadata.height-py)*metadata.resolution
    angle = metadata.origin[2]
    return dict(x=metadata.origin[0]+math.cos(angle)*rx-math.sin(angle)*ry,
                y=metadata.origin[1]+math.sin(angle)*rx+math.cos(angle)*ry, yaw=yaw)


# SLAM-aligned display anchors only seed the draft; saved coordinates are ROS map meters.
rooms = {'space-a4': (96, 75, 2, False), 'space-m1': (169, 75, 3, False),
         'space-m2': (250, 75, 3, False), 'space-m3': (331, 75, 3, False),
         'space-a3': (64, 133, 2, True), 'space-a2': (64, 190, 2, True),
         'space-a1': (64, 251, 2, True)}
reference = json.loads((DIRECTORY / 'dhub-layout-reference.json').read_text())
image_hash = hashlib.sha256((DIRECTORY / reference['display_image']).read_bytes()).hexdigest()
if image_hash != reference['display_image_sha256']:
    raise ValueError('Review the D-HUB anchor again after editing the background')
walls = reference['wall_center_pixels']
units = reference['pixels_per_unit']
dhub_cx = (walls['west'] + walls['east']) / (2 * units)
dhub_cy = (walls['north'] + walls['south']) / (2 * units)
block_gap = geometry['dhub']['block_gap_m']
pair_pitch = geometry['dhub']['row_pair_pitch_m']


entries = []
for seat in SEATS:
    row, column = seat['row'], seat['grid_column']
    side = -1 if row % 2 else 1
    if seat['zone_id'] == 'd-hub':
        indices = [1, 2, 3, 5, 6, 8, 9, 10]
        index = indices.index(column)
        group = 0 if index < 3 else 1 if index < 5 else 2
        slot = index if group == 0 else index-3 if group == 1 else index-5
        width, depth = geometry['dhub']['width_m'], geometry['dhub']['depth_m']
        # Keep measured furniture dimensions/pitch. Do not fit desks to tilted SLAM walls.
        total_width = 8 * width + 2 * block_gap
        previous_columns = [0, 3, 5][group]
        x_m = -total_width / 2 + previous_columns * width + group * block_gap + (slot + 0.5) * width
        y_m = ((row-1)//2 - 1) * pair_pitch + side * depth / 2
        x, y = dhub_cx + x_m * pixels_per_meter, dhub_cy + y_m * pixels_per_meter
        heading = 90 if side < 0 else -90
        table_id = f'dhub-{(row-1)//2+1}-{group+1}'
    else:
        cx, cy, count, vertical = rooms[seat['zone_id']]
        width = geometry['room']['width_units'] * room_m_per_unit
        depth = geometry['room']['depth_units'] * room_m_per_unit
        lx = (column-1-(count-1)/2)*geometry['room']['column_pitch_units']*room_m_per_unit*pixels_per_meter
        ly = side*geometry['room']['half_row_pitch_units']*room_m_per_unit*pixels_per_meter
        x, y = (cx-ly, cy+lx) if vertical else (cx+lx, cy+ly)
        heading = (180 if side < 0 else 0) if vertical else (90 if side < 0 else -90)
        table_id = seat['zone_id']
    center = pose(x, y, heading)
    distance = depth/2 + 0.8
    approach = dict(x=center['x']-math.cos(center['yaw'])*distance,
                    y=center['y']-math.sin(center['yaw'])*distance, yaw=center['yaw'])
    entries.append({k: seat[k] for k in ('seat_id', 'label', 'zone_id', 'row', 'grid_column')} |
                   dict(table_id=table_id, pose=center, width=width, depth=depth,
                        approach=approach, verification='draft'))
layout = SeatLayout(map_id=metadata.map_id, source_sha256=metadata.source_sha256['map.pgm'],
                    revision=0, seats=entries)
(DIRECTORY/'seat-layout.json').write_text(layout.model_dump_json(indent=2)+'\n')
print(f'{len(entries)} seats; draft only; no home/field verification')
