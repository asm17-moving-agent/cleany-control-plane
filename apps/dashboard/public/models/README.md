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
