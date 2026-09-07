# Image generation prompts: variations 06-08

Generated with the built-in `imagegen` tool. The two existing Cleany mockups
`01-map-fleet-workspace.png` and `02-active-mission-workspace.png` were supplied
as design-system references, not edit targets.

## 06 — Compact fleet overview

```text
Use case: ui-mockup
Asset type: high-fidelity desktop web dashboard concept for the Cleany facility cleaning control plane
Input images: Image 1 is the primary palette and visual-density reference; Images 2 and 3 are liked Cleany composition references. Use them only as visual references, not edit targets.
Primary request: Create an original Cleany dashboard variation titled “Fleet Overview” featuring a compact collapsible left fleet rail and a dominant facility map. The rail is visibly in a compact expanded state: narrow icon strip plus a concise robot list with four units, status dots, battery percentages, and a small collapse control. The large right workspace shows a detailed study-lounge floor plan, cleaning paths, four small robot markers, zone fills, and restrained operational counters across the top. Add a minimal top bar with “Cleany”, facility selector, notifications, and operator avatar.
Style/medium: realistic shippable SaaS product UI screenshot, precise 2D vector-like interface, crisp thin strokes, disciplined spacing, compact typography, not concept art
Composition/framing: 16:10 landscape desktop canvas, straight-on view, near edge-to-edge app shell with a subtle pale gray outer margin; dominant map occupies roughly 72 percent of content width; compact fleet rail roughly 22 percent; strong whitespace and clear hierarchy
Color palette: near-white #FCFCFC panels, soft cool/warm gray #F6F7F7 backgrounds, pale slate-blue #BBCAD6 and #C8D1D7 for furniture and map geometry, muted mint #ADD2B9 for clean zones and healthy states, charcoal #27323D text and paths, sparse dusty rose #D0A9B5 only for one alert, tiny periwinkle #9FAAE6 only for live/selected accent
Text (verbatim where rendered): “Cleany”, “Fleet Overview”, “Study Lounge”, “Floor 2”, “Unit 01”, “Unit 02”, “Unit 03”, “Unit 04”, “Active”, “Ready”, “Returning”, “Live”
Constraints: original layout; preserve the restrained low-saturation palette; readable UI hierarchy; one active cleaning route; fine gray borders; gentle card radii; subtle shadows; no photographic imagery; no robot product photo; no existing brand assets
Avoid: Robodog name or logo; copied logos; dark navy sidebar; saturated blue dominance; gradients except an almost imperceptible status tint; glassmorphism; giant cards; excessive alerts; illegible decorative text; watermark
```

## 07 — Mission timeline workspace

```text
Use case: ui-mockup
Asset type: high-fidelity desktop web dashboard concept for the Cleany facility cleaning control plane
Input images: Images 1 and 2 are liked Cleany composition and palette references. Use them only as design-system references, not edit targets.
Primary request: Create an original Cleany “Active Mission” workspace variation centered on one running cleaning mission. Use a compact mission queue at left, a large central study-lounge floor map with a dotted cleaning route and selected cleaner, a narrow telemetry drawer on the far right, and a prominent horizontal mission lifecycle timeline docked across the full bottom of the map area. The lifecycle reads Requested, Assigned, Navigating, Cleaning, Returning, Completed; current state Cleaning at 68 percent. The telemetry drawer is slim and dense with battery, runtime, speed, coverage, connectivity, and one low side-brush alert. Include a minimal top bar with facility selector and operator controls.
Style/medium: realistic shippable SaaS product UI screenshot, precise clean 2D vector-like interface, crisp thin strokes, disciplined spacing, compact readable typography, not concept art
Composition/framing: 16:10 landscape desktop canvas, straight-on view, near edge-to-edge app shell with subtle pale gray outer margin; center map roughly 58 percent width; compact mission queue 20 percent; telemetry drawer 17 percent; bottom lifecycle timeline clearly separated and visually dominant without becoming oversized
Color palette: near-white #FCFCFC panels, soft cool/warm gray #F6F7F7 backgrounds, pale slate-blue #BBCAD6 and #C8D1D7 for map geometry, muted mint #ADD2B9 for clean zone and healthy states, charcoal #27323D text and route lines, sparse dusty rose #D0A9B5 only for the brush alert, tiny periwinkle #9FAAE6 only for current lifecycle state and selected robot
Text (verbatim where rendered): “Cleany”, “Active Mission”, “Mission Queue”, “Quiet Study”, “Cleaner 02”, “Telemetry”, “Requested”, “Assigned”, “Navigating”, “Cleaning”, “Returning”, “Completed”, “68%”, “Battery”, “Coverage”, “Connected”
Constraints: original layout; preserve restrained low-saturation palette; lifecycle phases clearly distinct; external mission phase only, no internal robot FSM controls; fine gray borders; gentle card radii; subtle shadows; no photographic imagery; no robot product photo; no existing brand assets
Avoid: Robodog name or logo; copied logos; dark navy sidebar; saturated blue dominance; large blue surfaces; gradients except imperceptible mint zone tint; glassmorphism; giant cards; excessive alerts; illegible decorative text; watermark
```

## 08 — Selected robot inspector

```text
Use case: ui-mockup
Asset type: high-fidelity desktop web dashboard concept for the Cleany facility cleaning control plane
Input images: Images 1 and 2 are liked Cleany composition and palette references. Use them only as design-system references, not edit targets.
Primary request: Create an original Cleany selected-robot focus workspace. Use a very compact mission list on the left and a dominant facility map across the rest of the canvas. Select “Cleaner 03” on the map and show a floating contextual inspector anchored near the robot over the right side of the map, not a permanent full-height sidebar. The floating inspector contains status Connected, current mission Reading Nook, battery 81%, elapsed 00:18:42, area covered 184 square meters, small sensor-health rows, and two restrained actions “Pause mission” and “View details”. Behind it, keep the floor plan and route visible. Include map filters, layers, counters, and a minimal top bar. The mission list contains one active and three queued items, with compact rows rather than large cards.
Style/medium: realistic shippable SaaS product UI screenshot, precise clean 2D vector-like interface, crisp thin strokes, disciplined spacing, compact readable typography, not concept art
Composition/framing: 16:10 landscape desktop canvas, straight-on view, near edge-to-edge app shell with subtle pale gray outer margin; mission list roughly 18 percent; map roughly 77 percent; floating inspector a medium-height card occupying at most 21 percent width, offset from the right edge with visible map around it; selected robot and inspector connected by a subtle pointer or short leader
Color palette: near-white #FCFCFC panels, soft cool/warm gray #F6F7F7 backgrounds, pale slate-blue #BBCAD6 and #C8D1D7 for furniture and map geometry, muted mint #ADD2B9 for clean zones and healthy states, charcoal #27323D text and paths, sparse dusty rose #D0A9B5 only for one minor sensor warning, tiny periwinkle #9FAAE6 only for selected robot ring and small active accent
Text (verbatim where rendered): “Cleany”, “Robot Focus”, “Mission Queue”, “Cleaner 03”, “Connected”, “Reading Nook”, “Battery”, “81%”, “Elapsed”, “00:18:42”, “Area covered”, “184 m²”, “Sensor health”, “Pause mission”, “View details”, “Live”
Constraints: original layout; contextual inspector must float over the map rather than form a full-height right column; selected robot remains visible; preserve restrained low-saturation palette; fine gray borders; gentle card radii; subtle shadows; no photographic imagery; no robot product photo; no existing brand assets
Avoid: Robodog name or logo; copied logos; dark navy sidebar; saturated blue dominance; large blue surfaces; gradients except imperceptible mint zone tint; glassmorphism; giant cards; excessive alerts; illegible decorative text; watermark
```
