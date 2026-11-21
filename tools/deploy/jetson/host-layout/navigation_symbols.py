"""Archive navigation DWARF by ELF build ID and keep a per-release index."""

import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import subprocess
import zlib
from pathlib import Path
from tempfile import TemporaryDirectory


def output(*args: str | Path) -> str:
    result = subprocess.run(args, capture_output=True, text=True, env={**os.environ, "LC_ALL": "C"})
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed for {args[-1]}: {result.stderr.strip()}")
    return result.stdout


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_id(path: Path) -> str:
    match = re.search(r"Build ID: ([0-9a-f]+)", output("readelf", "-nW", path))
    if not match:
        raise ValueError(f"Missing ELF build ID: {path}")
    return match[1]


def has_dwarf(sections: str) -> bool:
    return bool(re.search(r"\s\.z?debug_info\s", sections))


def split_binary(binary: Path, archive: Path) -> dict[str, str] | None:
    sections = output("readelf", "-SW", binary)
    if not has_dwarf(sections) and ".gnu_debuglink" not in sections:
        return None
    identity = build_id(binary)
    debug = archive / ".build-id" / identity[:2] / (identity[2:] + ".debug")
    if has_dwarf(sections):
        debug.parent.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(dir=debug.parent) as symbols, TemporaryDirectory(dir=binary.parent) as work:
            candidate = Path(symbols) / debug.name
            subprocess.run(["objcopy", "--only-keep-debug", "--compress-debug-sections=zlib", binary, candidate], check=True)
            if build_id(candidate) != identity or not has_dwarf(output("readelf", "-SW", candidate)):
                raise ValueError(f"Invalid debug companion for {binary}")
            if debug.exists():
                if digest(debug) != digest(candidate):
                    raise ValueError(f"Conflicting symbols for build ID {identity}")
            else:
                os.replace(candidate, debug)
            stripped = Path(work) / binary.name
            subprocess.run(["objcopy", "--strip-debug", f"--add-gnu-debuglink={debug}", binary, stripped], check=True)
            if (build_id(stripped) != identity or has_dwarf(output("readelf", "-SW", stripped))
                    or output("nm", "-D", "-P", binary) != output("nm", "-D", "-P", stripped)):
                raise ValueError(f"Runtime symbols changed in {binary}")
            shutil.copystat(binary, stripped)
            os.replace(stripped, binary)
    if not debug.is_file() or build_id(debug) != identity or not has_dwarf(output("readelf", "-SW", debug)):
        raise ValueError(f"Missing matching DWARF for {binary}")
    with TemporaryDirectory() as tmp:
        link = Path(tmp) / "link"
        subprocess.run(["objcopy", "--dump-section", f".gnu_debuglink={link}", binary, Path(tmp) / "copy"], check=True)
        with binary.open("rb") as stream:
            byte_order = "little" if stream.read(6)[5] == 1 else "big"
        companion = debug.read_bytes()
        if int.from_bytes(link.read_bytes()[-4:], byte_order) != zlib.crc32(companion):
            raise ValueError(f"Debug link checksum mismatch for {binary}")
    return {"build_id": identity, "runtime_sha256": digest(binary), "debug_sha256": hashlib.sha256(companion).hexdigest()}


def stage_symbols(release: Path, archive: Path) -> None:
    package = release / "ros/cleany_navigation"
    if not package.is_dir():
        return
    archive.mkdir(parents=True, exist_ok=True)
    with (archive / ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        records = {}
        for binary in sorted((package / "lib").rglob("*")):
            if binary.is_symlink() or not binary.is_file():
                continue
            with binary.open("rb") as stream:
                if stream.read(4) != b"\x7fELF":
                    continue
            record = split_binary(binary, archive)
            if record:
                records[str(binary.relative_to(release))] = record
        indexes = archive / "releases"
        indexes.mkdir(exist_ok=True)
        index = indexes / (release.name + ".json")
        with TemporaryDirectory(dir=indexes) as tmp:
            new = Path(tmp) / index.name
            new.write_text(json.dumps(records, indent=2, sort_keys=True) + "\n")
            os.replace(new, index)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("release", type=Path)
    parser.add_argument("--archive", type=Path, default=Path("/var/opt/cleany/debug/navigation"))
    args = parser.parse_args()
    stage_symbols(args.release.resolve(strict=True), args.archive)
