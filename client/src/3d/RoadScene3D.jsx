import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import RoadMesh from './RoadMesh';
import GroundPlane from './GroundPlane';
import { roadCurve } from './roadCurve';

// Reusable vectors
const _camPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

export default function RoadScene3D({ scrollRef, completedSteps, totalSteps }) {
  const { camera } = useThree();

  useFrame(() => {
    const t = scrollRef.current;
    const roadPos = roadCurve.getPoint(Math.min(t, 1));
    const lookT = Math.min(t + 0.08, 1);
    const lookPos = roadCurve.getPoint(lookT);

    // High top-down view with minimal X offset
    _camPos.set(roadPos.x * 0.08, 28, roadPos.z + 8);
    _lookTarget.set(lookPos.x * 0.5, 0, lookPos.z);

    camera.position.lerp(_camPos, 0.05);
    camera.lookAt(_lookTarget);
  });

  return (
    <>
      {/* Soft flat lighting — no shadows */}
      <ambientLight intensity={0.9} color="#ffffff" />
      <directionalLight position={[5, 20, 5]} intensity={0.4} />

      {/* Ground */}
      <GroundPlane />

      {/* Road */}
      <RoadMesh completedCount={completedSteps.size} totalSteps={totalSteps} />
    </>
  );
}
