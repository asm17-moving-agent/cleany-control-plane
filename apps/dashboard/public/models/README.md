# Cleany web model

- Source repository: asm17-moving-agent/cleany
- Source commit: e718ac57e861f3d34b6e0e10b0d18d87a348bf51
- Source model: ros2_ws/src/cleany_description/mjcf/cleany.xml and its meshes
- Pose: MuJoCo qpos0; static geometry, not live joint state or hardware telemetry
- Export: compiled visual geometry transforms and material colors; exclude collision group 3 and invisible geometry; Z-up to glTF Y-up.
- Web derivative: quadric simplification per geometry (22% target for meshes with >=500 faces, minimum 300 faces), retaining transforms and separate nodes.
- Source GLB: 6,803,816 bytes / 375,110 unique triangles.
- Web GLB: 2,926,432 bytes / 159,586 unique triangles / 128 placed geometry instances.
- Unique triangles are not per-frame rendered triangles; repeated instances increase rendering cost.
- No runtime mesh compression decoder required. Original CAD and original GLB remain unchanged.

This asset is for the Cleany project preview. Source asset licensing must be reviewed before redistribution outside the project.

`cleany-poster.webp` is a crop of the same web model rendered in native Firefox and captured with niri; it is not a new CAD asset.
Use `tools/optimize_robot_glb.py` from the repository root to reproduce the simplification from an exported flat-color source GLB.

## Standby display model

`cleany-e718ac57-standby.glb` derives folded arm transforms and display materials
from the same pinned source. It retains the 47 meshes and 128 placed geometry
instances of the lightweight model and is 2,928,036 bytes. The pose and finishes
are recorded in `cleany-e718ac57-standby.json`; they are not live telemetry or a
validated hardware command. Reproduction uses `tools/prepare_robot_standby.py`;
the dashboard README documents its inputs and invocation.

- Lightweight input SHA-256: `2ef3f79e7d3fbb0cd8f43ea53afe44b8b5a377af250f7171ae23f5165c7131de`
- Standby SHA-256: `ef8f031b27c28b6e12fc40d56803a104c0bb632474953622113fd270292f3bde`

`cleany-standby-poster.png` shows that folded CAD model. The current preview uses
`cleany-exterior-poster.png`, captured from the same pose with the additional
display-only enclosure, arm covers, couplers and wordmark. These concept shapes
are generated separately by `RobotExterior.ts` and `RobotArmCovers.ts`; they do
not alter the pinned CAD or claim confirmed manufacturing specifications.
