import importlib.util
from pathlib import Path

import pytest


@pytest.fixture
def publisher():
    path = Path(__file__).resolve().parents[3] / "tools/deploy/jetson/host-layout/shared_runtime.py"
    spec = importlib.util.spec_from_file_location("shared_runtime", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.pin


def test_browser_reuse_upgrade_and_corruption(tmp_path, publisher):
    source = tmp_path / "source"
    browser = source / "chromium-1/chrome"
    browser.parent.mkdir(parents=True)
    browser.write_bytes(b"first")
    browser.chmod(0o755)
    store = tmp_path / "store"
    a, b = tmp_path / "a/browsers", tmp_path / "b/browsers"
    first = publisher("chromium", source, a, store=store)
    assert publisher("chromium", source, b, store=store) == first
    browser.write_bytes(b"second")
    second = publisher("chromium", source, b, store=store)
    assert second != first and a.resolve() == first and b.resolve() == second
    assert (a / "chromium-1/chrome").read_bytes() == b"first"
    (second / "chromium-1/chrome").write_bytes(b"damaged")
    with pytest.raises(ValueError, match="checksum mismatch"):
        publisher("chromium", source, a, store=store)
    assert a.resolve() == first


def test_relocated_venv_can_seed_another_release(tmp_path, publisher):
    source = tmp_path / "home/venv"
    (source / "bin").mkdir(parents=True)
    (source / "lib/python3.10/site-packages/ultralytics-8.dist-info").mkdir(parents=True)
    (source / "bin/pip").write_text(f"#!{source}/bin/python\n")
    (source / "bin/activate").write_text(f"VIRTUAL_ENV={source}\n")
    (source / "bin/python").symlink_to("/usr/bin/python3")
    store = tmp_path / "store"
    link = tmp_path / "a/native/yolo-env"
    shared = publisher("yolo-env", source, link, store=store)
    assert (shared / "bin/pip").read_text() == f"#!{shared}/bin/python\n"
    assert (shared / "bin/activate").read_text() == f"VIRTUAL_ENV={shared}\n"
    assert (source / "bin/pip").read_text() == f"#!{source}/bin/python\n"
    assert (shared / "bin/python").is_symlink()
    assert publisher("yolo-env", link, tmp_path / "b/native/yolo-env", store=store) == shared
