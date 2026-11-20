import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import confetti from 'canvas-confetti';
import { motion } from 'motion/react';
import {
  Bot,
  Users,
  KeyRound,
  BookOpen,
  History,
  Trophy,
  Settings,
  Play,
} from 'lucide-react';
import {
  AIDifficulty,
  BettingActionType,
  ClientGameState,
  HandHistorySummary,
  PlayerStats,
  RoomConfig,
} from './poker/types';
import { parseCard } from './poker/evaluator';
import { PlayingCard } from './components/PlayingCard';
import { PokerTable } from './components/PokerTable';
import { ActiveModalType, Modals } from './components/Modals';
import { AvatarIcon } from './components/AvatarIcon';
import { sound } from './utils/sound';

const ROYAL_SHOWCASE_CARDS = [
  parseCard('10s'),
  parseCard('Js'),
  parseCard('Qs'),
  parseCard('Ks'),
  parseCard('As'),
];

function getOrCreatePlayerId(): string {
  const key = 'pokerverse_player_id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = `plr-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
  localStorage.setItem(key, created);
  return created;
}

export default function App() {
  const [playerId] = useState<string>(() => getOrCreatePlayerId());
  const [playerName, setPlayerName] = useState<string>(
    () => localStorage.getItem('pokerverse_player_name') || 'Royal Ace'
  );
  const [playerAvatar, setPlayerAvatar] = useState<string>(
    () => localStorage.getItem('pokerverse_player_avatar') || 'crown'
  );

  const [feltTheme, setFeltTheme] = useState<'emerald' | 'royal' | 'crimson'>(
    () =>
      (localStorage.getItem('pokerverse_felt') as
        | 'emerald'
        | 'royal'
        | 'crimson') || 'emerald'
  );
  const [fourColorDeck, setFourColorDeck] = useState<boolean>(
    () => localStorage.getItem('pokerverse_4color') === 'true'
  );
  const [isMuted, setIsMuted] = useState<boolean>(() => sound.muted);
  const [volume, setVolume] = useState<number>(() => sound.volume);

  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModalType>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [initialJoinCode, setInitialJoinCode] = useState<string>('');

  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [recentHands, setRecentHands] = useState<HandHistorySummary[]>([]);
  const [activeEmotes, setActiveEmotes] = useState<Record<string, string>>({});

  // Interactive cursor tilt on Title Screen card centerpiece
  const [mouseTilt, setMouseTilt] = useState({ x: 0, y: 0 });

  const socketRef = useRef<Socket | null>(null);
  const prevHandNumberRef = useRef<number>(0);
  const prevPhaseRef = useRef<string>('WAITING');
  const prevActiveIdRef = useRef<string | null>(null);

  const fetchStatsAndHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/stats/${encodeURIComponent(playerId)}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setRecentHands(data.recentHands || []);
      }
    } catch {
      // Ignore network fetch errors
    }
  }, [playerId]);

  // Sync document.body.dataset.state for Game State Machine
  useEffect(() => {
    if (!gameState) {
      document.body.dataset.state = 'title';
    } else if (activeModal === 'pause') {
      document.body.dataset.state = 'paused';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [gameState, activeModal]);

  // Connect Socket.IO and check URL query parameters (?autostart=1 or ?room=CODE)
  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('room:state', (incoming: ClientGameState) => {
      setGameState(incoming);
    });

    socket.on(
      'chat:emote_burst',
      (payload: { playerId: string; emote: string }) => {
        setActiveEmotes((prev) => ({
          ...prev,
          [payload.playerId]: payload.emote,
        }));
        setTimeout(() => {
          setActiveEmotes((prev) => {
            const copy = { ...prev };
            delete copy[payload.playerId];
            return copy;
          });
        }, 2400);
      }
    );

    fetchStatsAndHistory();

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const autoStartParam = params.get('autostart');
    const botsParam = params.get('bots');
    const parsedBots = botsParam
      ? Math.max(1, Math.min(5, parseInt(botsParam, 10) || 3))
      : 3;

    if (autoStartParam === '1') {
      document.body.dataset.state = 'playing';
      socket.emit(
        'room:create',
        {
          playerId,
          playerName,
          avatar: playerAvatar,
          mode: 'ai',
          botCount: parsedBots,
          botDifficulty: 'intermediate',
          autoStart: true,
        },
        (res: any) => {
          if (res?.ok && res.state) {
            setGameState(res.state);
          }
        }
      );
    } else if (roomParam) {
      setInitialJoinCode(roomParam.trim().toUpperCase());
      setActiveModal('join_room');
    }

    return () => {
      socket.disconnect();
    };
  }, [playerId, fetchStatsAndHistory]);

  // Expose live state text snapshot for automated multi-seat testing
  useEffect(() => {
    (window as any).render_game_to_text = () =>
      JSON.stringify(
        gameState
          ? {
              roomCode: gameState.roomCode,
              handNumber: gameState.handNumber,
              phase: gameState.phase,
              pot: gameState.pot,
              activePlayerId: gameState.activePlayerId,
              myPlayerId: gameState.myPlayerId,
              playerCount: gameState.players.length,
              players: gameState.players.map((p) => ({
                id: p.id,
                name: p.name,
                seatIndex: p.seatIndex,
                chips: p.chips,
                currentBet: p.currentBet,
                folded: p.folded,
                allIn: p.allIn,
              })),
            }
          : { screen: 'title' }
      );
  }, [gameState]);

  // Trigger audio cues and confetti on state transitions
  useEffect(() => {
    if (!gameState) return;

    if (gameState.handNumber !== prevHandNumberRef.current) {
      prevHandNumberRef.current = gameState.handNumber;
      sound.playCardDeal();
    }

    if (gameState.phase !== prevPhaseRef.current) {
      if (
        gameState.phase === 'FLOP' ||
        gameState.phase === 'TURN' ||
        gameState.phase === 'RIVER'
      ) {
        sound.playCardDeal();
      } else if (gameState.phase === 'SHOWDOWN') {
        fetchStatsAndHistory();
        const didIWin = gameState.awards.some((a) =>
          a.winnerIds.includes(playerId)
        );
        if (didIWin) {
          sound.playWin();
          try {
            confetti({
              particleCount: 55,
              spread: 65,
              origin: { y: 0.6 },
            });
          } catch {}
        }
      }
      prevPhaseRef.current = gameState.phase;
    }

    if (
      gameState.activePlayerId === playerId &&
      prevActiveIdRef.current !== playerId
    ) {
      sound.playTurnAlert();
    }
    prevActiveIdRef.current = gameState.activePlayerId;
  }, [gameState, playerId, fetchStatsAndHistory]);

  // Global keyboard shortcuts (Enter/Space on Title, Escape/P to Pause, M to Mute)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }

      if (!gameState && !activeModal && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleQuickPlayAI();
        return;
      }

      if (gameState) {
        if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
          e.preventDefault();
          setActiveModal((prev) => (prev === 'pause' ? null : 'pause'));
        } else if (e.key.toLowerCase() === 'm') {
          e.preventDefault();
          handleToggleMute();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleUpdateProfile = (name: string, avatar: string) => {
    setPlayerName(name);
    setPlayerAvatar(avatar);
    localStorage.setItem('pokerverse_player_name', name);
    localStorage.setItem('pokerverse_player_avatar', avatar);
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    sound.setMuted(next);
  };

  const handleChangeVolume = (vol: number) => {
    setVolume(vol);
    sound.setVolume(vol);
    if (vol > 0 && isMuted) {
      setIsMuted(false);
      sound.setMuted(false);
    }
  };

  const handleChangeFeltTheme = (theme: 'emerald' | 'royal' | 'crimson') => {
    setFeltTheme(theme);
    localStorage.setItem('pokerverse_felt', theme);
  };

  const handleToggleFourColorDeck = (val: boolean) => {
    setFourColorDeck(val);
    localStorage.setItem('pokerverse_4color', String(val));
  };

  const handleQuickPlayAI = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.body.dataset.state = 'playing';
    sound.playShuffle();
    socketRef.current?.emit(
      'room:create',
      {
        playerId,
        playerName,
        avatar: playerAvatar,
        mode: 'ai',
        botCount: 3,
        botDifficulty: 'intermediate',
        autoStart: true,
      },
      (res: any) => {
        if (res?.ok && res.state) {
          setGameState(res.state);
          setActiveModal(null);
        }
      }
    );
  };

  const handleCreateAIRoom = (params: {
    botCount: number;
    botDifficulty: AIDifficulty;
    startingChips: number;
    smallBlind: number;
    bigBlind: number;
  }) => {
    document.body.dataset.state = 'playing';
    socketRef.current?.emit(
      'room:create',
      {
        playerId,
        playerName,
        avatar: playerAvatar,
        mode: 'ai',
        botCount: params.botCount,
        botDifficulty: params.botDifficulty,
        config: {
          startingChips: params.startingChips,
          smallBlind: params.smallBlind,
          bigBlind: params.bigBlind,
        },
        autoStart: true,
      },
      (res: any) => {
        if (res?.ok && res.state) {
          setGameState(res.state);
          setActiveModal(null);
        }
      }
    );
  };

  const handleCreatePrivateRoom = (params: {
    startingChips: number;
    smallBlind: number;
    bigBlind: number;
    turnTimerSeconds: number;
    maxPlayers: number;
    botCount: number;
    botDifficulty: AIDifficulty;
  }) => {
    socketRef.current?.emit(
      'room:create',
      {
        playerId,
        playerName,
        avatar: playerAvatar,
        mode: 'multiplayer',
        botCount: params.botCount,
        botDifficulty: params.botDifficulty,
        config: {
          startingChips: params.startingChips,
          smallBlind: params.smallBlind,
          bigBlind: params.bigBlind,
          turnTimerSeconds: params.turnTimerSeconds,
          maxPlayers: params.maxPlayers,
        },
        autoStart: false,
      },
      (res: any) => {
        if (res?.ok && res.state) {
          setGameState(res.state);
          setActiveModal('lobby_config');
          const url = new URL(window.location.href);
          url.searchParams.set('room', res.roomCode);
          window.history.replaceState({}, '', url.toString());
        }
      }
    );
  };

  const handleJoinRoom = (roomCode: string, asSpectator: boolean) => {
    setJoinError(null);
    socketRef.current?.emit(
      'room:join',
      {
        roomCode,
        playerId,
        playerName,
        avatar: playerAvatar,
        asSpectator,
      },
      (res: any) => {
        if (!res?.ok) {
          setJoinError(res?.error || 'Could not join room.');
          return;
        }
        setGameState(res.state);
        setActiveModal(null);
        const url = new URL(window.location.href);
        url.searchParams.set('room', res.roomCode);
        window.history.replaceState({}, '', url.toString());
      }
    );
  };

  const handlePlayerAction = (action: BettingActionType, amount?: number) => {
    if (!gameState) return;
    socketRef.current?.emit('game:action', {
      roomCode: gameState.roomCode,
      playerId,
      action,
      amount,
    });
  };

  const handleStartHand = () => {
    if (!gameState) return;
    socketRef.current?.emit(
      'game:start',
      {
        roomCode: gameState.roomCode,
        playerId,
      },
      (res: any) => {
        if (res?.ok && res.state) {
          setGameState(res.state);
        }
      }
    );
  };

  const handleRebuy = () => {
    if (!gameState) return;
    socketRef.current?.emit('game:rebuy', {
      roomCode: gameState.roomCode,
      playerId,
    });
  };

  const handleToggleSpectator = () => {
    if (!gameState) return;
    socketRef.current?.emit('room:toggle_spectator', {
      roomCode: gameState.roomCode,
      playerId,
      playerName,
      avatar: playerAvatar,
    });
  };

  const handleUpdateRoomConfig = (config: Partial<RoomConfig>) => {
    if (!gameState) return;
    socketRef.current?.emit('room:configure', {
      roomCode: gameState.roomCode,
      playerId,
      config,
    });
  };

  const handleAddBot = (difficulty: AIDifficulty) => {
    if (!gameState) return;
    socketRef.current?.emit('room:add_bot', {
      roomCode: gameState.roomCode,
      playerId,
      difficulty,
    });
  };

  const handleRemoveBot = (botId?: string) => {
    if (!gameState) return;
    socketRef.current?.emit('room:remove_bot', {
      roomCode: gameState.roomCode,
      playerId,
      botId,
    });
  };

  const handleSendChat = (text?: string, emote?: string) => {
    if (!gameState) return;
    socketRef.current?.emit('chat:send', {
      roomCode: gameState.roomCode,
      playerId,
      playerName,
      text,
      emote,
    });
  };

  const handleLeaveRoom = () => {
    socketRef.current?.emit('room:leave');
    setGameState(null);
    setActiveModal(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.searchParams.delete('autostart');
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <main className="min-h-screen w-full bg-[#070B0E] text-slate-100 relative overflow-x-hidden overflow-y-auto">
      {gameState ? (
        <PokerTable
          gameState={gameState}
          feltTheme={feltTheme}
          fourColorDeck={fourColorDeck}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onAction={handlePlayerAction}
          onStartHand={handleStartHand}
          onRebuy={handleRebuy}
          onToggleSpectator={handleToggleSpectator}
          onOpenSettings={() => setActiveModal('settings')}
          onOpenPause={() => setActiveModal('pause')}
          onOpenLobbyConfig={() => setActiveModal('lobby_config')}
          onLeaveRoom={handleLeaveRoom}
          onSendChat={handleSendChat}
          activeEmotes={activeEmotes}
        />
      ) : (
        /* TITLE SCREEN / GAME LOBBY (Game Shell Architecture) */
        <div
          onMouseMove={(e) => {
            const nx = (e.clientX / window.innerWidth - 0.5) * 14;
            const ny = (e.clientY / window.innerHeight - 0.5) * 10;
            setMouseTilt({ x: nx, y: ny });
          }}
          className="relative min-h-screen w-full flex flex-col justify-between px-6 py-8 sm:px-12 sm:py-10 overflow-hidden"
        >
          {/* Ambient Emerald & Brass Lighting Vignette */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 35%, rgba(19, 107, 67, 0.28) 0%, rgba(12, 24, 33, 0.65) 52%, rgba(7, 11, 14, 0.98) 100%)',
            }}
          />

          {/* Top Bar: Player Profile Identity & Secondary Game Modals */}
          <div className="relative z-10 max-w-6xl w-full mx-auto flex flex-wrap items-center justify-between gap-4">
            {/* Player Identity Pill */}
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setActiveModal('stats');
              }}
              className="flex items-center gap-3 bg-[#0E151F]/90 hover:bg-[#141E2C] border border-slate-800 rounded-2xl px-3.5 py-2 transition-colors cursor-pointer"
              title="View Player Profile & Statistics"
            >
              <AvatarIcon avatar={playerAvatar} size="sm" active />
              <div className="text-left">
                <div className="text-xs font-bold text-white leading-tight">
                  {playerName}
                </div>
                <div className="text-[11px] font-mono text-amber-400 tabular-nums">
                  {stats?.handsPlayed ?? 0} Hands · {stats?.handsWon ?? 0} Wins
                </div>
              </div>
            </button>

            {/* Secondary Utility Actions: How to Play, Game History, Statistics, Settings */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setActiveModal('how_to_play');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0E151F]/90 hover:bg-slate-800 border border-slate-800 text-xs sm:text-sm font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span>How to Play</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  fetchStatsAndHistory();
                  setActiveModal('history');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0E151F]/90 hover:bg-slate-800 border border-slate-800 text-xs sm:text-sm font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <History className="w-4 h-4 text-amber-400" />
                <span>Game History</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  fetchStatsAndHistory();
                  setActiveModal('stats');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0E151F]/90 hover:bg-slate-800 border border-slate-800 text-xs sm:text-sm font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Player Statistics</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setActiveModal('settings');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0E151F]/90 hover:bg-slate-800 border border-slate-800 text-xs sm:text-sm font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Settings className="w-4 h-4 text-amber-400" />
                <span>Settings</span>
              </button>
            </div>
          </div>

          {/* Centerpiece Stage: Bespoke Inline SVG Title Lockup + Interactive Card Fan + Primary Modes */}
          <div className="relative z-10 max-w-5xl w-full mx-auto my-auto py-8 flex flex-col items-center text-center">
            {/* Interactive Royal Flush Card Fan Centerpiece */}
            <motion.div
              style={{
                transform: `perspective(900px) rotateY(${mouseTilt.x}deg) rotateX(${-mouseTilt.y}deg)`,
              }}
              className="relative flex items-center justify-center mb-8 h-32 sm:h-36"
            >
              {ROYAL_SHOWCASE_CARDS.map((card, idx) => {
                const offset = idx - 2;
                const rotate = offset * 11;
                const translateY = Math.abs(offset) * 6;
                return (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, y: 30, rotate: 0 }}
                    animate={{ opacity: 1, y: translateY, rotate }}
                    transition={{
                      duration: 0.45,
                      delay: idx * 0.06,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    whileHover={{ y: translateY - 14, scale: 1.08 }}
                    className="-mx-2.5 sm:-mx-3 cursor-pointer"
                  >
                    <PlayingCard
                      card={card}
                      size="lg"
                      fourColorDeck={fourColorDeck}
                      highlighted={idx === 4}
                    />
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Bespoke Inline SVG Title Emblem & Lockup */}
            <div className="flex flex-col items-center mb-6">
              <svg
                viewBox="0 0 540 92"
                className="w-full max-w-[480px] h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.8)]"
                role="img"
                aria-label="PokerVerse Crest Emblem"
              >
                <defs>
                  <linearGradient id="goldCrest" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FDE68A" />
                    <stop offset="50%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#B45309" />
                  </linearGradient>
                </defs>
                {/* Decorative Filigree Lines */}
                <line
                  x1="30"
                  y1="14"
                  x2="230"
                  y2="14"
                  stroke="url(#goldCrest)"
                  strokeWidth="1.5"
                  strokeOpacity="0.45"
                />
                <path
                  d="M270 4 L280 14 L270 24 L260 14 Z"
                  fill="url(#goldCrest)"
                />
                <line
                  x1="310"
                  y1="14"
                  x2="510"
                  y2="14"
                  stroke="url(#goldCrest)"
                  strokeWidth="1.5"
                  strokeOpacity="0.45"
                />

                <text
                  x="270"
                  y="68"
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontFamily="Cinzel, Georgia, serif"
                  fontWeight="800"
                  fontSize="52"
                  letterSpacing="8"
                >
                  POKERVERSE
                </text>

                <line
                  x1="90"
                  y1="84"
                  x2="450"
                  y2="84"
                  stroke="url(#goldCrest)"
                  strokeWidth="1.5"
                  strokeOpacity="0.45"
                />
              </svg>

              <p
                className="mt-2 text-sm sm:text-base text-slate-300 max-w-xl"
                style={{ textWrap: 'balance' }}
              >
                Authentic No-Limit Texas Hold&apos;em with Adaptive AI Opponents,
                Private Multiplayer Rooms, and Instant Shareable Table Links.
              </p>
            </div>

            {/* 3 Primary Game Mode Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 w-full max-w-3xl mt-2">
              {/* 1. PLAY AGAINST AI */}
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  data-start="true"
                  onClick={handleQuickPlayAI}
                  className="w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-base shadow-[0_12px_32px_rgba(245,158,11,0.35)] transition-all cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>Play Against AI</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setActiveModal('ai_setup');
                  }}
                  className="text-xs text-amber-300/85 hover:text-amber-200 underline underline-offset-4 cursor-pointer py-0.5"
                >
                  Customize AI Difficulty &amp; Stakes
                </button>
              </div>

              {/* 2. CREATE PRIVATE ROOM */}
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setActiveModal('create_room');
                  }}
                  className="w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-600 border border-emerald-400/40 text-white font-bold text-base shadow-[0_12px_32px_rgba(16,185,129,0.25)] transition-all cursor-pointer whitespace-nowrap"
                >
                  <Users className="w-5 h-5" />
                  <span>Create Private Room</span>
                </button>
                <span className="text-xs text-slate-400">
                  Host a table &amp; copy invite URL
                </span>
              </div>

              {/* 3. JOIN PRIVATE ROOM */}
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setJoinError(null);
                    setActiveModal('join_room');
                  }}
                  className="w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl bg-[#111A26] hover:bg-[#182434] border border-slate-700 hover:border-amber-400/50 text-white font-bold text-base shadow-lg transition-all cursor-pointer whitespace-nowrap"
                >
                  <KeyRound className="w-5 h-5 text-amber-400" />
                  <span>Join Private Room</span>
                </button>
                <span className="text-xs text-slate-400">
                  Enter 6-character code or link
                </span>
              </div>
            </div>
          </div>

          {/* Flat Borderless Bottom Control Hint & Social Gaming Notice */}
          <div className="relative z-10 max-w-5xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400 pt-4">
            <span>
              Enter Quick Play AI · F Fold · C Check/Call · R Bet/Raise · A All-In · P Pause
            </span>
            <span>
              Virtual Chips Only · Server-Authoritative Texas Hold&apos;em Engine
            </span>
          </div>
        </div>
      )}

      {/* Unified Modals Controller */}
      <Modals
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        playerName={playerName}
        playerAvatar={playerAvatar}
        onUpdateProfile={handleUpdateProfile}
        onCreateAIRoom={handleCreateAIRoom}
        onCreatePrivateRoom={handleCreatePrivateRoom}
        onJoinRoom={handleJoinRoom}
        joinError={joinError}
        initialJoinCode={initialJoinCode}
        gameState={gameState}
        onUpdateRoomConfig={handleUpdateRoomConfig}
        onAddBot={handleAddBot}
        onRemoveBot={handleRemoveBot}
        onStartHand={handleStartHand}
        onLeaveRoom={handleLeaveRoom}
        stats={stats}
        recentHands={recentHands}
        feltTheme={feltTheme}
        onChangeFeltTheme={handleChangeFeltTheme}
        fourColorDeck={fourColorDeck}
        onToggleFourColorDeck={handleToggleFourColorDeck}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        volume={volume}
        onChangeVolume={handleChangeVolume}
      />
    </main>
  );
}
