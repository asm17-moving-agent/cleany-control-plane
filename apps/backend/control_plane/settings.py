"""Server, authentication, persistence, and adapter settings from CLEANY_ variables and .env."""

from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CLEANY_", env_file=".env", extra="ignore", populate_by_name=True
    )

    openai_api_key: SecretStr = Field(
        default=SecretStr(""), validation_alias="OPENAI_API_KEY", repr=False
    )
    agent_provider: str = "openai"
    agent_qwen_url: str = "http://127.0.0.1:18764"
    agent_model: str = "gpt-6.1-sol"
    agent_reasoning_effort: Literal["low", "medium", "high"] = "low"
    agent_api_base_url: str = "https://api.openai.com/v1"
    agent_request_timeout_seconds: float = Field(default=90, gt=0, le=300)
    agent_turn_timeout_seconds: float = Field(default=180, gt=0, le=600)
    agent_max_output_tokens: int = Field(default=4000, ge=512, le=16000)
    agent_max_tool_rounds: int = Field(default=6, ge=1, le=12)
    agent_max_plan_items: int = Field(default=50, ge=1, le=50)
    agent_plan_ttl_seconds: int = Field(default=900, ge=60, le=86400)
    agent_history_turns: int = Field(default=20, ge=2, le=100)
    agent_history_retention_days: int = Field(default=90, ge=1, le=3650)
    agent_stream_heartbeat_seconds: float = Field(default=5, gt=0, le=30)
    agent_max_concurrent_turns: int = Field(default=4, ge=1, le=32)

    host: str = "127.0.0.1"
    port: int = Field(default=8080, ge=1, le=65535)
    shutdown_grace_seconds: float = Field(default=5, gt=0, allow_inf_nan=False)
    pose_receive_timeout_seconds: float = Field(default=1.5, gt=0, allow_inf_nan=False)
    telemetry_receive_timeout_seconds: float = Field(default=45, gt=0, allow_inf_nan=False)
    telemetry_stale_seconds: float = Field(default=3, gt=0, allow_inf_nan=False)
    telemetry_supervisor_stale_seconds: float = Field(default=5, gt=0, allow_inf_nan=False)
    telemetry_battery_stale_seconds: float = Field(default=30, gt=0, allow_inf_nan=False)
    telemetry_poll_interval_ms: int = Field(default=200, ge=100, le=5000)
    telemetry_activity_sample_seconds: float = Field(default=2, gt=0, allow_inf_nan=False)
    telemetry_battery_sample_seconds: float = Field(default=30, gt=0, allow_inf_nan=False)
    telemetry_retention_days: int = Field(default=90, ge=1, le=3650)
    telemetry_prune_interval_seconds: float = Field(default=3600, gt=0, allow_inf_nan=False)
    telemetry_moving_speed_threshold: float = Field(default=0.01, gt=0, allow_inf_nan=False)
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

    map_directory: str = str(Path(__file__).resolve().parents[1] / "maps")

    teleop_url: str = ""
    teleop_token_file: str = ""
    teleop_timeout_seconds: float = Field(default=0.18, gt=0, le=0.25)

    require_physical_missions: bool = False

    camera_preview_url: str = ""
    head_camera_topic: str = ""
    camera_timeout_seconds: float = Field(default=1, gt=0, le=3)

    @model_validator(mode="after")
    def check_dispatcher_mode(self):
        if self.require_physical_missions and self.robot_mode != "gateway":
            raise ValueError("Physical missions require Gateway mode")
        return self

    @field_validator("teleop_url", "camera_preview_url", "agent_qwen_url")
    @classmethod
    def loopback_url(cls, value: str) -> str:
        from urllib.parse import urlsplit

        if not value:
            return value
        url = urlsplit(value)
        if (
            url.scheme != "http"
            or url.hostname not in {"127.0.0.1", "::1", "localhost"}
            or url.username
            or url.password
            or url.path not in {"", "/"}
            or url.query
            or url.fragment
        ):
            raise ValueError("URL must be a loopback HTTP origin")
        return value.rstrip("/")
