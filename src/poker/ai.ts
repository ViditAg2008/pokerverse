import {
  AIDifficulty,
  AIPersonality,
  BettingActionType,
  Card,
  HandCategory,
} from './types';
import { evaluateHand } from './evaluator';
import { PokerEngine } from './engine';

export interface AIDecision {
  action: BettingActionType;
  amount?: number;
  reasoning?: string;
}

export interface AIBotProfile {
  name: string;
  avatar: string;
  difficulty: AIDifficulty;
  personality: AIPersonality;
  tagline: string;
}

export const AI_BOT_ROSTER: AIBotProfile[] = [
  {
    name: 'Viktor Vance',
    avatar: 'crown',
    difficulty: 'advanced',
    personality: 'aggressive',
    tagline: 'High-roller Shark · Aggressive 3-Bettor',
  },
  {
    name: 'Elena Rostova',
    avatar: 'diamond',
    difficulty: 'advanced',
    personality: 'balanced',
    tagline: 'GTO Tactician · Pot-Odds Specialist',
  },
  {
    name: 'Marcus Sterling',
    avatar: 'shield',
    difficulty: 'intermediate',
    personality: 'conservative',
    tagline: 'Tight-Solid Grinder · Plays Premium Hands',
  },
  {
    name: 'Aria Chen',
    avatar: 'flame',
    difficulty: 'intermediate',
    personality: 'unpredictable',
    tagline: 'Creative Maverick · Mixes Traps & Bluffs',
  },
  {
    name: 'Dante Moretti',
    avatar: 'spade',
    difficulty: 'beginner',
    personality: 'conservative',
    tagline: 'Casual Lounge Player · Straightforward',
  },
  {
    name: 'Chloe Mercer',
    avatar: 'star',
    difficulty: 'beginner',
    personality: 'balanced',
    tagline: 'Friendly Regular · Calls Wide',
  },
  {
    name: 'Soren Lindqvist',
    avatar: 'zap',
    difficulty: 'advanced',
    personality: 'unpredictable',
    tagline: 'Scandinavian Power Player · Fearless Pressure',
  },
];

/**
 * Evaluates pre-flop 2-card hand strength normalized between 0.0 and 1.0
 * using an enhanced Chen-inspired formula (high card value, pocket pairs, suitedness, gap).
 */
export function evaluatePreFlopStrength(holeCards: Card[]): number {
  if (holeCards.length < 2) return 0.3;
  const [c1, c2] =
    holeCards[0].rank >= holeCards[1].rank
      ? [holeCards[0], holeCards[1]]
      : [holeCards[1], holeCards[0]];

  let score = 0;

  // Base high card value
  if (c1.rank === 14) score = 10;
  else if (c1.rank === 13) score = 8;
  else if (c1.rank === 12) score = 7;
  else if (c1.rank === 11) score = 6;
  else score = c1.rank / 2;

  // Pocket pair boost
  if (c1.rank === c2.rank) {
    score = Math.max(5, score * 2);
    if (c1.rank >= 10) score += 2;
  } else {
    // Suited bonus
    if (c1.suit === c2.suit) {
      score += 2;
    }
    // Connectedness gap penalty
    const gap = c1.rank - c2.rank - 1;
    if (gap === 0) score += 1;
    else if (gap === 1) score -= 0.5;
    else if (gap === 2) score -= 1.5;
    else if (gap === 3) score -= 3;
    else score -= 4.5;
  }

  // Clamp and normalize to [0.08, 0.99]
  const normalized = Math.max(0.08, Math.min(0.99, (score + 2) / 22));
  return normalized;
}

/**
 * Evaluates post-flop hand strength and draw equity (flush draw, straight draw)
 * using ONLY the AI player's own 2 hole cards and the public community cards.
 */
export function evaluatePostFlopStrength(
  holeCards: Card[],
  communityCards: Card[]
): number {
  const allCards = [...holeCards, ...communityCards];
  const evaluated = evaluateHand(allCards);
  const boardOnly =
    communityCards.length >= 3 ? evaluateHand(communityCards) : null;

  let baseStrength = 0.2;

  switch (evaluated.category) {
    case HandCategory.RoyalFlush:
    case HandCategory.StraightFlush:
      baseStrength = 0.99;
      break;
    case HandCategory.FourOfAKind:
      baseStrength = 0.97;
      break;
    case HandCategory.FullHouse:
      baseStrength = 0.93;
      break;
    case HandCategory.Flush:
      baseStrength = 0.86;
      break;
    case HandCategory.Straight:
      baseStrength = 0.80;
      break;
    case HandCategory.ThreeOfAKind:
      baseStrength = 0.72;
      break;
    case HandCategory.TwoPair: {
      // Check if both pairs are on the board
      if (boardOnly && boardOnly.category === HandCategory.TwoPair) {
        baseStrength = 0.42;
      } else {
        baseStrength = 0.65;
      }
      break;
    }
    case HandCategory.OnePair: {
      const pairRank = evaluated.tiebreakers[0] ?? 8;
      const boardHigh = Math.max(...communityCards.map((c) => c.rank), 2);
      // If the pair is solely on the board, it doesn't help much
      if (boardOnly && boardOnly.category >= HandCategory.OnePair && boardOnly.tiebreakers[0] === pairRank) {
        baseStrength = 0.28 + ( Math.max(holeCards[0].rank, holeCards[1].rank) / 60 );
      } else if (pairRank >= boardHigh) {
        // Top pair or overpair
        baseStrength = 0.54 + ((pairRank - 7) / 45);
      } else {
        // Middle or bottom pair
        baseStrength = 0.38 + ((pairRank - 2) / 55);
      }
      break;
    }
    case HandCategory.HighCard: {
      const highHole = Math.max(holeCards[0]?.rank ?? 2, holeCards[1]?.rank ?? 2);
      baseStrength = 0.14 + (highHole / 65);
      break;
    }
  }

  // Draw detection on Flop and Turn (4 cards to a Flush or 4 cards to an Open-Ended Straight)
  if (communityCards.length < 5 && baseStrength < 0.75) {
    const suitCounts: Record<string, number> = {};
    for (const c of allCards) {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    }
    const hasFlushDraw = Object.values(suitCounts).some((cnt) => cnt === 4);
    if (hasFlushDraw) {
      baseStrength += communityCards.length === 3 ? 0.16 : 0.09;
    }

    const uniqueRanks = Array.from(new Set(allCards.map((c) => c.rank))).sort(
      (a, b) => a - b
    );
    let hasOpenStraightDraw = false;
    for (let i = 0; i <= uniqueRanks.length - 4; i++) {
      if (uniqueRanks[i + 3] - uniqueRanks[i] === 3) {
        hasOpenStraightDraw = true;
        break;
      }
    }
    if (hasOpenStraightDraw) {
      baseStrength += communityCards.length === 3 ? 0.12 : 0.07;
    }
  }

  return Math.max(0.05, Math.min(0.99, baseStrength));
}

/**
 * Computes a legal, intelligent decision for an AI player using only public table state
 * and the AI player's own 2 hole cards.
 */
export function computeAIDecision(
  engine: PokerEngine,
  playerId: string,
  randomFn: () => number = Math.random
): AIDecision {
  const player = engine.players.find((p) => p.id === playerId);
  const legal = engine.getLegalActions(playerId);

  if (!player || !legal) {
    return { action: 'fold' };
  }

  const difficulty: AIDifficulty = player.aiDifficulty || 'intermediate';
  const personality: AIPersonality = player.aiPersonality || 'balanced';

  const isPreFlop = engine.phase === 'PREFLOP';
  const rawStrength = isPreFlop
    ? evaluatePreFlopStrength(player.holeCards)
    : evaluatePostFlopStrength(player.holeCards, engine.communityCards);

  // Personality adjustments
  let aggressionMod = 0;
  let tightnessMod = 0;
  let bluffChance = 0.05;

  if (personality === 'conservative') {
    aggressionMod = -0.10;
    tightnessMod = 0.08;
    bluffChance = 0.02;
  } else if (personality === 'aggressive') {
    aggressionMod = 0.12;
    tightnessMod = -0.06;
    bluffChance = 0.14;
  } else if (personality === 'unpredictable') {
    aggressionMod = (randomFn() - 0.4) * 0.22;
    tightnessMod = (randomFn() - 0.5) * 0.12;
    bluffChance = 0.18;
  } else {
    // balanced
    aggressionMod = 0.02;
    tightnessMod = 0;
    bluffChance = 0.07;
  }

  // Position awareness for Advanced AI
  let positionBonus = 0;
  if (difficulty === 'advanced') {
    const activePlayers = engine.players.filter((p) => !p.folded);
    const isButtonOrLate =
      player.seatIndex === engine.dealerSeatIndex ||
      activePlayers.length <= 3;
    if (isButtonOrLate) {
      positionBonus = 0.06;
    }
  }

  const effectiveStrength = Math.max(
    0.05,
    Math.min(0.99, rawStrength + aggressionMod + positionBonus - tightnessMod)
  );

  const totalPot = Math.max(engine.getTotalPot(), engine.config.bigBlind);
  const toCall = Math.max(0, engine.currentBet - player.currentBet);
  const potOdds = toCall > 0 ? toCall / (totalPot + toCall) : 0;

  // 1. BEGINNER AI: Simple threshold logic
  if (difficulty === 'beginner') {
    if (legal.canCheck) {
      if (effectiveStrength > 0.62 && legal.canBet) {
        return {
          action: 'bet',
          amount: legal.minBetOrRaiseTo,
        };
      }
      return { action: 'check' };
    }

    // Facing a bet
    const callFractionOfStack = toCall / Math.max(1, player.chips);
    if (effectiveStrength > 0.78 && legal.canRaise) {
      return {
        action: 'raise',
        amount: legal.minBetOrRaiseTo,
      };
    }
    if (
      effectiveStrength > 0.34 ||
      (toCall <= engine.config.bigBlind && effectiveStrength > 0.22) ||
      (callFractionOfStack < 0.1 && effectiveStrength > 0.28)
    ) {
      return { action: 'call' };
    }
    return { action: 'fold' };
  }

  // 2. INTERMEDIATE & ADVANCED AI: Pot odds, expected value, street sizing, and strategic bluffs
  const roll = randomFn();

  // When checking is available (no bet to call)
  if (legal.canCheck) {
    const shouldValueBet = effectiveStrength >= 0.56;
    const shouldSemiBluff =
      difficulty === 'advanced' &&
      roll < bluffChance &&
      effectiveStrength >= 0.32;

    if ((shouldValueBet || shouldSemiBluff) && (legal.canBet || legal.canRaise)) {
      // Size bet between 50% and 85% of pot
      const potFactor =
        effectiveStrength > 0.8 ? 0.75 : effectiveStrength > 0.65 ? 0.6 : 0.5;
      const desiredTotal = Math.round(
        player.currentBet + Math.max(engine.config.bigBlind, totalPot * potFactor)
      );
      const clampedTotal = Math.max(
        legal.minBetOrRaiseTo,
        Math.min(legal.maxBetOrRaiseTo, desiredTotal)
      );

      const actionType = engine.currentBet === 0 ? 'bet' : 'raise';
      return { action: actionType, amount: clampedTotal };
    }

    return { action: 'check' };
  }

  // Facing a bet (toCall > 0)
  // Compare effective hand equity against required pot odds
  const requiredEquity =
    difficulty === 'advanced' ? potOdds * 0.92 : potOdds * 1.05;

  // Monster hand -> Raise or All-In
  if (effectiveStrength >= 0.76 && legal.canRaise) {
    if (effectiveStrength >= 0.90 && player.chips <= totalPot * 1.5 && legal.canAllIn) {
      return { action: 'all-in' };
    }
    const raiseSize = Math.round(
      engine.currentBet + Math.max(engine.minRaiseDelta, totalPot * 0.65)
    );
    const clampedRaise = Math.max(
      legal.minBetOrRaiseTo,
      Math.min(legal.maxBetOrRaiseTo, raiseSize)
    );
    return { action: 'raise', amount: clampedRaise };
  }

  // Advanced occasional bluff-raise when facing a small bet
  if (
    difficulty === 'advanced' &&
    legal.canRaise &&
    toCall <= totalPot * 0.35 &&
    roll < bluffChance * 0.5
  ) {
    const clampedRaise = Math.min(
      legal.maxBetOrRaiseTo,
      Math.max(legal.minBetOrRaiseTo, Math.round(engine.currentBet * 2.2))
    );
    return { action: 'raise', amount: clampedRaise };
  }

  // Profitable call based on pot odds or cheap blind defense
  const isCheapPreFlopCall =
    isPreFlop &&
    toCall <= engine.config.bigBlind &&
    effectiveStrength >= 0.25;

  if (
    legal.canCall &&
    (effectiveStrength >= requiredEquity + 0.08 || isCheapPreFlopCall)
  ) {
    // Avoid calling off entire stack with a weak/medium hand
    if (toCall >= player.chips * 0.7 && effectiveStrength < 0.58) {
      return { action: 'fold' };
    }
    return { action: 'call' };
  }

  return { action: 'fold' };
}
