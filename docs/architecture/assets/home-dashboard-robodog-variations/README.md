# Cleany home dashboard variations

Five high-fidelity UI mockups generated with the built-in `imagegen` tool on
2026-08-31. These are visual exploration artifacts, not implementation
specifications.

## Variations

1. `01-map-dominant-operations.png`: mission list, dominant facility map, and
   contextual mission detail.
2. `02-active-mission-command.png`: active mission lifecycle, map route, robot
   inspector, and recent events.
3. `03-fleet-overview.png`: searchable robot fleet, zone map, and telemetry
   inspector.
4. `04-alert-response.png`: alert inbox, blocked route, incident details, and
   safe-stop action.
5. `05-daily-operations-overview.png`: daily KPIs, current mission, map,
   recommendations, activity, and schedule.

All outputs are 1448 x 1086 sRGB PNG files.

## Prompt set

Shared prompt:

> Create an original, high-fidelity 4:3 desktop Cleany facility-cleaning robot
> dashboard. Use the supplied Robodog screenshots only as references for
> information architecture and compact visual rhythm, and the existing Cleany
> mockup as the product baseline. Produce a realistic, shippable enterprise
> SaaS UI with a white and cool-gray surface palette, deep navy typography,
> blue controls, restrained mint status accents, thin borders, subtle shadows,
> compact typography, and practical component proportions. Include the Cleany
> name and concise Korean interface headings. Do not reproduce Robodog
> branding, logos, media, proprietary artwork, or exact composition. No
> watermark, photographic scene, device frame, or perspective tilt.

Variation requests:

1. Map-dominant workspace with a slim navigation rail, mission queue on the
   left, central 2D facility map and route, and mission drawer on the right.
2. Active-mission workspace with lifecycle stepper, progress, safe stop,
   central route map, robot inspector, and recent event strip.
3. Fleet workspace with four compact robot rows, multi-zone map, two robot
   positions, and a telemetry/control inspector.
4. Alert workspace with operational KPIs, severity inbox, blocked route,
   incident details, recommended actions, and safe stop.
5. Daily overview with summary KPIs, current mission, central route map,
   recommendations, recent activity, and upcoming schedule.

## References

- `assets/reference/robodog-fuselab/robodog-dashboard-ui-design-6s.png`
- `assets/reference/robodog-fuselab/robodog-dashboard-ui-design-17s.png`
- `docs/architecture/assets/home-dashboard-reference-mix/01-balanced-overview.png`

The third-party references remain subject to their owners' rights. These
generated images should guide layout exploration only; implementation should
continue using Cleany-owned branding, data, and assets.
