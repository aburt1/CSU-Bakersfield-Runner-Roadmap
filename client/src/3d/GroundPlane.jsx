import * as THREE from 'three';

export default function GroundPlane() {
  return (
    <group>
      {/* Main grass ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, -19]} receiveShadow>
        <planeGeometry args={[40, 50]} />
        <meshStandardMaterial
          color="#5a9e3e"
          roughness={1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Lighter grass patches */}
      {[
        [3, -5], [-4, -12], [5, -20], [-3, -28], [4, -35],
      ].map(([x, z], i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[x, 0.001, z]}
        >
          <circleGeometry args={[2 + i * 0.3, 16]} />
          <meshStandardMaterial
            color="#6ab844"
            roughness={1}
            transparent
            opacity={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}
