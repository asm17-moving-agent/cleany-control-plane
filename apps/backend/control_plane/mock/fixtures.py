"""Fixed facility inventory with synthetic D-HUB occupancy and unknown SPACE occupancy."""

from __future__ import annotations

OCCUPANTS = {
    3: "테스트 이용자 03",
    4: "테스트 이용자 04",
    6: "테스트 이용자 06",
    9: "테스트 이용자 09",
    10: "테스트 이용자 10",
    11: "테스트 이용자 11",
    13: "테스트 이용자 13",
    14: "테스트 이용자 14",
    15: "테스트 이용자 15",
    16: "테스트 이용자 16",
    17: "테스트 이용자 17",
    19: "테스트 이용자 19",
    21: "테스트 이용자 21",
    22: "테스트 이용자 22",
    24: "테스트 이용자 24",
    30: "테스트 이용자 30",
    31: "테스트 이용자 31",
    32: "테스트 이용자 32",
    34: "테스트 이용자 34",
    36: "테스트 이용자 36",
    37: "테스트 이용자 37",
    38: "테스트 이용자 38",
    39: "테스트 이용자 39",
    42: "테스트 이용자 42",
    46: "테스트 이용자 46",
    48: "테스트 이용자 48",
}

# One-based D-HUB columns reserve 4 and 7 for aisles.
GRID_COLUMNS = (1, 2, 3, 5, 6, 8, 9, 10)

SEATS = [
    {
        "seat_id": f"seat-{number:02d}",
        "label": f"{number:02d}",
        "zone_id": "d-hub",
        "row": (number - 1) // 8 + 1,
        "grid_column": GRID_COLUMNS[(number - 1) % 8],
        "occupancy": "OCCUPIED" if number in OCCUPANTS else "AVAILABLE",
        "occupant_name": OCCUPANTS.get(number),
    }
    for number in range(1, 49)
]

# Room inventory is known; occupancy has no connected source yet.
SEATS += [
    {
        "seat_id": f"seat-{room.lower()}-{number:02d}",
        "label": f"{room}-{number:02d}",
        "zone_id": f"space-{room.lower()}",
        "row": (number - 1) // columns + 1,
        "grid_column": (number - 1) % columns + 1,
        "occupancy": "UNKNOWN",
        "occupant_name": None,
    }
    for room, columns in [
        ("A1", 2), ("A2", 2), ("A3", 2), ("A4", 2), ("M1", 3), ("M2", 3), ("M3", 3)
    ]
    for number in range(1, columns * 2 + 1)
]
