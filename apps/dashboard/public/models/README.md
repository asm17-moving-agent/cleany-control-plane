# Current CAD web model

All active dashboard previews and the presentation viewer use
`cleany-c32c3074-cad.glb` and its matching `cleany-c32c3074-cad-poster.png`.
The shared paths live in `src/components/robot-model-asset.ts`.

- Source: Cleany `refactor/docs-and-navigation`, commit `c32c30740e8a3e61f9ba99decbb6ad57914a2462`.
- CAD: `Cleany-final.FCStd`, SHA-256 `91c26ec2eb8d1227fe9a0a18ded1235fcde257d2ef94cf9d345d337511625ff0`.
- Geometry: the source MJCF's 330 CAD meshes (verified against its manifest) and 48 wheel roller capsules.
- Pose: saved CAD registration angles from `config/geometry/cad_final.json`; static, not live telemetry.
- No invented enclosure, covers, electronics or replacement wheels. Complex source meshes are simplified for web rendering; all source parts and transforms remain.
- 1,213,060 source triangles → 591,768 web triangles, merged by original color into 7 draw meshes; 10,638,980 bytes.
- 127 complex meshes reduced; reject reductions shifting local bounds by more than 0.2 mm. This bound check is not a surface-error certificate.
- GLB SHA-256: `5200cee468d53b907add7a37d7f1ed308af29149bc417a75e1793618e7717083`.
- Provenance, source hashes, visible geometry names and export verification: `cleany-c32c3074-cad.json`.
- Reproduce with `tools/export_cad_web_model.py`; capture the poster with `apps/dashboard/tools/capture-cad-poster.mjs`, as described in the dashboard README.

The poster is a transparent capture of the actual dashboard renderer, not a generated illustration.
The original CAD/ROS assets are unchanged. This is project preview geometry, not evidence of physical calibration or a validated motion command.
Source licensing must be reviewed before redistribution outside the project.

## Historical assets (not used by active previews)

### Original web model

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

`cleany-standby-poster.png` shows that folded CAD model. The former preview used
`cleany-exterior-poster.png`, captured from the same pose with the additional
display-only enclosure, arm covers, couplers, wordmark and front sensor openings.
These concept shapes are generated separately by `RobotExterior.ts`,
`RobotArmCovers.ts` and `RobotSensorOpenings.ts`; they do
not alter the pinned CAD or claim confirmed manufacturing specifications.
