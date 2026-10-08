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

    temporary_password_seconds: float = Field(default=86400, gt=0)
    password_change_session_seconds: float = Field(default=600, gt=0)
    session_absolute_seconds: float = Field(default=43200, gt=0)
    session_idle_seconds: float = Field(default=1800, gt=0)
    auth_stream_recheck_seconds: float = Field(default=10, gt=0)
    auth_failure_window: float = Field(default=900, gt=0)
    auth_identity_limit: int = Field(default=5, gt=0)
    auth_ip_limit: int = Field(default=30, gt=0)
    cookie_secure: bool = True
    allowed_origins: list[str] = []

    observation_directory: str = str(Path(__file__).resolve().parents[1] / ".data/observations")
