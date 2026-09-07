# Cleany dashboard palette variations v2

Fifteen high-fidelity UI mockups generated with the built-in `imagegen` tool on
2026-08-31 and 2026-09-01. Two rounds of three parallel agents produced
independent layout directions, and the final set was visually reviewed together.

## Variations

1. `01-map-fleet-workspace.png`: fleet and mission list with a dominant map.
2. `02-active-mission-workspace.png`: active mission lifecycle and robot health.
3. `03-daily-operations.png`: daily summary, current mission, and recommendations.
4. `04-alert-response.png`: blocked-route response and incident timeline.
5. `05-mission-configuration.png`: zone selection and mission configuration flow.
6. `06-compact-fleet-overview.png`: compact fleet list with a dominant map.
7. `07-mission-timeline-workspace.png`: active mission with a bottom lifecycle.
8. `08-selected-robot-inspector.png`: contextual selected-robot inspector.
9. `09-multi-zone-route-operations.png`: multi-zone routes and robot allocation.
10. `10-charging-dock-coordination.png`: charging-aware queue and dock schedule.
11. `11-split-mission-map-command.png`: mission queue and map command split.
12. `12-map-filter-toolbar.png`: map-first operations with dense filters.
13. `13-queue-first-mission-focus.png`: selected mission and upcoming queue.
14. `14-maximum-map-telemetry-drawer.png`: maximum map area with slim telemetry.
15. `15-current-and-upcoming-operations.png`: current mission, queue, and activity.

## Reference-derived palette

The palette was sampled from the supplied Robodog screenshot and then applied
to original Cleany layouts:

- App and panel white: `#FCFCFC`
- Muted surface: `#F6F7F7`
- Pale blue-gray: `#DBE5E6`
- Slate map blocks: `#BBCAD6`, `#C8D1D7`
- Muted mint: `#ADD2B9`
- Charcoal text and icons: `#27323D`
- Periwinkle live accent: `#9FAAE6`
- Dusty rose alert accent: `#D0A9B5`

The prompts use nearby normalized design-token values so generated surfaces
remain consistent across variants. Full prompts are recorded in the
`prompts-*.md` files in this directory.

## Review notes

- Variations 1 and 2 are the closest to the reference's low-saturation balance.
- Variation 3 uses more blue for the active route but keeps it spatially small.
- Variation 4 restricts rose/red to the blocked route and incident state.
- Variation 5 uses a stronger periwinkle primary action; implementation should
  desaturate that button or reserve it for the final confirmation step.
- All floor plans, icons, robot labels, and Cleany compositions are original.

The third-party reference remains subject to its owner's rights. These images
are layout and palette studies; implementation should use Cleany-owned assets
and product data.
