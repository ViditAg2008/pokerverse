export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string; // e.g., "As", "10h", "2c"
}

export enum HandCategory {
  HighCard = 1,
  OnePair = 2,
  TwoPair = 3,
  ThreeOfAKind = 4,
  Straight = 5,
  Flush = 6,
  FullHouse = 7,
  FourOfAKind = 8,
  StraightFlush = 9,
  RoyalFlush = 10,
}

export interface EvaluatedHand {
  category: HandCategory;
  categoryName: string;
  description: string; // e.g., "Full House, Aces full of Kings"
  score: number; // Numerical score for deterministic comparison
  tiebreakers: number[]; // Ordered ranks used for tie-breaking
  bestFive: Card[]; // The exact 5 cards forming the hand
  bestFiveIds: string[];
}

export type GamePhase =
  | 'WAITING'
  | 'PREFLOP'
  | 'FLOP'
  | 'TURN'
  | 'RIVER'
  | 'SHOWDOWN';

export type BettingActionType =
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'all-in';

export type AIDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type AIPersonality = 'conservative' | 'aggressive' | 'balanced' | 'unpredictable';

export interface PlayerActionRecord {
  playerId: string;
  playerName: string;
  type: BettingActionType;
  amount: number;
  phase: GamePhase;
  timestamp: number;
}

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
  name: string; // "Main Pot", "Side Pot 1", etc.
}

export interface PotAward {
  potName: string;
  amount: number;
  winnerIds: string[];
  winnerNames: string[];
  winningHandName?: string;
  winningCardIds: string[];
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  seatIndex: number; // 0 to maxPlayers - 1
  chips: number;
  holeCards: Card[];
  currentBet: number; // Bet in current betting round
  totalBetInHand: number; // Cumulative bet across the entire hand
  folded: boolean;
  allIn: boolean;
  isAI: boolean;
  aiDifficulty?: AIDifficulty;
  aiPersonality?: AIPersonality;
  connected: boolean;
  isSpectator: boolean;
  hasActedInRound: boolean;
  lastAction?: {
    type: BettingActionType | 'sb' | 'bb' | 'thinking';
    amount?: number;
  };
  evaluatedHand?: EvaluatedHand;
}

/**
 * Sanitized player state sent to clients so opponents' hole cards remain strictly hidden
 * until a non-folded Showdown.
 */
export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  seatIndex: number;
  chips: number;
  holeCards: (Card | null)[]; // null means face-down hidden card
  cardCount: number;
  currentBet: number;
  totalBetInHand: number;
  folded: boolean;
  allIn: boolean;
  isAI: boolean;
  aiDifficulty?: AIDifficulty;
  aiPersonality?: AIPersonality;
  connected: boolean;
  isSpectator: boolean;
  lastAction?: {
    type: BettingActionType | 'sb' | 'bb' | 'thinking';
    amount?: number;
  };
  evaluatedHand?: EvaluatedHand;
}

export interface RoomConfig {
  minPlayers: number;
  maxPlayers: number;
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  turnTimerSeconds: number; // 0 = unlimited, e.g. 30s
  isPrivate: boolean;
  allowSpectators: boolean;
  mode: 'ai' | 'multiplayer';
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  minBetOrRaiseTo: number; // Total bet in current street required for a minimum valid bet/raise
  maxBetOrRaiseTo: number; // Total bet in current street if going all-in
  canAllIn: boolean;
  allInAmount: number; // Additional chips player puts in on All-In
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  emote?: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface HandHistorySummary {
  handId: string;
  roomCode: string;
  handNumber: number;
  timestamp: number;
  communityCards: Card[];
  totalPot: number;
  awards: PotAward[];
  actions: PlayerActionRecord[];
  players: {
    id: string;
    name: string;
    isAI: boolean;
    startingChips: number;
    endingChips: number;
    netChange: number;
    holeCards?: Card[];
    folded: boolean;
    handName?: string;
  }[];
}

export interface PlayerStats {
  playerName: string;
  avatar: string;
  handsPlayed: number;
  handsWon: number;
  totalGamesSessions: number;
  biggestPotWon: number;
  totalChipsWon: number;
  bestHandCategory: number;
  bestHandName: string;
  opponentsPlayed: Record<string, number>;
  recentHands: HandHistorySummary[];
}

export interface ClientGameState {
  roomId: string;
  roomCode: string;
  hostId: string;
  config: RoomConfig;
  phase: GamePhase;
  handNumber: number;
  players: PublicPlayer[];
  spectators: { id: string; name: string; avatar: string }[];
  dealerSeatIndex: number;
  smallBlindSeatIndex: number;
  bigBlindSeatIndex: number;
  activePlayerId: string | null;
  turnDeadline: number | null;
  communityCards: Card[];
  pot: number;
  pots: Pot[];
  currentBet: number;
  minRaiseDelta: number;
  awards: PotAward[];
  winningCardIds: string[];
  actionLog: PlayerActionRecord[];
  chatMessages: ChatMessage[];
  myPlayerId: string;
  myLegalActions: LegalActions | null;
  myEvaluatedHand: EvaluatedHand | null;
}
