# Cleany brand assets

Source artwork supplied by the project owner on 2026-09-08:
- `wordmark-original.png`: `/home/ehdrms/Downloads/logo_image.png`
- `robot-original.png`: `/home/ehdrms/Downloads/robot_loro_image_polished_v4.png`

Originals are preserved. Runtime assets use deterministic ImageMagick processing, not regenerated illustrations:
- `wordmark.png`: transparent bounds trimmed, resized to 480px wide; header displays at 120px. Also used on the 3D enclosure's upper front panel.
- `robot-character.webp`: 680×680 crop at (105,85), resized to 320×320; full robot without lettering.
- `robot-face.png`: 270×168 crop at (305,244), exterior background flood-filled transparent with 5% tolerance, resized within 192×128.
- `robot-lockup.png`: complete character and lettering from `robot-original.png`, trimmed to 512×676. White areas become transparent ink gaps; navy (`#001d2c`) and yellow (`#ffd400`) are normalized to avoid pale or colored edge fringes. Retained as a design alternative; the 3D enclosure currently uses the wordmark alone.
- `public/brand/favicon.png`: face resized within 56×40, centered on a white 64×64 canvas.

Wordmark appears in the app header. Face artwork is shared by small robot icons and the map marker. Full character appears in the robot detail drawer and robot page. Status colors remain on the existing rings and badges.

Reproduce the alternative illustrated decal from the repository root:

```bash
magick \
  \( apps/dashboard/src/assets/brand/robot-original.png -alpha set -channel A \
     -fx 'max(max(r,g),b)-min(min(r,g),b)>0.008 ? 1-min(min(r,g),b) : 0' \
     +channel -fill '#001d2c' -colorize 100 \) \
  \( apps/dashboard/src/assets/brand/robot-original.png -alpha set -channel A \
     -fx 'r>b+0.08 && g>b+0.06 ? 1-b : 0' \
     +channel -fill '#ffd400' -colorize 100 \) \
  -compose over -composite -trim +repage -resize 512x -strip \
  apps/dashboard/src/assets/brand/robot-lockup.png
```
