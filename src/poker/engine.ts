import {
  AIDifficulty,
  AIPersonality,
  BettingActionType,
  Card,
  ChatMessage,
  ClientGameState,
  EvaluatedHand,
  GamePhase,
  HandHistorySummary,
  LegalActions,
  Player,
  PlayerActionRecord,
  Pot,
  PotAward,
  PublicPlayer,
  Rank,
  RoomConfig,
  Suit,
} from './types';
import {
  compareEvaluatedHands,
  evaluateHand,
  RANK_LABEL,
} from './evaluator';

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const SUIT_SHORT: Record<Suit, string> = {
  spades: 's',
  hearts: 'h',
  diamonds: 'd',
  clubs: 'c',
};

/**
 * Generates a fresh 52-card standard poker deck.
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        id: `${RANK_LABEL[rank]}${SUIT_SHORT[suit]}`,
      });
    }
  }
  return deck;
}

/**
 * Cryptographically secure Fisher-Yates shuffle.
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const copy = [...deck];
  const n = copy.length;
  const randomBuffer = new Uint32Array(n);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(randomBuffer);
  } else {
    for (let i = 0; i < n; i++) {
      randomBuffer[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }

  for (let i = n - 1; i > 0; i--) {
    const j = randomBuffer[i] % (i + 1);
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

export class PokerEngine {
  public roomId: string;
  public roomCode: string;
  public hostId: string;
  public config: RoomConfig;
  public phase: GamePhase = 'WAITING';
  public handNumber: number = 0;
  public players: Player[] = [];
  public spectators: { id: string; name: string; avatar: string }[] = [];

  public deck: Card[] = [];
  public communityCards: Card[] = [];
  public dealerSeatIndex: number = -1;
  public smallBlindSeatIndex: number = -1;
  public bigBlindSeatIndex: number = -1;
  public activePlayerId: string | null = null;
  public turnDeadline: number | null = null;

  public currentBet: number = 0;
  public minRaiseDelta: number = 0;
  public actedSinceLastFullRaise: Set<string> = new Set();

  public pots: Pot[] = [];
  public awards: PotAward[] = [];
  public winningCardIds: string[] = [];
  public actionLog: PlayerActionRecord[] = [];
  public chatMessages: ChatMessage[] = [];
  public handHistory: HandHistorySummary[] = [];

  private handStartingChips: Map<string, number> = new Map();

  constructor(
    roomId: string,
    roomCode: string,
    hostId: string,
    config?: Partial<RoomConfig>
  ) {
    this.roomId = roomId;
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.config = {
      minPlayers: 2,
      maxPlayers: 8,
      startingChips: 2000,
      smallBlind: 10,
      bigBlind: 20,
      turnTimerSeconds: 30,
      isPrivate: true,
      allowSpectators: true,
      mode: 'multiplayer',
      ...config,
    };
  }

  /**
   * Adds a player or reconnects an existing player by ID or name.
   */
  public addPlayer(params: {
    id: string;
    name: string;
    avatar: string;
    isAI?: boolean;
    aiDifficulty?: AIDifficulty;
    aiPersonality?: AIPersonality;
    asSpectator?: boolean;
  }): Player | null {
    // Check if player already exists
    const existing = this.players.find((p) => p.id === params.id);
    if (existing) {
      existing.connected = true;
      existing.name = params.name || existing.name;
      existing.avatar = params.avatar || existing.avatar;
      return existing;
    }

    if (params.asSpectator) {
      if (!this.spectators.some((s) => s.id === params.id)) {
        this.spectators.push({
          id: params.id,
          name: params.name,
          avatar: params.avatar,
        });
      }
      return null;
    }

    const occupiedSeats = new Set(this.players.map((p) => p.seatIndex));
    let seatIndex = -1;
    for (let i = 0; i < this.config.maxPlayers; i++) {
      if (!occupiedSeats.has(i)) {
        seatIndex = i;
        break;
      }
    }

    if (seatIndex === -1) {
      // Room is full; add as spectator if allowed
      if (this.config.allowSpectators) {
        if (!this.spectators.some((s) => s.id === params.id)) {
          this.spectators.push({
            id: params.id,
            name: params.name,
            avatar: params.avatar,
          });
        }
      }
      return null;
    }

    const isHandInProgress = this.phase !== 'WAITING' && this.phase !== 'SHOWDOWN';

    const newPlayer: Player = {
      id: params.id,
      name: params.name,
      avatar: params.avatar,
      seatIndex,
      chips: this.config.startingChips,
      holeCards: [],
      currentBet: 0,
      totalBetInHand: 0,
      folded: isHandInProgress, // Sit out current hand if joining mid-hand
      allIn: false,
      isAI: Boolean(params.isAI),
      aiDifficulty: params.aiDifficulty,
      aiPersonality: params.aiPersonality,
      connected: true,
      isSpectator: false,
      hasActedInRound: false,
    };

    this.players.push(newPlayer);
    this.players.sort((a, b) => a.seatIndex - b.seatIndex);
    return newPlayer;
  }

  /**
   * Removes a player or marks them disconnected if a hand is active.
   */
  public removePlayer(playerId: string, forceRemove: boolean = false): void {
    this.spectators = this.spectators.filter((s) => s.id !== playerId);
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    if (this.phase !== 'WAITING' && this.phase !== 'SHOWDOWN' && !forceRemove) {
      player.connected = false;
      if (this.activePlayerId === playerId) {
        this.handleAction(playerId, 'fold');
      }
      return;
    }

    this.players = this.players.filter((p) => p.id !== playerId);
    if (this.hostId === playerId && this.players.length > 0) {
      const nextHuman = this.players.find((p) => !p.isAI);
      if (nextHuman) {
        this.hostId = nextHuman.id;
      }
    }
  }

  /**
   * Toggles a user between seated player and spectator (when allowed).
   */
  public toggleSpectator(
    userId: string,
    name: string,
    avatar: string
  ): { isSpectator: boolean; error?: string } {
    const seated = this.players.find((p) => p.id === userId);
    if (seated) {
      if (this.phase !== 'WAITING' && this.phase !== 'SHOWDOWN' && !seated.folded) {
        this.handleAction(userId, 'fold');
      }
      this.players = this.players.filter((p) => p.id !== userId);
      this.spectators.push({ id: userId, name: seated.name, avatar: seated.avatar });
      return { isSpectator: true };
    }

    const specIdx = this.spectators.findIndex((s) => s.id === userId);
    if (specIdx !== -1) {
      if (this.players.length >= this.config.maxPlayers) {
        return { isSpectator: true, error: 'Table seats are currently full.' };
      }
      const spec = this.spectators[specIdx];
      this.spectators.splice(specIdx, 1);
      this.addPlayer({ id: spec.id, name: spec.name, avatar: spec.avatar });
      return { isSpectator: false };
    }

    return { isSpectator: false, error: 'Player not found in room.' };
  }

  /**
   * Allows a busted player (or between hands) to rebuy back to starting chips.
   */
  public rebuyPlayer(playerId: string): boolean {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return false;
    if (this.phase !== 'WAITING' && this.phase !== 'SHOWDOWN') return false;
    if (player.chips >= this.config.startingChips) return false;
    player.chips = this.config.startingChips;
    return true;
  }

  /**
   * Starts a new hand of Texas Hold'em.
   * Accepts an optional predetermined deck for deterministic unit testing.
   */
  public startHand(customDeck?: Card[]): { ok: boolean; error?: string } {
    // Auto-top-up AI bots that busted out so single-player/bot games can continue seamlessly
    for (const p of this.players) {
      if (p.isAI && p.chips <= 0) {
        p.chips = this.config.startingChips;
      }
    }

    const eligiblePlayers = this.players.filter(
      (p) => p.connected && !p.isSpectator && p.chips > 0
    );

    if (eligiblePlayers.length < 2) {
      return {
        ok: false,
        error: 'At least 2 players with chips are required to start a hand.',
      };
    }

    this.handNumber += 1;
    this.phase = 'PREFLOP';
    this.communityCards = [];
    this.pots = [];
    this.awards = [];
    this.winningCardIds = [];
    this.actionLog = [];
    this.actedSinceLastFullRaise.clear();
    this.handStartingChips.clear();

    // Prepare deck
    this.deck = customDeck ? [...customDeck] : shuffleDeck(createDeck());

    // Reset player states for the new hand
    for (const p of this.players) {
      this.handStartingChips.set(p.id, p.chips);
      p.holeCards = [];
      p.currentBet = 0;
      p.totalBetInHand = 0;
      p.allIn = false;
      p.hasActedInRound = false;
      p.lastAction = undefined;
      p.evaluatedHand = undefined;
      p.folded = !(p.connected && !p.isSpectator && p.chips > 0);
    }

    // Rotate Dealer Button to the next eligible seat clockwise
    const activeSeats = eligiblePlayers.map((p) => p.seatIndex).sort((a, b) => a - b);
    if (this.dealerSeatIndex === -1) {
      this.dealerSeatIndex = activeSeats[0];
    } else {
      const nextSeat = activeSeats.find((s) => s > this.dealerSeatIndex);
      this.dealerSeatIndex = nextSeat !== undefined ? nextSeat : activeSeats[0];
    }

    const dealerIdxInActive = activeSeats.indexOf(this.dealerSeatIndex);
    const numActive = activeSeats.length;

    // Determine Small Blind and Big Blind seats (Standard + Heads-Up rules)
    if (numActive === 2) {
      // Heads-up rule: Dealer posts Small Blind, other player posts Big Blind
      this.smallBlindSeatIndex = activeSeats[dealerIdxInActive];
      this.bigBlindSeatIndex = activeSeats[(dealerIdxInActive + 1) % 2];
    } else {
      this.smallBlindSeatIndex = activeSeats[(dealerIdxInActive + 1) % numActive];
      this.bigBlindSeatIndex = activeSeats[(dealerIdxInActive + 2) % numActive];
    }

    // Post Small Blind and Big Blind
    const sbPlayer = this.getPlayerBySeat(this.smallBlindSeatIndex)!;
    const bbPlayer = this.getPlayerBySeat(this.bigBlindSeatIndex)!;

    this.postBlind(sbPlayer, this.config.smallBlind, 'sb');
    this.postBlind(bbPlayer, this.config.bigBlind, 'bb');

    this.currentBet = this.config.bigBlind;
    this.minRaiseDelta = this.config.bigBlind;

    // Deal 2 hole cards to each active player one card at a time in clockwise order starting left of dealer
    for (let cardRound = 0; cardRound < 2; cardRound++) {
      for (let offset = 1; offset <= numActive; offset++) {
        const seat = activeSeats[(dealerIdxInActive + offset) % numActive];
        const player = this.getPlayerBySeat(seat)!;
        const card = this.deck.shift();
        if (card) {
          player.holeCards.push(card);
        }
      }
    }

    // Evaluate initial 2-card hand description for each player
    for (const p of eligiblePlayers) {
      p.evaluatedHand = evaluateHand(p.holeCards);
    }

    this.recalculatePots(false);

    // Pre-flop first to act:
    // In heads-up (2 players): Dealer/SB acts first pre-flop.
    // In 3+ players: Player clockwise after Big Blind (UTG) acts first.
    const bbIdxInActive = activeSeats.indexOf(this.bigBlindSeatIndex);
    let firstActorSeat: number | null = null;
    for (let offset = 1; offset <= numActive; offset++) {
      const candidateSeat = activeSeats[(bbIdxInActive + offset) % numActive];
      const candidate = this.getPlayerBySeat(candidateSeat)!;
      if (!candidate.folded && !candidate.allIn) {
        firstActorSeat = candidateSeat;
        break;
      }
    }

    if (firstActorSeat !== null) {
      this.setActivePlayer(this.getPlayerBySeat(firstActorSeat)!.id);
    } else {
      // Everyone is already all-in from blinds
      this.runoutToShowdown();
    }

    return { ok: true };
  }

  private postBlind(player: Player, blindAmount: number, type: 'sb' | 'bb'): void {
    const actual = Math.min(player.chips, blindAmount);
    player.chips -= actual;
    player.currentBet += actual;
    player.totalBetInHand += actual;
    if (player.chips === 0) {
      player.allIn = true;
    }
    player.lastAction = { type, amount: actual };
  }

  private setActivePlayer(playerId: string | null): void {
    this.activePlayerId = playerId;
    if (playerId && this.config.turnTimerSeconds > 0) {
      this.turnDeadline = Date.now() + this.config.turnTimerSeconds * 1000;
    } else {
      this.turnDeadline = null;
    }
  }

  public getPlayerBySeat(seatIndex: number): Player | undefined {
    return this.players.find((p) => p.seatIndex === seatIndex);
  }

  /**
   * Computes all legal betting actions for a given player at the current moment.
   */
  public getLegalActions(playerId: string): LegalActions | null {
    if (
      this.phase === 'WAITING' ||
      this.phase === 'SHOWDOWN' ||
      this.activePlayerId !== playerId
    ) {
      return null;
    }

    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.folded || player.allIn || player.chips <= 0) {
      return null;
    }

    const toCall = Math.max(0, this.currentBet - player.currentBet);
    const canCheck = toCall === 0;
    const canCall = toCall > 0;
    const callAmount = Math.min(player.chips, toCall);

    const maxBetOrRaiseTo = player.currentBet + player.chips;
    const minTarget =
      this.currentBet === 0
        ? this.config.bigBlind
        : this.currentBet + this.minRaiseDelta;

    // A player who already acted since the last full raise cannot re-raise a short all-in
    const lockedByShortRaise =
      this.actedSinceLastFullRaise.has(playerId) && toCall > 0;

    const canBet =
      this.currentBet === 0 && player.chips > 0 && !lockedByShortRaise;
    const canRaise =
      this.currentBet > 0 &&
      player.chips > toCall &&
      !lockedByShortRaise;

    const minBetOrRaiseTo = Math.min(maxBetOrRaiseTo, Math.max(minTarget, this.config.bigBlind));

    return {
      canFold: true,
      canCheck,
      canCall,
      callAmount,
      canBet,
      canRaise,
      minBetOrRaiseTo,
      maxBetOrRaiseTo,
      canAllIn: !lockedByShortRaise || player.chips <= toCall,
      allInAmount: player.chips,
    };
  }

  /**
   * Processes and validates a player's betting action.
   * For 'bet' and 'raise', `targetBetAmount` is the total street bet the player is raising TO
   * (or if they pass an increment smaller than currentBet, we normalize it safely).
   */
  public handleAction(
    playerId: string,
    action: BettingActionType,
    targetBetAmount?: number
  ): { ok: boolean; error?: string } {
    if (this.phase === 'WAITING' || this.phase === 'SHOWDOWN') {
      return { ok: false, error: 'No active hand in progress.' };
    }

    if (this.activePlayerId !== playerId) {
      return { ok: false, error: 'It is not your turn to act.' };
    }

    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.folded || player.allIn) {
      return { ok: false, error: 'Player cannot act in current state.' };
    }

    const legal = this.getLegalActions(playerId);
    if (!legal) {
      return { ok: false, error: 'No legal actions available.' };
    }

    const toCall = Math.max(0, this.currentBet - player.currentBet);
    let chipsAdded = 0;
    let recordedType: BettingActionType = action;

    switch (action) {
      case 'fold': {
        player.folded = true;
        player.hasActedInRound = true;
        this.actedSinceLastFullRaise.add(player.id);
        player.lastAction = { type: 'fold' };
        break;
      }

      case 'check': {
        if (!legal.canCheck) {
          return {
            ok: false,
            error: `Cannot check when facing a bet of ${this.currentBet}.`,
          };
        }
        player.hasActedInRound = true;
        this.actedSinceLastFullRaise.add(player.id);
        player.lastAction = { type: 'check' };
        break;
      }

      case 'call': {
        if (!legal.canCall) {
          if (legal.canCheck) {
            return this.handleAction(playerId, 'check');
          }
          return { ok: false, error: 'Cannot call right now.' };
        }
        chipsAdded = Math.min(player.chips, toCall);
        player.chips -= chipsAdded;
        player.currentBet += chipsAdded;
        player.totalBetInHand += chipsAdded;
        player.hasActedInRound = true;
        this.actedSinceLastFullRaise.add(player.id);

        if (player.chips === 0) {
          player.allIn = true;
          recordedType = 'all-in';
        }
        player.lastAction = { type: recordedType, amount: player.currentBet };
        break;
      }

      case 'bet':
      case 'raise': {
        if (!legal.canBet && !legal.canRaise) {
          return { ok: false, error: `Cannot ${action} in the current state.` };
        }

        const desiredTotal =
          targetBetAmount !== undefined ? Math.floor(targetBetAmount) : legal.minBetOrRaiseTo;

        // Validate minimum bet/raise unless player is going all-in with their entire stack
        const maxPossibleTotal = player.currentBet + player.chips;
        if (desiredTotal < legal.minBetOrRaiseTo && desiredTotal < maxPossibleTotal) {
          return {
            ok: false,
            error: `Minimum ${action} is to ${legal.minBetOrRaiseTo} chips.`,
          };
        }
        if (desiredTotal > maxPossibleTotal) {
          return {
            ok: false,
            error: `Cannot bet more than your stack (${maxPossibleTotal} total).`,
          };
        }

        chipsAdded = desiredTotal - player.currentBet;
        const previousHighestBet = this.currentBet;
        const raiseDelta = desiredTotal - previousHighestBet;

        player.chips -= chipsAdded;
        player.currentBet = desiredTotal;
        player.totalBetInHand += chipsAdded;
        player.hasActedInRound = true;

        if (desiredTotal > previousHighestBet) {
          this.currentBet = desiredTotal;
          if (raiseDelta >= this.minRaiseDelta) {
            // Full valid raise: updates minRaiseDelta and reopens betting for everyone
            this.minRaiseDelta = raiseDelta;
            this.actedSinceLastFullRaise.clear();
            for (const other of this.players) {
              if (other.id !== player.id && !other.folded && !other.allIn) {
                other.hasActedInRound = false;
              }
            }
          } else {
            // Short all-in raise: other players who haven't matched currentBet must still respond
            for (const other of this.players) {
              if (
                other.id !== player.id &&
                !other.folded &&
                !other.allIn &&
                other.currentBet < this.currentBet
              ) {
                other.hasActedInRound = false;
              }
            }
          }
        }

        this.actedSinceLastFullRaise.add(player.id);

        if (player.chips === 0) {
          player.allIn = true;
          recordedType = 'all-in';
        } else {
          recordedType = previousHighestBet === 0 ? 'bet' : 'raise';
        }
        player.lastAction = { type: recordedType, amount: player.currentBet };
        break;
      }

      case 'all-in': {
        if (player.chips <= 0) {
          return { ok: false, error: 'No chips remaining to go all-in.' };
        }
        const totalBet = player.currentBet + player.chips;
        if (totalBet > this.currentBet) {
          if (this.actedSinceLastFullRaise.has(playerId) && toCall > 0) {
            return {
              ok: false,
              error: 'Cannot re-raise a short all-in after already acting on the last full bet.',
            };
          }
          return this.handleAction(
            playerId,
            this.currentBet === 0 ? 'bet' : 'raise',
            totalBet
          );
        } else {
          return this.handleAction(playerId, 'call');
        }
      }
    }

    this.actionLog.push({
      playerId: player.id,
      playerName: player.name,
      type: recordedType,
      amount: recordedType === 'fold' || recordedType === 'check' ? 0 : player.currentBet,
      phase: this.phase,
      timestamp: Date.now(),
    });

    this.recalculatePots(false);
    this.advanceTurnOrStreet(player.seatIndex);
    return { ok: true };
  }

  /**
   * Determines the next player to act, or advances to the next street / showdown.
   */
  private advanceTurnOrStreet(lastActorSeatIndex: number): void {
    const nonFolded = this.players.filter((p) => !p.folded);

    // 1. Everyone else folded -> single winner takes pot immediately
    if (nonFolded.length === 1) {
      this.resolveUncontestedWinner(nonFolded[0]);
      return;
    }

    // 2. Check if all non-folded, non-all-in players have acted and matched currentBet
    const activeCanAct = nonFolded.filter((p) => !p.allIn);
    const roundComplete = activeCanAct.every(
      (p) => p.hasActedInRound && p.currentBet === this.currentBet
    );

    if (roundComplete) {
      // If <= 1 player can still make bets in future streets, deal remaining cards to Showdown
      if (activeCanAct.length <= 1) {
        this.runoutToShowdown();
        return;
      }
      this.advanceStreet();
      return;
    }

    // 3. Find next clockwise player who can act
    const sortedSeats = this.players.map((p) => p.seatIndex).sort((a, b) => a - b);
    const currentIdx = sortedSeats.indexOf(lastActorSeatIndex);
    const n = sortedSeats.length;

    for (let offset = 1; offset <= n; offset++) {
      const seat = sortedSeats[(currentIdx + offset) % n];
      const candidate = this.getPlayerBySeat(seat)!;
      if (
        !candidate.folded &&
        !candidate.allIn &&
        (!candidate.hasActedInRound || candidate.currentBet < this.currentBet)
      ) {
        this.setActivePlayer(candidate.id);
        return;
      }
    }

    // Fallback if no candidate found
    if (activeCanAct.length <= 1) {
      this.runoutToShowdown();
    } else {
      this.advanceStreet();
    }
  }

  /**
   * Advances to the next street (FLOP -> TURN -> RIVER -> SHOWDOWN).
   */
  private advanceStreet(): void {
    // Reset current street bets
    for (const p of this.players) {
      p.currentBet = 0;
      p.hasActedInRound = false;
      if (
        p.lastAction?.type !== 'fold' &&
        p.lastAction?.type !== 'all-in'
      ) {
        p.lastAction = undefined;
      }
    }
    this.currentBet = 0;
    this.minRaiseDelta = this.config.bigBlind;
    this.actedSinceLastFullRaise.clear();

    if (this.phase === 'PREFLOP') {
      this.phase = 'FLOP';
      // Burn 1, deal 3 flop cards
      this.deck.shift();
      for (let i = 0; i < 3; i++) {
        const card = this.deck.shift();
        if (card) this.communityCards.push(card);
      }
    } else if (this.phase === 'FLOP') {
      this.phase = 'TURN';
      this.deck.shift();
      const card = this.deck.shift();
      if (card) this.communityCards.push(card);
    } else if (this.phase === 'TURN') {
      this.phase = 'RIVER';
      this.deck.shift();
      const card = this.deck.shift();
      if (card) this.communityCards.push(card);
    } else if (this.phase === 'RIVER') {
      this.resolveShowdown();
      return;
    }

    // Update each non-folded player's evaluated hand with new community cards
    for (const p of this.players) {
      if (!p.folded && p.holeCards.length === 2) {
        p.evaluatedHand = evaluateHand([...p.holeCards, ...this.communityCards]);
      }
    }

    // First to act post-flop is the first non-folded, non-all-in player clockwise from Dealer
    // (In heads-up, Dealer is SB, so the other player is BB and acts first post-flop)
    const sortedSeats = this.players.map((p) => p.seatIndex).sort((a, b) => a - b);
    const n = sortedSeats.length;

    let startIdx = sortedSeats.findIndex((s) => s > this.dealerSeatIndex);
    if (startIdx === -1) startIdx = 0;

    for (let offset = 0; offset < n; offset++) {
      const seat = sortedSeats[(startIdx + offset) % n];
      const candidate = this.getPlayerBySeat(seat)!;
      if (!candidate.folded && !candidate.allIn) {
        this.setActivePlayer(candidate.id);
        return;
      }
    }

    this.runoutToShowdown();
  }

  /**
   * Deals any remaining community cards when all players are all-in and evaluates Showdown.
   */
  private runoutToShowdown(): void {
    for (const p of this.players) {
      p.currentBet = 0;
    }
    this.currentBet = 0;

    if (this.communityCards.length === 0) {
      // Deal Flop
      this.deck.shift();
      for (let i = 0; i < 3; i++) {
        const c = this.deck.shift();
        if (c) this.communityCards.push(c);
      }
    }
    if (this.communityCards.length === 3) {
      // Deal Turn
      this.deck.shift();
      const c = this.deck.shift();
      if (c) this.communityCards.push(c);
    }
    if (this.communityCards.length === 4) {
      // Deal River
      this.deck.shift();
      const c = this.deck.shift();
      if (c) this.communityCards.push(c);
    }

    this.resolveShowdown();
  }

  /**
   * Refunds any uncalled portion of the highest bettor's bet and constructs Main + Side Pots.
   */
  public recalculatePots(refundUncalled: boolean): void {
    const contributors = this.players.filter((p) => p.totalBetInHand > 0);
    if (contributors.length === 0) {
      this.pots = [];
      return;
    }

    if (refundUncalled) {
      // Sort contributors descending by totalBetInHand
      const byBetDesc = [...contributors].sort(
        (a, b) => b.totalBetInHand - a.totalBetInHand
      );
      if (byBetDesc.length >= 2) {
        const highest = byBetDesc[0];
        const secondHighestBet = byBetDesc[1].totalBetInHand;
        if (highest.totalBetInHand > secondHighestBet) {
          const uncalled = highest.totalBetInHand - secondHighestBet;
          highest.chips += uncalled;
          highest.totalBetInHand -= uncalled;
          highest.currentBet = Math.max(0, highest.currentBet - uncalled);
        }
      } else if (byBetDesc.length === 1) {
        const only = byBetDesc[0];
        only.chips += only.totalBetInHand;
        only.totalBetInHand = 0;
        only.currentBet = 0;
      }
    }

    // Build discrete contribution levels ONLY from all-in non-folded players' caps + the overall max bet
    const activeContributors = this.players.filter((p) => p.totalBetInHand > 0);
    const maxContribution = Math.max(
      0,
      ...activeContributors.map((p) => p.totalBetInHand)
    );

    const allInCaps = activeContributors
      .filter((p) => !p.folded && p.allIn && p.totalBetInHand < maxContribution)
      .map((p) => p.totalBetInHand);

    const distinctLevels = Array.from(
      new Set([...allInCaps, maxContribution])
    )
      .filter((lvl) => lvl > 0)
      .sort((a, b) => a - b);

    const rawPots: Pot[] = [];
    let prevLevel = 0;

    for (const level of distinctLevels) {
      const slice = level - prevLevel;
      if (slice <= 0) continue;

      let sliceAmount = 0;
      const eligibleIds: string[] = [];

      for (const p of activeContributors) {
        if (p.totalBetInHand > prevLevel) {
          const contribution = Math.min(p.totalBetInHand, level) - prevLevel;
          sliceAmount += contribution;
        }
        if (!p.folded && (p.totalBetInHand >= level || !p.allIn)) {
          eligibleIds.push(p.id);
        }
      }

      if (sliceAmount > 0) {
        const prevPot = rawPots[rawPots.length - 1];
        if (
          prevPot &&
          prevPot.eligiblePlayerIds.length === eligibleIds.length &&
          prevPot.eligiblePlayerIds.every((id, idx) => id === eligibleIds[idx])
        ) {
          prevPot.amount += sliceAmount;
        } else {
          rawPots.push({
            amount: sliceAmount,
            eligiblePlayerIds: eligibleIds,
            name: rawPots.length === 0 ? 'Main Pot' : `Side Pot ${rawPots.length}`,
          });
        }
      }

      prevLevel = level;
    }

    this.pots = rawPots;
  }

  /**
   * Resolves the hand when all opponents fold.
   */
  private resolveUncontestedWinner(winner: Player): void {
    this.phase = 'SHOWDOWN';
    this.setActivePlayer(null);

    this.recalculatePots(true);
    const totalPot = this.pots.reduce((sum, p) => sum + p.amount, 0);

    for (const p of this.players) {
      p.currentBet = 0;
    }
    this.currentBet = 0;

    winner.chips += totalPot;
    this.awards = [
      {
        potName: 'Main Pot',
        amount: totalPot,
        winnerIds: [winner.id],
        winnerNames: [winner.name],
        winningHandName: 'Opponents Folded',
        winningCardIds: [],
      },
    ];

    this.recordHandHistory(totalPot, false);
  }

  /**
   * Resolves a full Showdown across Main Pot and any Side Pots, splitting ties and odd chips.
   */
  private resolveShowdown(): void {
    this.phase = 'SHOWDOWN';
    this.setActivePlayer(null);

    // Refund any uncalled bet and build final pots
    this.recalculatePots(true);

    const nonFolded = this.players.filter((p) => !p.folded);
    for (const p of nonFolded) {
      p.evaluatedHand = evaluateHand([...p.holeCards, ...this.communityCards]);
    }

    const awards: PotAward[] = [];
    const winningCardsSet = new Set<string>();

    for (const pot of this.pots) {
      const contenders = nonFolded.filter((p) =>
        pot.eligiblePlayerIds.includes(p.id)
      );
      if (contenders.length === 0) continue;

      // Find best hand among contenders for this pot
      let bestContenders: Player[] = [contenders[0]];
      for (let i = 1; i < contenders.length; i++) {
        const candidate = contenders[i];
        const cmp = compareEvaluatedHands(
          candidate.evaluatedHand!,
          bestContenders[0].evaluatedHand!
        );
        if (cmp > 0) {
          bestContenders = [candidate];
        } else if (cmp === 0) {
          bestContenders.push(candidate);
        }
      }

      // Order tied winners clockwise starting left of dealer button for odd-chip distribution
      bestContenders.sort((a, b) => {
        const distA =
          (a.seatIndex - this.dealerSeatIndex - 1 + this.config.maxPlayers) %
          this.config.maxPlayers;
        const distB =
          (b.seatIndex - this.dealerSeatIndex - 1 + this.config.maxPlayers) %
          this.config.maxPlayers;
        return distA - distB;
      });

      const baseShare = Math.floor(pot.amount / bestContenders.length);
      let oddChips = pot.amount % bestContenders.length;

      for (const w of bestContenders) {
        const bonus = oddChips > 0 ? 1 : 0;
        if (oddChips > 0) oddChips--;
        w.chips += baseShare + bonus;
        if (w.evaluatedHand) {
          for (const cid of w.evaluatedHand.bestFiveIds) {
            winningCardsSet.add(cid);
          }
        }
      }

      awards.push({
        potName: pot.name,
        amount: pot.amount,
        winnerIds: bestContenders.map((w) => w.id),
        winnerNames: bestContenders.map((w) => w.name),
        winningHandName: bestContenders[0].evaluatedHand?.description,
        winningCardIds: bestContenders[0].evaluatedHand?.bestFiveIds || [],
      });
    }

    this.awards = awards;
    this.winningCardIds = Array.from(winningCardsSet);

    const totalPot = this.pots.reduce((sum, p) => sum + p.amount, 0);
    this.recordHandHistory(totalPot, true);
  }

  private recordHandHistory(totalPot: number, reachedShowdown: boolean): void {
    const summary: HandHistorySummary = {
      handId: `${this.roomCode}-H${this.handNumber}-${Date.now()}`,
      roomCode: this.roomCode,
      handNumber: this.handNumber,
      timestamp: Date.now(),
      communityCards: [...this.communityCards],
      totalPot,
      awards: [...this.awards],
      actions: [...this.actionLog],
      players: this.players
        .filter((p) => this.handStartingChips.has(p.id))
        .map((p) => {
          const startChips = this.handStartingChips.get(p.id) ?? p.chips;
          return {
            id: p.id,
            name: p.name,
            isAI: p.isAI,
            startingChips: startChips,
            endingChips: p.chips,
            netChange: p.chips - startChips,
            holeCards:
              reachedShowdown && !p.folded ? [...p.holeCards] : undefined,
            folded: p.folded,
            handName:
              reachedShowdown && !p.folded
                ? p.evaluatedHand?.description
                : undefined,
          };
        }),
    };

    this.handHistory.unshift(summary);
    if (this.handHistory.length > 50) {
      this.handHistory.pop();
    }
  }

  public getTotalPot(): number {
    return this.pots.reduce((sum, p) => sum + p.amount, 0);
  }

  /**
   * Produces a strictly sanitized ClientGameState for a specific viewer.
   * Private hole cards of other players are ALWAYS masked with `null` unless the game
   * has reached a multi-player SHOWDOWN and that opponent did not fold.
   */
  public getClientState(viewerId: string): ClientGameState {
    const reachedShowdownWithContenders =
      this.phase === 'SHOWDOWN' &&
      this.players.filter((p) => !p.folded && p.holeCards.length > 0).length >= 2;

    const sanitizedPlayers: PublicPlayer[] = this.players.map((p) => {
      const canSeeCards =
        p.id === viewerId || (reachedShowdownWithContenders && !p.folded);

      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        seatIndex: p.seatIndex,
        chips: p.chips,
        holeCards: canSeeCards
          ? [...p.holeCards]
          : p.holeCards.map(() => null),
        cardCount: p.holeCards.length,
        currentBet: p.currentBet,
        totalBetInHand: p.totalBetInHand,
        folded: p.folded,
        allIn: p.allIn,
        isAI: p.isAI,
        aiDifficulty: p.aiDifficulty,
        aiPersonality: p.aiPersonality,
        connected: p.connected,
        isSpectator: p.isSpectator,
        lastAction: p.lastAction,
        evaluatedHand: canSeeCards ? p.evaluatedHand : undefined,
      };
    });

    const viewerPlayer = this.players.find((p) => p.id === viewerId);

    return {
      roomId: this.roomId,
      roomCode: this.roomCode,
      hostId: this.hostId,
      config: { ...this.config },
      phase: this.phase,
      handNumber: this.handNumber,
      players: sanitizedPlayers,
      spectators: [...this.spectators],
      dealerSeatIndex: this.dealerSeatIndex,
      smallBlindSeatIndex: this.smallBlindSeatIndex,
      bigBlindSeatIndex: this.bigBlindSeatIndex,
      activePlayerId: this.activePlayerId,
      turnDeadline: this.turnDeadline,
      communityCards: [...this.communityCards],
      pot: this.getTotalPot(),
      pots: this.pots.map((pot) => ({
        ...pot,
        eligiblePlayerIds: [...pot.eligiblePlayerIds],
      })),
      currentBet: this.currentBet,
      minRaiseDelta: this.minRaiseDelta,
      awards: [...this.awards],
      winningCardIds: [...this.winningCardIds],
      actionLog: this.actionLog.slice(-20),
      chatMessages: this.chatMessages.slice(-40),
      myPlayerId: viewerId,
      myLegalActions: this.getLegalActions(viewerId),
      myEvaluatedHand: viewerPlayer?.evaluatedHand || null,
    };
  }
}
