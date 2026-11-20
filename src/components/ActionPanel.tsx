import React, { useEffect, useState } from 'react';
import { BettingActionType, LegalActions } from '../poker/types';
import { sound } from '../utils/sound';

interface ActionPanelProps {
  legalActions: LegalActions;
  currentPot: number;
  bigBlind: number;
  myCurrentBet: number;
  onAction: (action: BettingActionType, amount?: number) => void;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({
  legalActions,
  currentPot,
  bigBlind,
  myCurrentBet,
  onAction,
}) => {
  const {
    canFold,
    canCheck,
    canCall,
    callAmount,
    canBet,
    canRaise,
    minBetOrRaiseTo,
    maxBetOrRaiseTo,
    canAllIn,
    allInAmount,
  } = legalActions;

  const [betAmount, setBetAmount] = useState<number>(minBetOrRaiseTo);

  useEffect(() => {
    setBetAmount(minBetOrRaiseTo);
  }, [minBetOrRaiseTo, maxBetOrRaiseTo]);

  // Keyboard shortcuts for fast play: F = Fold, C = Check/Call, R = Bet/Raise, A = All-In
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'f' && canFold) {
        e.preventDefault();
        sound.playFold();
        onAction('fold');
      } else if (key === 'c') {
        e.preventDefault();
        if (canCheck) {
          sound.playCheck();
          onAction('check');
        } else if (canCall) {
          sound.playChips();
          onAction('call');
        }
      } else if (key === 'r' && (canBet || canRaise)) {
        e.preventDefault();
        sound.playChips();
        onAction(canBet ? 'bet' : 'raise', betAmount);
      } else if (key === 'a' && canAllIn) {
        e.preventDefault();
        sound.playChips();
        onAction('all-in');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canFold,
    canCheck,
    canCall,
    canBet,
    canRaise,
    canAllIn,
    betAmount,
    onAction,
  ]);

  const clampBet = (val: number) =>
    Math.max(minBetOrRaiseTo, Math.min(maxBetOrRaiseTo, Math.round(val)));

  const handlePresetPotFraction = (fraction: number) => {
    sound.playClick();
    const target = myCurrentBet + callAmount + Math.round((currentPot + callAmount) * fraction);
    setBetAmount(clampBet(target));
  };

  return (
    <div
      className="w-full max-w-4xl mx-auto bg-[#0D131A]/95 border border-amber-500/30 rounded-2xl p-3 sm:p-4 shadow-[0_16px_48px_rgba(0,0,0,0.85)] flex flex-col gap-3 pointer-events-auto"
      role="region"
      aria-label="Player Betting Controls"
    >
      {/* Top Row: Bet Sizing Presets + Slider + Manual Input (only shown if Bet or Raise is legal) */}
      {(canBet || canRaise) && maxBetOrRaiseTo > minBetOrRaiseTo && (
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 pb-2 border-b border-slate-800">
          {/* Quick Pot Fractions */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setBetAmount(minBetOrRaiseTo);
              }}
              className="px-2.5 py-1 text-xs font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              Min
            </button>
            <button
              type="button"
              onClick={() => handlePresetPotFraction(0.5)}
              className="px-2.5 py-1 text-xs font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              1/2 Pot
            </button>
            <button
              type="button"
              onClick={() => handlePresetPotFraction(0.75)}
              className="px-2.5 py-1 text-xs font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              3/4 Pot
            </button>
            <button
              type="button"
              onClick={() => handlePresetPotFraction(1)}
              className="px-2.5 py-1 text-xs font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              Pot
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setBetAmount(maxBetOrRaiseTo);
              }}
              className="px-2.5 py-1 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-md border border-amber-500/40 transition-colors whitespace-nowrap shrink-0"
            >
              Max
            </button>
          </div>

          {/* Range Slider + Manual Number Input */}
          <div className="flex items-center gap-3 flex-1 min-w-[200px]">
            <label htmlFor="bet-slider" className="sr-only">
              Bet or Raise Amount Slider
            </label>
            <input
              id="bet-slider"
              type="range"
              min={minBetOrRaiseTo}
              max={maxBetOrRaiseTo}
              step={Math.max(1, Math.floor(bigBlind / 2))}
              value={betAmount}
              onChange={(e) => setBetAmount(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 focus-within:border-amber-400">
              <span className="text-xs text-amber-400 font-mono mr-1">$</span>
              <label htmlFor="bet-manual-input" className="sr-only">
                Manual Bet Amount
              </label>
              <input
                id="bet-manual-input"
                type="number"
                min={minBetOrRaiseTo}
                max={maxBetOrRaiseTo}
                value={betAmount}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isNaN(val)) {
                    setBetAmount(val);
                  }
                }}
                onBlur={() => setBetAmount(clampBet(betAmount))}
                className="w-20 bg-transparent text-right font-mono font-bold text-sm text-white focus:outline-none tabular-nums"
              />
            </div>
          </div>
        </div>
      )}

      {/* Primary Action Buttons Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* 1. FOLD */}
        {canFold && (
          <button
            type="button"
            onClick={() => {
              sound.playFold();
              onAction('fold');
            }}
            className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-red-950/80 border border-slate-700 hover:border-red-500/50 text-slate-200 hover:text-red-200 font-semibold text-sm transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Fold</span>
            <span className="text-[11px] font-mono text-slate-400">[F]</span>
          </button>
        )}

        {/* 2. CHECK or CALL */}
        {canCheck && (
          <button
            type="button"
            onClick={() => {
              sound.playCheck();
              onAction('check');
            }}
            className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 border border-emerald-400/40 text-white font-semibold text-sm shadow-md transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Check</span>
            <span className="text-[11px] font-mono text-emerald-200">[C]</span>
          </button>
        )}

        {canCall && (
          <button
            type="button"
            onClick={() => {
              sound.playChips();
              onAction('call');
            }}
            className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 border border-emerald-400/40 text-white font-semibold text-sm shadow-md transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <span className="tabular-nums">
              Call ${callAmount.toLocaleString()}
            </span>
            <span className="text-[11px] font-mono text-emerald-200">[C]</span>
          </button>
        )}

        {/* 3. BET or RAISE */}
        {(canBet || canRaise) && (
          <button
            type="button"
            onClick={() => {
              sound.playChips();
              onAction(canBet ? 'bet' : 'raise', clampBet(betAmount));
            }}
            className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-md transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <span className="tabular-nums">
              {canBet ? 'Bet' : 'Raise to'} ${clampBet(betAmount).toLocaleString()}
            </span>
            <span className="text-[11px] font-mono text-slate-900/75">[R]</span>
          </button>
        )}

        {/* 4. ALL-IN */}
        {canAllIn && (
          <button
            type="button"
            onClick={() => {
              sound.playChips();
              onAction('all-in');
            }}
            className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-700 to-rose-600 hover:from-red-600 hover:to-rose-500 border border-rose-400/40 text-white font-bold text-sm shadow-md transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <span className="tabular-nums">
              All-In ${allInAmount.toLocaleString()}
            </span>
            <span className="text-[11px] font-mono text-rose-200">[A]</span>
          </button>
        )}
      </div>
    </div>
  );
};
