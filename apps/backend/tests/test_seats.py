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
        "row",
        "grid_column",
        "occupancy",
        "occupant_name",
    }

    def test_contains_48_seats_in_six_rows(self) -> None:
        self.assertEqual(48, len(SEATS))
        self.assertEqual(set(range(1, 7)), {seat["row"] for seat in SEATS})

    def test_each_seat_matches_the_contract_shape(self) -> None:
        for seat in SEATS:
            self.assertEqual(self.REQUIRED_FIELDS, set(seat))
            self.assertRegex(seat["seat_id"], r"^seat-[0-9]{2}$")
            self.assertRegex(seat["label"], r"^[0-9]{2}$")

    def test_each_row_preserves_two_aisles(self) -> None:
        for row in range(1, 7):
            columns = tuple(seat["grid_column"] for seat in SEATS if seat["row"] == row)
            self.assertEqual(GRID_COLUMNS, columns)

    def test_occupancy_includes_name_only_for_occupied_seats(self) -> None:
        for seat in SEATS:
            if seat["occupancy"] == "OCCUPIED":
                self.assertIsInstance(seat["occupant_name"], str)
            else:
                self.assertIsNone(seat["occupant_name"])


if __name__ == "__main__":
    unittest.main()
