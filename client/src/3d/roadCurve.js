import * as THREE from 'three';

/**
 * Convert SVG road coordinates to 3D world space.
 * SVG viewBox: 0 0 1000 1900
 * Three.js: X(-10..10), Y(up), Z(0..-38)
 */
function s2w(svgX, svgY) {
  return new THREE.Vector3(
    (svgX / 1000) * 20 - 10,
    0,
    -(svgY / 1900) * 38
  );
}

// Waypoints matching the SVG S-curve road path.
// The SVG alternates horizontal lanes at y=120,340,...,1840
// with x bouncing between 150 (left) and 850 (right).
const waypoints = [
  // Lane 1: left → right (y=120)
  s2w(150, 120),
  s2w(500, 120),
  s2w(850, 120),
  // Curve right → down
  s2w(920, 200),
  s2w(920, 270),
  // Lane 2: right → left (y=340)
  s2w(850, 340),
  s2w(500, 340),
  s2w(150, 340),
  // Curve left → down
  s2w(80, 420),
  s2w(80, 490),
  // Lane 3: left → right (y=560)
  s2w(150, 560),
  s2w(500, 560),
  s2w(850, 560),
  // Curve right → down
  s2w(920, 640),
  s2w(920, 710),
  // Lane 4: right → left (y=780)
  s2w(850, 780),
  s2w(500, 780),
  s2w(150, 780),
  // Curve left → down
  s2w(80, 860),
  s2w(80, 930),
  // Lane 5: left → right (y=1000)
  s2w(150, 1000),
  s2w(500, 1000),
  s2w(850, 1000),
  // Curve right → down
  s2w(920, 1080),
  s2w(920, 1150),
  // Lane 6: right → left (y=1220)
  s2w(850, 1220),
  s2w(500, 1220),
  s2w(150, 1220),
  // Curve left → down
  s2w(80, 1300),
  s2w(80, 1370),
  // Lane 7: left → right (y=1440)
  s2w(150, 1440),
  s2w(500, 1440),
  s2w(850, 1440),
  // Curve right → down
  s2w(920, 1520),
  s2w(920, 1590),
  // Lane 8: right → left (y=1660)
  s2w(850, 1660),
  s2w(500, 1660),
  s2w(150, 1660),
  // Curve left → down
  s2w(80, 1740),
  s2w(80, 1790),
  // Lane 9: partial left → center (y=1840)
  s2w(150, 1840),
  s2w(500, 1840),
];

export const roadCurve = new THREE.CatmullRomCurve3(waypoints, false, 'catmullrom', 0.25);

// Step positions: fraction along the curve for each of the 9 steps
// Placed at the midpoint of each lane
export const STEP_FRACTIONS = [
  0.025,  // Step 1: start of lane 1
  0.145,  // Step 2: lane 2
  0.26,   // Step 3: lane 3
  0.375,  // Step 4: lane 4
  0.49,   // Step 5: lane 5
  0.605,  // Step 6: lane 6
  0.72,   // Step 7: lane 7
  0.835,  // Step 8: lane 8
  0.97,   // Step 9: lane 9 (end)
];

// Which side each sign sits on (relative to road direction)
export const STEP_SIDES = [
  'left', 'right', 'left', 'right', 'left', 'right', 'left', 'right', 'left',
];

/**
 * Get a 3D position for a step sign, offset to the side of the road.
 */
export function getStepPosition(index, sideOffset = 2.5) {
  const t = STEP_FRACTIONS[index];
  const point = roadCurve.getPoint(t);
  const tangent = roadCurve.getTangent(t);
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();

  const side = STEP_SIDES[index];
  const mult = side === 'right' ? 1 : -1;

  return new THREE.Vector3(
    point.x + normal.x * sideOffset * mult,
    0,
    point.z + normal.z * sideOffset * mult
  );
}

/**
 * Get the road-surface position for a milestone dot.
 */
export function getMilestonePosition(index) {
  const t = STEP_FRACTIONS[index];
  return roadCurve.getPoint(t);
}

// Camera path: elevated view following the road
export function getCameraPosition(t) {
  const roadPos = roadCurve.getPoint(Math.min(t, 1));
  // Height 18, offset +10 on Z (behind the road point), slight X centering
  return new THREE.Vector3(roadPos.x * 0.15, 18, roadPos.z + 10);
}

export function getCameraLookAt(t) {
  const lookT = Math.min(t + 0.04, 1);
  const target = roadCurve.getPoint(lookT);
  // Look slightly above the road surface
  return new THREE.Vector3(target.x, 0.5, target.z);
}
