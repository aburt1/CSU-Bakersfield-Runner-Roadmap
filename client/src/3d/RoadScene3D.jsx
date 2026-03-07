import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useScroll, PerspectiveCamera, Sparkles, Sky } from '@react-three/drei';
import * as THREE from 'three';
import RoadMesh from './RoadMesh';
import SignPost3D from './SignPost3D';
import Trees from './Trees';
import GroundPlane from './GroundPlane';
import {
  roadCurve,
  STEP_FRACTIONS,
  STEP_SIDES,
  getStepPosition,
  getCameraPosition,
  getCameraLookAt,
} from './roadCurve';
import RoadrunnerMascot from '../components/RoadrunnerMascot';
import { Html } from '@react-three/drei';

// Reusable vectors to avoid allocation in render loop
const _camPos = new THREE.Vector3();
const _lookAt = new THREE.Vector3();

export default function RoadScene3D({ steps, completedSteps, onToggleStep }) {
  const cameraRef = useRef();
  const scroll = useScroll();

  // Find current step for mascot
  const currentStepIndex = steps.findIndex((s) => !completedSteps.has(s.id));
  const mascotIndex = currentStepIndex === -1 ? steps.length - 1 : currentStepIndex;
  const mascotPos = getStepPosition(mascotIndex, 1.0);

  // Animate camera along the road
  useFrame(() => {
    if (!cameraRef.current) return;
    const t = scroll.offset;

    const camPos = getCameraPosition(t);
    const lookAtPos = getCameraLookAt(t);

    _camPos.copy(camPos);
    _lookAt.copy(lookAtPos);

    cameraRef.current.position.lerp(_camPos, 0.08);
    cameraRef.current.lookAt(_lookAt);
  });

  return (
    <>
      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        fov={55}
        position={[0, 14, 6]}
        near={0.1}
        far={100}
      />

      {/* Lighting */}
      <ambientLight intensity={0.5} color="#B3DCF2" />
      <directionalLight
        position={[8, 18, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={5}
        shadow-camera-bottom={-45}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
      />
      <pointLight position={[-5, 8, -15]} intensity={0.3} color="#FFC72C" />

      {/* Sky */}
      <Sky
        sunPosition={[50, 40, 20]}
        inclination={0.6}
        azimuth={0.25}
        rayleigh={0.5}
        turbidity={8}
      />

      {/* Fog-like atmosphere */}
      <fog attach="fog" args={['#b3d9f2', 30, 60]} />

      {/* Ground */}
      <GroundPlane />

      {/* Road */}
      <RoadMesh
        completedCount={completedSteps.size}
        totalSteps={steps.length}
      />

      {/* Sign posts for each step */}
      {steps.map((step, i) => {
        const pos = getStepPosition(i);
        return (
          <SignPost3D
            key={step.id}
            step={step}
            index={i}
            completed={completedSteps.has(step.id)}
            onToggle={onToggleStep}
            side={STEP_SIDES[i]}
            position={pos}
          />
        );
      })}

      {/* Roadrunner mascot */}
      <group position={[mascotPos.x, 0.5, mascotPos.z]}>
        <Html distanceFactor={8} transform style={{ pointerEvents: 'none' }}>
          <div className="flex flex-col items-center">
            <div className="bg-white rounded-lg px-2 py-1 text-[10px] font-bold text-csub-blue shadow-md font-display mb-1 whitespace-nowrap">
              {completedSteps.size === steps.length ? 'Go Runners!' : 'You are here!'}
            </div>
            <RoadrunnerMascot />
          </div>
        </Html>
      </group>

      {/* Start flag */}
      <group position={[roadCurve.getPoint(0).x - 1.5, 0, roadCurve.getPoint(0).z]}>
        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 2.4, 6]} />
          <meshStandardMaterial color="#8B4513" />
        </mesh>
        <mesh position={[0.3, 2.2, 0]}>
          <boxGeometry args={[0.6, 0.35, 0.02]} />
          <meshStandardMaterial color="#4CAF50" />
        </mesh>
      </group>

      {/* Finish flag */}
      <group position={[roadCurve.getPoint(1).x + 1.5, 0, roadCurve.getPoint(1).z]}>
        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 2.4, 6]} />
          <meshStandardMaterial color="#8B4513" />
        </mesh>
        <mesh position={[0.3, 2.2, 0]}>
          <boxGeometry args={[0.6, 0.35, 0.02]} />
          <meshStandardMaterial color="#003594" />
        </mesh>
      </group>

      {/* Trees */}
      <Trees />

      {/* Gold sparkles */}
      <Sparkles
        count={80}
        scale={[22, 4, 42]}
        position={[0, 2, -19]}
        size={3}
        speed={0.4}
        color="#FFC72C"
        opacity={0.5}
      />
    </>
  );
}
