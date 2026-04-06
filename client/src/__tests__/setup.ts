import '@testing-library/jest-dom/vitest';
import React from 'react';

// Mock fetch globally
globalThis.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  } as Response)
);

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target: object, prop: string | symbol) => {
      if (typeof prop === 'string') {
        return (props: Record<string, unknown>) => {
          const { children, ...rest } = props;
          const htmlProps: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(rest)) {
            if (!['initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap', 'layout', 'layoutId'].includes(key)) {
              htmlProps[key] = value;
            }
          }
          return React.createElement(prop as string, htmlProps, children as React.ReactNode);
        };
      }
      return undefined;
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  useInView: () => true,
  useAnimation: () => ({ start: vi.fn(), set: vi.fn() }),
}));
