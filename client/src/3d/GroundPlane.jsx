import * as THREE from 'three';

export default function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, -19]}>
      <planeGeometry args={[60, 70]} />
      <meshBasicMaterial color="#b8d4a3" side={THREE.DoubleSide} />
    </mesh>
  );
}
