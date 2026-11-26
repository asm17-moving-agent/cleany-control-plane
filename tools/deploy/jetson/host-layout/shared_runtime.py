"""Pin a release to a verified, content-addressed Jetson runtime tree."""

import argparse
import fcntl
import hashlib
import json
import os
import shutil
import stat
from pathlib import Path
from tempfile import TemporaryDirectory

STORE = Path("/opt/cleany/shared/runtimes")
VENV_KINDS = ("yolo-env", "curobo")
KINDS = ("torch", *VENV_KINDS, "chromium")


def pip_prefix(tree: Path) -> bytes:
    line = (tree / "bin/pip").read_bytes().splitlines()[0]
    if not line.startswith(b"#!/") or b"/bin/python" not in line:
        raise ValueError(f"Unsupported venv launcher: {tree}/bin/pip")
    return line[2:].rsplit(b"/bin/python", 1)[0]


def script_data(path: Path, prefix: bytes, replacement: bytes) -> bytes:
    data = path.read_bytes()
    return data.replace(prefix, replacement) if b"\0" not in data else data


def fingerprint(tree: Path, kind: str, names: list[str]) -> str:
    """Include paths, file modes, content and literal symlink targets."""
    digest = hashlib.sha256()
    prefix = pip_prefix(tree) if kind in VENV_KINDS else None

    def visit(path: Path) -> None:
        if kind != "chromium" and path.name == "__pycache__":
            return
        rel = path.relative_to(tree)
        mode = path.lstat().st_mode
        if stat.S_ISDIR(mode):
            value = ""
        elif stat.S_ISLNK(mode):
            value = os.readlink(path)
        elif stat.S_ISREG(mode):
            content = hashlib.sha256()
            if prefix and rel.parent == Path("bin"):
                content.update(script_data(path, prefix, b"@CLEANY_VENV@"))
            else:
                with path.open("rb") as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        content.update(chunk)
            value = content.hexdigest()
        else:
            raise ValueError(f"Unsupported runtime entry: {path}")
        digest.update(json.dumps([rel.as_posix(), mode, value], ensure_ascii=True).encode() + b"\n")
        if stat.S_ISDIR(mode):
            for child in sorted(path.iterdir()):
                visit(child)

    for name in names:
        visit(tree / name)
    return digest.hexdigest()


def replace_link(link: Path, target: Path) -> None:
    if link.exists() and not link.is_symlink():
        raise ValueError(f"Existing release path requires explicit migration: {link}")
    link.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=link.parent) as tmp:
        new = Path(tmp) / "link"
        new.symlink_to(target)
        os.replace(new, link)


def pin(kind: str, source: Path, link: Path, names: list[str] | None = None, store: Path = STORE) -> Path:
    source = source.resolve(strict=True)
    if link.exists() and not link.is_symlink():
        raise ValueError(f"Existing release directory requires explicit migration: {link}")
    selected = sorted(set(names if names is not None else os.listdir(source)))
    if not selected or any(Path(n).name != n or n in (".", "..", "") for n in selected):
        raise ValueError("Expected top-level runtime files or directories")
    pattern = {"torch": "torch-*.dist-info", "yolo-env": "ultralytics-*.dist-info", "chromium": "chromium-*",
               "curobo": "nvidia_curobo-*.dist-info"}[kind]
    metadata = source.glob("lib/python*/site-packages/" + pattern) if kind in VENV_KINDS else source.glob(pattern)
    versions = sorted(p.name.removesuffix(".dist-info") for p in metadata if p.is_dir())
    version = "-".join(versions)
    if not version:
        raise ValueError(f"Missing {kind} version metadata in {source}")
    identity = fingerprint(source, kind, selected)
    base = store / kind
    base.mkdir(parents=True, exist_ok=True)
    target = base / (version + "-" + identity[:16])
    with (base / ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not target.exists():
            with TemporaryDirectory(dir=base) as tmp:
                tree = Path(tmp) / "tree"
                tree.mkdir()
                for name in selected:
                    if kind != "chromium" and name == "__pycache__":
                        continue
                    src, dst = source / name, tree / name
                    if src.is_dir() and not src.is_symlink():
                        ignore = None if kind == "chromium" else shutil.ignore_patterns("__pycache__")
                        shutil.copytree(src, dst, symlinks=True, ignore=ignore)
                    else:
                        shutil.copy2(src, dst, follow_symlinks=False)
                if kind in VENV_KINDS:
                    old = pip_prefix(tree)
                    for script in (tree / "bin").iterdir():
                        if script.is_file() and not script.is_symlink():
                            data = script_data(script, old, os.fsencode(target))
                            if data != script.read_bytes():
                                script.write_bytes(data)
                if fingerprint(tree, kind, sorted(os.listdir(tree))) != identity:
                    raise ValueError(f"{kind} source changed during copy")
                tree.rename(target)
        elif fingerprint(target, kind, sorted(os.listdir(target))) != identity:
            raise ValueError(f"Existing runtime checksum mismatch: {target}")
        if kind in VENV_KINDS and pip_prefix(target) != os.fsencode(target):
            raise ValueError(f"Incorrect venv interpreter in {target}")
        replace_link(link, target)
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=KINDS)
    parser.add_argument("source", type=Path)
    parser.add_argument("link", type=Path)
    parser.add_argument("names", nargs="*")
    args = parser.parse_args()
    print(pin(args.kind, args.source, args.link, args.names or None))
