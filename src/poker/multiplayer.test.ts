import test from 'node:test';
import assert from 'node:assert/strict';
import { io as createClient, Socket as ClientSocket } from 'socket.io-client';
import { createPokerServer } from '../../server';
import { ClientGameState } from './types';

function emitAsync<T = any>(
  socket: ClientSocket,
  event: string,
  payload: any
): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res: T) => resolve(res));
  });
}

test('Multiplayer Socket.IO: Room Creation, Invite Join, Turn Sync, Private Cards & Reconnection', async () => {
  const { httpServer, io } = await createPokerServer(false);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const url = `http://127.0.0.1:${port}`;

  const clientA = createClient(url, { transports: ['websocket'] });
  const clientB = createClient(url, { transports: ['websocket'] });

  try {
    await Promise.all([
      new Promise<void>((r) => clientA.on('connect', () => r())),
      new Promise<void>((r) => clientB.on('connect', () => r())),
    ]);

    // 1. Host (Alice) creates a private room
    const createRes = await emitAsync(clientA, 'room:create', {
      playerId: 'alice-id',
      playerName: 'Alice',
      avatar: 'crown',
      mode: 'multiplayer',
      botCount: 0,
      config: {
        startingChips: 1000,
        smallBlind: 10,
        bigBlind: 20,
        turnTimerSeconds: 0,
      },
    });

    assert.equal(createRes.ok, true);
    const roomCode: string = createRes.roomCode;
    assert.equal(roomCode.length, 6);

    // 2. Friend (Bob) joins using the room code
    const joinRes = await emitAsync(clientB, 'room:join', {
      roomCode,
      playerId: 'bob-id',
      playerName: 'Bob',
      avatar: 'shield',
    });

    assert.equal(joinRes.ok, true);
    assert.equal(joinRes.state.players.length, 2);

    // 3. Host starts the game and both receive synchronized state with strictly private hole cards
    const statePromiseA = new Promise<ClientGameState>((resolve) => {
      const handler = (st: ClientGameState) => {
        if (st.phase === 'PREFLOP') {
          clientA.off('room:state', handler);
          resolve(st);
        }
      };
      clientA.on('room:state', handler);
    });
    const statePromiseB = new Promise<ClientGameState>((resolve) => {
      const handler = (st: ClientGameState) => {
        if (st.phase === 'PREFLOP') {
          clientB.off('room:state', handler);
          resolve(st);
        }
      };
      clientB.on('room:state', handler);
    });

    const startRes = await emitAsync(clientA, 'game:start', {
      roomCode,
      playerId: 'alice-id',
    });
    assert.equal(startRes.ok, true);

    const [stateA, stateB] = await Promise.all([statePromiseA, statePromiseB]);
    assert.equal(stateA.phase, 'PREFLOP');
    assert.equal(stateB.phase, 'PREFLOP');

    // Verify Alice sees her own cards, but Bob's cards are [null, null] in Alice's payload
    const aliceInA = stateA.players.find((p) => p.id === 'alice-id')!;
    const bobInA = stateA.players.find((p) => p.id === 'bob-id')!;
    assert.ok(aliceInA.holeCards[0] !== null && aliceInA.holeCards[1] !== null);
    assert.deepEqual(bobInA.holeCards, [null, null]);

    // Verify Bob sees his own cards, but Alice's cards are [null, null] in Bob's payload
    const aliceInB = stateB.players.find((p) => p.id === 'alice-id')!;
    const bobInB = stateB.players.find((p) => p.id === 'bob-id')!;
    assert.deepEqual(aliceInB.holeCards, [null, null]);
    assert.ok(bobInB.holeCards[0] !== null && bobInB.holeCards[1] !== null);

    // 4. Out-of-turn action by Bob (when Alice is active) is rejected by server
    const wrongTurnRes = await emitAsync(clientB, 'game:action', {
      roomCode,
      playerId: 'bob-id',
      action: 'call',
    });
    assert.equal(wrongTurnRes.ok, false);

    // 5. Alice calls pre-flop, then Bob checks to see the Flop
    const act1 = await emitAsync(clientA, 'game:action', {
      roomCode,
      playerId: 'alice-id',
      action: 'call',
    });
    assert.equal(act1.ok, true);

    const flopPromiseA = new Promise<ClientGameState>((resolve) => {
      clientA.once('room:state', (st: ClientGameState) => resolve(st));
    });

    const act2 = await emitAsync(clientB, 'game:action', {
      roomCode,
      playerId: 'bob-id',
      action: 'check',
    });
    assert.equal(act2.ok, true);

    const flopState = await flopPromiseA;
    assert.equal(flopState.phase, 'FLOP');
    assert.equal(flopState.communityCards.length, 3);

    // 6. Test Reconnection: Bob reconnects with his playerId and recovers his seat and hole cards
    const reconnectRes = await emitAsync(clientB, 'room:join', {
      roomCode,
      playerId: 'bob-id',
      playerName: 'Bob',
      avatar: 'shield',
    });
    assert.equal(reconnectRes.ok, true);
    const bobReconnected = reconnectRes.state.players.find(
      (p: any) => p.id === 'bob-id'
    );
    assert.ok(
      bobReconnected.holeCards[0] !== null &&
        bobReconnected.holeCards[1] !== null
    );

    // 7. Complete Hand #1 to SHOWDOWN (Bob bets on Flop, Alice folds)
    const betFlopRes = await emitAsync(clientB, 'game:action', {
      roomCode,
      playerId: 'bob-id',
      action: 'bet',
      amount: 40,
    });
    assert.equal(betFlopRes.ok, true);

    const showdownPromiseB = new Promise<ClientGameState>((resolve) => {
      const handler = (st: ClientGameState) => {
        if (st.phase === 'SHOWDOWN') {
          clientB.off('room:state', handler);
          resolve(st);
        }
      };
      clientB.on('room:state', handler);
    });

    const foldFlopRes = await emitAsync(clientA, 'game:action', {
      roomCode,
      playerId: 'alice-id',
      action: 'fold',
    });
    assert.equal(foldFlopRes.ok, true);

    const showdownStateB = await showdownPromiseB;
    assert.equal(showdownStateB.phase, 'SHOWDOWN');
    assert.equal(showdownStateB.handNumber, 1);

    // 8. Unauthorized non-host/non-dealer (Bob is seat 1, Alice is host & seat 0 dealer in Hand #1) cannot start Hand #2
    const unauthorizedNextRes = await emitAsync(clientB, 'game:start', {
      roomCode,
      playerId: 'bob-id',
    });
    assert.equal(unauthorizedNextRes.ok, false);

    // 9. Authorized Host/Dealer (Alice) clicks Deal Next Hand -> transitions to Hand #2 PREFLOP for all players
    const hand2PromiseB = new Promise<ClientGameState>((resolve) => {
      const handler = (st: ClientGameState) => {
        if (st.phase === 'PREFLOP' && st.handNumber === 2) {
          clientB.off('room:state', handler);
          resolve(st);
        }
      };
      clientB.on('room:state', handler);
    });

    const nextHandRes = await emitAsync(clientA, 'game:start', {
      roomCode,
      playerId: 'alice-id',
    });
    assert.equal(nextHandRes.ok, true);
    assert.equal(nextHandRes.state.handNumber, 2);
    assert.equal(nextHandRes.state.phase, 'PREFLOP');
    assert.equal(nextHandRes.state.communityCards.length, 0);
    assert.equal(nextHandRes.state.dealerSeatIndex, 1); // Dealer rotated from seat 0 to seat 1!

    // Duplicate click while Hand #2 is already in PREFLOP is rejected
    const duplicateClickRes = await emitAsync(clientA, 'game:start', {
      roomCode,
      playerId: 'alice-id',
    });
    assert.equal(duplicateClickRes.ok, false);

    const hand2StateB = await hand2PromiseB;
    assert.equal(hand2StateB.handNumber, 2);
    assert.equal(hand2StateB.phase, 'PREFLOP');
    assert.equal(hand2StateB.communityCards.length, 0);
    assert.equal(hand2StateB.dealerSeatIndex, 1);
  } finally {
    clientA.disconnect();
    clientB.disconnect();
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});
