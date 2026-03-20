import { motion } from 'framer-motion';
import TimelineStep from './TimelineStep';

export default function RoadmapTimeline({ steps, completedDates, onSelectStep }) {
  return (
    <section aria-label="Admissions roadmap steps">
      <ol className="relative" aria-label="Admissions steps in order">
        {/* Vertical timeline spine */}
        <div
          className="absolute left-5 sm:left-6 top-0 bottom-0 w-0.5 bg-gray-200"
          aria-hidden="true"
        />

        {steps.map((step, index) => (
          <TimelineStep
            key={step.id}
            step={step}
            index={index}
            completedAt={completedDates[step.id]}
            isLast={index === steps.length - 1}
            onSelect={() => onSelectStep(step)}
          />
        ))}
      </ol>
    </section>
  );
}
