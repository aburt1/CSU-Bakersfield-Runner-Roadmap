import * as THREE from 'three';

/**
 * Decorative 3D sign post — no interactivity.
 * All interaction happens in the HTML StepCard overlay.
 */
export default function SignPost3D({ index, position, milestonePosition, completed }) {
  return (
    <group>
      {/* Sign post */}
      <group position={[position.x, 0, position.z]}>
        {/* Wooden post */}
        <mesh position={[0, 1.2, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.08, 2.4, 8]} />
          <meshStandardMaterial color="#8B6914" roughness={0.7} />
        </mesh>

        {/* Post base */}
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.15, 0.18, 0.04, 8]} />
          <meshStandardMaterial color="#6B5210" roughness={0.8} />
        </mesh>

        {/* Sign board */}
        <mesh position={[0, 2.6, 0]} castShadow>
          <boxGeometry args={[1.6, 1.0, 0.06]} />
          <meshStandardMaterial
            color="#003594"
            emissive={completed ? '#FFC72C' : '#000000'}
            emissiveIntensity={completed ? 0.2 : 0}
            roughness={0.4}
          />
        </mesh>

        {/* Gold frame when completed */}
        {completed && (
          <mesh position={[0, 2.6, 0.04]}>
            <boxGeometry args={[1.7, 1.1, 0.02]} />
            <meshStandardMaterial
              color="#FFC72C"
              emissive="#FFC72C"
              emissiveIntensity={0.3}
              transparent
              opacity={0.5}
            />
          </mesh>
        )}

        {/* Gold glow light for completed */}
        {completed && (
          <pointLight position={[0, 2.6, 0.5]} color="#FFC72C" intensity={2} distance={4} decay={2} />
        )}
      </group>

      {/* Milestone dot on road surface */}
      <mesh
        position={[milestonePosition.x, 0.025, milestonePosition.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.25, 24]} />
        <meshStandardMaterial
          color={completed ? '#FFC72C' : '#ffffff'}
          emissive={completed ? '#FFC72C' : '#000000'}
          emissiveIntensity={completed ? 0.4 : 0}
        />
      </mesh>
    </group>
  );
}
