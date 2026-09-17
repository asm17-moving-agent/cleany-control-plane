import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/** KB model identities, with illustrative board layouts/mounts rather than vendor CAD. */
export function createRobotElectronics() {
  const group = new THREE.Group();
  group.name = "lower-electronics-concept";
  group.userData = { concept: true, units: "metres", specificationsVerified: false };
  const material = (color: number, metalness = .1, roughness = .5) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const silver = material(0xadb7bc, .7, .32), black = material(0x202a30), pcb = material(0x176554);
  const blue = material(0x315774), green = material(0x39816c), gold = material(0xc0a667, .65);
  const red = material(0xb53732), wireBlack = material(0x182027), yellow = material(0xc39839);
  const signal = material(0x527ea2), white = material(0xd6dfe1), strap = material(0x2b3033, 0, .9);
  function box(name: string, size: [number, number, number], at: [number, number, number], mat: THREE.Material, radius = .001) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 2, radius), mat);
    mesh.name = name; mesh.position.set(...at); group.add(mesh); return mesh;
  }
  function cylinder(name: string, radius: number, height: number, at: [number, number, number], mat: THREE.Material, face = false) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 32), mat);
    mesh.name = name; mesh.position.set(...at); if (face) mesh.rotation.x = Math.PI / 2;
    group.add(mesh); return mesh;
  }
  function cable(name: string, points: [number, number, number][], mat: THREE.Material, radius = .002) {
    const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), false, "centripetal");
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, 40, radius, 8, false), mat);
    mesh.name = name; group.add(mesh);
  }
  function label(text: string, width: number, at: [number, number, number], front = false) {
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#dce5e7"; context.fillRect(0, 0, 512, 128);
    context.fillStyle = "#203441"; context.font = "bold 64px sans-serif";
    context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(text, 256, 68);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    mesh.name = `label-${text}`; mesh.position.set(...at); if (front) mesh.rotation.y = Math.PI / 2;
    group.add(mesh);
  }

  // Equipment tray on the existing lower platform.
  box("electronics-tray", [.350, .006, .420], [0, .180, 0], silver);
  for (const x of [-.155, .155]) for (const z of [-.19, .19]) {
    cylinder("tray-standoff", .005, .018, [x, .170, z], gold);
    cylinder("tray-screw", .004, .002, [x, .184, z], black);
  }

  // Battery pack, retaining straps, protected terminals and a service connector.
  box("battery-pack", [.195, .125, .125], [-.020, .248, -.108], blue, .006);
  box("battery-top", [.198, .011, .128], [-.020, .315, -.108], black, .003);
  for (const x of [-.078, .035]) {
    box("battery-retaining-strap", [.016, .006, .132], [x, .324, -.108], strap);
    box("battery-strap-face", [.016, .132, .004], [x, .250, -.043], strap);
    box("battery-strap-buckle", [.022, .012, .011], [x, .295, -.036], silver);
  }
  label("BATTERY", .082, [.079, .251, -.108], true);
  cylinder("battery-positive", .005, .013, [.047, .327, -.143], red);
  cylinder("battery-negative", .005, .013, [.047, .327, -.077], black);
  box("battery-service-plug", [.023, .018, .019], [.106, .224, -.146], yellow, .003);

  // Vertical service board keeps controllers visible and clear of the bin above.
  box("controller-mounting-plate", [.354, .147, .004], [0, .266, .189], silver);
  for (const x of [-.168, .168]) {
    box("controller-plate-foot", [.018, .012, .045], [x, .190, .173], silver);
    cylinder("controller-mount-screw", .003, .004, [x, .331, .194], black, true);
  }
  function board(name: string, x: number, width: number, height: number) {
    box(name, [width, height, .002], [x, .267, .202], pcb);
    for (const dx of [-width / 2 + .006, width / 2 - .006]) for (const dy of [-height / 2 + .006, height / 2 - .006]) {
      cylinder("pcb-spacer", .0025, .010, [x + dx, .267 + dy, .197], gold, true);
      cylinder("pcb-screw", .002, .002, [x + dx, .267 + dy, .204], silver, true);
    }
  }
  for (const [index, x] of [[0, -.042], [1, .084]] as const) {
    board(`dual-motor-driver-${index}`, x, .110, .110);
    // Cytron MDD20A uses discrete MOSFET bridges, not a large finned heatsink.
    for (const dx of [-.025, .025]) for (const dy of [-.018, -.006, .006, .018]) {
      box("mdd20a-mosfet", [.014, .008, .003], [x + dx, .270 + dy, .206], black, .0004);
      for (const side of [-1, 1]) box("mosfet-solder-pad", [.002, .006, .001], [x + dx + side * .008, .270 + dy, .204], silver, .0001);
    }
    box("mdd20a-logic-ic", [.010, .018, .002], [x, .272, .205], black);
    for (const dx of [-.011, .011]) {
      box("mdd20a-test-button-base", [.007, .007, .002], [x + dx, .242, .205], silver);
      cylinder("mdd20a-test-button", .002, .003, [x + dx, .242, .208], black, true);
    }
    for (const y of [.227, .308]) {
      box("driver-terminal-block", [.057, .012, .015], [x - .010, y, .211], green);
      for (let pin = 0; pin < 4; pin++) cylinder("terminal-screw", .0022, .002, [x - .031 + pin * .014, y, .220], silver, true);
    }
    for (const y of [.243, .299]) cylinder("driver-capacitor", .006, .014, [x + .043, y, .211], blue, true);
    label(`MDD20A ${index + 1}`, .067, [x, .206, .205]);
    box("driver-status-led", [.003, .003, .002], [x + .039, .279, .205], green);
  }

  // Recognizable ESP32-style development board: shield, antenna, pin headers, USB.
  const espX = -.142;
  board("esp32-carrier", espX, .057, .108);
  box("esp32-dev-board", [.034, .076, .002], [espX, .267, .209], black);
  box("esp32-module-shield", [.021, .025, .003], [espX, .276, .213], silver);
  box("esp32-antenna-area", [.026, .012, .002], [espX, .297, .211], pcb);
  for (let i = 0; i < 5; i++) box("antenna-trace", [.001, .007, .0005], [espX - .010 + i * .005, .299, .213], gold, .0001);
  for (const side of [-1, 1]) for (let pin = 0; pin < 12; pin++) {
    box("esp32-pin-socket", [.004, .004, .004], [espX + side * .021, .239 + pin * .005, .212], black);
    box("esp32-header-pin", [.001, .001, .005], [espX + side * .021, .239 + pin * .005, .216], gold, .0001);
  }
  box("esp32-usb-port", [.009, .006, .005], [espX, .232, .214], silver);
  box("usb-port-opening", [.006, .003, .001], [espX, .232, .217], black);
  label("ESP32", .038, [espX, .205, .205]);

  // Front-facing illustrative boost converter; KB specifies 3S → Jetson 19 V.
  box("power-module-board", [.003, .055, .080], [.161, .226, -.104], pcb);
  box("power-module-inductor", [.017, .019, .019], [.172, .229, -.095], gold, .003);
  box("power-module-heatsink", [.015, .027, .025], [.171, .228, -.126], black);
  for (let fin = 0; fin < 4; fin++) box("power-cooling-fin", [.023, .002, .025], [.181, .217 + fin * .007, -.126], silver, .0003);
  box("power-fuse-holder", [.018, .018, .023], [.165, .216, -.164], black);
  box("power-fuse", [.020, .007, .014], [.168, .229, -.164], red);
  label("PWR", .035, [.178, .253, -.108], true);

  // A1M8-like silhouette: offset drive motor/base and black rotating scanner.
  // Overall envelope follows SLAMTEC 96.8 × 70.3 × 55 mm; internals are illustrative.
  box("lidar-support-post", [.020, .145, .025], [.155, .258, .009], silver);
  box("lidar-support-shelf", [.120, .006, .112], [.204, .324, 0], silver);
  for (const z of [-.04, .04]) cylinder("lidar-mounting-bolt", .003, .003, [.240, .329, z], black);
  box("a1m8-base", [.0968, .006, .0703], [.216, .332, 0], black, .008);
  cylinder("a1m8-drive-motor", .012, .025, [.181, .3475, 0], black);
  cylinder("a1m8-drive-pulley", .009, .003, [.181, .362, 0], steelMaterial());
  cylinder("lidar-foot", .031, .007, [.229, .3385, 0], black);
  cylinder("lidar-optical-band", .034, .021, [.229, .3525, 0], material(0x241922, .15, .25));
  cylinder("lidar-top-shell", .035, .018, [.229, .372, 0], black);
  cylinder("lidar-cap", .021, .003, [.229, .3825, 0], black);
  label("RPLIDAR A1", .052, [.265, .371, 0], true);
  function steelMaterial() { return material(0x737f86, .5, .35); }

  // Visible harnesses with gentle bend radii, routed along the equipment tray.
  cable("battery-positive-lead", [[.047,.334,-.143],[.095,.339,-.147],[.118,.274,-.155],[.162,.240,-.164]], red, .003);
  cable("battery-negative-lead", [[.047,.334,-.077],[.100,.329,-.070],[.139,.265,-.080],[.165,.209,-.080]], wireBlack, .003);
  for (const [index, x] of [[0, -.042], [1, .084]] as const) {
    cable(`motor-power-red-${index}`, [[.166,.221,-.146],[.180,.199,-.05],[.161,.200,.158],[x,.211,.226],[x-.025,.227,.224]], red);
    cable(`motor-power-black-${index}`, [[.166,.209,-.079],[.174,.193,.02],[.150,.194,.166],[x+.006,.206,.235],[x+.010,.227,.224]], wireBlack);
    cable(`motor-output-${index}`, [[x,.308,.224],[x+.027,.325,.238],[.174,.284,.245],[.175,.186,.243],[.175,.09,index ? -.20 : .20]], yellow, .0025);
    cable(`motor-return-${index}`, [[x+.014,.308,.224],[x+.037,.335,.235],[.181,.280,.245],[.181,.185,.243],[.181,.09,index ? -.21 : .21]], wireBlack, .0025);
    cable(`controller-signal-${index}`, [[espX+.022,.265,.219],[espX+.040,.250,.238],[x-.040,.251,.241],[x-.040,.282,.214]], signal, .0012);
  }
  // Harness runs to the upper compute bay, not to the ESP32 USB connector.
  cable("lidar-data-cable", [[.181,.338,-.025],[.170,.318,-.014],[.126,.343,.164],[-.125,.344,.224],[-.183,.38,.226]], wireBlack, .002);
  cable("mast-cable-loom", [[espX,.305,.215],[-.183,.351,.226],[-.183,.450,.226],[-.183,.740,.226],[.09,.780,.06]], wireBlack, .004);
  for (const y of [.380,.480,.600,.720]) box("harness-clip", [.026,.007,.008], [-.183,y,.231], black);
  // Additional connectors on the carrier make the peripheral harness legible.
  box("peripheral-connector", [.020,.010,.009], [-.14,.318,.210], white);
  return group;
}
