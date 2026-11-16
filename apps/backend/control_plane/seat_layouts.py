"""Facility-scoped metric seat catalogs, independent of presentation artwork."""

from __future__ import annotations

import hashlib
import json
import math
import sqlite3
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from control_plane.maps import SlamMap, map_directory


class MetricPose(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    x: float
    y: float
    yaw: float = Field(ge=-math.pi, le=math.pi)


class LayoutSeat(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    seat_id: str = Field(pattern=r"^seat-[a-z0-9][a-z0-9-]{0,47}$")
    label: str = Field(min_length=1, max_length=24)
    zone_id: Literal[
        "d-hub", "space-a1", "space-a2", "space-a3", "space-a4", "space-m1", "space-m2", "space-m3"
    ]
    table_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")
    row: int = Field(ge=1, le=6)
    grid_column: Literal[1, 2, 3, 5, 6, 8, 9, 10]
    # Pose is the desktop center, with +X pointing from chair toward the desk.
    pose: MetricPose
    width: float = Field(ge=0.3, le=3)
    depth: float = Field(ge=0.3, le=2)
    approach: MetricPose
    verification: Literal["draft", "field_verified"] = "draft"


class SeatLayout(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    schema_version: Literal[1] = 1
    map_id: str
    frame_id: Literal["map"] = "map"
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    revision: int = Field(ge=0)
    seats: list[LayoutSeat] = Field(min_length=1, max_length=300)
    home: MetricPose | None = None
    home_verified: bool = False
    verification_evidence: str | None = None

    @model_validator(mode="after")
    def unique_seats(self):
        for field in ("seat_id", "label"):
            values = [getattr(seat, field) for seat in self.seats]
            if len(values) != len(set(values)):
                raise ValueError(f"duplicate {field}")
        return self


class LayoutReview(BaseModel):
    layout: SeatLayout
    warnings: dict[str, list[str]]
    target_digest: str


class TargetExport(BaseModel):
    schema_version: Literal[2] = 2
    map_id: str
    frame_id: Literal["map"] = "map"
    source_sha256: str
    layout_revision: int
    validation_status: Literal["draft", "field_verified"]
    home: list[float] | None
    seats: dict[str, list[float]]
    target_digest: str


def initialize_layouts(db: sqlite3.Connection) -> None:
    # The catalog has its own revision history without rebuilding account/mission tables.
    db.execute("""CREATE TABLE IF NOT EXISTS seat_layouts (
        customer_id TEXT NOT NULL, site_id TEXT NOT NULL, map_id TEXT NOT NULL,
        revision INTEGER NOT NULL, payload TEXT NOT NULL,
        PRIMARY KEY(customer_id,site_id,map_id,revision),
        FOREIGN KEY(customer_id,site_id) REFERENCES sites(customer_id,site_id)
    )""")


def read_layout(db, root: str, customer: str, site: str, metadata: SlamMap) -> SeatLayout:
    row = db.execute(
        "SELECT payload FROM seat_layouts WHERE customer_id=? AND site_id=? AND map_id=? "
        "ORDER BY revision DESC LIMIT 1",
        (customer, site, metadata.map_id),
    ).fetchone()
    if row:
        layout = SeatLayout.model_validate_json(row[0])
    else:
        layout = SeatLayout.model_validate_json(
            (map_directory(root, metadata.map_id) / "seat-layout.json").read_text()
        )
    check_binding(layout, metadata)
    if not row:
        db.execute(
            "INSERT OR IGNORE INTO seat_layouts VALUES(?,?,?,?,?)",
            (
                customer,
                site,
                metadata.map_id,
                0,
                layout.model_dump_json(),
            ),
        )
    return layout


def raster_point(metadata: SlamMap, pose: MetricPose) -> tuple[float, float]:
    ox, oy, yaw = metadata.origin
    dx, dy = pose.x - ox, pose.y - oy
    return (
        (math.cos(yaw) * dx + math.sin(yaw) * dy) / metadata.resolution,
        metadata.height - (-math.sin(yaw) * dx + math.cos(yaw) * dy) / metadata.resolution,
    )


def check_binding(layout: SeatLayout, metadata: SlamMap) -> None:
    if (
        layout.map_id != metadata.map_id
        or layout.source_sha256 != metadata.source_sha256["map.pgm"]
    ):
        raise ValueError("지도 원본이 달라졌습니다. 배치 좌표를 다시 확인해 주세요.")
    for pose in [p for seat in layout.seats for p in (seat.pose, seat.approach)] + (
        [layout.home] if layout.home else []
    ):
        x, y = raster_point(metadata, pose)
        if not (0 <= x < metadata.width and 0 <= y < metadata.height):
            raise ValueError("좌석 또는 접근 위치가 지도 범위를 벗어났습니다.")


def save_layout(
    db, root: str, customer: str, site: str, metadata: SlamMap, proposed: SeatLayout
) -> SeatLayout:
    """Caller holds the store transaction; stale editors and pending missions block saving."""
    check_binding(proposed, metadata)
    current = read_layout(db, root, customer, site, metadata)
    if proposed.revision != current.revision:
        raise ValueError("다른 창에서 배치가 변경되었습니다. 다시 불러온 뒤 수정해 주세요.")
    if db.execute(
        "SELECT 1 FROM missions WHERE customer_id=? AND site_id=? "
        "AND json_extract(payload,'$.phase')!='TERMINAL' LIMIT 1",
        (customer, site),
    ).fetchone():
        raise ValueError("대기 또는 진행 중인 작업이 있어 배치를 저장할 수 없습니다.")
    # Editor writes never confer physical verification, including unchanged imported flags.
    proposed = proposed.model_copy(deep=True)
    proposed.revision += 1
    proposed.home_verified = False
    proposed.verification_evidence = None
    for seat in proposed.seats:
        seat.verification = "draft"
    db.execute(
        "INSERT INTO seat_layouts VALUES(?,?,?,?,?)",
        (
            customer,
            site,
            metadata.map_id,
            proposed.revision,
            proposed.model_dump_json(),
        ),
    )
    return proposed


def target_export(layout: SeatLayout) -> TargetExport:
    def values(pose: MetricPose):
        return [pose.x, pose.y, pose.yaw]

    verified_seats = [s for s in layout.seats if s.verification == "field_verified"]
    verified = bool(layout.home and layout.home_verified and verified_seats)
    payload = dict(
        schema_version=2,
        map_id=layout.map_id,
        frame_id="map",
        source_sha256=layout.source_sha256,
        layout_revision=layout.revision,
        validation_status="field_verified" if verified and layout.home else "draft",
        home=values(layout.home) if layout.home else None,
        seats={
            s.seat_id: values(s.approach) for s in (verified_seats if verified else layout.seats)
        },
    )
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    ).hexdigest()
    return TargetExport(**payload, target_digest=digest)


def read_pgm(path: Path) -> tuple[int, int, bytes]:
    """Read the imported 8-bit binary occupancy raster without image-library dependencies."""
    with path.open("rb") as stream:
        tokens = []
        while len(tokens) < 4:
            line = stream.readline()
            if not line:
                raise ValueError("incomplete occupancy raster")
            tokens.extend(line.split(b"#", 1)[0].split())
        if tokens[0] != b"P5" or tokens[3] != b"255":
            raise ValueError("expected 8-bit P5 map")
        width, height = int(tokens[1]), int(tokens[2])
        pixels = stream.read()
        if len(pixels) != width * height:
            raise ValueError("incomplete occupancy raster")
        return width, height, pixels


def review_layout(layout: SeatLayout, metadata: SlamMap, root: str) -> LayoutReview:
    """Conservative raster checks are hints, never physical collision/arm reach certification."""
    width, height, pixels = read_pgm(map_directory(root, metadata.map_id) / "map.pgm")
    warnings: dict[str, list[str]] = {}
    radius = math.ceil(0.4 / metadata.resolution)
    for seat_id, pose in [(s.seat_id, s.approach) for s in layout.seats] + (
        [("home", layout.home)] if layout.home else []
    ):
        px, py = raster_point(metadata, pose)
        blocked = unknown = False
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                if dx * dx + dy * dy > radius * radius:
                    continue
                x, y = math.floor(px) + dx, math.floor(py) + dy
                if not (0 <= x < width and 0 <= y < height):
                    unknown = True
                    continue
                value = pixels[y * width + x] / 255
                probability = value if metadata.negate else 1 - value
                blocked |= probability > metadata.occupied_thresh
                unknown |= metadata.free_thresh <= probability <= metadata.occupied_thresh
        messages = []
        if blocked:
            messages.append("접근점 반경 0.4 m 내 장애물 관측")
        if unknown:
            messages.append("접근점 반경 0.4 m 내 미관측 영역")
        if messages:
            warnings[seat_id] = messages
    return LayoutReview(
        layout=layout, warnings=warnings, target_digest=target_export(layout).target_digest
    )


def runtime_matches(layout: SeatLayout, runtime: dict | None) -> bool:
    exported = target_export(layout)
    return exported.validation_status == "field_verified" and runtime == {
        "map_id": layout.map_id,
        "source_sha256": layout.source_sha256,
        "layout_revision": layout.revision,
        "target_digest": exported.target_digest,
    }
