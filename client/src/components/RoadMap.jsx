import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import RoadStep from './RoadStep';
import RoadrunnerMascot from './RoadrunnerMascot';

// SVG viewBox dimensions
const VB_W = 1000;
const VB_H = 1900;

// Road path: winding S-curves from top to bottom
// Lane Y positions: 120, 340, 560, 780, 1000, 1220, 1440, 1660, 1840
const ROAD_PATH = [
  'M 150,120 H 850',
  'A 110,110 0 0 1 850,340',
  'H 150',
  'A 110,110 0 0 0 150,560',
  'H 850',
  'A 110,110 0 0 1 850,780',
  'H 150',
  'A 110,110 0 0 0 150,1000',
  'H 850',
  'A 110,110 0 0 1 850,1220',
  'H 150',
  'A 110,110 0 0 0 150,1440',
  'H 850',
  'A 110,110 0 0 1 850,1660',
  'H 150',
  'A 110,110 0 0 0 150,1840',
  'H 500',
].join(' ');

// Step positions: percentage-based for responsive layout
// Each step is at the midpoint of its lane, positioned above or below the road
const STEP_CONFIGS = [
  { x: 40, y: 3.5, side: 'left' },    // Step 1: Accepted! (lane y=120)
  { x: 60, y: 15, side: 'right' },    // Step 2: Activate Account (lane y=340)
  { x: 40, y: 27, side: 'left' },     // Step 3: Intent to Enroll (lane y=560)
  { x: 60, y: 38.5, side: 'right' },  // Step 4: CSUB Email (lane y=780)
  { x: 40, y: 50.5, side: 'left' },   // Step 5: Register Orientation (lane y=1000)
  { x: 60, y: 62, side: 'right' },    // Step 6: Attend Orientation (lane y=1220)
  { x: 40, y: 73.5, side: 'left' },   // Step 7: Meet Advisor (lane y=1440)
  { x: 60, y: 85.5, side: 'right' },  // Step 8: Housing (lane y=1660)
  { x: 50, y: 95, side: 'center' },   // Step 9: First Day! (lane y=1840)
];

// Milestone dot positions on the road (SVG coordinates)
const MILESTONE_DOTS = [
  { cx: 400, cy: 120 },  // Step 1
  { cx: 600, cy: 340 },  // Step 2
  { cx: 400, cy: 560 },  // Step 3
  { cx: 600, cy: 780 },  // Step 4
  { cx: 400, cy: 1000 }, // Step 5
  { cx: 600, cy: 1220 }, // Step 6
  { cx: 400, cy: 1440 }, // Step 7
  { cx: 600, cy: 1660 }, // Step 8
  { cx: 500, cy: 1840 }, // Step 9
];

export default function RoadMap({ steps, completedSteps, onToggleStep }) {
  const pathRef = useRef(null);
  const [pathLength, setPathLength] = useState(0);

  // Get the current step (first incomplete step) for mascot positioning
  const currentStepIndex = steps.findIndex((s) => !completedSteps.has(s.id));
  const mascotIndex = currentStepIndex === -1 ? steps.length - 1 : currentStepIndex;

  // Calculate path length for progress animation
  useEffect(() => {
    if (pathRef.current) {
      setPathLength(pathRef.current.getTotalLength());
    }
  }, []);

  // Calculate progress offset
  const completedCount = completedSteps.size;
  const progressFraction = completedCount / steps.length;
  const progressOffset = pathLength * (1 - progressFraction);

  return (
    <div className="relative w-full max-w-3xl mx-auto px-2 md:px-4 pb-16 mt-4">
      {/* SVG Road */}
      <div className="relative" style={{ aspectRatio: `${VB_W} / ${VB_H}` }}>
        <svg
          className="road-svg absolute inset-0 w-full h-full"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grass patches along the road */}
          <GrassDeco />

          {/* Road edge (slightly wider, darker) */}
          <path
            d={ROAD_PATH}
            className="road-edge"
            strokeWidth="72"
          />

          {/* Road surface */}
          <path
            d={ROAD_PATH}
            className="road-surface"
            strokeWidth="64"
          />

          {/* Road progress overlay (gold fill) */}
          <path
            ref={pathRef}
            d={ROAD_PATH}
            className="road-progress"
            strokeWidth="64"
            strokeDasharray={pathLength}
            strokeDashoffset={progressOffset}
          />

          {/* Center line dashes */}
          <path
            d={ROAD_PATH}
            className="road-dashes"
            strokeWidth="3"
          />

          {/* Milestone dots */}
          {MILESTONE_DOTS.map((dot, i) => (
            <g key={i} className={`milestone-marker ${completedSteps.has(steps[i]?.id) ? 'completed' : ''}`}>
              <circle
                cx={dot.cx}
                cy={dot.cy}
                r="18"
                fill={completedSteps.has(steps[i]?.id) ? '#FFC72C' : '#ffffff'}
                stroke={completedSteps.has(steps[i]?.id) ? '#e6a800' : '#003594'}
                strokeWidth="4"
              />
              {completedSteps.has(steps[i]?.id) ? (
                <text
                  x={dot.cx}
                  y={dot.cy + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#003594"
                  fontSize="18"
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  ✓
                </text>
              ) : (
                <text
                  x={dot.cx}
                  y={dot.cy + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#003594"
                  fontSize="14"
                  fontWeight="bold"
                  fontFamily="Fredoka, sans-serif"
                >
                  {i + 1}
                </text>
              )}
            </g>
          ))}

          {/* Start flag */}
          <g transform="translate(130, 75)">
            <rect x="0" y="0" width="6" height="45" fill="#8B4513" rx="2" />
            <rect x="6" y="0" width="28" height="18" fill="#4CAF50" rx="3" />
            <text x="12" y="13" fill="white" fontSize="10" fontWeight="bold" fontFamily="sans-serif">
              GO!
            </text>
          </g>

          {/* Finish flag */}
          <g transform="translate(510, 1795)">
            <rect x="0" y="0" width="6" height="45" fill="#8B4513" rx="2" />
            <rect x="6" y="0" width="35" height="20" rx="3" fill="#003594" />
            <text x="10" y="14" fill="#FFC72C" fontSize="9" fontWeight="bold" fontFamily="sans-serif">
              CSUB
            </text>
          </g>

          {/* Little trees along the road */}
          <TreeDeco x={60} y={200} />
          <TreeDeco x={940} y={450} />
          <TreeDeco x={60} y={700} />
          <TreeDeco x={940} y={900} />
          <TreeDeco x={60} y={1150} />
          <TreeDeco x={940} y={1350} />
          <TreeDeco x={60} y={1600} />
        </svg>

        {/* Step sign cards (positioned over SVG) */}
        {steps.map((step, i) => {
          const config = STEP_CONFIGS[i];
          if (!config) return null;

          return (
            <div
              key={step.id}
              style={{
                position: 'absolute',
                left: `${config.x}%`,
                top: `${config.y}%`,
              }}
            >
              <RoadStep
                step={step}
                index={i}
                completed={completedSteps.has(step.id)}
                onToggle={onToggleStep}
                side={config.side}
              />
            </div>
          );
        })}

        {/* Roadrunner mascot at current step */}
        <motion.div
          className="absolute z-20 pointer-events-none"
          animate={{
            left: `${STEP_CONFIGS[mascotIndex]?.x - 7}%`,
            top: `${STEP_CONFIGS[mascotIndex]?.y + 4}%`,
          }}
          transition={{ type: 'spring', stiffness: 80, damping: 15 }}
        >
          <RoadrunnerMascot />
          <motion.div
            className="bg-white rounded-lg px-2 py-1 text-[10px] font-bold text-csub-blue shadow-md
                        absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap font-display"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1 }}
          >
            {completedCount === steps.length ? 'Go Runners!' : 'You are here!'}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

/* Small decorative tree SVG */
function TreeDeco({ x, y }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x="-3" y="10" width="6" height="14" fill="#8B6914" rx="2" />
      <circle cx="0" cy="2" r="14" fill="#4CAF50" opacity="0.8" />
      <circle cx="-6" cy="8" r="10" fill="#45a049" opacity="0.7" />
      <circle cx="6" cy="6" r="11" fill="#388E3C" opacity="0.7" />
    </g>
  );
}

/* Decorative grass patches */
function GrassDeco() {
  return (
    <>
      {[150, 400, 650, 900, 1200, 1500, 1750].map((y, i) => (
        <g key={i}>
          <ellipse cx={i % 2 === 0 ? 50 : 950} cy={y} rx="40" ry="8" fill="#4CAF50" opacity="0.3" />
          <ellipse cx={i % 2 === 0 ? 950 : 50} cy={y + 50} rx="35" ry="6" fill="#66BB6A" opacity="0.25" />
        </g>
      ))}
    </>
  );
}
