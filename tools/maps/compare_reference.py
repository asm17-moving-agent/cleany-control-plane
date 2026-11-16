"""Plot the saved dashboard reference and original SLAM pixels as transparent layers.

uv run --with numpy --with pillow --with matplotlib python tools/maps/compare_reference.py OUTPUT.png
Uses a single similarity transform; local geometry is not warped to make the maps agree.
"""

import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.font_manager import FontProperties
from matplotlib.lines import Line2D
from matplotlib.transforms import Affine2D
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
args = parser.parse_args()
repo = Path(__file__).resolve().parents[2]
reference_path = repo / "apps/dashboard/src/assets/facility-18f-floorplan.png"
map_root = repo / "apps/backend/maps/slam-20261108"
metadata = json.loads((map_root / "metadata.json").read_text())

# Corresponding structural junctions, picked for a temporary visual comparison.
# The virtual square corner at the rounded east wall is omitted.
reference_points = np.array([[106, 10], [819, 10], [1387, 10], [10, 302],
                             [10, 440], [819, 589], [620, 652]], dtype=float)
slam_points = np.array([[61, 33], [371, 30], [618, 30], [25, 160],
                        [25, 220], [371, 275], [289, 310]], dtype=float)
source = reference_points[:, 0] + 1j*reference_points[:, 1]
target = slam_points[:, 0] + 1j*slam_points[:, 1]
source_mean, target_mean = source.mean(), target.mean()
factor = np.sum(np.conj(source-source_mean)*(target-target_mean)) / np.sum(abs(source-source_mean)**2)
offset = target_mean-factor*source_mean
reference_transform = [factor.real, factor.imag, -factor.imag, factor.real,
                       offset.real, offset.imag]

reference = np.asarray(Image.open(reference_path).convert("RGB"), dtype=float)/255
raw = np.asarray(Image.open(map_root / "map.png").convert("L"), dtype=float)
blue = np.array([.10, .36, .80])
red = np.array([.88, .21, .18])
reference_rgba = np.empty((*reference.shape[:2], 4))
reference_rgba[..., :3] = blue
reference_rgba[..., 3] = (1-reference.min(axis=2))*.50
slam_rgba = np.empty((*raw.shape, 4))
slam_rgba[..., :3] = red
# White/free and uniform unknown backgrounds stay transparent, retaining observation tones.
slam_rgba[..., 3] = np.clip((205-raw)/205, 0, 1)*.50

font = FontProperties(fname="/usr/share/fonts/google-noto-sans-cjk-vf-fonts/NotoSansCJK-VF.ttc")
fig, ax = plt.subplots(figsize=(16, 10), dpi=140)
fig.patch.set_facecolor("white")
ax.imshow(reference_rgba, extent=(0, reference.shape[1], reference.shape[0], 0),
          transform=Affine2D.from_values(*reference_transform)+ax.transData,
          interpolation="bilinear")
ax.imshow(slam_rgba, extent=(0, raw.shape[1], raw.shape[0], 0),
          transform=Affine2D.from_values(*metadata["presentation"]["transform"])+ax.transData,
          interpolation="nearest")
ax.set_xlim(0, 770)
ax.set_ylim(465, 0)
ax.set_aspect("equal")
ax.axis("off")
fig.suptitle("기존 도면 × SLAM 원본", fontproperties=font, fontsize=19, y=.975)
fig.legend(handles=[Line2D([0], [0], color=blue, alpha=.5, linewidth=4, label="기존 대시보드 도면 · 50%"),
                    Line2D([0], [0], color=red, alpha=.5, linewidth=4, label="SLAM 원본 · 50%")],
           loc="upper center", bbox_to_anchor=(.5, .945), ncol=2, frameon=False, prop=font)
fig.text(.5, .025, "임시 비교용 · 동일 비율 확대/축소, 회전, 이동만 적용 · 구간별 변형 없음",
         fontproperties=font, fontsize=10, ha="center", color="#647080")
fig.subplots_adjust(left=.015, right=.985, bottom=.06, top=.895)
args.output.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(args.output, facecolor="white", metadata={
    "Description": "Saved dashboard reference, not a verified original evacuation photo. "
                   "Two 50% ink layers with white/unknown backgrounds transparent.",
    "Sources": str(reference_path)+"; "+str(map_root / "map.png"),
    "ReferenceTransform": json.dumps(reference_transform),
    "SlamTransform": json.dumps(metadata["presentation"]["transform"]),
})
print(args.output)
