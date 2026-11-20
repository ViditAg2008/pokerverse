import React from 'react';
import { motion } from 'motion/react';

interface ChipStackProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

interface ChipDenom {
  value: number;
  bg: string;
  border: string;
  ring: string;
}

const CHIP_DENOMS: ChipDenom[] = [
  {
    value: 1000,
    bg: 'bg-amber-500',
    border: 'border-amber-200',
    ring: 'ring-amber-600',
  },
  {
    value: 500,
    bg: 'bg-purple-700',
    border: 'border-purple-200',
    ring: 'ring-purple-800',
  },
  {
    value: 100,
    bg: 'bg-slate-900',
    border: 'border-amber-300',
    ring: 'ring-slate-950',
  },
  {
    value: 25,
    bg: 'bg-emerald-600',
    border: 'border-emerald-100',
    ring: 'ring-emerald-800',
  },
  {
    value: 5,
    bg: 'bg-red-600',
    border: 'border-red-100',
    ring: 'ring-red-800',
  },
  {
    value: 1,
    bg: 'bg-slate-200',
    border: 'border-slate-600',
    ring: 'ring-slate-400',
  },
];

function breakIntoChips(amount: number): ChipDenom[] {
  let rem = Math.max(0, Math.floor(amount));
  const chips: ChipDenom[] = [];

  for (const denom of CHIP_DENOMS) {
    while (rem >= denom.value && chips.length < 6) {
      chips.push(denom);
      rem -= denom.value;
    }
  }
  if (chips.length === 0 && amount > 0) {
    chips.push(CHIP_DENOMS[CHIP_DENOMS.length - 1]);
  }
  return chips;
}

export const ChipStack: React.FC<ChipStackProps> = ({
  amount,
  size = 'md',
  label,
  className = '',
}) => {
  if (amount <= 0) return null;

  const chips = breakIntoChips(amount);
  const chipSize = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  const stepPx = size === 'sm' ? 1.2 : 1.5;
  const baseOffset = ((chips.length - 1) * stepPx) / 2;

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className={`inline-flex items-center gap-1.5 bg-[#090E14]/90 border border-amber-400/45 rounded-lg px-2 py-0.5 shadow-md pointer-events-none select-none shrink-0 ${className}`}
    >
      {/* Stacked physical chips centered within fixed container */}
      <div
        className="relative flex items-center justify-center shrink-0"
        style={{
          height: size === 'lg' ? 22 : size === 'md' ? 18 : 16,
          width: size === 'lg' ? 20 : size === 'md' ? 16 : 14,
        }}
      >
        {chips.map((chip, idx) => (
          <div
            key={idx}
            style={{
              transform: `translateY(${baseOffset - idx * stepPx}px)`,
            }}
            className={`absolute ${chipSize} rounded-full ${chip.bg} border border-dashed ${chip.border} ring-1 ${chip.ring} shadow-xs flex items-center justify-center`}
          >
            <div className="w-1 h-1 rounded-full bg-white/40" />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 leading-none">
        {label && (
          <span className="text-[10px] uppercase tracking-wider text-amber-300/90 font-semibold whitespace-nowrap">
            {label}
          </span>
        )}
        <span className="font-mono font-bold text-[11px] sm:text-xs text-amber-100 tabular-nums whitespace-nowrap">
          ${amount.toLocaleString()}
        </span>
      </div>
    </motion.div>
  );
};
