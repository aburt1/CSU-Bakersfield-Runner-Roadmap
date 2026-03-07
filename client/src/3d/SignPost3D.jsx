import { useRef } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import RoadStep from '../components/RoadStep';
import { getMilestonePosition } from './roadCurve';

export default function SignPost3D({ step, index, completed, onToggle, side, position }) {
  const groupRef = useRef();
  const milestonePos = getMilestonePosition(index);

  return (
    <group>
      {/* Sign post group at offset position */}
      <group ref={groupRef} position={[position.x, 0, position.z]}>
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

        {/* Sign board backing (3D rectangle) */}
        <mesh position={[0, 2.6, 0]} castShadow>
          <boxGeometry args={[2, 1.4, 0.08]} />
          <meshStandardMaterial
            color={completed ? '#003594' : '#003594'}
            emissive={completed ? '#FFC72C' : '#000000'}
            emissiveIntensity={completed ? 0.15 : 0}
            roughness={0.4}
          />
        </mesh>

        {/* Gold border frame when completed */}
        {completed && (
          <mesh position={[0, 2.6, 0.05]}>
            <boxGeometry args={[2.1, 1.5, 0.02]} />
            <meshStandardMaterial
              color="#FFC72C"
              emissive="#FFC72C"
              emissiveIntensity={0.3}
              transparent
              opacity={0.6}
            />
          </mesh>
        )}

        {/* HTML card content overlay */}
        <Html
          position={[0, 2.6, 0.15]}
          distanceFactor={8}
          transform
          style={{ pointerEvents: 'auto' }}
        >
          <div
            onClick={() => onToggle(step.id)}
            className="cursor-pointer select-none"
            style={{ width: '180px' }}
          >
            <div className={`sign-card-3d ${completed ? 'completed' : ''}`}>
              <div className="step-badge">{index + 1}</div>
              <div className="flex items-start gap-2 mb-1">
                <span className="text-lg flex-shrink-0">{step.icon}</span>
                <h3 className="font-display text-xs font-bold leading-tight text-white">
                  {step.title}
                </h3>
              </div>
              {step.deadline && (
                <span className="inline-block bg-csub-gold/20 text-csub-gold-light text-[10px] font-bold rounded-full px-2 py-0.5 mb-1 font-body">
                  {step.deadline}
                </span>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[10px]
                    ${completed
                      ? 'bg-green-400 border-green-400 text-white'
                      : 'border-white/40 text-transparent'
                    }`}
                >
                  {completed ? '✓' : ''}
                </div>
                <span className="text-[10px] font-body text-white/60">
                  {completed ? 'Done!' : 'Click to complete'}
                </span>
              </div>
            </div>
          </div>
        </Html>

        {/* Glow light for completed steps */}
        {completed && (
          <pointLight
            position={[0, 2.6, 0.5]}
            color="#FFC72C"
            intensity={2}
            distance={4}
            decay={2}
          />
        )}
      </group>

      {/* Milestone dot on the road surface */}
      <group position={[milestonePos.x, 0.025, milestonePos.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.25, 24]} />
          <meshStandardMaterial
            color={completed ? '#FFC72C' : '#ffffff'}
            emissive={completed ? '#FFC72C' : '#000000'}
            emissiveIntensity={completed ? 0.4 : 0}
          />
        </mesh>
      </group>
    </group>
  );
}
