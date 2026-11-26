"""Stage the dashboard, its ROS observers, and face display from a running Jetson."""

import argparse
import os
import shutil
import subprocess
from pathlib import Path

from map_catalog import seed_catalog
from navigation_symbols import stage_symbols
from shared_runtime import pin, replace_link


def copy_tree(source: Path, destination: Path, *excludes: str) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["rsync", "-a", *(f"--exclude={item}" for item in excludes), f"{source}/", f"{destination}/"],
        check=True,
    )


def install_settings(path: Path, content: bytes) -> None:
    if path.exists():
        if path.read_bytes() != content:
            raise ValueError(f"Existing settings differ, review {path}")
        return
    with path.open("xb") as target:
        target.write(content)


def rewrite_env(source: Path, destination: Path, settings: dict[str, str | None]) -> None:
    lines = []
    remaining = dict(settings)
    for line in source.read_text().splitlines():
        key = line.partition("=")[0]
        if key in settings:
            remaining.pop(key, None)
            if settings[key] is not None:
                lines.append(f"{key}={settings[key]}")
        else:
            lines.append(line)
    lines.extend(f"{key}={value}" for key, value in remaining.items() if value is not None)
    content = "\n".join(lines) + "\n"
    if "/home/" in content or "$HOME" in content or "%h/" in content:
        raise ValueError(f"Unmapped home path in {source.name}")
    install_settings(destination, content.encode())


def stage_browser(display: Path | None, current: Path, release: Path, legacy_home: Path | None) -> None:
    if display is not None and (display / "browsers").is_dir():
        source = display / "browsers"
        executable = Path((display / "browser.path").read_text().strip())
        original = source
        if legacy_home and not executable.is_relative_to(source):
            original = legacy_home / "cleany-display/browsers"
        relative = executable.relative_to(original)
    else:
        source = current / "browsers"
        relative = (current / "kiosk-browser").resolve(strict=True).relative_to(source.resolve(strict=True))
    tree = pin("chromium", source, release / "browsers")
    executable = (tree / relative).resolve(strict=True)
    if not executable.is_relative_to(tree) or not executable.is_file() or not os.access(executable, os.X_OK):
        raise ValueError(f"Invalid kiosk browser in {tree}")
    replace_link(release / "kiosk-browser", Path("browsers") / relative)


def write_units(release: Path) -> None:
    units = release / "systemd-user"
    units.mkdir(exist_ok=True)
    services = (
        ("cleany-control-plane", "backend", "control-plane/backend", "default"),
        ("cleany-camera-privacy", "privacy", "control-plane/camera", "default"),
        ("cleany-dashboard-camera", "camera", "control-plane/camera", "default"),
        ("cleany-dashboard-observe@", "%i", "control-plane/observations", "default"),
        ("cleany-display", "display", "display/runtime", "default"),
        ("cleany-display-kiosk", "kiosk", "display/runtime", "graphical-session"),
    )
    for name, command, env, target in services:
        dependency = ""
        if command == "camera":
            dependency = "Wants=cleany-camera-privacy.service\nAfter=cleany-camera-privacy.service\n"
        if command == "kiosk":
            dependency = "After=cleany-display.service\nWants=cleany-display.service\nPartOf=graphical-session.target\n"
        if command == "%i":
            dependency = "After=cleany-control-plane.service\n"
        (units / f"{name}.service").write_text(
            f"[Unit]\nDescription=Cleany {name.removeprefix('cleany-')}\n"
            f"ConditionUser=cleany\n{dependency}\n"
            "[Service]\nWorkingDirectory=/opt/cleany/current\n"
            "Environment=HOME=/var/opt/cleany/state XDG_CACHE_HOME=/var/opt/cleany/cache "
            "ROS_LOG_DIR=/var/opt/cleany/ros-log PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1\n"
            "Environment=PATH=/usr/local/bin:/usr/bin:/bin\n"
            f"EnvironmentFile=/etc/opt/cleany/{env}.env\n"
            "ExecStart=/usr/bin/bwrap --bind / / --dev-bind /dev /dev --tmpfs /home -- "
            f"/opt/cleany/current/run-service {command}\n"
            "Restart=on-failure\nRestartSec=4\nTimeoutStopSec=20\nUMask=0077\n"
            f"\n[Install]\nWantedBy={target}.target\n"
        )


def import_settings(home: Path, display: Path, observer_fastdds_profile: Path | None,
                    config: Path, state: Path, current: Path) -> None:
    """Import a legacy installation only when its location is supplied explicitly."""
    legacy = home / ".config/cleany-control-plane"
    install_settings(config / "control-plane/cleany-01.token", (legacy / "cleany-01.token").read_bytes())
    install_settings(config / "control-plane/web-token", (home / ".local/state/cleany/teleop/web-token").read_bytes())
    install_settings(config / "display/display.json", (display / "config/display.json").read_bytes())
    for name in ("Corefile", "Caddyfile", "compose.yaml"):
        install_settings(config / "lan" / name, (home / "cleany-control-plane/lan" / name).read_bytes())
    # CoreDNS runs as nonroot and reads a single bind-mounted file.
    (config / "lan/Corefile").chmod(0o644)
    maps = state / "control-plane/maps"
    observation_dir = str(state / "control-plane/observations")
    rewrite_env(legacy / "backend.env", config / "control-plane/backend.env", {
        "CLEANY_HEAD_CAMERA_TOPIC": "/camera/head/color/image_preview_redacted",
        "CLEANY_MAP_DIRECTORY": str(maps / "presentation"),
        "CLEANY_DATABASE_PATH": str(state / "control-plane/control-plane.db"),
        "CLEANY_OBSERVATION_DIRECTORY": observation_dir,
        "CLEANY_TELEOP_TOKEN_FILE": str(config / "control-plane/web-token"),
    })
    observer_profile = config / "ros/observations-fastdds.xml"
    if observer_fastdds_profile:
        install_settings(observer_profile, observer_fastdds_profile.read_bytes())
    if observer_profile.is_file():
        dds = {"RMW_IMPLEMENTATION": "rmw_fastrtps_cpp", "FASTRTPS_DEFAULT_PROFILES_FILE": str(observer_profile),
               "CYCLONEDDS_URI": None}
    else:
        cyclone = config / "ros/host.xml"
        install_settings(cyclone, (home / "cleany/containers/vision/cyclonedds/host.xml").read_bytes())
        dds = {"CYCLONEDDS_URI": cyclone.as_uri()}
    rewrite_env(legacy / "camera.env", config / "control-plane/camera.env", {
        **dds, "CLEANY_TELEMETRY_INSTALL": str(current / "ros"),
    })
    rewrite_env(legacy / "observations.env", config / "control-plane/observations.env", {
        **dds, "CLEANY_FIELD_INSTALL": str(current / "ros"),
        "CLEANY_DEVICE_TOKEN_FILE": str(config / "control-plane/cleany-01.token"),
        "CLEANY_OBSERVATION_DIRECTORY": observation_dir,
    })
    rewrite_env(display / "runtime.env", config / "display/runtime.env", {
        "CLEANY_DISPLAY_BROWSER": str(current / "kiosk-browser"),
    })


def check_settings(config: Path) -> None:
    for name in ("control-plane/backend.env", "control-plane/camera.env", "control-plane/observations.env",
                 "control-plane/cleany-01.token", "control-plane/web-token", "display/display.json",
                 "display/runtime.env"):
        if not (config / name).is_file():
            raise ValueError(f"Missing site setting: {config / name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version")
    parser.add_argument("--dashboard", type=Path, required=True)
    parser.add_argument("--ros", type=Path, required=True)
    parser.add_argument("--display", type=Path, help="display build; defaults to the active display install")
    parser.add_argument("--import-legacy-home", type=Path, help="one-time source of legacy site settings")
    parser.add_argument("--observer-fastdds-profile", type=Path,
                        help="Fast DDS XML used by the Jetson's native sensors")
    args = parser.parse_args()
    if not args.version or not args.version[0].isalnum() or Path(args.version).name != args.version:
        parser.error("version must be a single release name")
    if not (args.dashboard / "apps/dashboard/dist/index.html").is_file():
        parser.error("Build the dashboard before staging (pnpm build)")
    os.umask(0o077)
    config = Path("/etc/opt/cleany")
    state = Path("/var/opt/cleany")
    release = Path("/opt/cleany/releases") / args.version
    current = Path("/opt/cleany/current")
    if current.exists() and release.resolve() == current.resolve():
        parser.error("choose a new version before staging another release")
    if release.exists() or release.is_symlink():
        parser.error(f"Release already exists: {release}")
    release.mkdir(parents=True)
    for directory in ("control-plane", "display", "ros", "lan"):
        (config / directory).mkdir(exist_ok=True)
    for directory in ("control-plane", "display", "state", "cache", "ros-log", "backups"):
        (state / directory).mkdir(exist_ok=True)

    if args.import_legacy_home:
        if not args.display:
            parser.error("--import-legacy-home requires --display")
        import_settings(args.import_legacy_home, args.display, args.observer_fastdds_profile, config, state, current)
    elif args.observer_fastdds_profile:
        profile = config / "ros/observations-fastdds.xml"
        if not profile.is_file() or profile.read_bytes() != args.observer_fastdds_profile.read_bytes():
            parser.error(f"Configure the observer profile in {profile} before staging")
    check_settings(config)

    for directory in ("apps", "packages", "tools"):
        copy_tree(args.dashboard / directory, release / directory, ".venv", "__pycache__",
                  ".data", ".env", ".env.*", "tests", "node_modules", ".pytest_cache")
    python = args.dashboard / "apps/backend/.venv/bin/python"
    if not python.is_file():
        python = current / "apps/backend/.venv/bin/python"
    interpreter = python.resolve(strict=True)
    prefix = interpreter.parent.parent
    if prefix in (Path("/"), Path("/usr"), Path("/usr/local")):
        parser.error(f"Supply a standalone Python installation, got {interpreter}")
    copy_tree(prefix, release / "python")
    subprocess.run([
        "/opt/cleany/tools/uv", "sync", "--locked", "--offline", "--no-dev",
        "--no-install-project", "--link-mode", "copy", "--project", str(release / "apps/backend"),
        "--python", str(release / "python/bin" / interpreter.name),
    ], check=True, env={**os.environ, "HOME": str(state / "state"), "UV_CACHE_DIR": str(state / "cache/uv"),
                        "UV_PYTHON_DOWNLOADS": "never", "UV_PROJECT_ENVIRONMENT": str(release / "apps/backend/.venv")})
    copy_tree(args.ros, release / "ros", "__pycache__")
    stage_symbols(release, state / "debug/navigation")
    display_ros = args.display / "ros2_ws/install" if args.display else current / "display-ros"
    copy_tree(display_ros, release / "display-ros", "__pycache__")
    stage_browser(args.display, current, release, args.import_legacy_home)
    installer = release / "installer"
    installer.mkdir(exist_ok=True)
    for name in ("stage.py", "navigation_symbols.py", "map_catalog.py", "shared_runtime.py", "run-service", "switch.py", "verify"):
        source = Path(__file__).resolve().with_name(name)
        if source != (installer / name).resolve():
            shutil.copy2(source, installer / name)
    shutil.copy2(Path(__file__).with_name("run-service"), release / "run-service")
    (release / "run-service").chmod(0o755)
    maps = state / "control-plane/maps"
    seed_catalog(release / "apps/backend/maps", maps)
    write_units(release)


if __name__ == "__main__":
    main()
