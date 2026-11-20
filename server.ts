import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PokerEngine } from './src/poker/engine';
import { AI_BOT_ROSTER, computeAIDecision } from './src/poker/ai';
import {
  AIDifficulty,
  BettingActionType,
  HandHistorySummary,
  PlayerStats,
  RoomConfig,
} from './src/poker/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'pokerverse_store.json');

interface PersistentStore {
  profiles: Record<string, PlayerStats>;
  recentHands: HandHistorySummary[];
}

function getDefaultStore(): PersistentStore {
  const now = Date.now();
  const demoHand: HandHistorySummary = {
    handId: 'DEMO-H1',
    roomCode: 'ROYAL8',
    handNumber: 1,
    timestamp: now - 1000 * 60 * 18,
    communityCards: [
      { suit: 'spades', rank: 14, id: 'As' },
      { suit: 'spades', rank: 13, id: 'Ks' },
      { suit: 'hearts', rank: 10, id: '10h' },
      { suit: 'diamonds', rank: 10, id: '10d' },
      { suit: 'clubs', rank: 2, id: '2c' },
    ],
    totalPot: 1240,
    awards: [
      {
        potName: 'Main Pot',
        amount: 1240,
        winnerIds: ['demo-1'],
        winnerNames: ['Viktor Vance'],
        winningHandName: 'Full House, Kings full of Tens',
        winningCardIds: ['Kh', 'Kd', 'Ks', '10h', '10d'],
      },
    ],
    actions: [
      {
        playerId: 'demo-1',
        playerName: 'Viktor Vance',
        type: 'raise',
        amount: 120,
        phase: 'PREFLOP',
        timestamp: now - 1000 * 60 * 19,
      },
      {
        playerId: 'demo-2',
        playerName: 'Elena Rostova',
        type: 'call',
        amount: 120,
        phase: 'PREFLOP',
        timestamp: now - 1000 * 60 * 19,
      },
    ],
    players: [
      {
        id: 'demo-1',
        name: 'Viktor Vance',
        isAI: true,
        startingChips: 2000,
        endingChips: 2620,
        netChange: 620,
        holeCards: [
          { suit: 'hearts', rank: 13, id: 'Kh' },
          { suit: 'diamonds', rank: 13, id: 'Kd' },
        ],
        folded: false,
        handName: 'Full House, Kings full of Tens',
      },
      {
        id: 'demo-2',
        name: 'Elena Rostova',
        isAI: true,
        startingChips: 2000,
        endingChips: 1380,
        netChange: -620,
        holeCards: [
          { suit: 'clubs', rank: 14, id: 'Ac' },
          { suit: 'diamonds', rank: 12, id: 'Qd' },
        ],
        folded: false,
        handName: 'Two Pair, Aces and Tens',
      },
    ],
  };

  return {
    profiles: {},
    recentHands: [demoHand],
  };
}

function loadStore(): PersistentStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      return JSON.parse(raw) as PersistentStore;
    }
  } catch {
    // Fallback to in-memory default
  }
  return getDefaultStore();
}

function saveStore(store: PersistentStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // Ignore write errors in read-only environments
  }
}

const store = loadStore();

// Active rooms indexed by 6-char roomCode
export const rooms = new Map<string, PokerEngine>();
// Map socketId -> { roomCode, playerId }
const socketContext = new Map<string, { roomCode: string; playerId: string }>();
// Map roomCode -> active timeout handle for AI thinking or human turn timer
const roomTimers = new Map<string, NodeJS.Timeout>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return `PK${Date.now().toString().slice(-4)}`;
}

function updateStatsAfterShowdown(engine: PokerEngine): void {
  const latestHand = engine.handHistory[0];
  if (!latestHand) return;

  // Avoid duplicate recording for the same handId
  if (store.recentHands.some((h) => h.handId === latestHand.handId)) {
    return;
  }

  store.recentHands.unshift(latestHand);
  if (store.recentHands.length > 60) {
    store.recentHands.pop();
  }

  const winnerIdSet = new Set<string>();
  for (const award of latestHand.awards) {
    for (const wid of award.winnerIds) {
      winnerIdSet.add(wid);
    }
  }

  for (const pSummary of latestHand.players) {
    const enginePlayer = engine.players.find((p) => p.id === pSummary.id);
    if (!enginePlayer) continue;

    const key = pSummary.id;
    const existing: PlayerStats = store.profiles[key] || {
      playerName: pSummary.name,
      avatar: enginePlayer.avatar,
      handsPlayed: 0,
      handsWon: 0,
      totalGamesSessions: 1,
      biggestPotWon: 0,
      totalChipsWon: 0,
      bestHandCategory: 0,
      bestHandName: 'None yet',
      opponentsPlayed: {},
      recentHands: [],
    };

    existing.playerName = pSummary.name;
    existing.avatar = enginePlayer.avatar;
    existing.handsPlayed += 1;

    if (winnerIdSet.has(pSummary.id)) {
      existing.handsWon += 1;
      const wonAmount = latestHand.awards
        .filter((a) => a.winnerIds.includes(pSummary.id))
        .reduce((s, a) => s + Math.floor(a.amount / a.winnerIds.length), 0);
      if (wonAmount > existing.biggestPotWon) {
        existing.biggestPotWon = wonAmount;
      }
    }

    if (pSummary.netChange > 0) {
      existing.totalChipsWon += pSummary.netChange;
    }

    if (
      enginePlayer.evaluatedHand &&
      !pSummary.folded &&
      enginePlayer.evaluatedHand.category > existing.bestHandCategory
    ) {
      existing.bestHandCategory = enginePlayer.evaluatedHand.category;
      existing.bestHandName = enginePlayer.evaluatedHand.description;
    }

    for (const other of latestHand.players) {
      if (other.id !== pSummary.id) {
        existing.opponentsPlayed[other.name] =
          (existing.opponentsPlayed[other.name] || 0) + 1;
      }
    }

    existing.recentHands.unshift(latestHand);
    if (existing.recentHands.length > 25) {
      existing.recentHands.pop();
    }

    store.profiles[key] = existing;
  }

  saveStore(store);
}

export async function createPokerServer(attachVite: boolean = true) {
  const app = express();
  app.use(express.json());

  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  function clearRoomTimer(roomCode: string) {
    const existing = roomTimers.get(roomCode);
    if (existing) {
      clearTimeout(existing);
      roomTimers.delete(roomCode);
    }
  }

  /**
   * Broadcasts each connected client's personalized, hole-card-sanitized game state.
   */
  function broadcastRoomState(engine: PokerEngine) {
    const roomSockets = io.sockets.adapter.rooms.get(engine.roomCode);
    if (!roomSockets) return;

    for (const socketId of roomSockets) {
      const targetSocket = io.sockets.sockets.get(socketId);
      const ctx = socketContext.get(socketId);
      if (targetSocket && ctx) {
        targetSocket.emit('room:state', engine.getClientState(ctx.playerId));
      }
    }
  }

  /**
   * Schedules either an AI thinking delay or a human turn timeout for the current activePlayerId.
   */
  function scheduleTurnProgress(engine: PokerEngine) {
    clearRoomTimer(engine.roomCode);

    if (engine.phase === 'SHOWDOWN') {
      updateStatsAfterShowdown(engine);
      broadcastRoomState(engine);
      return;
    }

    if (engine.phase === 'WAITING' || !engine.activePlayerId) {
      return;
    }

    const activePlayer = engine.players.find(
      (p) => p.id === engine.activePlayerId
    );
    if (!activePlayer) return;

    if (activePlayer.isAI) {
      activePlayer.lastAction = { type: 'thinking' };
      broadcastRoomState(engine);

      const delayMs = 650 + Math.floor(Math.random() * 450);
      const timer = setTimeout(() => {
        if (
          engine.phase === 'WAITING' ||
          engine.phase === 'SHOWDOWN' ||
          engine.activePlayerId !== activePlayer.id
        ) {
          return;
        }
        const decision = computeAIDecision(engine, activePlayer.id);
        const res = engine.handleAction(
          activePlayer.id,
          decision.action,
          decision.amount
        );
        if (!res.ok) {
          // Fallback to check or fold if any edge constraint occurred
          const legal = engine.getLegalActions(activePlayer.id);
          if (legal?.canCheck) {
            engine.handleAction(activePlayer.id, 'check');
          } else {
            engine.handleAction(activePlayer.id, 'fold');
          }
        }
        broadcastRoomState(engine);
        scheduleTurnProgress(engine);
      }, delayMs);

      roomTimers.set(engine.roomCode, timer);
    } else if (engine.config.turnTimerSeconds > 0 && engine.turnDeadline) {
      const waitMs = Math.max(500, engine.turnDeadline - Date.now());
      const timer = setTimeout(() => {
        if (
          engine.phase === 'WAITING' ||
          engine.phase === 'SHOWDOWN' ||
          engine.activePlayerId !== activePlayer.id
        ) {
          return;
        }
        const legal = engine.getLegalActions(activePlayer.id);
        if (legal?.canCheck) {
          engine.handleAction(activePlayer.id, 'check');
        } else {
          engine.handleAction(activePlayer.id, 'fold');
        }
        broadcastRoomState(engine);
        scheduleTurnProgress(engine);
      }, waitMs);

      roomTimers.set(engine.roomCode, timer);
    }
  }

  // REST API Endpoints for History, Statistics, and Room Lookup
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', activeRooms: rooms.size });
  });

  app.get('/api/stats/:playerId', (req, res) => {
    const { playerId } = req.params;
    const stats = store.profiles[playerId] || null;
    res.json({
      stats,
      recentHands: store.recentHands.slice(0, 25),
    });
  });

  app.get('/api/history', (_req, res) => {
    res.json({
      recentHands: store.recentHands.slice(0, 30),
    });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = (req.params.code || '').trim().toUpperCase();
    const engine = rooms.get(code);
    if (!engine) {
      res.status(404).json({ error: 'Room not found or has expired.' });
      return;
    }
    res.json({
      roomCode: engine.roomCode,
      phase: engine.phase,
      playerCount: engine.players.length,
      maxPlayers: engine.config.maxPlayers,
      smallBlind: engine.config.smallBlind,
      bigBlind: engine.config.bigBlind,
      startingChips: engine.config.startingChips,
      allowSpectators: engine.config.allowSpectators,
      players: engine.players.map((p) => ({
        name: p.name,
        avatar: p.avatar,
        isAI: p.isAI,
      })),
    });
  });

  // Socket.IO Real-time Multiplayer & AI Room Handling
  io.on('connection', (socket: Socket) => {
    socket.on(
      'room:create',
      (
        payload: {
          playerId: string;
          playerName: string;
          avatar: string;
          mode: 'ai' | 'multiplayer';
          botCount?: number;
          botDifficulty?: AIDifficulty;
          config?: Partial<RoomConfig>;
          autoStart?: boolean;
        },
        callback?: (res: {
          ok: boolean;
          roomCode?: string;
          state?: any;
          error?: string;
        }) => void
      ) => {
        try {
          const playerName = (payload.playerName || 'Player 1').trim().slice(0, 24);
          const playerId = payload.playerId || `player-${socket.id}`;
          const avatar = payload.avatar || 'crown';
          const roomCode = generateRoomCode();
          const roomId = `room-${roomCode}-${Date.now()}`;

          const engine = new PokerEngine(roomId, roomCode, playerId, {
            mode: payload.mode || 'multiplayer',
            ...payload.config,
          });

          engine.addPlayer({
            id: playerId,
            name: playerName,
            avatar,
          });

          // Add requested AI bots
          const requestedBots =
            payload.mode === 'ai'
              ? Math.min(7, Math.max(1, payload.botCount ?? 3))
              : Math.min(7, Math.max(0, payload.botCount ?? 0));

          for (let i = 0; i < requestedBots; i++) {
            const profile = AI_BOT_ROSTER[i % AI_BOT_ROSTER.length];
            const botDifficulty = payload.botDifficulty || profile.difficulty;
            engine.addPlayer({
              id: `bot-${roomCode}-${i + 1}`,
              name: profile.name,
              avatar: profile.avatar,
              isAI: true,
              aiDifficulty: botDifficulty,
              aiPersonality: profile.personality,
            });
          }

          rooms.set(roomCode, engine);
          socket.join(roomCode);
          socketContext.set(socket.id, { roomCode, playerId });

          engine.chatMessages.push({
            id: `sys-${Date.now()}`,
            senderId: 'system',
            senderName: 'Table Dealer',
            text: `Welcome to Room ${roomCode}. Blinds are ${engine.config.smallBlind}/${engine.config.bigBlind}.`,
            timestamp: Date.now(),
            isSystem: true,
          });

          if (payload.mode === 'ai' || payload.autoStart) {
            engine.startHand();
          }

          const clientState = engine.getClientState(playerId);
          broadcastRoomState(engine);
          scheduleTurnProgress(engine);
          callback?.({ ok: true, roomCode, state: clientState });
        } catch (err: any) {
          callback?.({
            ok: false,
            error: err?.message || 'Failed to create room.',
          });
        }
      }
    );

    socket.on(
      'room:join',
      (
        payload: {
          roomCode: string;
          playerId: string;
          playerName: string;
          avatar: string;
          asSpectator?: boolean;
        },
        callback?: (res: {
          ok: boolean;
          roomCode?: string;
          state?: any;
          error?: string;
        }) => void
      ) => {
        const code = (payload.roomCode || '').trim().toUpperCase();
        const engine = rooms.get(code);
        if (!engine) {
          callback?.({
            ok: false,
            error: `Room "${code}" does not exist or has expired. Check your invitation code.`,
          });
          return;
        }

        const playerId = payload.playerId || `player-${socket.id}`;
        const playerName = (payload.playerName || 'Guest').trim().slice(0, 24);
        const avatar = payload.avatar || 'shield';

        const existingPlayer = engine.players.find((p) => p.id === playerId);
        if (
          !existingPlayer &&
          !payload.asSpectator &&
          engine.players.length >= engine.config.maxPlayers &&
          !engine.config.allowSpectators
        ) {
          callback?.({
            ok: false,
            error: 'This room is currently full and spectator mode is disabled.',
          });
          return;
        }

        const joined = engine.addPlayer({
          id: playerId,
          name: playerName,
          avatar,
          asSpectator: payload.asSpectator,
        });

        socket.join(code);
        socketContext.set(socket.id, { roomCode: code, playerId });

        if (!existingPlayer) {
          engine.chatMessages.push({
            id: `sys-${Date.now()}-${Math.random()}`,
            senderId: 'system',
            senderName: 'Table Dealer',
            text: joined
              ? `${playerName} took Seat ${joined.seatIndex + 1}.`
              : `${playerName} joined as a spectator.`,
            timestamp: Date.now(),
            isSystem: true,
          });
        }

        const clientState = engine.getClientState(playerId);
        broadcastRoomState(engine);
        callback?.({ ok: true, roomCode: code, state: clientState });
      }
    );

    socket.on(
      'room:configure',
      (
        payload: {
          roomCode: string;
          playerId: string;
          config: Partial<RoomConfig>;
        },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        const engine = rooms.get((payload.roomCode || '').toUpperCase());
        if (!engine) {
          callback?.({ ok: false, error: 'Room not found.' });
          return;
        }
        if (engine.hostId !== payload.playerId) {
          callback?.({ ok: false, error: 'Only the room host can change settings.' });
          return;
        }
        if (engine.phase !== 'WAITING' && engine.phase !== 'SHOWDOWN') {
          callback?.({
            ok: false,
            error: 'Room configuration can only be updated between hands.',
          });
          return;
        }

        if (payload.config.startingChips) {
          engine.config.startingChips = Math.max(
            200,
            Math.min(100000, Number(payload.config.startingChips))
          );
          if (engine.handNumber === 0) {
            for (const p of engine.players) {
              p.chips = engine.config.startingChips;
            }
          }
        }
        if (payload.config.smallBlind) {
          engine.config.smallBlind = Math.max(
            1,
            Math.min(5000, Number(payload.config.smallBlind))
          );
        }
        if (payload.config.bigBlind) {
          engine.config.bigBlind = Math.max(
            engine.config.smallBlind * 2,
            Math.min(10000, Number(payload.config.bigBlind))
          );
        }
        if (payload.config.turnTimerSeconds !== undefined) {
          engine.config.turnTimerSeconds = Math.max(
            0,
            Math.min(120, Number(payload.config.turnTimerSeconds))
          );
        }
        if (payload.config.maxPlayers) {
          engine.config.maxPlayers = Math.max(
            2,
            Math.min(8, Number(payload.config.maxPlayers))
          );
        }
        if (payload.config.allowSpectators !== undefined) {
          engine.config.allowSpectators = Boolean(payload.config.allowSpectators);
        }

        broadcastRoomState(engine);
        callback?.({ ok: true });
      }
    );

    socket.on(
      'room:add_bot',
      (
        payload: {
          roomCode: string;
          playerId: string;
          difficulty?: AIDifficulty;
        },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        const engine = rooms.get((payload.roomCode || '').toUpperCase());
        if (!engine) {
          callback?.({ ok: false, error: 'Room not found.' });
          return;
        }
        if (engine.hostId !== payload.playerId) {
          callback?.({ ok: false, error: 'Only the host can add AI bots.' });
          return;
        }
        if (engine.players.length >= engine.config.maxPlayers) {
          callback?.({ ok: false, error: 'Table is already at maximum capacity.' });
          return;
        }

        const existingNames = new Set(engine.players.map((p) => p.name));
        const profile =
          AI_BOT_ROSTER.find((b) => !existingNames.has(b.name)) ||
          AI_BOT_ROSTER[engine.players.length % AI_BOT_ROSTER.length];

        const botId = `bot-${engine.roomCode}-${Date.now().toString().slice(-4)}`;
        engine.addPlayer({
          id: botId,
          name: profile.name,
          avatar: profile.avatar,
          isAI: true,
          aiDifficulty: payload.difficulty || profile.difficulty,
          aiPersonality: profile.personality,
        });

        broadcastRoomState(engine);
        callback?.({ ok: true });
      }
    );

    socket.on(
      'room:remove_bot',
      (
        payload: {
          roomCode: string;
          playerId: string;
          botId?: string;
        },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        const engine = rooms.get((payload.roomCode || '').toUpperCase());
        if (!engine) {
          callback?.({ ok: false, error: 'Room not found.' });
          return;
        }
        if (engine.hostId !== payload.playerId) {
          callback?.({ ok: false, error: 'Only the host can remove AI bots.' });
          return;
        }

        const targetBot = payload.botId
          ? engine.players.find((p) => p.id === payload.botId && p.isAI)
          : [...engine.players].reverse().find((p) => p.isAI);

        if (!targetBot) {
          callback?.({ ok: false, error: 'No AI bots to remove.' });
          return;
        }

        engine.removePlayer(targetBot.id, true);
        broadcastRoomState(engine);
        callback?.({ ok: true });
      }
    );

    socket.on(
      'room:toggle_spectator',
      (
        payload: {
          roomCode: string;
          playerId: string;
          playerName: string;
          avatar: string;
        },
        callback?: (res: { ok: boolean; isSpectator?: boolean; error?: string }) => void
      ) => {
        const engine = rooms.get((payload.roomCode || '').toUpperCase());
        if (!engine) {
          callback?.({ ok: false, error: 'Room not found.' });
          return;
        }
        const result = engine.toggleSpectator(
          payload.playerId,
          payload.playerName,
          payload.avatar
        );
        broadcastRoomState(engine);
        scheduleTurnProgress(engine);
        callback?.({ ok: !result.error, ...result });
      }
    );

    const handleStartGameEvent = (
      payload: { roomCode: string; playerId: string },
      callback?: (res: { ok: boolean; state?: any; error?: string }) => void
    ) => {
      const engine = rooms.get((payload.roomCode || '').toUpperCase());
      if (!engine) {
        callback?.({ ok: false, error: 'Room not found.' });
        return;
      }
      if (engine.phase !== 'WAITING' && engine.phase !== 'SHOWDOWN') {
        callback?.({ ok: false, error: 'A hand is already in progress.' });
        return;
      }

      // In multiplayer mode, only the room host or the current human dealer may start the next hand
      if (engine.config.mode === 'multiplayer') {
        const dealerPlayer = engine.getPlayerBySeat(engine.dealerSeatIndex);
        const isHostPlayer = engine.hostId === payload.playerId;
        const isHumanDealer =
          dealerPlayer &&
          !dealerPlayer.isAI &&
          dealerPlayer.id === payload.playerId;

        if (!isHostPlayer && !isHumanDealer) {
          callback?.({
            ok: false,
            error: 'Only the room host or current dealer can start the next hand.',
          });
          return;
        }
      }

      const res = engine.startHand();
      if (!res.ok) {
        callback?.(res);
        return;
      }

      const clientState = engine.getClientState(payload.playerId);
      broadcastRoomState(engine);
      scheduleTurnProgress(engine);
      callback?.({ ok: true, state: clientState });
    };

    socket.on('game:start', handleStartGameEvent);
    socket.on('game:next_hand', handleStartGameEvent);

    socket.on(
      'game:action',
      (
        payload: {
          roomCode: string;
          playerId: string;
          action: BettingActionType;
          amount?: number;
        },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        const engine = rooms.get((payload.roomCode || '').toUpperCase());
        if (!engine) {
          callback?.({ ok: false, error: 'Room not found.' });
          return;
        }

        const res = engine.handleAction(
          payload.playerId,
          payload.action,
          payload.amount
        );
        if (!res.ok) {
          callback?.(res);
          return;
        }

        broadcastRoomState(engine);
        scheduleTurnProgress(engine);
        callback?.({ ok: true });
      }
    );

    socket.on(
      'game:rebuy',
      (
        payload: { roomCode: string; playerId: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        const engine = rooms.get((payload.roomCode || '').toUpperCase());
        if (!engine) {
          callback?.({ ok: false, error: 'Room not found.' });
          return;
        }
        const ok = engine.rebuyPlayer(payload.playerId);
        broadcastRoomState(engine);
        callback?.({
          ok,
          error: ok ? undefined : 'Can only rebuy between hands when low on chips.',
        });
      }
    );

    socket.on(
      'chat:send',
      (payload: {
        roomCode: string;
        playerId: string;
        playerName: string;
        text?: string;
        emote?: string;
      }) => {
        const engine = rooms.get((payload.roomCode || '').toUpperCase());
        if (!engine) return;

        const cleanText = (payload.text || '').trim().slice(0, 200);
        const cleanEmote = (payload.emote || '').trim().slice(0, 32);
        if (!cleanText && !cleanEmote) return;

        engine.chatMessages.push({
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          senderId: payload.playerId,
          senderName: (payload.playerName || 'Player').slice(0, 24),
          text: cleanText,
          emote: cleanEmote || undefined,
          timestamp: Date.now(),
        });

        if (engine.chatMessages.length > 60) {
          engine.chatMessages.shift();
        }

        broadcastRoomState(engine);
        if (cleanEmote) {
          io.to(engine.roomCode).emit('chat:emote_burst', {
            playerId: payload.playerId,
            emote: cleanEmote,
          });
        }
      }
    );

    socket.on('room:leave', () => {
      const ctx = socketContext.get(socket.id);
      if (!ctx) return;
      socketContext.delete(socket.id);
      socket.leave(ctx.roomCode);

      const engine = rooms.get(ctx.roomCode);
      if (engine) {
        engine.removePlayer(ctx.playerId, true);
        broadcastRoomState(engine);
        scheduleTurnProgress(engine);
      }
    });

    socket.on('disconnect', () => {
      const ctx = socketContext.get(socket.id);
      if (!ctx) return;
      socketContext.delete(socket.id);

      const engine = rooms.get(ctx.roomCode);
      if (engine) {
        engine.removePlayer(ctx.playerId, false);
        broadcastRoomState(engine);
        scheduleTurnProgress(engine);
      }
    });
  });

  if (attachVite) {
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(__dirname, 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return { app, httpServer, io };
}

// Start the server directly unless imported for unit testing
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  createPokerServer(true).then(({ httpServer }) => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`PokerVerse server listening on http://localhost:${PORT}`);
    });
  });
}
