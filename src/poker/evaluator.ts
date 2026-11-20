import { Card, EvaluatedHand, HandCategory, Rank, Suit } from './types';

export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export const RANK_LABEL: Record<Rank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

export const RANK_NAME: Record<Rank, string> = {
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
  14: 'Ace',
};

export const RANK_PLURAL: Record<Rank, string> = {
  2: 'Twos',
  3: 'Threes',
  4: 'Fours',
  5: 'Fives',
  6: 'Sixes',
  7: 'Sevens',
  8: 'Eights',
  9: 'Nines',
  10: 'Tens',
  11: 'Jacks',
  12: 'Queens',
  13: 'Kings',
  14: 'Aces',
};

export const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'High Card',
  [HandCategory.OnePair]: 'One Pair',
  [HandCategory.TwoPair]: 'Two Pair',
  [HandCategory.ThreeOfAKind]: 'Three of a Kind',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full House',
  [HandCategory.FourOfAKind]: 'Four of a Kind',
  [HandCategory.StraightFlush]: 'Straight Flush',
  [HandCategory.RoyalFlush]: 'Royal Flush',
};

/**
 * Helper to parse a shorthand string like "As", "10h", "Td", "2c" into a Card object.
 */
export function parseCard(code: string): Card {
  const trimmed = code.trim();
  const suitChar = trimmed.slice(-1).toLowerCase();
  const rankStr = trimmed.slice(0, -1).toUpperCase();

  const suitMap: Record<string, Suit> = {
    s: 'spades',
    h: 'hearts',
    d: 'diamonds',
    c: 'clubs',
  };
  const rankMap: Record<string, Rank> = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
  };

  const suit = suitMap[suitChar];
  const rank = rankMap[rankStr];
  if (!suit || !rank) {
    throw new Error(`Invalid card code: "${code}"`);
  }
  return {
    suit,
    rank,
    id: `${RANK_LABEL[rank]}${suitChar}`,
  };
}

/**
 * Computes a deterministic numeric score from category and up to 5 tiebreaker ranks (base 15).
 */
function computeScore(category: HandCategory, tiebreakers: number[]): number {
  let score = category * Math.pow(15, 5);
  for (let i = 0; i < 5; i++) {
    const val = tiebreakers[i] ?? 0;
    score += val * Math.pow(15, 4 - i);
  }
  return score;
}

/**
 * Evaluates an exact 5-card hand and returns its EvaluatedHand representation.
 */
export function evaluateFiveCardHand(fiveCards: Card[]): EvaluatedHand {
  if (fiveCards.length !== 5) {
    throw new Error(`Expected 5 cards, received ${fiveCards.length}`);
  }

  // Sort descending by rank
  const sorted = [...fiveCards].sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map((c) => c.rank);
  const suits = sorted.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);

  // Check Straight (including Ace-low A-2-3-4-5 wheel)
  let isStraight = false;
  let straightHighRank: Rank = ranks[0];
  let orderedBestFive = sorted;

  const uniqueRanks = Array.from(new Set(ranks));
  if (uniqueRanks.length === 5) {
    if (ranks[0] - ranks[4] === 4) {
      isStraight = true;
      straightHighRank = ranks[0];
    } else if (
      ranks[0] === 14 &&
      ranks[1] === 5 &&
      ranks[2] === 4 &&
      ranks[3] === 3 &&
      ranks[4] === 2
    ) {
      // 5-high wheel straight (5-4-3-2-A)
      isStraight = true;
      straightHighRank = 5;
      orderedBestFive = [sorted[1], sorted[2], sorted[3], sorted[4], sorted[0]];
    }
  }

  // Count frequencies of each rank
  const counts = new Map<Rank, Card[]>();
  for (const card of sorted) {
    const group = counts.get(card.rank) || [];
    group.push(card);
    counts.set(card.rank, group);
  }

  // Sort rank groups by (count DESC, rank DESC)
  const groups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return b[0] - a[0];
  });

  // 1. Royal Flush & 2. Straight Flush
  if (isFlush && isStraight) {
    if (straightHighRank === 14) {
      const tiebreakers = [14];
      return {
        category: HandCategory.RoyalFlush,
        categoryName: CATEGORY_NAMES[HandCategory.RoyalFlush],
        description: 'Royal Flush',
        score: computeScore(HandCategory.RoyalFlush, tiebreakers),
        tiebreakers,
        bestFive: orderedBestFive,
        bestFiveIds: orderedBestFive.map((c) => c.id),
      };
    }
    const tiebreakers = [straightHighRank];
    return {
      category: HandCategory.StraightFlush,
      categoryName: CATEGORY_NAMES[HandCategory.StraightFlush],
      description: `Straight Flush, ${RANK_NAME[straightHighRank]} High`,
      score: computeScore(HandCategory.StraightFlush, tiebreakers),
      tiebreakers,
      bestFive: orderedBestFive,
      bestFiveIds: orderedBestFive.map((c) => c.id),
    };
  }

  // 3. Four of a Kind
  if (groups[0][1].length === 4) {
    const quadRank = groups[0][0];
    const kickerRank = groups[1][0];
    const arranged = [...groups[0][1], ...groups[1][1]];
    const tiebreakers = [quadRank, kickerRank];
    return {
      category: HandCategory.FourOfAKind,
      categoryName: CATEGORY_NAMES[HandCategory.FourOfAKind],
      description: `Four of a Kind, ${RANK_PLURAL[quadRank]}`,
      score: computeScore(HandCategory.FourOfAKind, tiebreakers),
      tiebreakers,
      bestFive: arranged,
      bestFiveIds: arranged.map((c) => c.id),
    };
  }

  // 4. Full House
  if (groups[0][1].length === 3 && groups[1][1].length === 2) {
    const tripRank = groups[0][0];
    const pairRank = groups[1][0];
    const arranged = [...groups[0][1], ...groups[1][1]];
    const tiebreakers = [tripRank, pairRank];
    return {
      category: HandCategory.FullHouse,
      categoryName: CATEGORY_NAMES[HandCategory.FullHouse],
      description: `Full House, ${RANK_PLURAL[tripRank]} full of ${RANK_PLURAL[pairRank]}`,
      score: computeScore(HandCategory.FullHouse, tiebreakers),
      tiebreakers,
      bestFive: arranged,
      bestFiveIds: arranged.map((c) => c.id),
    };
  }

  // 5. Flush
  if (isFlush) {
    const tiebreakers = ranks;
    return {
      category: HandCategory.Flush,
      categoryName: CATEGORY_NAMES[HandCategory.Flush],
      description: `Flush, ${RANK_NAME[ranks[0]]} High`,
      score: computeScore(HandCategory.Flush, tiebreakers),
      tiebreakers,
      bestFive: sorted,
      bestFiveIds: sorted.map((c) => c.id),
    };
  }

  // 6. Straight
  if (isStraight) {
    const tiebreakers = [straightHighRank];
    return {
      category: HandCategory.Straight,
      categoryName: CATEGORY_NAMES[HandCategory.Straight],
      description: `Straight, ${RANK_NAME[straightHighRank]} High`,
      score: computeScore(HandCategory.Straight, tiebreakers),
      tiebreakers,
      bestFive: orderedBestFive,
      bestFiveIds: orderedBestFive.map((c) => c.id),
    };
  }

  // 7. Three of a Kind
  if (groups[0][1].length === 3) {
    const tripRank = groups[0][0];
    const kicker1 = groups[1][0];
    const kicker2 = groups[2][0];
    const arranged = [...groups[0][1], ...groups[1][1], ...groups[2][1]];
    const tiebreakers = [tripRank, kicker1, kicker2];
    return {
      category: HandCategory.ThreeOfAKind,
      categoryName: CATEGORY_NAMES[HandCategory.ThreeOfAKind],
      description: `Three of a Kind, ${RANK_PLURAL[tripRank]}`,
      score: computeScore(HandCategory.ThreeOfAKind, tiebreakers),
      tiebreakers,
      bestFive: arranged,
      bestFiveIds: arranged.map((c) => c.id),
    };
  }

  // 8. Two Pair
  if (groups[0][1].length === 2 && groups[1][1].length === 2) {
    const highPair = groups[0][0];
    const lowPair = groups[1][0];
    const kicker = groups[2][0];
    const arranged = [...groups[0][1], ...groups[1][1], ...groups[2][1]];
    const tiebreakers = [highPair, lowPair, kicker];
    return {
      category: HandCategory.TwoPair,
      categoryName: CATEGORY_NAMES[HandCategory.TwoPair],
      description: `Two Pair, ${RANK_PLURAL[highPair]} and ${RANK_PLURAL[lowPair]}`,
      score: computeScore(HandCategory.TwoPair, tiebreakers),
      tiebreakers,
      bestFive: arranged,
      bestFiveIds: arranged.map((c) => c.id),
    };
  }

  // 9. One Pair
  if (groups[0][1].length === 2) {
    const pairRank = groups[0][0];
    const k1 = groups[1][0];
    const k2 = groups[2][0];
    const k3 = groups[3][0];
    const arranged = [
      ...groups[0][1],
      ...groups[1][1],
      ...groups[2][1],
      ...groups[3][1],
    ];
    const tiebreakers = [pairRank, k1, k2, k3];
    return {
      category: HandCategory.OnePair,
      categoryName: CATEGORY_NAMES[HandCategory.OnePair],
      description: `Pair of ${RANK_PLURAL[pairRank]}`,
      score: computeScore(HandCategory.OnePair, tiebreakers),
      tiebreakers,
      bestFive: arranged,
      bestFiveIds: arranged.map((c) => c.id),
    };
  }

  // 10. High Card
  const tiebreakers = ranks;
  return {
    category: HandCategory.HighCard,
    categoryName: CATEGORY_NAMES[HandCategory.HighCard],
    description: `High Card, ${RANK_NAME[ranks[0]]}`,
    score: computeScore(HandCategory.HighCard, tiebreakers),
    tiebreakers,
    bestFive: sorted,
    bestFiveIds: sorted.map((c) => c.id),
  };
}

/**
 * Evaluates 5, 6, or 7 cards and returns the best 5-card Texas Hold'em hand.
 * Also supports 2-card pre-flop strength preview so the UI can show current pair/high card.
 */
export function evaluateHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) {
    // Pre-flop or partial evaluation (e.g. 2 hole cards)
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    if (sorted.length >= 2 && sorted[0].rank === sorted[1].rank) {
      const pairRank = sorted[0].rank;
      return {
        category: HandCategory.OnePair,
        categoryName: CATEGORY_NAMES[HandCategory.OnePair],
        description: `Pocket ${RANK_PLURAL[pairRank]}`,
        score: computeScore(HandCategory.OnePair, [pairRank]),
        tiebreakers: [pairRank],
        bestFive: sorted,
        bestFiveIds: sorted.map((c) => c.id),
      };
    }
    const highRank = sorted[0]?.rank ?? 2;
    return {
      category: HandCategory.HighCard,
      categoryName: CATEGORY_NAMES[HandCategory.HighCard],
      description: `${RANK_NAME[highRank]} High`,
      score: computeScore(
        HandCategory.HighCard,
        sorted.map((c) => c.rank)
      ),
      tiebreakers: sorted.map((c) => c.rank),
      bestFive: sorted,
      bestFiveIds: sorted.map((c) => c.id),
    };
  }

  if (cards.length === 5) {
    return evaluateFiveCardHand(cards);
  }

  // Generate all C(n, 5) combinations (for 7 cards, 21 combinations; for 6 cards, 6 combinations)
  let bestEval: EvaluatedHand | null = null;
  const n = cards.length;

  for (let i = 0; i < n - 4; i++) {
    for (let j = i + 1; j < n - 3; j++) {
      for (let k = j + 1; k < n - 2; k++) {
        for (let l = k + 1; l < n - 1; l++) {
          for (let m = l + 1; m < n; m++) {
            const combo = [cards[i], cards[j], cards[k], cards[l], cards[m]];
            const current = evaluateFiveCardHand(combo);
            if (!bestEval || compareEvaluatedHands(current, bestEval) > 0) {
              bestEval = current;
            }
          }
        }
      }
    }
  }

  return bestEval!;
}

/**
 * Compares two EvaluatedHands:
 * Returns > 0 if handA > handB, < 0 if handA < handB, and 0 if exact tie.
 */
export function compareEvaluatedHands(
  handA: EvaluatedHand,
  handB: EvaluatedHand
): number {
  if (handA.category !== handB.category) {
    return handA.category - handB.category;
  }
  const len = Math.max(handA.tiebreakers.length, handB.tiebreakers.length);
  for (let i = 0; i < len; i++) {
    const a = handA.tiebreakers[i] ?? 0;
    const b = handB.tiebreakers[i] ?? 0;
    if (a !== b) return a - b;
  }
  return 0;
}
