import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { roadCurve } from './roadCurve';

const UP = new THREE.Vector3(0, 1, 0);
const ROAD_WIDTH = 1.4;
const EDGE_WIDTH = 1.6;
const SEGMENTS = 300;

function buildRibbonGeometry(curve, width, yOffset = 0) {
  const points = curve.getPoints(SEGMENTS);
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < points.length; i++) {
    const t = i / (points.length - 1);
    const tangent = curve.getTangent(t);
    const normal = new THREE.Vector3().crossVectors(UP, tangent).normalize();
    const halfW = width / 2;

    const left = points[i].clone().add(normal.clone().multiplyScalar(halfW));
    const right = points[i].clone().sub(normal.clone().multiplyScalar(halfW));

    positions.push(left.x, yOffset, left.z);
    positions.push(right.x, yOffset, right.z);

    uvs.push(0, t * 40);
    uvs.push(1, t * 40);

    if (i < points.length - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Dashed center-line geometry (thin strip)
function buildDashGeometry(curve) {
  const points = curve.getPoints(SEGMENTS);
  const positions = [];
  const uvs = [];
  const indices = [];
  const dashWidth = 0.06;

  for (let i = 0; i < points.length; i++) {
    const t = i / (points.length - 1);
    const tangent = curve.getTangent(t);
    const normal = new THREE.Vector3().crossVectors(UP, tangent).normalize();

    const left = points[i].clone().add(normal.clone().multiplyScalar(dashWidth));
    const right = points[i].clone().sub(normal.clone().multiplyScalar(dashWidth));

    positions.push(left.x, 0.03, left.z);
    positions.push(right.x, 0.03, right.z);
    uvs.push(0, t * 80);
    uvs.push(1, t * 80);

    if (i < points.length - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export default function RoadMesh({ completedCount, totalSteps }) {
  const progressRef = useRef();

  const edgeGeo = useMemo(() => buildRibbonGeometry(roadCurve, EDGE_WIDTH, 0.005), []);
  const surfaceGeo = useMemo(() => buildRibbonGeometry(roadCurve, ROAD_WIDTH, 0.01), []);
  const progressGeo = useMemo(() => buildRibbonGeometry(roadCurve, ROAD_WIDTH, 0.02), []);
  const dashGeo = useMemo(() => buildDashGeometry(roadCurve), []);

  // Animate progress fill using drawRange
  const progressFraction = totalSteps > 0 ? completedCount / totalSteps : 0;
  const totalIndices = progressGeo.index ? progressGeo.index.count : 0;
  const drawCount = Math.floor(totalIndices * progressFraction);

  return (
    <group>
      {/* Road edge (slightly wider, darker) */}
      <mesh geometry={edgeGeo} receiveShadow>
        <meshStandardMaterial color="#555555" roughness={0.95} />
      </mesh>

      {/* Road surface */}
      <mesh geometry={surfaceGeo} receiveShadow>
        <meshStandardMaterial color="#3a3a3a" roughness={0.85} />
      </mesh>

      {/* Gold progress overlay */}
      <mesh ref={progressRef} geometry={progressGeo}>
        <meshStandardMaterial
          color="#FFC72C"
          transparent
          opacity={0.4}
          emissive="#FFC72C"
          emissiveIntensity={0.15}
          depthWrite={false}
        />
        {/* Control how much of the road is gold */}
        <primitive object={progressGeo} attach="geometry" drawRange-start={0} drawRange-count={drawCount} />
      </mesh>

      {/* Center dashes */}
      <mesh geometry={dashGeo}>
        <meshStandardMaterial
          color="#FFC72C"
          emissive="#FFC72C"
          emissiveIntensity={0.2}
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
