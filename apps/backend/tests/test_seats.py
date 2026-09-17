from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from control_plane.fixtures import GRID_COLUMNS, SEATS  # noqa: E402


class SeatFixtureTest(unittest.TestCase):
    REQUIRED_FIELDS = {
        "seat_id",
        "label",
        "zone_id",
        "row",
        "grid_column",
        "occupancy",
        "occupant_name",
    }

    def test_contains_48_seats_in_six_rows(self) -> None:
        dhub = [seat for seat in SEATS if seat["zone_id"] == "d-hub"]
        self.assertEqual(48, len(dhub))
        self.assertEqual(set(range(1, 7)), {seat["row"] for seat in dhub})

    def test_room_inventory_has_unique_addressable_seats(self) -> None:
        self.assertEqual(82, len(SEATS))
        self.assertEqual(82, len({seat["seat_id"] for seat in SEATS}))
        for room in ("a1", "a2", "a3", "a4", "m1", "m2", "m3"):
            seats = [seat for seat in SEATS if seat["zone_id"] == f"space-{room}"]
            columns = 2 if room.startswith("a") else 3
            self.assertEqual(columns * 2, len(seats))
            for index, seat in enumerate(seats):
                self.assertEqual(f"{room.upper()}-{index + 1:02d}", seat["label"])
                self.assertEqual(
                    (index // columns + 1, index % columns + 1),
                    (seat["row"], seat["grid_column"]),
                )
                self.assertEqual("UNKNOWN", seat["occupancy"])

    def test_each_seat_matches_the_contract_shape(self) -> None:
        for seat in SEATS:
            self.assertEqual(self.REQUIRED_FIELDS, set(seat))
            self.assertRegex(seat["seat_id"], r"^seat-(?:[0-9]{2}|(?:a[1-4]|m[1-3])-0[1-6])$")
            self.assertRegex(seat["label"], r"^(?:[0-9]{2}|(?:A[1-4]|M[1-3])-0[1-6])$")

    def test_each_row_preserves_two_aisles(self) -> None:
        for row in range(1, 7):
            columns = tuple(
                seat["grid_column"] for seat in SEATS
                if seat["zone_id"] == "d-hub" and seat["row"] == row
            )
            self.assertEqual(GRID_COLUMNS, columns)

    def test_occupancy_includes_name_only_for_occupied_seats(self) -> None:
        for seat in SEATS:
            if seat["occupancy"] == "OCCUPIED":
                self.assertIsInstance(seat["occupant_name"], str)
            else:
                self.assertIsNone(seat["occupant_name"])


if __name__ == "__main__":
    unittest.main()
