import { Float } from '@react-three/drei';

function Tree({ position, scale = 1 }) {
  return (
    <Float speed={0.5} rotationIntensity={0.1} floatIntensity={0.2}>
      <group position={position} scale={scale}>
        {/* Trunk */}
        <mesh position={[0, 0.6, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.12, 1.2, 6]} />
          <meshStandardMaterial color="#8B6914" roughness={0.8} />
        </mesh>
        {/* Foliage layers */}
        <mesh position={[0, 1.6, 0]} castShadow>
          <coneGeometry args={[0.6, 1.2, 7]} />
          <meshStandardMaterial color="#4CAF50" roughness={0.8} flatShading />
        </mesh>
        <mesh position={[0, 2.1, 0]} castShadow>
          <coneGeometry args={[0.45, 0.9, 7]} />
          <meshStandardMaterial color="#66BB6A" roughness={0.8} flatShading />
        </mesh>
        <mesh position={[0, 2.5, 0]} castShadow>
          <coneGeometry args={[0.3, 0.7, 7]} />
          <meshStandardMaterial color="#81C784" roughness={0.8} flatShading />
        </mesh>
      </group>
    </Float>
  );
}

// Tree positions along the road edges
const TREE_POSITIONS = [
  // Left side
  [-8, 0, -1], [-9, 0, -5], [-7.5, 0, -10], [-9, 0, -15],
  [-8, 0, -20], [-9, 0, -25], [-7.5, 0, -30], [-8.5, 0, -35],
  // Right side
  [8, 0, -3], [9, 0, -7], [7.5, 0, -12], [9, 0, -17],
  [8, 0, -22], [9, 0, -27], [7.5, 0, -32], [8.5, 0, -37],
  // Scattered extras
  [-6, 0, -8], [6, 0, -14], [-5, 0, -19], [7, 0, -28],
];

const TREE_SCALES = [
  1.0, 0.8, 1.2, 0.9, 1.1, 0.7, 1.0, 0.85,
  0.9, 1.1, 0.8, 1.0, 1.2, 0.85, 0.9, 1.0,
  0.7, 1.3, 0.6, 0.95,
];

export default function Trees() {
  return (
    <group>
      {TREE_POSITIONS.map((pos, i) => (
        <Tree
          key={i}
          position={pos}
          scale={TREE_SCALES[i] || 1}
        />
      ))}
    </group>
  );
}
