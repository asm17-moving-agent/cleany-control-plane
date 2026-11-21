"""Read immutable, administrator-imported occupancy maps in facility scope."""

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class MapDisplayLayers(BaseModel):
    """Edited, full-canvas rasters in presentation coordinates, never navigation inputs."""

    model_config = ConfigDict(extra="forbid")
    floorplan_url: Literal["/api/map/presentation/floorplan"] = "/api/map/presentation/floorplan"
    slam_url: Literal["/api/map/presentation/slam"] = "/api/map/presentation/slam"


class MapPresentation(BaseModel):
    """Display-only rigid transform in source raster coordinates."""

    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    image_url: Literal["/api/map/presentation"] = "/api/map/presentation"
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    transform: tuple[float, float, float, float, float, float]
    rotation_degrees: float
    source_image_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    layers: MapDisplayLayers | None = None


class SlamMap(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")

    map_id: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$")
    label: str
    frame_id: Literal["map"] = "map"
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    resolution: float = Field(gt=0)
    origin: tuple[float, float, float]
    negate: Literal[0, 1]
    occupied_thresh: float = Field(gt=0, lt=1)
    free_thresh: float = Field(gt=0, lt=1)
    source_run: str
    source_kind: Literal["slam", "slam_manually_edited"]
    source_sha256: dict[str, str]
    image_url: str = "/api/map/image"
    presentation: MapPresentation | None = None


def map_directory(root: str, map_ref: str) -> Path:
    import re

    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}", map_ref):
        raise FileNotFoundError("invalid map reference")
    base = Path(root).resolve()
    directory = (base / map_ref).resolve()
    if directory.parent != base:
        raise FileNotFoundError("map outside catalog")
    return directory


def load_map(root: str, map_ref: str) -> SlamMap:
    directory = map_directory(root, map_ref)
    metadata = SlamMap.model_validate_json((directory / "metadata.json").read_text())
    if metadata.map_id != map_ref or not (directory / "map.png").is_file():
        raise ValueError("incomplete map bundle")
    if metadata.presentation and not (directory / "presentation.svg").is_file():
        raise ValueError("incomplete presentation bundle")
    if (
        metadata.presentation and metadata.presentation.layers
        and any(
            not (directory / f"display-{layer}.png").is_file() for layer in ("floorplan", "slam")
        )
    ):
        raise ValueError("incomplete display layers")
    return metadata
