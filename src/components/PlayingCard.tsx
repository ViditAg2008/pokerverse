import React from 'react';
import { motion } from 'motion/react';
import { Card, Suit } from '../poker/types';
import { RANK_LABEL, SUIT_SYMBOL } from '../poker/evaluator';

interface PlayingCardProps {
  card: Card | null; // null renders face-down card
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  highlighted?: boolean;
  dimmed?: boolean;
  fourColorDeck?: boolean;
  dealDelay?: number;
  className?: string;
}

export const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  size = 'md',
  highlighted = false,
  dimmed = false,
  fourColorDeck = false,
  dealDelay = 0,
  className = '',
}) => {
  const dimensions = {
    xs: 'w-8 h-12 sm:w-10 sm:h-14 md:w-11 md:h-16 rounded-md text-[9px] sm:text-[11px]',
    sm: 'w-9 h-13 sm:w-11 sm:h-16 rounded-md text-[10px] sm:text-xs',
    md: 'w-11 h-16 sm:w-14 sm:h-20 lg:w-16 lg:h-24 rounded-lg text-xs sm:text-sm',
    lg: 'w-16 h-24 sm:w-20 sm:h-28 rounded-xl text-base',
    xl: 'w-20 h-28 sm:w-24 sm:h-34 rounded-xl text-lg',
  }[size];

  const getSuitColor = (suit: Suit): string => {
    if (fourColorDeck) {
      switch (suit) {
        case 'spades':
          return 'text-slate-900';
        case 'hearts':
          return 'text-red-600';
        case 'diamonds':
          return 'text-blue-600';
        case 'clubs':
          return 'text-emerald-700';
      }
    }
    return suit === 'hearts' || suit === 'diamonds'
      ? 'text-red-600'
      : 'text-slate-900';
  };

  // Face-down card back
  if (!card) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.75, y: -12 }}
        animate={{ opacity: dimmed ? 0.45 : 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, delay: dealDelay, ease: [0.16, 1, 0.3, 1] }}
        className={`${dimensions} relative select-none pointer-events-none overflow-hidden bg-[#121824] border border-amber-500/40 card-shadow shrink-0 ${className}`}
        aria-label="Face-down playing card"
      >
        <div className="absolute inset-1 rounded border border-amber-400/30 bg-gradient-to-br from-[#1A2436] via-[#0F1520] to-[#1A2436] flex items-center justify-center">
          {/* Intricate geometric SVG back emblem */}
          <svg
            viewBox="0 0 60 88"
            className="w-full h-full opacity-55 text-amber-400"
            fill="none"
          >
            <rect
              x="4"
              y="4"
              width="52"
              height="80"
              rx="4"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <path
              d="M30 14L46 44L30 74L14 44L30 14Z"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <circle
              cx="30"
              cy="44"
              r="9"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M30 38L34 44L30 50L26 44L30 38Z"
              fill="currentColor"
            />
          </svg>
        </div>
      </motion.div>
    );
  }

  const rankStr = RANK_LABEL[card.rank];
  const suitSym = SUIT_SYMBOL[card.suit];
  const suitColor = getSuitColor(card.suit);
  const isCourt = card.rank >= 11 && card.rank <= 13;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: -12, rotateY: 90 }}
      animate={{
        opacity: dimmed ? 0.45 : 1,
        scale: highlighted ? 1.03 : 1,
        y: 0,
        rotateY: 0,
      }}
      transition={{ duration: 0.24, delay: dealDelay, ease: [0.16, 1, 0.3, 1] }}
      className={`${dimensions} relative select-none pointer-events-none bg-[#FAFBFD] border ${
        highlighted
          ? 'border-amber-400 ring-2 ring-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.65)]'
          : 'border-slate-300/90 card-shadow'
      } flex flex-col justify-between p-1 sm:p-1.5 shrink-0 overflow-hidden ${suitColor} ${className}`}
      aria-label={`${rankStr} of ${card.suit}`}
    >
      {/* Top-Left Index */}
      <div className="flex flex-col items-center leading-none z-10 w-fit">
        <span className="font-mono font-bold tracking-tighter text-[1.05em]">
          {rankStr}
        </span>
        <span className="text-[0.95em] leading-none mt-0.5">{suitSym}</span>
      </div>

      {/* Center Pip or Court Emblem */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {isCourt ? (
          <div className="w-[58%] h-[58%] rounded border border-current/15 flex flex-col items-center justify-center bg-current/[0.03]">
            <span className="font-display font-bold text-[1.45em] leading-none opacity-85">
              {rankStr}
            </span>
            <span className="text-[1.1em] leading-none mt-0.5">{suitSym}</span>
          </div>
        ) : (
          <span
            className={`${
              card.rank === 14 ? 'text-[2.3em]' : 'text-[1.9em]'
            } leading-none opacity-90`}
          >
            {suitSym}
          </span>
        )}
      </div>

      {/* Bottom-Right Mirrored Index */}
      <div className="flex flex-col items-center leading-none self-end rotate-180 z-10 w-fit">
        <span className="font-mono font-bold tracking-tighter text-[1.05em]">
          {rankStr}
        </span>
        <span className="text-[0.95em] leading-none mt-0.5">{suitSym}</span>
      </div>
    </motion.div>
  );
};
