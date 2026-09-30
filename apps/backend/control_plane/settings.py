from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CLEANY_", env_file=".env", extra="ignore")

    host: str = "127.0.0.1"
    port: int = Field(default=8080, ge=1, le=65535)
    pose_receive_timeout_seconds: float = Field(default=1.5, gt=0, allow_inf_nan=False)
    robot_mode: Literal["gateway", "mock"] = "gateway"
    database_path: str = str(Path(__file__).resolve().parents[1] / ".data/control-plane.db")
    gateway_heartbeat_interval_seconds: float = Field(default=1, gt=0, allow_inf_nan=False)
    gateway_heartbeat_timeout_seconds: float = Field(default=5, gt=0, allow_inf_nan=False)
    gateway_offer_timeout_seconds: float = Field(default=5, gt=0, allow_inf_nan=False)
    gateway_retry_initial_seconds: float = Field(default=1, gt=0, allow_inf_nan=False)
    gateway_retry_max_seconds: float = Field(default=30, gt=0, allow_inf_nan=False)
    queue_ttl_seconds: float = Field(default=1800, gt=0, allow_inf_nan=False)
    gateway_tick_interval_seconds: float = Field(default=0.1, gt=0, allow_inf_nan=False)
    mock_step_delay_seconds: float = Field(default=0.8, gt=0, allow_inf_nan=False)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
