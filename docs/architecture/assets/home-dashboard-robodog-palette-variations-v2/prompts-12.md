# Cleany dashboard palette variations 1–2

Built with the built-in `image_gen` tool. Both prompts used these references:

- `/tmp/codex-clipboard-X07ejE.png`: primary palette, spacing, density, and layout reference
- `docs/architecture/assets/home-dashboard-reference-mix/01-balanced-overview.png`: Cleany product-domain reference

## 01 — Map and fleet workspace

```text
Use case: ui-mockup
Asset type: polished desktop web application home dashboard mockup for a student robotics facility-control project
Primary request: Create an original Cleany facility operations dashboard, variation 1: a map-dominant fleet and mission workspace. Closely match the restrained color relationships, airy density, thin-line visual language, and practical three-column proportions of Image 1, while using Image 2 only to understand Cleany's cleaning-mission domain and product vocabulary. Do not reproduce the reference brand, logo, exact map, icons, copy, robot names, or proprietary arrangement.
Input images: Image 1: primary palette, spacing, density, and general desktop-layout reference; Image 2: secondary Cleany product-domain reference only.
Scene/backdrop: a wide desktop browser-free app canvas on a soft warm gray outer background.
Subject: slim left icon navigation rail with a simple original geometric Cleany mark; adjacent white operations panel with location selector, tabs "Missions", "Robots", "Events", and four compact robot/mission cards; a very large central facility floor map titled "Study Lounge · Floor 2"; small status counters and a periwinkle "Live" pill above the map. The floor map depicts original study-cafe geometry with rectangular seating clusters, muted mint cleaning zones, thin charcoal circulation paths, small original robot markers, route dots, and sparse numeric labels. Include modest map zoom and layer controls.
Style/medium: high-fidelity shippable SaaS product UI screenshot, crisp vector-like interface rendering, precise 8px grid, thin 1px borders, subtle rounding, nearly flat surfaces, excellent information hierarchy; not concept art, no device frame.
Composition/framing: wide landscape 4:3-ish desktop canvas, orthographic straight-on view; navigation and list occupy about 27% width and the map about 73%; comfortable outer margins; dense but calm.
Lighting/mood: neutral diffuse digital surface, no dramatic light, quiet professional operations-room mood.
Color palette: closely follow Image 1: soft warm gray canvas #F3F2F0, near-white app background #FCFCFB, white panels #FFFFFF, pale gray borders #D9DDDE, slate-blue map/seating blocks #AEBECC and #BDCAD4, muted mint status and zone fills #8FC9AD and #CDE8DA, charcoal text/icons #27313A, medium gray secondary text #737A80. Accent color must be scarce: tiny coral alert dots #D96B78 and one periwinkle-blue Live pill #747DE8. Avoid Cleany's prior saturated navy sidebar and electric blue dominance.
Text (verbatim where visible): "Cleany", "Facility Operations", "Study Lounge · Floor 2", "Missions", "Robots", "Events", "Live", "Active", "Ready", "Cleaning", "Returning", "Zone A", "Zone B".
Constraints: original visual design inspired by the references but not a copy; no Robodog wordmark, icon, brand name, robot model names, customer names, exact floor plan, or copied assets; use only Cleany branding; readable interface text; no trademarked third-party logos; no watermark; no gradients except an almost imperceptible periwinkle Live-pill sheen; no glassmorphism; no dark sidebar; no oversized cards; no photorealistic robot imagery.
Avoid: neon colors, saturated royal blue, heavy shadows, glossy 3D, marketing landing-page look, illegible pseudo-text, clutter, copied reference geometry.
```

## 02 — Active mission workspace

```text
Use case: ui-mockup
Asset type: polished desktop web application home dashboard mockup for a student robotics facility-control project
Primary request: Create an original Cleany facility operations dashboard, variation 2: an active cleaning mission workspace with lifecycle progress and a robot inspector. Closely match the restrained color relationships, airy density, fine-line visual language, and balanced product realism of Image 1, while using Image 2 only to understand Cleany's cleaning-mission domain. Make it visibly part of the same design system as variation 1, but with a distinct mission-focused information architecture. Do not reproduce the reference brand, logo, exact map, icons, copy, robot names, or proprietary arrangement.
Input images: Image 1: primary palette, spacing, density, and general UI-character reference; Image 2: secondary Cleany product-domain and mission-lifecycle reference only.
Scene/backdrop: a wide desktop browser-free app canvas on a soft warm gray outer background.
Subject: slim left icon navigation rail with an original geometric Cleany mark; main white workspace headed "Active Mission"; a narrow mission queue column with three compact mission rows; a central facility map occupying about half the screen with an original study-lounge floor plan, slate-blue seat blocks, muted mint cleaning coverage, a dotted active route, and one highlighted robot; directly beneath or alongside the map, a clear four-step lifecycle rail labeled "Requested", "Navigating", "Cleaning", "Returning", with Cleaning active at 68%; a right-side white robot inspector titled "Cleaner 02" containing connection status, battery 74%, current zone "Quiet Study", elapsed time, area covered, compact sensor health rows, and restrained actions "Pause mission" and "View details". Include one tiny coral attention notice but no alarming full panel.
Style/medium: high-fidelity shippable SaaS product UI screenshot, crisp vector-like interface rendering, precise 8px grid, thin 1px borders, subtle rounding, nearly flat surfaces, excellent information hierarchy; not concept art, no device frame.
Composition/framing: wide landscape 4:3-ish desktop canvas, orthographic straight-on view; slim navigation 5%, queue 20%, central map and lifecycle 50%, inspector 25%; calm whitespace and clearly aligned card edges.
Lighting/mood: neutral diffuse digital surface, quiet and trustworthy real-time operations mood.
Color palette: closely follow Image 1 and match variation 1: soft warm gray canvas #F3F2F0, near-white app background #FCFCFB, white panels #FFFFFF, pale gray borders #D9DDDE, slate-blue map/seating blocks #AEBECC and #BDCAD4, muted mint status and cleaning fills #8FC9AD and #CDE8DA, charcoal text/icons #27313A, medium gray secondary text #737A80. Accent color must be scarce: tiny coral alert #D96B78 and a small periwinkle-blue live/status accent #747DE8. Avoid Cleany's prior saturated navy sidebar and electric blue dominance.
Text (verbatim where visible): "Cleany", "Active Mission", "Mission Queue", "Cleaner 02", "Connected", "Quiet Study", "Requested", "Navigating", "Cleaning", "Returning", "68%", "Battery", "74%", "Elapsed", "Area covered", "Sensor health", "Pause mission", "View details".
Constraints: original visual design inspired by the references but not a copy; no Robodog wordmark, icon, brand name, robot model names, customer names, exact floor plan, or copied assets; use only Cleany branding; readable interface text; mission cancellation, pause, and emergency stop must not be visually conflated; do not show an emergency-stop control; no trademarked third-party logos; no watermark; no dark sidebar; no saturated blue dominance; no gradients except a nearly imperceptible periwinkle accent sheen; no glassmorphism; no oversized cards; no photorealistic robot imagery.
Avoid: neon colors, heavy shadows, glossy 3D, marketing landing-page look, illegible pseudo-text, clutter, copied reference geometry, large red destructive buttons.
```
