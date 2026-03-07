import { useState, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ScrollControls } from '@react-three/drei';
import { AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import ProgressBar from './components/ProgressBar';
import Celebration from './components/Celebration';
import RoadScene3D from './3d/RoadScene3D';
import { STEPS } from './data/steps';
import { useProgress } from './hooks/useProgress';

export default function App() {
  const { completedSteps, toggleStep, loading } = useProgress();
  const [showCelebration, setShowCelebration] = useState(false);
  const totalSteps = STEPS.length;
  const completedCount = completedSteps.size;

  // Trigger celebration when all steps completed
  useEffect(() => {
    if (completedCount === totalSteps && totalSteps > 0) {
      setShowCelebration(true);
    }
  }, [completedCount, totalSteps]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-200">
        <div className="text-center">
          <div className="text-6xl animate-bounce-slow mb-4">🐦</div>
          <p className="text-csub-blue font-display text-xl font-bold">
            Loading your roadmap...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen relative overflow-hidden">
      {/* HTML overlays - above the 3D canvas */}
      <div className="fixed top-0 left-0 right-0 z-30 pointer-events-auto">
        <Header />
        <ProgressBar completed={completedCount} total={totalSteps} />
      </div>

      {/* Full-viewport 3D Canvas */}
      <Canvas
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={['#87CEEB']} />

        <Suspense fallback={null}>
          <ScrollControls pages={5} damping={0.25}>
            <RoadScene3D
              steps={STEPS}
              completedSteps={completedSteps}
              onToggleStep={toggleStep}
            />
          </ScrollControls>
        </Suspense>
      </Canvas>

      {/* Celebration overlay - above everything */}
      <AnimatePresence>
        {showCelebration && (
          <div className="fixed inset-0 z-50">
            <Celebration onClose={() => setShowCelebration(false)} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
