# Variation 5 — Mission configuration workspace

## Generation

- Tool: built-in `image_gen`
- Use case: `ui-mockup`
- Output: `05-mission-configuration.png`
- Size: 1536 × 1024 px
- Primary visual reference: `/tmp/codex-clipboard-X07ejE.png`
- Cleany product reference: `../home-dashboard-reference-mix/01-balanced-overview.png`

## Prompt

```text
Use case: ui-mockup
Asset type: high-fidelity desktop web dashboard concept for the Cleany student robotics control-plane project
Primary request: Create an original Cleany mission configuration workspace, visually close in color balance, density, and polished operational feel to Image 1, while using Image 2 only for Cleany product concepts and facility-cleaning mission semantics. This is a new design, not an edit or copy.
Input images: Image 1: primary palette, spacing, information-density, map treatment, subtle border, and dashboard mood reference only; Image 2: Cleany domain reference for cleaning missions, facility map, Korean operational context, and robot status semantics only.
Scene/backdrop: centered desktop application window on a very light warm-gray canvas; white app shell with small corner radius and subtle shadow.
Subject: mission configuration workspace with three zones. Left: narrow icon rail plus a mission-context panel showing selected facility, current robot, mission summary, and compact mission list. Center: dominant top-down facility floor map with thin charcoal-gray paths, room outlines, desaturated slate-blue seating/fixture blocks, muted mint cleaned/available zones, small robot marker, target markers, and minimal dusty-coral warning dots. Right: compact white configuration drawer with a vertical 4-step stepper labeled in Korean, practical inputs for 구역 선택, 청소 모드, 시작 시간, and 확인, plus a restrained primary action button labeled "Mission 생성". Top bar includes page title "Mission 구성", floor selector "18F", small operational counters, and a periwinkle "Live" status pill.
Style/medium: shippable high-fidelity SaaS product UI mockup, crisp sans-serif typography, restrained enterprise robotics interface, practical and implementable, flat surfaces, no glossy 3D.
Composition/framing: wide 4:3 desktop screenshot, approximately 10% icon/navigation and context rail, 62% central facility map, 28% right configuration drawer; balanced margins, thin dividers, dense but calm hierarchy; map remains the strongest focal area.
Lighting/mood: bright neutral product screenshot, calm, precise, trustworthy.
Color palette: near-white #F7F7F6 canvas; white #FFFFFF surfaces; soft gray #F0F2F2 controls; thin border gray #D9DDDE; charcoal #25292D primary text/icons; muted secondary gray #6E747A; desaturated slate-blue #9DAFBE map seats; pale slate #DDE5E9; muted mint #8EC5AC operational states and #DDEFE6 fills; dusty coral #D9858F used only for rare alerts; periwinkle #7889E8 for Live and limited primary accents; avoid dark navy dominance and avoid saturated electric blue.
Text (verbatim where legible): "Cleany", "Mission 구성", "18F", "Live", "현재 Mission", "THE GROND · 15번 좌석", "구역 선택", "청소 모드", "시작 시간", "확인", "Mission 생성".
Constraints: preserve the restrained palette closely; clear three-column operational layout; realistic control sizes; readable Korean labels; original Cleany icon treatment; one active cleaning robot only; mission phase distinct from robot internal status; no embedded photographs; no watermark.
Avoid: Robodog wordmark, logo, robot names, customer names, copied proprietary icons, copied exact map geometry, copied text, trademark mimicry, gradients except the tiny periwinkle status pill if needed, neon colors, excessive navy, oversized cards, glassmorphism, sci-fi HUD, illegible pseudo-text, clutter.
```

## Palette and layout critique

- The result stays close to the target's near-white shell, thin neutral borders, charcoal type, slate-blue fixtures, muted mint zones, and sparse coral alerts.
- Periwinkle is limited to `Live`, active step markers, selection outlines, and the primary action. It is somewhat stronger on `Mission 생성` than in the reference, so implementation should reduce that button's saturation or reserve it for the final confirmation state.
- The central map remains the visual anchor while the left context column and right configuration stepper are compact and implementation-friendly.
- The map geometry and iconography are original and Cleany-specific; no Robodog branding or proprietary map content is reused.
- The generated layout is 3:2 rather than the requested 4:3 framing, but the internal column proportions are suitable for a 1440–1600 px desktop breakpoint.
