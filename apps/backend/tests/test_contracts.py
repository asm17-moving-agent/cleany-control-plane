import json
from pathlib import Path

from control_plane.schemas import MissionRequest, PoseInput, PoseSnapshot, SeatResponse

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
    assert model["properties"]["zone_id"]["enum"] == contract["properties"]["zone_id"]["enum"]
    for field in ("seat_id", "label"):
        assert model["properties"][field]["pattern"] == contract["properties"][field]["pattern"]
    for example in contract["examples"]:
        assert SeatResponse.model_validate(example).model_dump() == example


def test_pose_contract_and_sse_snapshot_examples_match_models() -> None:
    contract = read_contract("robot-pose.schema.json")
    model = PoseInput.model_json_schema()
    assert set(model["required"]) == set(contract["required"]) == {"x", "y"}
    assert model["additionalProperties"] is contract["additionalProperties"] is False
    for field in ("x", "y"):
        assert model["properties"][field]["type"] == contract["properties"][field]["type"]
    for example in contract["examples"]:
        assert PoseInput.model_validate(example).model_dump() == example
    events = read_contract("robot-pose-event.schema.json")
    for example in events["examples"]:
        assert PoseSnapshot.model_validate(example["payload"]).model_dump() == example["payload"]
