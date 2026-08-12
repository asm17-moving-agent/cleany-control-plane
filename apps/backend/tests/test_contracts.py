import json
from pathlib import Path

from control_plane.schemas import MissionRequest, SeatResponse

CONTRACT_ROOT = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "schemas"


def read_contract(name: str) -> dict[str, object]:
    return json.loads((CONTRACT_ROOT / name).read_text(encoding="utf-8"))


def test_mission_request_model_matches_canonical_contract() -> None:
    contract = read_contract("mission-request.schema.json")
    model = MissionRequest.model_json_schema()

    assert set(model["required"]) == set(contract["required"])
    assert model["$defs"]["Priority"]["enum"] == contract["properties"]["priority"]["enum"]
    assert model["$defs"]["TargetKind"]["enum"] == contract["properties"]["target"][
        "properties"
    ]["kind"]["enum"]


def test_seat_model_preserves_canonical_shape() -> None:
    contract = read_contract("seat.schema.json")
    model = SeatResponse.model_json_schema()

    assert set(model["required"]) == set(contract["required"])
    assert model["properties"]["grid_column"]["enum"] == contract["properties"]["grid_column"][
        "enum"
    ]
    assert model["properties"]["occupancy"]["enum"] == contract["properties"]["occupancy"]["enum"]
