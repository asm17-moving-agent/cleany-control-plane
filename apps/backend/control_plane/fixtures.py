from __future__ import annotations

OCCUPANTS = {
    3: "김태현",
    4: "김혜성",
    6: "신홍재",
    9: "김응현",
    10: "오혜린",
    11: "김정현",
    13: "이창학",
    14: "강정민",
    15: "조성민",
    16: "최규호",
    17: "심여준",
    19: "정지은",
    21: "장현",
    22: "서예진",
    24: "심재혁",
    30: "이학성",
    31: "황선규",
    32: "권상재",
    34: "오창은",
    36: "방현우",
    37: "이강룡",
    38: "정지우",
    39: "엄현준",
    42: "박재영",
    46: "박창수",
    48: "이정현",
}

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
