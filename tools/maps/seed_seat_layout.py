#!/usr/bin/env python3
"""Reproduce the 82-seat draft from legacy ordering and reviewed SLAM furniture anchors."""
import json
import math
import re
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
structure = json.loads((DIRECTORY / 'presentation-layout.json').read_text())


def wall_segment(wall_id):
    path = next(w['d'] for w in structure['walls'] if w['id'] == wall_id)
    points = [(float(x), float(y)) for x, y in re.findall(r'[ML]\s*([-+0-9.eE]+),([-+0-9.eE]+)', path)]
    return max(zip(points, points[1:]), key=lambda segment: abs(segment[1][1]-segment[0][1]))


west_wall, east_wall = wall_segment('main-west'), wall_segment('north-east')
entries = []
for seat in SEATS:
    row, column = seat['row'], seat['grid_column']
    side = -1 if row % 2 else 1
    if seat['zone_id'] == 'd-hub':
        indices = [1, 2, 3, 5, 6, 8, 9, 10]
        index = indices.index(column)
        group = 0 if index < 3 else 1 if index < 5 else 2
        slot = index if group == 0 else index-3 if group == 1 else index-5
        count = 2 if group == 1 else 3
        width, depth = geometry['dhub']['width_m'], geometry['dhub']['depth_m']
        cy = [98, 160, 226][(row-1)//2]
        angle = 0
        cx = 489
        if group != 1:
            (x1, y1), (x2, y2) = west_wall if group == 0 else east_wall
            slope = (x2-x1)/(y2-y1)
            angle = math.atan(-slope)
            half_table = count*width*pixels_per_meter/2
            # Place the complete outer table edge on the traced wall, including its tilt.
            cx = x1 + slope*(cy-y1) + (1 if group == 0 else -1)*half_table*math.hypot(1, slope)
        lx, ly = (slot-(count-1)/2)*width*pixels_per_meter, side*depth/2*pixels_per_meter
        x = cx + math.cos(angle)*lx - math.sin(angle)*ly
        y = cy + math.sin(angle)*lx + math.cos(angle)*ly
        heading = (90 if side < 0 else -90) + math.degrees(angle)
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
