import React, { useEffect, useState } from 'react';
import {
  X,
  Copy,
  Check,
  Plus,
  Trash2,
  Play,
  Users,
  Trophy,
  History,
  BookOpen,
  Settings,
  Bot,
  Eye,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  AIDifficulty,
  ClientGameState,
  HandHistorySummary,
  PlayerStats,
  RoomConfig,
} from '../poker/types';
import { parseCard } from '../poker/evaluator';
import { PlayingCard } from './PlayingCard';
import { AvatarIcon, AVATAR_OPTIONS } from './AvatarIcon';
import { sound } from '../utils/sound';

export type ActiveModalType =
  | null
  | 'ai_setup'
  | 'create_room'
  | 'join_room'
  | 'lobby_config'
  | 'how_to_play'
  | 'history'
  | 'stats'
  | 'settings'
  | 'pause';

interface ModalsProps {
  activeModal: ActiveModalType;
  onClose: () => void;
  playerName: string;
  playerAvatar: string;
  onUpdateProfile: (name: string, avatar: string) => void;
  onCreateAIRoom: (params: {
    botCount: number;
    botDifficulty: AIDifficulty;
    startingChips: number;
    smallBlind: number;
    bigBlind: number;
  }) => void;
  onCreatePrivateRoom: (params: {
    startingChips: number;
    smallBlind: number;
    bigBlind: number;
    turnTimerSeconds: number;
    maxPlayers: number;
    botCount: number;
    botDifficulty: AIDifficulty;
  }) => void;
  onJoinRoom: (roomCode: string, asSpectator: boolean) => void;
  joinError: string | null;
  initialJoinCode?: string;
  gameState: ClientGameState | null;
  onUpdateRoomConfig: (config: Partial<RoomConfig>) => void;
  onAddBot: (difficulty: AIDifficulty) => void;
  onRemoveBot: (botId?: string) => void;
  onStartHand: () => void;
  onLeaveRoom: () => void;
  stats: PlayerStats | null;
  recentHands: HandHistorySummary[];
  feltTheme: 'emerald' | 'royal' | 'crimson';
  onChangeFeltTheme: (theme: 'emerald' | 'royal' | 'crimson') => void;
  fourColorDeck: boolean;
  onToggleFourColorDeck: (val: boolean) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  volume: number;
  onChangeVolume: (vol: number) => void;
}

const HAND_RANKING_EXAMPLES = [
  {
    rank: 1,
    name: 'Royal Flush',
    desc: 'A, K, Q, J, 10 all of the same suit. The highest possible hand in Texas Hold’em.',
    cards: ['As', 'Ks', 'Qs', 'Js', '10s'],
  },
  {
    rank: 2,
    name: 'Straight Flush',
    desc: 'Five consecutive cards of the same suit.',
    cards: ['9h', '8h', '7h', '6h', '5h'],
  },
  {
    rank: 3,
    name: 'Four of a Kind',
    desc: 'Four cards of matching rank plus one side card (kicker).',
    cards: ['Ah', 'Ad', 'Ac', 'As', 'Kh'],
  },
  {
    rank: 4,
    name: 'Full House',
    desc: 'Three of a kind combined with a pair.',
    cards: ['Kh', 'Kd', 'Kc', 'Qs', 'Qd'],
  },
  {
    rank: 5,
    name: 'Flush',
    desc: 'Any five cards of the same suit, not in numerical sequence.',
    cards: ['Ad', 'Jd', '9d', '6d', '3d'],
  },
  {
    rank: 6,
    name: 'Straight',
    desc: 'Five consecutive cards of mixed suits (Ace can be high or low A-2-3-4-5).',
    cards: ['10s', '9h', '8d', '7c', '6s'],
  },
  {
    rank: 7,
    name: 'Three of a Kind',
    desc: 'Three cards of the same rank with two unrelated side cards.',
    cards: ['8s', '8h', '8d', 'Ac', 'Kd'],
  },
  {
    rank: 8,
    name: 'Two Pair',
    desc: 'Two cards of one rank, two cards of another rank, and one kicker.',
    cards: ['Js', 'Jh', '9d', '9c', 'Ad'],
  },
  {
    rank: 9,
    name: 'One Pair',
    desc: 'Two cards of the same rank with three highest available kickers.',
    cards: ['Qs', 'Qh', 'Ad', '10c', '7s'],
  },
  {
    rank: 10,
    name: 'High Card',
    desc: 'When no hand above is made, the single highest card plays.',
    cards: ['As', 'Kd', 'Jc', '9h', '4c'],
  },
];

export const Modals: React.FC<ModalsProps> = ({
  activeModal,
  onClose,
  playerName,
  playerAvatar,
  onUpdateProfile,
  onCreateAIRoom,
  onCreatePrivateRoom,
  onJoinRoom,
  joinError,
  initialJoinCode = '',
  gameState,
  onUpdateRoomConfig,
  onAddBot,
  onRemoveBot,
  onStartHand,
  onLeaveRoom,
  stats,
  recentHands,
  feltTheme,
  onChangeFeltTheme,
  fourColorDeck,
  onToggleFourColorDeck,
  isMuted,
  onToggleMute,
  volume,
  onChangeVolume,
}) => {
  // AI Setup State
  const [aiBotCount, setAiBotCount] = useState(3);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('intermediate');
  const [aiStartingChips, setAiStartingChips] = useState(2000);
  const [aiSmallBlind, setAiSmallBlind] = useState(10);

  // Private Room Setup State
  const [privStartingChips, setPrivStartingChips] = useState(2000);
  const [privSmallBlind, setPrivSmallBlind] = useState(10);
  const [privTurnTimer, setPrivTurnTimer] = useState(30);
  const [privMaxPlayers, setPrivMaxPlayers] = useState(8);
  const [privBotCount, setPrivBotCount] = useState(0);
  const [privBotDifficulty, setPrivBotDifficulty] =
    useState<AIDifficulty>('intermediate');

  // Join Room State
  const [roomCodeInput, setRoomCodeInput] = useState(initialJoinCode);
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);
  const [roomPreview, setRoomPreview] = useState<any | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Profile Local State
  const [localName, setLocalName] = useState(playerName);

  useEffect(() => {
    setLocalName(playerName);
  }, [playerName]);

  useEffect(() => {
    if (initialJoinCode) {
      setRoomCodeInput(initialJoinCode.toUpperCase());
    }
  }, [initialJoinCode]);

  // Live preview of a room when typing a 6-character code in Join Room modal
  useEffect(() => {
    if (activeModal !== 'join_room') return;
    const code = roomCodeInput.trim().toUpperCase();
    if (code.length < 4) {
      setRoomPreview(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/rooms/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setRoomPreview(data);
      })
      .catch(() => {
        if (!cancelled) setRoomPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [roomCodeInput, activeModal]);

  if (!activeModal) return null;

  const commitProfileIfChanged = () => {
    const cleaned = localName.trim() || 'Player 1';
    if (cleaned !== playerName) {
      onUpdateProfile(cleaned, playerAvatar);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl bg-[#0D131C] border border-amber-500/35 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.9)] overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#090E14]">
          <div className="flex items-center gap-2.5">
            {activeModal === 'ai_setup' && <Bot className="w-5 h-5 text-amber-400" />}
            {(activeModal === 'create_room' || activeModal === 'lobby_config') && (
              <Users className="w-5 h-5 text-amber-400" />
            )}
            {activeModal === 'join_room' && <Users className="w-5 h-5 text-emerald-400" />}
            {activeModal === 'how_to_play' && <BookOpen className="w-5 h-5 text-amber-400" />}
            {activeModal === 'history' && <History className="w-5 h-5 text-amber-400" />}
            {activeModal === 'stats' && <Trophy className="w-5 h-5 text-amber-400" />}
            {(activeModal === 'settings' || activeModal === 'pause') && (
              <Settings className="w-5 h-5 text-amber-400" />
            )}

            <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-wide">
              {activeModal === 'ai_setup' && 'Play Against AI Opponents'}
              {activeModal === 'create_room' && 'Create Private Multiplayer Room'}
              {activeModal === 'lobby_config' &&
                `Private Room Lobby (${gameState?.roomCode || ''})`}
              {activeModal === 'join_room' && 'Join Private Room'}
              {activeModal === 'how_to_play' &&
                "How to Play Texas Hold'em & Hand Rankings"}
              {activeModal === 'history' && 'Game & Hand History'}
              {activeModal === 'stats' && 'Player Statistics & Profile'}
              {activeModal === 'settings' && 'Table & Audio Settings'}
              {activeModal === 'pause' && 'Game Paused'}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-200">
          {/* 1. PLAY AGAINST AI SETUP */}
          {activeModal === 'ai_setup' && (
            <div className="space-y-5">
              {/* Player Identity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-800">
                <div>
                  <label
                    htmlFor="ai-player-name"
                    className="block text-xs font-medium text-slate-400 mb-1.5"
                  >
                    Your Display Name
                  </label>
                  <input
                    id="ai-player-name"
                    type="text"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={commitProfileIfChanged}
                    maxLength={24}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-medium focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-400 mb-1.5">
                    Select Table Emblem
                  </span>
                  <div className="flex items-center gap-2">
                    {AVATAR_OPTIONS.map((av) => (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => {
                          sound.playClick();
                          onUpdateProfile(localName.trim() || 'Player 1', av.id);
                        }}
                        className={`rounded-full transition-transform cursor-pointer ${
                          playerAvatar === av.id ? 'scale-110' : 'opacity-60 hover:opacity-100'
                        }`}
                        aria-label={av.label}
                      >
                        <AvatarIcon
                          avatar={av.id}
                          size="sm"
                          active={playerAvatar === av.id}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Difficulty Selection */}
              <div>
                <span className="block text-xs font-medium text-slate-400 mb-2">
                  AI Opponent Difficulty
                </span>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      {
                        id: 'beginner',
                        title: 'Beginner',
                        sub: 'Straightforward & Conservative',
                      },
                      {
                        id: 'intermediate',
                        title: 'Intermediate',
                        sub: 'Pot Odds & Board Texture',
                      },
                      {
                        id: 'advanced',
                        title: 'Advanced',
                        sub: 'Positional Strategy & Bluffs',
                      },
                    ] as const
                  ).map((tier) => (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        setAiDifficulty(tier.id);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        aiDifficulty === tier.id
                          ? 'bg-amber-500/15 border-amber-400 text-white'
                          : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-sm">{tier.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {tier.sub}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Number of Opponents & Stakes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="ai-bot-count"
                    className="block text-xs font-medium text-slate-400 mb-1.5"
                  >
                    AI Opponents ({aiBotCount})
                  </label>
                  <select
                    id="ai-bot-count"
                    value={aiBotCount}
                    onChange={(e) => setAiBotCount(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'Opponent (Heads-Up)' : 'Opponents'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="ai-starting-chips"
                    className="block text-xs font-medium text-slate-400 mb-1.5"
                  >
                    Starting Chips
                  </label>
                  <select
                    id="ai-starting-chips"
                    value={aiStartingChips}
                    onChange={(e) => setAiStartingChips(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  >
                    <option value={1000}>$1,000</option>
                    <option value={2000}>$2,000</option>
                    <option value={5000}>$5,000</option>
                    <option value={10000}>$10,000</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="ai-blinds"
                    className="block text-xs font-medium text-slate-400 mb-1.5"
                  >
                    Small / Big Blind
                  </label>
                  <select
                    id="ai-blinds"
                    value={aiSmallBlind}
                    onChange={(e) => setAiSmallBlind(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  >
                    <option value={5}>$5 / $10</option>
                    <option value={10}>$10 / $20</option>
                    <option value={25}>$25 / $50</option>
                    <option value={50}>$50 / $100</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    commitProfileIfChanged();
                    sound.playShuffle();
                    onCreateAIRoom({
                      botCount: aiBotCount,
                      botDifficulty: aiDifficulty,
                      startingChips: aiStartingChips,
                      smallBlind: aiSmallBlind,
                      bigBlind: aiSmallBlind * 2,
                    });
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Launch AI Table</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. CREATE PRIVATE ROOM */}
          {activeModal === 'create_room' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-800">
                <div>
                  <label
                    htmlFor="host-player-name"
                    className="block text-xs font-medium text-slate-400 mb-1.5"
                  >
                    Host Display Name
                  </label>
                  <input
                    id="host-player-name"
                    type="text"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={commitProfileIfChanged}
                    maxLength={24}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-medium focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-400 mb-1.5">
                    Host Avatar
                  </span>
                  <div className="flex items-center gap-2">
                    {AVATAR_OPTIONS.map((av) => (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => {
                          sound.playClick();
                          onUpdateProfile(localName.trim() || 'Player 1', av.id);
                        }}
                        className={`rounded-full transition-transform cursor-pointer ${
                          playerAvatar === av.id ? 'scale-110' : 'opacity-60 hover:opacity-100'
                        }`}
                        aria-label={av.label}
                      >
                        <AvatarIcon
                          avatar={av.id}
                          size="sm"
                          active={playerAvatar === av.id}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="priv-max-players"
                    className="block text-xs font-medium text-slate-400 mb-1.5"
                  >
                    Max Seats
                  </label>
                  <select
                    id="priv-max-players"
                    value={privMaxPlayers}
                    onChange={(e) => setPrivMaxPlayers(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  >
                    <option value={2}>2 Seats (Heads-Up)</option>
                    <option value={4}>4 Seats</option>
                    <option value={6}>6 Seats (6-Max)</option>
                    <option value={8}>8 Seats (Full Ring)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="priv-starting-chips"
                    className="block text-xs font-medium text-slate-400 mb-1.5"
                  >
                    Starting Chips
                  </label>
                  <select
                    id="priv-starting-chips"
                    value={privStartingChips}
                    onChange={(e) => setPrivStartingChips(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  >
                    <option value={1000}>$1,000</option>
                    <option value={2000}>$2,000</option>
                    <option value={5000}>$5,000</option>
                    <option value={10000}>$10,000</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="priv-blinds"
                    className="block text-xs font-medium text-slate-400 mb-1.5"
                  >
                    Small / Big Blind
                  </label>
                  <select
                    id="priv-blinds"
                    value={privSmallBlind}
                    onChange={(e) => setPrivSmallBlind(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  >
                    <option value={5}>$5 / $10</option>
                    <option value={10}>$10 / $20</option>
                    <option value={25}>$25 / $50</option>
                    <option value={50}>$50 / $100</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="priv-turn-timer"
                    className="block text-xs font-medium text-slate-400 mb-1.5"
                  >
                    Turn Timer
                  </label>
                  <select
                    id="priv-turn-timer"
                    value={privTurnTimer}
                    onChange={(e) => setPrivTurnTimer(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  >
                    <option value={0}>Unlimited</option>
                    <option value={20}>20 Seconds</option>
                    <option value={30}>30 Seconds</option>
                    <option value={45}>45 Seconds</option>
                    <option value={60}>60 Seconds</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="priv-bots"
                    className="block text-xs font-medium text-slate-400 mb-1.5"
                  >
                    Initial AI Bots
                  </label>
                  <select
                    id="priv-bots"
                    value={privBotCount}
                    onChange={(e) => setPrivBotCount(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  >
                    <option value={0}>0 Bots (Humans Only)</option>
                    <option value={1}>1 AI Bot</option>
                    <option value={2}>2 AI Bots</option>
                    <option value={3}>3 AI Bots</option>
                    <option value={4}>4 AI Bots</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="priv-bot-diff"
                    className="block text-xs font-medium text-slate-400 mb-1.5"
                  >
                    AI Bot Difficulty
                  </label>
                  <select
                    id="priv-bot-diff"
                    value={privBotDifficulty}
                    onChange={(e) =>
                      setPrivBotDifficulty(e.target.value as AIDifficulty)
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    commitProfileIfChanged();
                    sound.playClick();
                    onCreatePrivateRoom({
                      startingChips: privStartingChips,
                      smallBlind: privSmallBlind,
                      bigBlind: privSmallBlind * 2,
                      turnTimerSeconds: privTurnTimer,
                      maxPlayers: privMaxPlayers,
                      botCount: privBotCount,
                      botDifficulty: privBotDifficulty,
                    });
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  <span>Create Room &amp; Get Invite Link</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. ROOM WAITING LOBBY & HOST CONFIGURATION */}
          {activeModal === 'lobby_config' && gameState && (
            <div className="space-y-5">
              {/* Shareable Invitation Box */}
              <div className="p-4 rounded-xl bg-slate-900/90 border border-amber-500/35 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-400">
                      Private Room Code
                    </div>
                    <div className="font-mono text-2xl font-extrabold text-amber-400 tracking-widest">
                      {gameState.roomCode}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      const url = `${window.location.origin}${window.location.pathname}?room=${gameState.roomCode}`;
                      navigator.clipboard?.writeText(url).catch(() => {});
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2200);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow cursor-pointer"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Invitation Link Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Invitation Link</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="text-xs font-mono text-slate-400 bg-black/50 px-3 py-2 rounded-lg border border-slate-800 break-all">
                  {`${window.location.origin}${window.location.pathname}?room=${gameState.roomCode}`}
                </div>
              </div>

              {/* Connected Players List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Seated Players ({gameState.players.length} /{' '}
                    {gameState.config.maxPlayers})
                  </span>

                  {gameState.hostId === gameState.myPlayerId && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          sound.playClick();
                          onAddBot('intermediate');
                        }}
                        disabled={
                          gameState.players.length >= gameState.config.maxPlayers
                        }
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-medium cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add AI Bot</span>
                      </button>

                      {gameState.players.some((p) => p.isAI) && (
                        <button
                          type="button"
                          onClick={() => {
                            sound.playClick();
                            onRemoveBot();
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-900/70 hover:bg-rose-800 text-rose-200 text-xs font-medium cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove Bot</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {gameState.players.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800"
                    >
                      <div className="flex items-center gap-2.5">
                        <AvatarIcon avatar={p.avatar} size="sm" />
                        <div>
                          <div className="font-semibold text-white text-xs sm:text-sm flex items-center gap-1.5">
                            <span>{p.name}</span>
                            {p.id === gameState.hostId && (
                              <span className="text-[10px] font-mono text-amber-400">
                                HOST
                              </span>
                            )}
                            {p.isAI && (
                              <span className="text-[10px] font-mono text-sky-400 uppercase">
                                AI · {p.aiDifficulty}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-emerald-400 tabular-nums">
                            Seat {p.seatIndex + 1} · ${p.chips.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {p.isAI && gameState.hostId === gameState.myPlayerId && (
                        <button
                          type="button"
                          onClick={() => onRemoveBot(p.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                          title="Remove AI Bot"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Host Stakes Configuration (editable between hands) */}
              {gameState.hostId === gameState.myPlayerId &&
                (gameState.phase === 'WAITING' ||
                  gameState.phase === 'SHOWDOWN') && (
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-800">
                    <div>
                      <label
                        htmlFor="lobby-chips"
                        className="block text-xs text-slate-400 mb-1"
                      >
                        Starting Chips
                      </label>
                      <select
                        id="lobby-chips"
                        value={gameState.config.startingChips}
                        onChange={(e) =>
                          onUpdateRoomConfig({
                            startingChips: Number(e.target.value),
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                      >
                        <option value={1000}>$1,000</option>
                        <option value={2000}>$2,000</option>
                        <option value={5000}>$5,000</option>
                        <option value={10000}>$10,000</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="lobby-blinds"
                        className="block text-xs text-slate-400 mb-1"
                      >
                        Blinds
                      </label>
                      <select
                        id="lobby-blinds"
                        value={gameState.config.smallBlind}
                        onChange={(e) => {
                          const sb = Number(e.target.value);
                          onUpdateRoomConfig({
                            smallBlind: sb,
                            bigBlind: sb * 2,
                          });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                      >
                        <option value={5}>$5 / $10</option>
                        <option value={10}>$10 / $20</option>
                        <option value={25}>$25 / $50</option>
                        <option value={50}>$50 / $100</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="lobby-timer"
                        className="block text-xs text-slate-400 mb-1"
                      >
                        Turn Timer
                      </label>
                      <select
                        id="lobby-timer"
                        value={gameState.config.turnTimerSeconds}
                        onChange={(e) =>
                          onUpdateRoomConfig({
                            turnTimerSeconds: Number(e.target.value),
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                      >
                        <option value={0}>Unlimited</option>
                        <option value={20}>20s</option>
                        <option value={30}>30s</option>
                        <option value={45}>45s</option>
                      </select>
                    </div>
                  </div>
                )}

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer"
                >
                  Return to Table
                </button>

                {gameState.players.length >= 2 &&
                  (gameState.phase === 'WAITING' ||
                    gameState.phase === 'SHOWDOWN') && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playShuffle();
                        onStartHand();
                        onClose();
                      }}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Start Game Now</span>
                    </button>
                  )}
              </div>
            </div>
          )}

          {/* 4. JOIN PRIVATE ROOM */}
          {activeModal === 'join_room' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="join-player-name"
                    className="block text-xs font-medium text-slate-400 mb-1.5"
                  >
                    Your Display Name
                  </label>
                  <input
                    id="join-player-name"
                    type="text"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={commitProfileIfChanged}
                    maxLength={24}
                    placeholder="Enter display name"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-medium focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="join-room-code"
                    className="block text-xs font-medium text-slate-400 mb-1.5"
                  >
                    6-Character Room Code
                  </label>
                  <input
                    id="join-room-code"
                    type="text"
                    value={roomCodeInput}
                    onChange={(e) =>
                      setRoomCodeInput(e.target.value.toUpperCase())
                    }
                    maxLength={8}
                    placeholder="e.g. PKR742"
                    className="w-full bg-slate-900 border border-amber-500/50 rounded-xl px-3.5 py-2 text-amber-300 font-mono font-bold tracking-widest uppercase focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Live Room Status Preview */}
              {roomPreview && (
                <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-emerald-300">
                      Room {roomPreview.roomCode} Found · {roomPreview.phase}
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5 font-mono">
                      Players: {roomPreview.playerCount}/{roomPreview.maxPlayers} ·
                      Blinds ${roomPreview.smallBlind}/${roomPreview.bigBlind}
                    </div>
                  </div>
                  <span className="text-xs text-emerald-400 font-medium">
                    Ready to Join
                  </span>
                </div>
              )}

              {joinError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs"
                >
                  {joinError}
                </div>
              )}

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={joinAsSpectator}
                  onChange={(e) => setJoinAsSpectator(e.target.checked)}
                  className="rounded accent-amber-500 w-4 h-4"
                />
                <span className="text-xs text-slate-300 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  Join in Spectator Mode (watch without playing)
                </span>
              </label>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!roomCodeInput.trim()}
                  onClick={() => {
                    commitProfileIfChanged();
                    sound.playClick();
                    onJoinRoom(roomCodeInput.trim().toUpperCase(), joinAsSpectator);
                  }}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold shadow-lg cursor-pointer"
                >
                  Join Room
                </button>
              </div>
            </div>
          )}

          {/* 5. HOW TO PLAY & HAND RANKINGS */}
          {activeModal === 'how_to_play' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <h3 className="font-bold text-white text-base">
                  Texas Hold&apos;em Rules Overview
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Every player is dealt <strong>2 private hole cards</strong>{' '}
                  face-down, followed by <strong>5 community cards</strong> dealt
                  face-up in three stages: the <strong>Flop</strong> (3 cards),
                  the <strong>Turn</strong> (1 card), and the{' '}
                  <strong>River</strong> (1 card). Your goal is to construct the
                  best possible <strong>5-card poker hand</strong> using any
                  combination of your 2 hole cards and the 5 community cards.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-bold text-white text-base">
                  Official 10 Poker Hand Rankings (Strongest to Weakest)
                </h3>
                <div className="space-y-2.5">
                  {HAND_RANKING_EXAMPLES.map((item) => (
                    <div
                      key={item.rank}
                      className="p-3 rounded-xl bg-slate-900/75 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-amber-400">
                            #{item.rank}
                          </span>
                          <span className="font-bold text-white text-sm">
                            {item.name}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{item.desc}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.cards.map((code) => (
                          <PlayingCard
                            key={code}
                            card={parseCard(code)}
                            size="sm"
                            fourColorDeck={fourColorDeck}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 6. GAME HISTORY */}
          {activeModal === 'history' && (
            <div className="space-y-4">
              {recentHands.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  No completed hands recorded yet. Play a hand to see full
                  showdown breakdowns!
                </div>
              ) : (
                recentHands.map((hand) => (
                  <div
                    key={hand.handId}
                    className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-amber-400 font-bold">
                          Room {hand.roomCode} · Hand #{hand.handNumber}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">
                          {new Date(hand.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="font-mono font-bold text-xs text-emerald-400 tabular-nums">
                        Total Pot: ${hand.totalPot.toLocaleString()}
                      </div>
                    </div>

                    {/* Community Cards & Winners */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        {hand.communityCards.length > 0 ? (
                          hand.communityCards.map((c) => (
                            <PlayingCard
                              key={c.id}
                              card={c}
                              size="sm"
                              fourColorDeck={fourColorDeck}
                            />
                          ))
                        ) : (
                          <span className="text-xs text-slate-500 italic">
                            Ended Pre-Flop (Opponents Folded)
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 text-right">
                        {hand.awards.map((aw, i) => (
                          <div key={i} className="text-xs">
                            <span className="font-bold text-amber-300">
                              {aw.winnerNames.join(' & ')}
                            </span>{' '}
                            won{' '}
                            <span className="font-mono font-bold text-emerald-400">
                              ${aw.amount.toLocaleString()}
                            </span>
                            {aw.winningHandName && (
                              <div className="text-[11px] text-slate-400">
                                {aw.winningHandName}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Player Net Changes */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                      {hand.players.map((pl) => (
                        <div
                          key={pl.id}
                          className="px-2.5 py-1.5 rounded-lg bg-black/40 border border-slate-800/80 flex items-center justify-between text-xs"
                        >
                          <span className="truncate text-slate-300 font-medium">
                            {pl.name}
                          </span>
                          <span
                            className={`font-mono font-bold tabular-nums ${
                              pl.netChange > 0
                                ? 'text-emerald-400'
                                : pl.netChange < 0
                                ? 'text-rose-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {pl.netChange > 0 ? `+${pl.netChange}` : pl.netChange}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 7. PLAYER STATISTICS */}
          {activeModal === 'stats' && (
            <div className="space-y-5">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
                <AvatarIcon avatar={playerAvatar} size="lg" active />
                <div>
                  <div className="text-lg font-bold text-white">{playerName}</div>
                  <div className="text-xs text-slate-400">
                    Best Hand Achieved:{' '}
                    <span className="text-amber-300 font-semibold">
                      {stats?.bestHandName || 'Play a hand to record'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="text-xs text-slate-400">Hands Played</div>
                  <div className="font-mono text-2xl font-bold text-white mt-1 tabular-nums">
                    {stats?.handsPlayed ?? 0}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="text-xs text-slate-400">Hands Won</div>
                  <div className="font-mono text-2xl font-bold text-emerald-400 mt-1 tabular-nums">
                    {stats?.handsWon ?? 0}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="text-xs text-slate-400">Win Rate</div>
                  <div className="font-mono text-2xl font-bold text-amber-400 mt-1 tabular-nums">
                    {stats && stats.handsPlayed > 0
                      ? `${Math.round((stats.handsWon / stats.handsPlayed) * 100)}%`
                      : '0%'}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="text-xs text-slate-400">Biggest Pot Won</div>
                  <div className="font-mono text-2xl font-bold text-emerald-400 mt-1 tabular-nums">
                    ${(stats?.biggestPotWon ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {stats && Object.keys(stats.opponentsPlayed).length > 0 && (
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Most Frequently Played Opponents
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(stats.opponentsPlayed)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 6)
                      .map(([oppName, count]) => (
                        <div
                          key={oppName}
                          className="px-3 py-1.5 rounded-lg bg-black/40 border border-slate-800 text-xs flex items-center gap-2"
                        >
                          <span className="text-white font-medium">{oppName}</span>
                          <span className="font-mono text-amber-400 tabular-nums">
                            {count} {count === 1 ? 'hand' : 'hands'}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 8. SETTINGS & PAUSE */}
          {(activeModal === 'settings' || activeModal === 'pause') && (
            <div className="space-y-5">
              {/* Audio Controls */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white">
                      Casino Sound Effects
                    </div>
                    <div className="text-xs text-slate-400">
                      Card shuffling, dealing, chip clinks, and turn chimes
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                      isMuted
                        ? 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                        : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                    }`}
                  >
                    {isMuted ? (
                      <>
                        <VolumeX className="w-4 h-4" />
                        <span>Muted</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-4 h-4" />
                        <span>Sound Active</span>
                      </>
                    )}
                  </button>
                </div>

                <div>
                  <label
                    htmlFor="settings-volume"
                    className="block text-xs text-slate-400 mb-1"
                  >
                    Sound Volume ({Math.round(volume * 100)}%)
                  </label>
                  <input
                    id="settings-volume"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => onChangeVolume(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Table Visual Customization */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                <div>
                  <span className="block text-xs font-medium text-slate-400 mb-2">
                    Table Felt Color
                  </span>
                  <div className="grid grid-cols-3 gap-3">
                    {(
                      [
                        { id: 'emerald', label: 'Classic Emerald' },
                        { id: 'royal', label: 'Monte Carlo Royal' },
                        { id: 'crimson', label: 'High-Roller Crimson' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          sound.playClick();
                          onChangeFeltTheme(t.id);
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                          feltTheme === t.id
                            ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-slate-800">
                  <div>
                    <div className="font-semibold text-white text-sm">
                      Four-Color Card Deck
                    </div>
                    <div className="text-xs text-slate-400">
                      Render Diamonds in Blue and Clubs in Green for instant flush
                      recognition
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={fourColorDeck}
                    onChange={(e) => onToggleFourColorDeck(e.target.checked)}
                    className="w-5 h-5 accent-amber-500 rounded"
                  />
                </label>
              </div>

              {activeModal === 'pause' && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      onLeaveRoom();
                      onClose();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-200 font-semibold cursor-pointer"
                  >
                    Leave Table to Title
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      onClose();
                    }}
                    className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
                  >
                    Resume Game
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
