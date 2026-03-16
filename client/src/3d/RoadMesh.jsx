import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { roadCurve } from './roadCurve';

const UP = new THREE.Vector3(0, 1, 0);
const ROAD_WIDTH = 1.8;
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

export default function RoadMesh({ completedCount, totalSteps }) {
  const progressMeshRef = useRef();

  const surfaceGeo = useMemo(() => buildRibbonGeometry(roadCurve, ROAD_WIDTH, 0.01), []);
  const progressGeo = useMemo(() => buildRibbonGeometry(roadCurve, ROAD_WIDTH, 0.02), []);

  useEffect(() => {
    if (!progressGeo.index) return;
    const fraction = totalSteps > 0 ? completedCount / totalSteps : 0;
    const totalIndices = progressGeo.index.count;
    progressGeo.setDrawRange(0, Math.floor(totalIndices * fraction));
    if (progressMeshRef.current) {
      progressMeshRef.current.geometry = progressGeo;
    }
  }, [completedCount, totalSteps, progressGeo]);

  return (
    <group>
      {/* Road surface */}
      <mesh geometry={surfaceGeo}>
        <meshBasicMaterial color="#d4d4d8" />
      </mesh>

      {/* Gold progress overlay */}
      <mesh ref={progressMeshRef} geometry={progressGeo}>
        <meshBasicMaterial
          color="#FFC72C"
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
