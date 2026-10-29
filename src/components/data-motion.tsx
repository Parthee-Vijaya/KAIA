'use client';
import { motion, useReducedMotion } from 'motion/react';
export function DataMotion({ quiet = false }: { quiet?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <div className={`data-motion ${quiet ? 'quiet' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 1000 460" fill="none" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={quiet ? 'kaia-line-q' : 'kaia-line'}>
            <stop stopColor="#bc4d30" />
            <stop offset="1" stopColor="#006f71" />
          </linearGradient>
        </defs>
        {Array.from({ length: 15 }, (_, i) => (
          <motion.path
            key={i}
            d={`M-80 ${240 + i * 9} C170 ${100 + i * 10},260 ${435 - i * 4},480 ${270 + i * 3} S780 ${135 + i * 5},1080 ${180 + i * 8}`}
            stroke={`url(#${quiet ? 'kaia-line-q' : 'kaia-line'})`}
            strokeWidth={i === 7 ? 2 : 0.8}
            opacity={i === 7 ? 0.8 : 0.14 + i * 0.01}
            initial={false}
            animate={reduced ? {} : { pathLength: [0.82, 1, 0.82], opacity: [0.18, 0.38, 0.18] }}
            transition={{ duration: 14 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
        {Array.from({ length: 26 }, (_, i) => {
          const x = 38 + ((i * 137) % 960);
          const y = 65 + ((i * 71) % 320);
          return (
            <g key={i}>
              <path
                d={`M${x} ${y} L${Math.min(1020, x + 100)} ${y + 30}`}
                stroke="#006f71"
                opacity=".09"
              />
              <motion.circle
                cx={x}
                cy={y}
                r={i % 5 === 0 ? 4 : 2}
                fill={i % 3 ? '#006f71' : '#bc4d30'}
                initial={false}
                animate={reduced ? {} : { cy: [y, y - 7, y], opacity: [0.25, 0.7, 0.25] }}
                transition={{ duration: 7 + i * 0.3, repeat: Infinity }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
