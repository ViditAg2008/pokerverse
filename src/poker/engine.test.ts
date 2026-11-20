import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareEvaluatedHands,
  evaluateHand,
  parseCard,
} from './evaluator';
import { HandCategory, Card } from './types';
import { createDeck, PokerEngine } from './engine';
import { computeAIDecision } from './ai';

function cards(str: string): Card[] {
  return str
    .trim()
    .split(/\s+/)
    .map((s) => parseCard(s));
}

test('Hand Evaluator: All 10 Standard Poker Hand Rankings', () => {
  const royalFlush = evaluateHand(cards('As Ks Qs Js 10s 2d 7c'));
  assert.equal(royalFlush.category, HandCategory.RoyalFlush);
  assert.equal(royalFlush.categoryName, 'Royal Flush');

  const straightFlush = evaluateHand(cards('9h 8h 7h 6h 5h Kd 2c'));
  assert.equal(straightFlush.category, HandCategory.StraightFlush);

  const fourOfAKind = evaluateHand(cards('Ah Ad Ac As Kh 3d 2c'));
  assert.equal(fourOfAKind.category, HandCategory.FourOfAKind);

  const fullHouse = evaluateHand(cards('Kh Kd Kc Qs Qd 9h 2c'));
  assert.equal(fullHouse.category, HandCategory.FullHouse);

  const flush = evaluateHand(cards('Ad Jd 9d 6d 3d Kh 2c'));
  assert.equal(flush.category, HandCategory.Flush);

  const straight = evaluateHand(cards('10s 9h 8d 7c 6s 2h 3d'));
  assert.equal(straight.category, HandCategory.Straight);

  const threeOfAKind = evaluateHand(cards('8s 8h 8d Ac Kd 4s 2h'));
  assert.equal(threeOfAKind.category, HandCategory.ThreeOfAKind);

  const twoPair = evaluateHand(cards('Js Jh 9d 9c Ad 4s 2h'));
  assert.equal(twoPair.category, HandCategory.TwoPair);

  const onePair = evaluateHand(cards('Qs Qh Ad 10c 7s 4d 2h'));
  assert.equal(onePair.category, HandCategory.OnePair);

  const highCard = evaluateHand(cards('As Kd Jc 9h 7s 4d 2c'));
  assert.equal(highCard.category, HandCategory.HighCard);

  // Verify strict hierarchy order
  assert.ok(compareEvaluatedHands(royalFlush, straightFlush) > 0);
  assert.ok(compareEvaluatedHands(straightFlush, fourOfAKind) > 0);
  assert.ok(compareEvaluatedHands(fourOfAKind, fullHouse) > 0);
  assert.ok(compareEvaluatedHands(fullHouse, flush) > 0);
  assert.ok(compareEvaluatedHands(flush, straight) > 0);
  assert.ok(compareEvaluatedHands(straight, threeOfAKind) > 0);
  assert.ok(compareEvaluatedHands(threeOfAKind, twoPair) > 0);
  assert.ok(compareEvaluatedHands(twoPair, onePair) > 0);
  assert.ok(compareEvaluatedHands(onePair, highCard) > 0);
});

test('Hand Evaluator: Ace-low (Wheel) vs Ace-high Straight and Kicker Comparisons', () => {
  const wheelStraight = evaluateHand(cards('As 2d 3c 4h 5s Kd 9c'));
  assert.equal(wheelStraight.category, HandCategory.Straight);
  assert.equal(wheelStraight.tiebreakers[0], 5);

  const sixHighStraight = evaluateHand(cards('2d 3c 4h 5s 6d Kc 9h'));
  assert.equal(sixHighStraight.category, HandCategory.Straight);
  assert.equal(sixHighStraight.tiebreakers[0], 6);

  assert.ok(compareEvaluatedHands(sixHighStraight, wheelStraight) > 0);

  // Kicker comparison on One Pair
  const pairAceKingKicker = evaluateHand(cards('Ah Ad Ks Qc 9d 4h 2c'));
  const pairAceQueenKicker = evaluateHand(cards('As Ac Qd Jc 9s 4d 3c'));
  assert.ok(compareEvaluatedHands(pairAceKingKicker, pairAceQueenKicker) > 0);

  // Exact tie (equal hands on board)
  const tieHandA = evaluateHand(cards('Ah Kh Qd Jc 10s 2c 3d'));
  const tieHandB = evaluateHand(cards('Ad Kd Qs Jh 10c 4h 5s'));
  assert.equal(compareEvaluatedHands(tieHandA, tieHandB), 0);
});

test('PokerEngine: Heads-Up Blinds, Turn Order, and Dealer Rotation', () => {
  const engine = new PokerEngine('room-1', 'HU100', 'p1', {
    startingChips: 1000,
    smallBlind: 10,
    bigBlind: 20,
    turnTimerSeconds: 0,
  });

  engine.addPlayer({ id: 'p1', name: 'Alice', avatar: 'crown' });
  engine.addPlayer({ id: 'p2', name: 'Bob', avatar: 'shield' });

  const startRes = engine.startHand();
  assert.equal(startRes.ok, true);
  assert.equal(engine.phase, 'PREFLOP');

  // In heads-up, Dealer (seat 0 = p1) posts Small Blind and acts FIRST pre-flop
  assert.equal(engine.dealerSeatIndex, 0);
  assert.equal(engine.smallBlindSeatIndex, 0);
  assert.equal(engine.bigBlindSeatIndex, 1);
  assert.equal(engine.activePlayerId, 'p1');

  // p1 calls 10 more to match 20, p2 checks option
  assert.equal(engine.handleAction('p1', 'call').ok, true);
  assert.equal(engine.activePlayerId, 'p2');
  assert.equal(engine.handleAction('p2', 'check').ok, true);

  // Now on FLOP: Big Blind (p2) acts FIRST post-flop
  assert.equal(engine.phase, 'FLOP');
  assert.equal(engine.communityCards.length, 3);
  assert.equal(engine.activePlayerId, 'p2');

  // Complete hand via fold and verify Dealer rotates to seat 1 next hand
  assert.equal(engine.handleAction('p2', 'bet', 40).ok, true);
  assert.equal(engine.handleAction('p1', 'fold').ok, true);
  assert.equal(engine.phase, 'SHOWDOWN');

  // Start Hand 2 -> Dealer rotates to seat 1 (p2)
  engine.startHand();
  assert.equal(engine.dealerSeatIndex, 1);
  assert.equal(engine.smallBlindSeatIndex, 1);
  assert.equal(engine.bigBlindSeatIndex, 0);
  assert.equal(engine.activePlayerId, 'p2');
});

test('PokerEngine: Minimum Raise, Short All-In Raise, and Out-of-Turn Protection', () => {
  const engine = new PokerEngine('room-2', 'RAISE1', 'p1', {
    startingChips: 1000,
    smallBlind: 10,
    bigBlind: 20,
    turnTimerSeconds: 0,
  });

  const p1 = engine.addPlayer({ id: 'p1', name: 'P1', avatar: 'crown' })!;
  const p2 = engine.addPlayer({ id: 'p2', name: 'P2', avatar: 'shield' })!;
  const p3 = engine.addPlayer({ id: 'p3', name: 'P3', avatar: 'diamond' })!;

  // Give P3 a short stack of 50 chips so P3's all-in is a short raise
  p1.chips = 1000;
  p2.chips = 1000;
  p3.chips = 50;

  engine.startHand();
  // 3 players: Dealer = seat 0 (p1), SB = seat 1 (p2, 10), BB = seat 2 (p3, 20). First to act pre-flop is p1 (seat 0).
  assert.equal(engine.activePlayerId, 'p1');

  // Out-of-turn action by p2 must be rejected
  assert.equal(engine.handleAction('p2', 'call').ok, false);

  // Invalid under-minimum raise by p1 (min raise is to 40) must be rejected
  assert.equal(engine.handleAction('p1', 'raise', 30).ok, false);

  // p1 raises to 40 (valid full raise of +20)
  assert.equal(engine.handleAction('p1', 'raise', 40).ok, true);

  // p2 calls 40
  assert.equal(engine.activePlayerId, 'p2');
  assert.equal(engine.handleAction('p2', 'call').ok, true);

  // p3 (in BB with 20 posted and 30 remaining) goes all-in for 50 total (short raise of +10 < minRaiseDelta 20)
  assert.equal(engine.activePlayerId, 'p3');
  assert.equal(engine.handleAction('p3', 'all-in').ok, true);
  assert.equal(p3.allIn, true);
  assert.equal(engine.currentBet, 50);

  // Now p1 faces the short all-in of 50. Because p1 already acted on the last full raise (40),
  // p1 can call 10 more or fold, but CANNOT re-raise!
  assert.equal(engine.activePlayerId, 'p1');
  const p1Legal = engine.getLegalActions('p1')!;
  assert.equal(p1Legal.canCall, true);
  assert.equal(p1Legal.callAmount, 10);
  assert.equal(p1Legal.canRaise, false);
});

test('PokerEngine: Multiple Side Pots, Uncalled Bet Refund, and Split Pots', () => {
  const engine = new PokerEngine('room-3', 'SIDEPOT', 'p1', {
    startingChips: 1000,
    smallBlind: 10,
    bigBlind: 20,
    turnTimerSeconds: 0,
  });

  const p1 = engine.addPlayer({ id: 'p1', name: 'ShortStack', avatar: 'crown' })!;
  const p2 = engine.addPlayer({ id: 'p2', name: 'MidStack', avatar: 'shield' })!;
  const p3 = engine.addPlayer({ id: 'p3', name: 'BigStackA', avatar: 'diamond' })!;
  const p4 = engine.addPlayer({ id: 'p4', name: 'BigStackB', avatar: 'flame' })!;

  p1.chips = 100;
  p2.chips = 300;
  p3.chips = 600;
  p4.chips = 1000;

  // Construct deterministic deck:
  // Dealer = p1 (seat 0), SB = p2 (seat 1), BB = p3 (seat 2), UTG = p4 (seat 3)
  // Dealing order: p2, p3, p4, p1 (round 1), then p2, p3, p4, p1 (round 2)
  // Let's give:
  // p1 (100 chips): Royal Flush in Spades (As, Ks)
  // p2 (300 chips): Four of a Kind Tens (10h, 10d)
  // p3 (600 chips): Full House Kings full of Tens (Kh, Kd)
  // p4 (1000 chips): Pair of Deuces (2c, 7d)
  // Board: Qs Js 10s 10c Kd
  const customDeck = [
    // Round 1 hole cards (p2, p3, p4, p1)
    parseCard('10h'),
    parseCard('Kh'),
    parseCard('2c'),
    parseCard('As'),
    // Round 2 hole cards (p2, p3, p4, p1)
    parseCard('10d'),
    parseCard('Kc'),
    parseCard('7d'),
    parseCard('Ks'),
    // Burn + Flop (Qs Js 10s)
    parseCard('3c'),
    parseCard('Qs'),
    parseCard('Js'),
    parseCard('10s'),
    // Burn + Turn (10c)
    parseCard('4c'),
    parseCard('10c'),
    // Burn + River (Kd)
    parseCard('5c'),
    parseCard('Kd'),
    ...createDeck(),
  ];

  engine.startHand(customDeck);

  // UTG (p4) goes all-in for 1000
  assert.equal(engine.activePlayerId, 'p4');
  assert.equal(engine.handleAction('p4', 'all-in').ok, true);

  // p1 calls all-in for 100
  assert.equal(engine.activePlayerId, 'p1');
  assert.equal(engine.handleAction('p1', 'call').ok, true);

  // p2 calls all-in for 300
  assert.equal(engine.activePlayerId, 'p2');
  assert.equal(engine.handleAction('p2', 'call').ok, true);

  // p3 calls all-in for 600
  assert.equal(engine.activePlayerId, 'p3');
  assert.equal(engine.handleAction('p3', 'call').ok, true);

  // Hand automatically runs out to SHOWDOWN!
  assert.equal(engine.phase, 'SHOWDOWN');

  // Verify Pots:
  // Uncalled 400 from p4 (1000 - 600) is immediately refunded to p4!
  // Main Pot: 100 * 4 = 400 -> won by p1 (Royal Flush)
  // Side Pot 1: (300 - 100) * 3 = 600 -> won by p2 (Four of a Kind Tens)
  // Side Pot 2: (600 - 300) * 2 = 600 -> won by p3 (Full House Kings full of Tens)
  assert.equal(engine.pots.length, 3);
  assert.equal(engine.pots[0].amount, 400);
  assert.equal(engine.pots[1].amount, 600);
  assert.equal(engine.pots[2].amount, 600);

  assert.equal(p1.chips, 400);
  assert.equal(p2.chips, 600);
  assert.equal(p3.chips, 600);
  assert.equal(p4.chips, 400); // Uncalled 400 refunded
});

test('PokerEngine: Private Hole Card Security & AI Legal Decision Making', () => {
  const engine = new PokerEngine('room-4', 'SECURE', 'human', {
    startingChips: 1500,
    smallBlind: 10,
    bigBlind: 20,
    turnTimerSeconds: 0,
  });

  engine.addPlayer({ id: 'human', name: 'Player 1', avatar: 'crown' });
  engine.addPlayer({
    id: 'bot1',
    name: 'Viktor AI',
    avatar: 'shield',
    isAI: true,
    aiDifficulty: 'advanced',
    aiPersonality: 'aggressive',
  });
  engine.addPlayer({
    id: 'bot2',
    name: 'Elena AI',
    avatar: 'diamond',
    isAI: true,
    aiDifficulty: 'intermediate',
    aiPersonality: 'balanced',
  });

  engine.startHand();

  // Verify client state for 'human' masks bot1 and bot2 hole cards with [null, null]
  const humanView = engine.getClientState('human');
  const meInView = humanView.players.find((p) => p.id === 'human')!;
  const bot1InView = humanView.players.find((p) => p.id === 'bot1')!;
  const spectatorView = engine.getClientState('spectator-xyz');

  assert.ok(meInView.holeCards[0] !== null && meInView.holeCards[1] !== null);
  assert.deepEqual(bot1InView.holeCards, [null, null]);
  assert.deepEqual(
    spectatorView.players.find((p) => p.id === 'human')!.holeCards,
    [null, null]
  );

  // Play out a full hand letting AI make decisions on its turns
  let safetyCounter = 0;
  while (engine.phase !== 'SHOWDOWN' && safetyCounter < 40) {
    safetyCounter++;
    const activeId = engine.activePlayerId!;
    assert.ok(activeId);
    const activePlayer = engine.players.find((p) => p.id === activeId)!;
    if (activePlayer.isAI) {
      const decision = computeAIDecision(engine, activeId);
      const res = engine.handleAction(activeId, decision.action, decision.amount);
      assert.equal(res.ok, true, `AI action ${decision.action} failed: ${res.error}`);
    } else {
      const legal = engine.getLegalActions(activeId)!;
      if (legal.canCheck) {
        assert.equal(engine.handleAction(activeId, 'check').ok, true);
      } else {
        assert.equal(engine.handleAction(activeId, 'call').ok, true);
      }
    }
  }

  assert.equal(engine.phase, 'SHOWDOWN');
  // Verify total chips in room remain conserved (3 * 1500 = 4500)
  const totalChipsAfter = engine.players.reduce((s, p) => s + p.chips, 0);
  assert.equal(totalChipsAfter, 4500);
});
