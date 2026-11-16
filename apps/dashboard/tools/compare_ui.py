"""Export paired Playwright snapshots as a local HTML review, PNG diffs and ZIP.

Run with Python + Pillow (or uv run --with pillow python). Differences between the
two designs are informational; regression assertions belong to Playwright.
"""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, required=True)
    parser.add_argument("--after", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--before-ref", required=True)
    parser.add_argument("--after-ref", required=True)
    parser.add_argument("--initial-scene", default="laptop/home.png")
    parser.add_argument("--capture-notes", default="")
    parser.add_argument("--expected-changes", default="Pretendard, 40/32/48px controls, 8/12px radii, spacing, semantic contrast, status and panel styles; Radix menu/switch")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    entries = []
    for original in sorted(args.before.rglob("*.png")):
        name = original.relative_to(args.before)
        revised = args.after / name
        if not revised.exists():
            raise SystemExit(f"Missing After image: {name}")
        for source, side in [(original, "before"), (revised, "after")]:
            destination = args.output / side / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            if source.resolve() != destination.resolve():
                shutil.copyfile(source, destination)
        before, after = Image.open(original).convert("RGB"), Image.open(revised).convert("RGB")
        size = max(before.width, after.width), max(before.height, after.height)
        left, right = Image.new("RGB", size, "white"), Image.new("RGB", size, "white")
        left.paste(before); right.paste(after)
        diff = ImageChops.difference(left, right)
        difference = args.output / "diff" / name
        difference.parent.mkdir(parents=True, exist_ok=True)
        diff.save(difference)
        red, green, blue = diff.split()
        peak = ImageChops.lighter(ImageChops.lighter(red, green), blue)
        changed = size[0] * size[1] - peak.histogram()[0]
        entries.append({"name": str(name), "before": str(Path("before") / name),
                        "after": str(Path("after") / name), "diff": str(Path("diff") / name),
                        "changed_percent": round(changed / (size[0] * size[1]) * 100, 2),
                        "before_sha256": hashlib.sha256(original.read_bytes()).hexdigest(),
                        "after_sha256": hashlib.sha256(revised.read_bytes()).hexdigest()})
    if not entries:
        raise SystemExit("No screenshot pairs found")
    paired = {entry["name"] for entry in entries}
    additions = []
    for revised in sorted(args.after.rglob("*.png")):
        name = revised.relative_to(args.after)
        if str(name) in paired:
            continue
        destination = args.output / "after" / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        if revised.resolve() != destination.resolve():
            shutil.copyfile(revised, destination)
        additions.append({"name": str(name), "after": str(Path("after") / name),
                          "after_sha256": hashlib.sha256(revised.read_bytes()).hexdigest()})
    manifest = {"before_ref": args.before_ref, "after_ref": args.after_ref,
                "fixture": "Display-only demo/API fixtures; fixed 2026-11-16T10:00:00Z; ko-KR; Asia/Seoul; DPR 1; reduced motion; static CAD poster; no hardware proof",
                "expected_changes": args.expected_changes,
                "capture_notes": args.capture_notes,
                "comparison": "Pixel differences are informational, not failures. After regression snapshots require zero pixel differences in the same browser/environment.",
                "initial_scene": args.initial_scene, "after_only": additions, "images": entries}
    (args.output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    template = '''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Cleany Before / After</title><style>
*{box-sizing:border-box}body{margin:0;padding:24px;font:14px/1.5 system-ui,sans-serif;color:#24333d;background:#f5f7f7}h1{font-size:24px;margin:0}p{max-width:1100px}select,button,input{font:inherit;padding:8px;border:1px solid #7a8a8e;border-radius:8px;background:white}nav{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:20px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pair img{width:100%;border:1px solid #ccd4d6}h2{font-size:16px}.overlay{position:relative;width:100%;max-width:1920px;background:white}.overlay img{width:100%;display:block}.overlay #top{position:absolute;top:0;left:0}.diff img{max-width:100%}[hidden]{display:none!important}a{color:#12695d}
</style><h1>Cleany 디자인 시스템 · Before / After</h1>
<p>동일한 표시 전용 fixture를 비교합니다. 실제 로봇·카메라 검증 자료가 아닙니다. 지도 좌표·기능은 보존 대상입니다. 검은 Diff 영역은 동일한 픽셀입니다.</p><p id="expected"></p>
<p id="refs"></p><nav><label>화면 <select id="scene"></select></label><label>보기 <select id="mode"><option value="pair">나란히</option><option value="overlay">겹치기</option><option value="diff">픽셀 차이</option></select></label><label>After 불투명도 <input id="opacity" type="range" min="0" max="100" value="50"></label><span id="count"></span><a href="manifest.json">출처·SHA-256</a><a href="comparison.zip">전체 ZIP</a></nav>
<section class="pair" id="pair"><div><h2>Before</h2><a id="beforeLink"><img id="before" alt="Before"></a></div><div><h2>After</h2><a id="afterLink"><img id="after" alt="After"></a></div></section>
<section class="overlay" id="overlay" hidden><img id="bottom" alt="Before"><img id="top" alt="After"></section><section class="diff" id="diff" hidden><img id="difference" alt="Pixel difference"></section>
<script>const data=__DATA__;const $=id=>document.getElementById(id);$('refs').textContent='Before: '+data.before_ref+' / After: '+data.after_ref;data.images.forEach((e,i)=>{const o=document.createElement('option');o.value=i;o.textContent=e.name;$('scene').append(o)});function render(){const e=data.images[Number($('scene').value)];$('before').src=$('bottom').src=$('beforeLink').href=e.before;$('after').src=$('top').src=$('afterLink').href=e.after;$('difference').src=e.diff;$('top').style.opacity=$('opacity').value/100;['pair','overlay','diff'].forEach(m=>$(m).hidden=m!==$('mode').value);$('count').textContent='변경 픽셀 '+e.changed_percent+'% (정보용)'};['scene','mode','opacity'].forEach(id=>$(id).addEventListener('input',render));render();</script></html>'''
    template = template.replace('<section class="pair"', '<p id="capture-notes"></p><p id="additions"></p><section class="pair"')
    template = template.replace("render();</script>", "$('capture-notes').textContent=data.capture_notes;$('expected').textContent='의도한 변경: '+data.expected_changes;const initial=data.images.findIndex(e=>e.name===data.initial_scene);if(initial>=0)$('scene').value=initial;data.after_only.forEach(e=>{const a=document.createElement('a');a.href=e.after;a.textContent='추가 화면: '+e.name;$('additions').append(a,document.createTextNode(' · '))});render();</script>")
    (args.output / "index.html").write_text(template.replace("__DATA__", json.dumps(manifest, ensure_ascii=False).replace("<", "\\u003c")))
    chosen = [e for e in entries if e["name"].startswith("laptop/") and Path(e["name"]).stem in ["home", "monitoring", "missions", "results", "settings"]]
    sheet = Image.new("RGB", (1200, len(chosen) * 365), "#f5f7f7")
    draw = ImageDraw.Draw(sheet)
    for row, entry in enumerate(chosen):
        for column, side in enumerate(["before", "after"]):
            img = Image.open(args.output / entry[side]).convert("RGB")
            img.thumbnail((580, 328))
            draw.text((column * 600 + 10, row * 365 + 8), f"{side.upper()} / {entry['name']}", fill="#24333d")
            sheet.paste(img, (column * 600 + 10, row * 365 + 28))
    sheet.save(args.output / "contact-sheet.png")
    with zipfile.ZipFile(args.output / "comparison.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        # Package only review artifacts, never a preview server's build or database.
        paths = [args.output / name for name in ["index.html", "manifest.json", "contact-sheet.png"]]
        paths += [args.output / entry[side] for entry in entries for side in ["before", "after", "diff"]]
        paths += [args.output / entry["after"] for entry in additions]
        for path in paths:
            archive.write(path, path.relative_to(args.output))
    print(f"Exported {len(entries)} pairs to {args.output / 'index.html'}")


if __name__ == "__main__":
    main()
