# Cleany dashboard prompts 12-15

Built-in `imagegen` was used once per asset. For every prompt, the input images are:

- Image 1: palette and density reference only (`assets/reference/robodog-fuselab/robodog-dashboard-ui-design-0.5s.png`)
- Image 2: liked Cleany map-first composition reference (`01-map-fleet-workspace.png`)
- Image 3: liked Cleany active-mission composition reference (`02-active-mission-workspace.png`)

The reference images guide visual language only. All layouts, map geometry, icons, labels, and branding must be original to Cleany.

## 12-map-filter-toolbar.png

```text
Use case: ui-mockup
Asset type: polished desktop web application home dashboard concept for Cleany facility-cleaning operations
Primary request: create an original map-first Cleany operations workspace whose distinctive feature is an exceptionally useful map toolbar and filter system. Keep the map as the dominant canvas. Add a compact left mission/fleet rail and a two-row toolbar above the map: site and floor selectors, search, layer toggle, robot-status chips, zone filter, mission-state filter, time range, and a discreet clear-filters action. Show only a few selected filter chips so the interface remains calm. The map should show an original study-facility floor plan, cleaning zones, thin route lines, four small robot markers, and one tiny warning marker.
Input images: Image 1 is the primary palette, spacing-density, thin-border, and restrained industrial-dashboard style reference only. Image 2 is a liked Cleany map-first hierarchy reference. Image 3 is a liked Cleany mission workspace reference. Do not copy any map geometry, logo, icon, or layout verbatim.
Style/medium: realistic shippable product UI mockup, crisp flat interface, precise alignment, not concept art, no device frame
Composition/framing: straight-on 16:10 landscape screenshot; narrow icon navigation at far left; compact operations list next; toolbar spanning the map; very large map filling roughly two-thirds of usable width; restrained header
Color palette: near-white #FCFCFC and pale gray #F6F7F7 surfaces; cool slate blue #BBCAD6 and #C8D1D7 for map fixtures; muted mint #ADD2B9 and soft green #45A978 for zones and healthy states; charcoal #27323D for text; only tiny periwinkle #727BEA for live/selected state; sparse dusty rose #D0A9B5 or coral-red for one alert
Text (verbatim): "Cleany", "Facility Operations", "Study Lounge", "Floor 2", "Filters", "All robots", "Cleaning", "Ready", "Zone A", "Zone B", "Live"
Constraints: original Cleany visual identity; practical implementation-ready hierarchy; readable concise labels; generous map area; 1 px light borders; subtle 8-12 px corner radii; minimal shadow; white canvas; no gradients except an almost imperceptible selection tint
Avoid: Robodog name or branding; copied floor-plan geometry; copied logos or icons; dark navy surfaces; saturated-blue dominance; oversized cards; glassmorphism; photos; 3D render; decorative illustration; watermark; gibberish text; excessive filters
```

## 13-queue-first-mission-focus.png

```text
Use case: ui-mockup
Asset type: polished desktop web application home dashboard concept for Cleany facility-cleaning operations
Primary request: design an original queue-first Cleany home workspace. Make the left column a structured mission queue with compact upcoming rows, while one large selected-mission card occupies the upper-left center and clearly shows mission name, assigned cleaner, zone, scheduled time, progress, and four phases. Keep a large original facility map beside and below that card, showing the selected cleaning zone, a dotted route, current robot position, dock, and subtle room furniture. Include a narrow right summary strip for robot battery and safe controls, but the selected mission and map must remain the focus.
Input images: Image 1 is the primary reference for restrained near-white palette, industrial data density, thin outlines, and tiny status colors. Image 2 supplies the liked Cleany map-first visual language. Image 3 supplies the liked active-mission hierarchy. Use references only as inspiration and create new geometry and component arrangement.
Style/medium: realistic shippable desktop SaaS UI mockup, refined flat vector-like interface, precise sans-serif typography, not concept art
Composition/framing: straight-on 16:10 landscape screenshot; slim left navigation; queue column around one-fifth width; large selected-mission panel aligned with a broad map; very narrow right status column; balanced whitespace
Color palette: #FCFCFC and #F6F7F7 backgrounds; #27323D charcoal text; #BBCAD6 and #C8D1D7 floor-plan fixtures; #ADD2B9 and #45A978 active cleaning zone and progress; sparse #D0A9B5 alert; tiny #8B91E8 selected/live accent only
Text (verbatim): "Cleany", "Mission Queue", "Quiet Study", "Active", "Cleaner 02", "Zone B", "Cleaning", "68%", "Upcoming", "Reading Nook", "Collaboration Hub", "Battery", "74%", "Pause mission"
Constraints: original Cleany branding and layout; one dominant selected-mission card; one dominant map; thin 1 px gray borders; small radii; minimal shadow; readable labels; safety action visually secondary; no terminal-outcome controls
Avoid: Robodog branding or assets; source-layout tracing; same floor-plan geometry as any reference; dark navy; saturated blue blocks; large colored backgrounds; photos; perspective device mockup; glass effects; gradients; watermark; malformed labels; visual clutter
```

## 14-maximum-map-telemetry-drawer.png

```text
Use case: ui-mockup
Asset type: polished desktop web application home dashboard concept for Cleany facility-cleaning operations
Primary request: create an ultra-compact Cleany monitoring workspace with maximum possible map area. Use only a slim icon rail and a single-line top header, then let an original campus lounge floor map occupy about 80 percent of the canvas. Add a narrow open telemetry drawer docked on the right for the selected Cleaner 03: connection, battery, current mission, velocity, coverage, lidar, bumper, side brush, and heartbeat. Overlay a small floating map toolbar with layers, routes, zones, zoom, and fit controls. Show several small robot markers, muted green coverage patches, delicate planned paths, and one dusty-rose sensor warning.
Input images: Image 1 is the palette and compact industrial-interface reference only. Image 2 is the liked Cleany large-map reference. Image 3 is the liked Cleany telemetry and mission reference. Invent a completely different map and component geometry.
Style/medium: implementation-ready product UI screenshot, crisp restrained flat design, high information density with strong hierarchy, not futuristic concept art
Composition/framing: straight-on 16:10 desktop screenshot; 56 px icon rail; 64 px top header; nearly edge-to-edge map; 260-300 px right drawer; tiny floating controls; no conventional left content panel
Color palette: dominant near-white #FCFCFC; pale gray #F6F7F7; charcoal #27323D; cool gray-blue #BBCAD6 and #C8D1D7; muted mint #ADD2B9 and #45A978 for coverage and nominal status; one sparse dusty rose #D0A9B5 warning; periwinkle #7D84E8 only on selected marker
Text (verbatim): "Cleany", "Live Operations", "Study Lounge", "Floor 1", "Cleaner 03", "Connected", "Telemetry", "Battery 81%", "Coverage 428 m²", "Lidar Good", "Bumper Good", "Side brush Check", "Heartbeat 2s"
Constraints: map is unmistakably dominant; thin 1 px borders; compact controls; subtle 8 px radii; minimal shadows; useful readable telemetry; original line icons; original facility geometry; no photos or decorative artwork
Avoid: Robodog name, mark, or assets; traced reference geometry; a large left card list; dark sidebars; dark navy panels; neon or saturated blue; oversized typography; heavy shadows; glassmorphism; gradients; watermark; gibberish labels
```

## 15-current-and-upcoming-operations.png

```text
Use case: ui-mockup
Asset type: polished desktop web application home dashboard concept for Cleany facility-cleaning operations
Primary request: create a cohesive Cleany home workspace that balances the current mission, upcoming queue, and recent activity without becoming a generic card dashboard. Use a narrow left navigation, a focused current-mission panel with progress and phase stepper, a large central original facility map with active zone and route, a short upcoming queue directly beneath the current mission, and a slim recent-activity timeline integrated along the lower edge of the map. Include a compact robot health summary in the right edge. The whole screen should read as one operational workspace rather than separate floating widgets.
Input images: Image 1 sets the restrained palette, thin-outline density, and industrial operations tone. Image 2 is the liked Cleany map-first composition reference. Image 3 is the liked Cleany active mission reference. Preserve only the visual principles; design new components, map geometry, labels, and icons.
Style/medium: realistic shippable product UI mockup, clean flat desktop web interface, careful typographic hierarchy and spacing, no concept-art styling
Composition/framing: straight-on 16:10 screenshot; slim icon rail; current mission and two upcoming rows in a compact left column; central map occupying most width; integrated bottom activity timeline; narrow robot status edge; restrained single-row header
Color palette: near-white #FCFCFC, pale gray #F6F7F7, charcoal #27323D, slate blue #BBCAD6 and #C8D1D7, muted mint #ADD2B9 and green #45A978, sparse dusty rose #D0A9B5 for an exception, tiny periwinkle #7D84E8 for selected/live only
Text (verbatim): "Cleany", "Today’s Operations", "Current Mission", "Quiet Study", "Cleaning 68%", "Upcoming", "Reading Nook", "Collaboration Hub", "Recent activity", "Mission started", "Zone B complete", "Cleaner 02", "Connected", "Live"
Constraints: unified workspace; map remains largest visual element; thin 1 px borders; subtle corner radii; almost no shadow; concise readable labels; original Cleany identity; status colors used only in small chips, lines, and dots
Avoid: Robodog branding or recognizable assets; copied map; generic analytics-card grid; dark navy; saturated blue dominance; large color fills; photos; device frame; perspective; glassmorphism; decorative gradients; watermark; gibberish text; excessive alerts
```
