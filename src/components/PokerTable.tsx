import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Copy,
  Check,
  Volume2,
  VolumeX,
  MessageSquare,
  Eye,
  Play,
  RotateCcw,
  Settings,
  LogOut,
  Users,
  Sparkles,
  Pause,
} from 'lucide-react';
import {
  BettingActionType,
  ClientGameState,
  PublicPlayer,
} from '../poker/types';
import { PlayingCard } from './PlayingCard';
import { ChipStack } from './ChipStack';
import { AvatarIcon } from './AvatarIcon';
import { ActionPanel } from './ActionPanel';
import { sound } from '../utils/sound';

interface PokerTableProps {
  gameState: ClientGameState;
  feltTheme: 'emerald' | 'royal' | 'crimson';
  fourColorDeck: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onAction: (action: BettingActionType, amount?: number) => void;
  onStartHand: () => void;
  onRebuy: () => void;
  onToggleSpectator: () => void;
  onOpenSettings: () => void;
  onOpenPause: () => void;
  onOpenLobbyConfig: () => void;
  onLeaveRoom: () => void;
  onSendChat: (text?: string, emote?: string) => void;
  activeEmotes: Record<string, string>;
}

type SeatSlotId =
  | 'bottom-center'
  | 'bottom-left'
  | 'mid-left'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'mid-right'
  | 'bottom-right';

const QUICK_EMOTES = ['👏', '🔥', '😎', '🤔', '🍀', '💎'];

export const PokerTable: React.FC<PokerTableProps> = ({
  gameState,
  feltTheme,
  fourColorDeck,
  isMuted,
  onToggleMute,
  onAction,
  onStartHand,
  onRebuy,
  onToggleSpectator,
  onOpenSettings,
  onOpenPause,
  onOpenLobbyConfig,
  onLeaveRoom,
  onSendChat,
  activeEmotes,
}) => {
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [shuffling, setShuffling] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isDealingNextHand, setIsDealingNextHand] = useState(false);

  const myPlayer = gameState.players.find((p) => p.id === gameState.myPlayerId);
  const isSpectator = gameState.spectators.some(
    (s) => s.id === gameState.myPlayerId
  );
  const isHost = gameState.hostId === gameState.myPlayerId;
  const isMyTurn = gameState.activePlayerId === gameState.myPlayerId;

  const dealerPlayer = gameState.players.find(
    (p) => p.seatIndex === gameState.dealerSeatIndex
  );
  const canDealNextHand =
    !isSpectator &&
    (gameState.config.mode === 'ai' ||
      isHost ||
      Boolean(
        dealerPlayer &&
          !dealerPlayer.isAI &&
          dealerPlayer.id === gameState.myPlayerId
      ));

  // Reset duplicate-click lock when handNumber or phase transitions
  useEffect(() => {
    setIsDealingNextHand(false);
  }, [gameState.handNumber, gameState.phase]);

  const handleTriggerNextHand = () => {
    if (isDealingNextHand || !canDealNextHand) return;
    setIsDealingNextHand(true);
    sound.playShuffle();
    onStartHand();
    setTimeout(() => setIsDealingNextHand(false), 1500);
  };

  // Countdown timer for active turn
  useEffect(() => {
    if (!gameState.turnDeadline || !gameState.activePlayerId) {
      setRemainingSeconds(null);
      return;
    }
    const updateClock = () => {
      const diff = Math.max(
        0,
        Math.ceil((gameState.turnDeadline! - Date.now()) / 1000)
      );
      setRemainingSeconds(diff);
    };
    updateClock();
    const interval = setInterval(updateClock, 250);
    return () => clearInterval(interval);
  }, [gameState.turnDeadline, gameState.activePlayerId]);

  // Trigger brief deck shuffle animation on hand start
  useEffect(() => {
    if (gameState.phase === 'PREFLOP' && gameState.actionLog.length === 0) {
      setShuffling(true);
      sound.playShuffle();
      const t = setTimeout(() => setShuffling(false), 450);
      return () => clearTimeout(t);
    }
  }, [gameState.handNumber, gameState.phase, gameState.actionLog.length]);

  const handleCopyInvite = () => {
    sound.playClick();
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${gameState.roomCode}`;
    navigator.clipboard?.writeText(inviteUrl).catch(() => {});
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2200);
  };

  // Order players clockwise starting from Hero (myPlayerId) at index 0 ('bottom-center')
  const orderedPlayers = [...gameState.players].sort(
    (a, b) => a.seatIndex - b.seatIndex
  );
  const myIdxInOrdered = Math.max(
    0,
    orderedPlayers.findIndex((p) => p.id === gameState.myPlayerId)
  );

  const getPlayerSlotId = (playerId: string): SeatSlotId => {
    const idx = orderedPlayers.findIndex((p) => p.id === playerId);
    if (idx === -1) return 'bottom-center';
    const total = orderedPlayers.length;
    const rel = (idx - myIdxInOrdered + total) % total;

    const slotMaps: Record<number, SeatSlotId[]> = {
      1: ['bottom-center'],
      2: ['bottom-center', 'top-center'],
      3: ['bottom-center', 'top-left', 'top-right'],
      4: ['bottom-center', 'top-left', 'top-center', 'top-right'],
      5: [
        'bottom-center',
        'bottom-left',
        'top-left',
        'top-center',
        'top-right',
      ],
      6: [
        'bottom-center',
        'bottom-left',
        'top-left',
        'top-center',
        'top-right',
        'bottom-right',
      ],
      7: [
        'bottom-center',
        'bottom-left',
        'mid-left',
        'top-left',
        'top-center',
        'top-right',
        'bottom-right',
      ],
      8: [
        'bottom-center',
        'bottom-left',
        'mid-left',
        'top-left',
        'top-center',
        'top-right',
        'mid-right',
        'bottom-right',
      ],
    };

    const map = slotMaps[Math.min(8, Math.max(1, total))] || slotMaps[8];
    return map[rel] ?? 'bottom-center';
  };

  const slotToPlayer = new Map<SeatSlotId, PublicPlayer>();
  for (const p of orderedPlayers) {
    slotToPlayer.set(getPlayerSlotId(p.id), p);
  }

  // Clockwise deal order (0..N-1 starting left of dealer button) for staggered one-at-a-time card dealing
  const getClockwiseDealOrder = (seatIndex: number): number => {
    const total = Math.max(1, orderedPlayers.length);
    const dealerPos = orderedPlayers.findIndex(
      (p) => p.seatIndex === gameState.dealerSeatIndex
    );
    const playerPos = orderedPlayers.findIndex((p) => p.seatIndex === seatIndex);
    if (dealerPos === -1 || playerPos === -1) return 0;
    return (playerPos - dealerPos - 1 + total * 2) % total;
  };

  const feltClass = {
    emerald: 'poker-felt-emerald',
    royal: 'poker-felt-royal',
    crimson: 'poker-felt-crimson',
  }[feltTheme];

  const winningCardSet = new Set(gameState.winningCardIds);

  const formatActionBadge = (player: PublicPlayer) => {
    if (player.folded) {
      return {
        text: 'FOLDED',
        cls: 'bg-slate-800/95 text-slate-400 border-slate-700',
      };
    }
    if (player.allIn) {
      return {
        text: 'ALL-IN',
        cls: 'bg-rose-600/95 text-white border-rose-400',
      };
    }
    if (!player.lastAction) {
      return {
        text: 'READY',
        cls: 'bg-slate-800/60 text-slate-400 border-slate-700/60',
      };
    }
    switch (player.lastAction.type) {
      case 'thinking':
        return {
          text: 'THINKING',
          cls: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
        };
      case 'check':
        return {
          text: 'CHECK',
          cls: 'bg-emerald-900/90 text-emerald-200 border-emerald-500/40',
        };
      case 'call':
        return {
          text: `CALL $${player.lastAction.amount?.toLocaleString() ?? ''}`,
          cls: 'bg-emerald-700/90 text-white border-emerald-400/40',
        };
      case 'bet':
        return {
          text: `BET $${player.lastAction.amount?.toLocaleString() ?? ''}`,
          cls: 'bg-amber-500/95 text-slate-950 border-amber-300',
        };
      case 'raise':
        return {
          text: `RAISE $${player.lastAction.amount?.toLocaleString() ?? ''}`,
          cls: 'bg-amber-500/95 text-slate-950 border-amber-300',
        };
      case 'sb':
        return {
          text: `SB $${player.lastAction.amount ?? ''}`,
          cls: 'bg-slate-800/90 text-amber-200 border-amber-500/30',
        };
      case 'bb':
        return {
          text: `BB $${player.lastAction.amount ?? ''}`,
          cls: 'bg-slate-800/90 text-amber-200 border-amber-500/30',
        };
      default:
        return {
          text: 'IN HAND',
          cls: 'bg-slate-800/60 text-slate-300 border-slate-700/60',
        };
    }
  };

  /**
   * Renders a self-contained Player Seat Unit inside its dedicated CSS Grid slot.
   * Each Seat Unit consists of:
   *  1. SeatCore: [Dedicated Private Cards Region] + [Dedicated Rectangular Info Panel]
   *  2. DedicatedBetRegion: Positioned dynamically between this seat and the central pot.
   */
  const renderSeatSlot = (slotId: SeatSlotId) => {
    const player = slotToPlayer.get(slotId);
    if (!player) {
      return (
        <div
          key={slotId}
          data-slot={slotId}
          className="pointer-events-none select-none"
          aria-hidden="true"
        />
      );
    }

    const isTurn = gameState.activePlayerId === player.id;
    const isMe = player.id === gameState.myPlayerId;
    const isDealer = player.seatIndex === gameState.dealerSeatIndex;
    const isSB = player.seatIndex === gameState.smallBlindSeatIndex;
    const isBB = player.seatIndex === gameState.bigBlindSeatIndex;
    const actionBadge = formatActionBadge(player);
    const isWinner =
      gameState.phase === 'SHOWDOWN' &&
      gameState.awards.some((a) => a.winnerIds.includes(player.id));
    const emoteBubble = activeEmotes[player.id];
    const dealOrder = getClockwiseDealOrder(player.seatIndex);

    const isTopRow =
      slotId === 'top-left' || slotId === 'top-center' || slotId === 'top-right';
    const isBottomRow =
      slotId === 'bottom-left' ||
      slotId === 'bottom-center' ||
      slotId === 'bottom-right';
    const isMidLeft = slotId === 'mid-left';

    // Dedicated Bet Region (always reserves fixed height/width so layout never shifts when bets change)
    const betRegion = (
      <div
        data-testid={`seat-bet-${player.seatIndex}`}
        className="h-[26px] sm:h-[28px] min-w-[68px] flex items-center justify-center shrink-0"
      >
        {player.currentBet > 0 ? (
          <ChipStack amount={player.currentBet} size="sm" />
        ) : null}
      </div>
    );

    // Dedicated Private Cards Region + Rectangular Player Info Panel
    const seatCore = (
      <div
        data-testid={`seat-core-${player.seatIndex}`}
        className="relative flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 md:gap-2"
      >
        {/* Emote Reaction Badge */}
        <AnimatePresence>
          {emoteBubble && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1.15 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="absolute -top-5 right-1 z-30 text-xl drop-shadow pointer-events-none"
            >
              {emoteBubble}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dedicated Private Cards Area (Never overlaps community cards or player info panel) */}
        <div
          data-testid={`seat-cards-${player.seatIndex}`}
          className="flex items-center justify-center -space-x-1.5 sm:-space-x-2 shrink-0 min-w-[54px] sm:min-w-[68px] h-[48px] sm:h-[58px] md:h-[64px]"
        >
          {player.cardCount > 0 ? (
            player.holeCards.map((c, cIdx) => (
              <PlayingCard
                key={`hand-${gameState.handNumber}-${player.id}-card-${cIdx}-${
                  c ? c.id : 'back'
                }`}
                card={c}
                size="xs"
                fourColorDeck={fourColorDeck}
                highlighted={Boolean(c && winningCardSet.has(c.id))}
                dimmed={player.folded}
                dealDelay={dealOrder * 0.06 + cIdx * 0.14}
                className={cIdx === 0 ? '-rotate-2' : 'rotate-2'}
              />
            ))
          ) : (
            <div className="flex items-center -space-x-1.5 opacity-25">
              <div className="w-8 h-12 sm:w-10 sm:h-14 md:w-11 md:h-16 rounded-md border border-dashed border-amber-300/40 bg-black/20" />
              <div className="w-8 h-12 sm:w-10 sm:h-14 md:w-11 md:h-16 rounded-md border border-dashed border-amber-300/40 bg-black/20" />
            </div>
          )}
        </div>

        {/* Dedicated Rectangular Player Information Panel */}
        <div
          data-testid={`seat-panel-${player.seatIndex}`}
          className={`w-[104px] sm:w-[148px] md:w-[168px] lg:w-[180px] rounded-xl px-2 py-1 sm:px-2.5 sm:py-1.5 bg-[#0D141D]/95 border transition-colors flex flex-col justify-between gap-0.5 shrink-0 ${
            isWinner
              ? 'border-amber-400 ring-2 ring-amber-400/70 shadow-[0_0_20px_rgba(251,191,36,0.45)]'
              : isTurn
              ? 'border-amber-400 ring-2 ring-amber-400/50 shadow-[0_0_16px_rgba(251,191,36,0.35)]'
              : player.folded
              ? 'border-slate-800/90 opacity-65'
              : 'border-slate-700/85'
          }`}
        >
          {/* Row 1: Avatar + Player Name + Inline Dealer / Blind Indicators */}
          <div className="flex items-center justify-between gap-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div className="hidden md:block shrink-0">
                <AvatarIcon avatar={player.avatar} size="sm" active={isTurn} />
              </div>
              <span className="text-[10px] sm:text-xs font-semibold text-white truncate">
                {player.name}
              </span>
              {isMe && (
                <span className="text-[9px] sm:text-[10px] font-mono text-amber-400 shrink-0">
                  (You)
                </span>
              )}
            </div>

            {/* Inline Dealer (D), Small Blind (SB), Big Blind (BB) Badges */}
            <div className="flex items-center gap-0.5 shrink-0">
              {isDealer && (
                <span
                  data-testid={`dealer-badge-${player.seatIndex}`}
                  className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 font-mono font-extrabold text-[9px] flex items-center justify-center border border-white"
                  title="Dealer Button"
                >
                  D
                </span>
              )}
              {isSB && (
                <span
                  className="px-1 h-4 rounded bg-sky-600 text-white font-mono font-bold text-[8px] sm:text-[9px] flex items-center justify-center"
                  title="Small Blind"
                >
                  SB
                </span>
              )}
              {isBB && (
                <span
                  className="px-1 h-4 rounded bg-indigo-600 text-white font-mono font-bold text-[8px] sm:text-[9px] flex items-center justify-center"
                  title="Big Blind"
                >
                  BB
                </span>
              )}
            </div>
          </div>

          {/* Row 2: Chip Balance + Hand Rank */}
          <div className="flex items-center justify-between gap-1 min-w-0">
            <span
              data-testid={`seat-chips-${player.seatIndex}`}
              className="font-mono font-bold text-[10px] sm:text-xs text-emerald-400 tabular-nums truncate"
            >
              ${player.chips.toLocaleString()}
            </span>

            {player.evaluatedHand &&
              !player.folded &&
              (isMe || gameState.phase === 'SHOWDOWN') && (
                <span className="text-[9px] sm:text-[10px] text-amber-300 truncate font-medium max-w-[66px] sm:max-w-[78px]">
                  {player.evaluatedHand.categoryName}
                </span>
              )}
          </div>

          {/* Row 3: Fixed-Height Status Pill + Turn Progress Track */}
          <div className="pt-0.5 border-t border-slate-800/90 flex flex-col gap-1">
            <div className="h-[18px] flex items-center justify-between gap-1 text-[9px] sm:text-[10px] font-mono">
              {actionBadge && (
                <span
                  data-testid={`seat-status-${player.seatIndex}`}
                  className={`px-1.5 py-0.5 rounded border font-bold leading-none whitespace-nowrap truncate ${actionBadge.cls}`}
                >
                  {actionBadge.text}
                </span>
              )}
              {isTurn && remainingSeconds !== null && (
                <span className="text-[9px] text-amber-300 font-mono tabular-nums shrink-0">
                  {remainingSeconds}s
                </span>
              )}
            </div>

            {/* Always-rendered 4px turn progress track so seat height never shifts */}
            <div className="w-full h-1 bg-slate-800/80 rounded-full overflow-hidden">
              {isTurn && remainingSeconds !== null ? (
                <div
                  className="h-full bg-amber-400 transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      (remainingSeconds /
                        Math.max(1, gameState.config.turnTimerSeconds)) *
                        100
                    )}%`,
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );

    // Orient SeatCore and DedicatedBetRegion so the bet always sits between the seat and the central pot
    if (isTopRow) {
      return (
        <div
          key={slotId}
          data-slot={slotId}
          data-testid={`seat-unit-${player.seatIndex}`}
          className="flex flex-col items-center justify-start gap-1.5"
        >
          {seatCore}
          {betRegion}
        </div>
      );
    }

    if (isBottomRow) {
      return (
        <div
          key={slotId}
          data-slot={slotId}
          data-testid={`seat-unit-${player.seatIndex}`}
          className="flex flex-col items-center justify-end gap-1.5"
        >
          {betRegion}
          {seatCore}
        </div>
      );
    }

    // Middle-left or Middle-right (for 7-8 players)
    return (
      <div
        key={slotId}
        data-slot={slotId}
        data-testid={`seat-unit-${player.seatIndex}`}
        className={`flex items-center gap-2 ${
          isMidLeft ? 'flex-row' : 'flex-row-reverse'
        }`}
      >
        {seatCore}
        {betRegion}
      </div>
    );
  };

  return (
    <div className="relative w-full min-h-screen overflow-x-hidden overflow-y-auto bg-[#060A0E] flex flex-col justify-between select-none">
      {/* Ambient Casino Spotlight */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, rgba(16, 185, 129, 0.08) 0%, rgba(6, 10, 14, 0.95) 75%)',
        }}
      />

      {/* REGION 1: Top Perimeter Game HUD Bar */}
      <header className="relative z-30 flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-6 py-2 bg-[#0A0F16]/95 border-b border-slate-800/80 shrink-0">
        {/* Left Cluster: Room Identity & Invite Link */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg px-2 py-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">
              Room
            </span>
            <span className="font-mono font-bold text-xs sm:text-sm text-amber-400 tracking-wider">
              {gameState.roomCode}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopyInvite}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Copy shareable room invitation URL"
          >
            {copiedInvite ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Copy Invite Link</span>
                <span className="sm:hidden">Invite</span>
              </>
            )}
          </button>

          {isHost && (
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                onOpenLobbyConfig();
              }}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span>Manage Table / Bots</span>
            </button>
          )}
        </div>

        {/* Center Cluster: Live Blinds, Hand Counter & Phase */}
        <div className="hidden lg:flex items-center gap-4 text-xs text-slate-300 font-mono tabular-nums">
          <span>HAND #{gameState.handNumber}</span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span>
            BLINDS ${gameState.config.smallBlind}/${gameState.config.bigBlind}
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="text-amber-300 font-semibold">{gameState.phase}</span>
        </div>

        {/* Right Cluster: Spectator, Chat, Audio, Settings, Pause, Leave */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onToggleSpectator();
            }}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isSpectator
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
            title={
              isSpectator ? 'Take a Seat at the Table' : 'Switch to Spectator Mode'
            }
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {isSpectator ? 'Sit Down' : 'Spectate'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setChatOpen((prev) => !prev);
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
            aria-label="Toggle Table Chat"
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Chat</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            tabIndex={-1}
            className="p-1.5 sm:p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors cursor-pointer"
            aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            title="Mute / Unmute [M]"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              sound.playClick();
              onOpenSettings();
            }}
            tabIndex={-1}
            className="p-1.5 sm:p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors cursor-pointer"
            aria-label="Table Settings"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              sound.playClick();
              onOpenPause();
            }}
            tabIndex={-1}
            className="p-1.5 sm:p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors cursor-pointer"
            aria-label="Pause Game"
            title="Pause [P]"
          >
            <Pause className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onLeaveRoom();
            }}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/30 text-rose-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
            aria-label="Leave Table"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* REGION 2: Centered Casino Table Stage with Dedicated CSS Grid Regions */}
      <div className="relative z-10 flex-1 w-full flex items-center justify-center px-2 sm:px-6 py-1 sm:py-2">
        <div
          data-testid="poker-table-rail"
          className="relative w-full max-w-[1140px] poker-table-rail rounded-[44px] sm:rounded-[120px] lg:rounded-[180px] p-1.5 sm:p-3 shadow-2xl"
        >
          {/* Inner Felt Surface — 3-Row CSS Grid (Top Seats | Central Pot & Community Cards | Bottom Seats) */}
          <div
            data-testid="poker-table-felt"
            className={`relative w-full ${feltClass} rounded-[36px] sm:rounded-[108px] lg:rounded-[166px] border-2 border-amber-400/25 shadow-inner px-2 py-2.5 sm:px-6 sm:py-3 md:px-10 md:py-3.5 grid grid-rows-[auto_1fr_auto] gap-y-1.5 sm:gap-y-2 items-center`}
          >
            {/* Subtle decorative inner casino brass line */}
            <div className="pointer-events-none absolute inset-3 sm:inset-5 rounded-[28px] sm:rounded-[92px] lg:rounded-[146px] border border-amber-300/15" />

            {/* GRID ROW 1: Top Perimeter Seats (Top-Left, Top-Center, Top-Right) + Their Dedicated Bet Regions */}
            <div
              data-testid="table-top-row"
              className="relative z-10 grid grid-cols-3 items-start justify-items-center gap-1.5 sm:gap-3 w-full"
            >
              {renderSeatSlot('top-left')}
              {renderSeatSlot('top-center')}
              {renderSeatSlot('top-right')}
            </div>

            {/* GRID ROW 2: Dedicated Central Region (Optional Mid Wings + Central Pot + 5 Community Cards) */}
            <div
              data-testid="table-middle-row"
              className="relative z-10 flex flex-wrap lg:flex-nowrap items-center justify-center gap-3 sm:gap-6 w-full py-1"
            >
              {slotToPlayer.has('mid-left') && renderSeatSlot('mid-left')}

              {/* Dedicated Central Board: Pot Region + 5 Community Cards Region */}
              <div
                data-testid="table-center-board"
                className="flex flex-col items-center justify-center gap-2 mx-auto px-2"
              >
                {/* Dedicated Central Pot Position */}
                <div
                  data-testid="central-pot-region"
                  className="min-h-[30px] flex flex-wrap items-center justify-center gap-1.5 sm:gap-2"
                >
                  {gameState.pot > 0 ? (
                    <ChipStack
                      amount={gameState.pot}
                      size="md"
                      label="Total Pot"
                    />
                  ) : (
                    <div className="px-3 py-1 rounded-lg bg-black/40 border border-white/15 text-[11px] sm:text-xs text-slate-200 font-mono">
                      BLINDS ${gameState.config.smallBlind} / $
                      {gameState.config.bigBlind}
                    </div>
                  )}

                  {gameState.pots.length > 1 &&
                    gameState.pots.map((sp, i) => (
                      <div
                        key={i}
                        className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md bg-black/65 border border-amber-400/35 text-[10px] sm:text-xs font-mono text-amber-200 tabular-nums"
                      >
                        {sp.name}: ${sp.amount.toLocaleString()}
                      </div>
                    ))}
                </div>

                {/* Dedicated Central 5 Community Cards Region */}
                <div
                  data-testid="community-cards-region"
                  className="flex items-center justify-center gap-1 sm:gap-2 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl bg-black/25 border border-amber-300/15"
                >
                  {/* Dealer Deck Visual */}
                  <motion.div
                    animate={
                      shuffling
                        ? { x: [0, -5, 5, -3, 3, 0], rotate: [0, -2, 2, 0] }
                        : { x: 0, rotate: 0 }
                    }
                    transition={{ duration: 0.4 }}
                    className="hidden md:flex relative mr-1 pointer-events-none"
                    title="52-Card Cryptographic Deck"
                  >
                    <PlayingCard card={null} size="sm" />
                  </motion.div>

                  {/* 5 Community Card Slots (Flop 1-3, Turn 4, River 5) */}
                  {[0, 1, 2, 3, 4].map((slotIdx) => {
                    const card = gameState.communityCards[slotIdx] || null;
                    return card ? (
                      <PlayingCard
                        key={`hand-${gameState.handNumber}-comm-${slotIdx}-${card.id}`}
                        card={card}
                        size="sm"
                        fourColorDeck={fourColorDeck}
                        highlighted={winningCardSet.has(card.id)}
                        dimmed={
                          gameState.phase === 'SHOWDOWN' &&
                          winningCardSet.size > 0 &&
                          !winningCardSet.has(card.id)
                        }
                        dealDelay={slotIdx < 3 ? slotIdx * 0.1 : 0.06}
                      />
                    ) : (
                      <div
                        key={`hand-${gameState.handNumber}-empty-${slotIdx}`}
                        className="w-9 h-13 sm:w-11 sm:h-16 rounded-md border border-white/15 bg-black/25 flex items-center justify-center text-[8px] sm:text-[9px] font-mono uppercase tracking-wider text-white/35 select-none pointer-events-none shrink-0"
                      >
                        {slotIdx < 3 ? 'Flop' : slotIdx === 3 ? 'Turn' : 'River'}
                      </div>
                    );
                  })}
                </div>

                {/* Host Configuration Button in Waiting State */}
                {gameState.phase === 'WAITING' && isHost && (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      onOpenLobbyConfig();
                    }}
                    className="px-3 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-amber-200 border border-amber-500/35 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Configure Table / Add AI Bots
                  </button>
                )}
              </div>

              {slotToPlayer.has('mid-right') && renderSeatSlot('mid-right')}
            </div>

            {/* GRID ROW 3: Bottom Perimeter Seats (Bottom-Left, Bottom-Center Hero, Bottom-Right) + Their Dedicated Bet Regions */}
            <div
              data-testid="table-bottom-row"
              className="relative z-10 grid grid-cols-3 items-end justify-items-center gap-1.5 sm:gap-3 w-full"
            >
              {renderSeatSlot('bottom-left')}
              {renderSeatSlot('bottom-center')}
              {renderSeatSlot('bottom-right')}
            </div>
          </div>
        </div>
      </div>

      {/* REGION 3: Dedicated Bottom Action Area (Completely Outside & Below the Poker Table) */}
      <footer
        data-testid="bottom-action-dock"
        className="relative z-30 w-full px-3 sm:px-6 pb-3 pt-0.5 flex flex-col items-center gap-2 shrink-0"
      >
        {/* Hero Live Hand Rank + Quick Emote Bar */}
        <div className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-2">
          {gameState.myEvaluatedHand && myPlayer && !myPlayer.folded ? (
            <div className="flex items-center gap-2 bg-[#0D141D]/90 border border-slate-800 rounded-xl px-3 py-1 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-slate-400">Your Hand:</span>
              <span className="font-semibold text-amber-300">
                {gameState.myEvaluatedHand.description}
              </span>
            </div>
          ) : (
            <div />
          )}

          {/* Quick Emotes Bar */}
          <div className="flex items-center gap-1 bg-[#0D141D]/90 border border-slate-800 rounded-xl px-2 py-0.5 ml-auto">
            {QUICK_EMOTES.map((emote) => (
              <button
                key={emote}
                type="button"
                onClick={() => {
                  sound.playClick();
                  onSendChat(undefined, emote);
                }}
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg hover:bg-slate-800 flex items-center justify-center text-sm transition-transform hover:scale-110 cursor-pointer"
                title={`Send ${emote} reaction`}
              >
                {emote}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Betting Action Panel (Rendered when it's Hero's turn) */}
        {isMyTurn && gameState.myLegalActions && myPlayer ? (
          <ActionPanel
            legalActions={gameState.myLegalActions}
            currentPot={gameState.pot}
            bigBlind={gameState.config.bigBlind}
            myCurrentBet={myPlayer.currentBet}
            onAction={onAction}
          />
        ) : (
          <div className="w-full max-w-2xl flex flex-col items-center gap-2.5">
            {/* Showdown / Status Notification Banner */}
            <div
              data-testid="showdown-notification"
              className="w-full bg-[#0D131A]/95 border border-amber-500/35 rounded-xl px-4 py-1.5 text-xs sm:text-sm text-slate-200 text-center shadow-lg flex flex-col items-center gap-0.5"
            >
              {gameState.phase === 'SHOWDOWN' && gameState.awards.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-xs sm:text-sm">
                  {gameState.awards.map((award, idx) => (
                    <span key={idx}>
                      <span className="font-bold text-amber-300">
                        {award.winnerNames.join(' & ')}
                      </span>{' '}
                      <span className="text-slate-300">won</span>{' '}
                      <span className="font-mono font-bold text-emerald-400 tabular-nums">
                        ${award.amount.toLocaleString()}
                      </span>{' '}
                      <span className="text-slate-400">({award.potName})</span>
                      {award.winningHandName && (
                        <span className="text-amber-200 font-medium">
                          {' '}
                          — {award.winningHandName}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              <span className="text-slate-300">
                {isSpectator
                  ? 'Spectator Mode — Watching live table action (Private cards hidden).'
                  : gameState.phase === 'WAITING'
                  ? gameState.players.length < 2
                    ? 'Waiting for at least 2 players to take a seat...'
                    : canDealNextHand
                    ? 'Waiting for hand to begin. Click "Deal Hand" below to start.'
                    : 'Waiting for the room host or dealer to start the hand...'
                  : gameState.phase === 'SHOWDOWN'
                  ? canDealNextHand
                    ? 'Showdown complete. Click "Deal Next Hand" to continue.'
                    : 'Showdown complete. Waiting for host/dealer to deal the next hand...'
                  : `Waiting for ${
                      gameState.players.find(
                        (p) => p.id === gameState.activePlayerId
                      )?.name || 'player'
                    } to act...`}
              </span>
            </div>

            {/* Dedicated Bottom-Center Action Area (Below Showdown Message, Outside Poker Table) */}
            {((gameState.phase === 'SHOWDOWN' ||
              (gameState.phase === 'WAITING' &&
                gameState.players.length >= 2)) &&
              canDealNextHand) ||
            (myPlayer &&
              myPlayer.chips < gameState.config.startingChips &&
              (gameState.phase === 'WAITING' ||
                gameState.phase === 'SHOWDOWN')) ? (
              <div
                data-testid="bottom-deal-action-area"
                className="w-full flex flex-wrap items-center justify-center gap-4"
              >
                {(gameState.phase === 'SHOWDOWN' ||
                  (gameState.phase === 'WAITING' &&
                    gameState.players.length >= 2)) &&
                  canDealNextHand && (
                    <button
                      type="button"
                      data-start="true"
                      data-testid="deal-next-hand-btn"
                      disabled={isDealingNextHand}
                      onClick={handleTriggerNextHand}
                      className="w-[204px] min-w-[180px] max-w-[220px] h-[50px] min-h-[48px] max-h-[54px] px-5 rounded-xl bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:via-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-extrabold text-sm sm:text-base tracking-wide border border-amber-200/80 shadow-[0_8px_24px_rgba(245,158,11,0.4)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      <span>
                        {isDealingNextHand
                          ? 'Dealing...'
                          : gameState.phase === 'SHOWDOWN'
                          ? 'Deal Next Hand'
                          : 'Deal Hand'}
                      </span>
                    </button>
                  )}

                {myPlayer &&
                  myPlayer.chips < gameState.config.startingChips &&
                  (gameState.phase === 'WAITING' ||
                    gameState.phase === 'SHOWDOWN') && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playChips();
                        onRebuy();
                      }}
                      className="h-[50px] min-h-[48px] max-h-[54px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-600 border border-emerald-400/40 text-white font-bold text-sm shadow-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-4 h-4 shrink-0" />
                      <span>Top-Up Stack</span>
                    </button>
                  )}
              </div>
            ) : null}
          </div>
        )}
      </footer>

      {/* Collapsible In-Room Chat & Action Log Drawer */}
      <AnimatePresence>
        {chatOpen && (
          <motion.aside
            initial={{ x: 340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 340, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed right-3 top-14 bottom-20 w-80 bg-[#0B1017]/95 border border-slate-800 rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden"
            aria-label="Room Chat and Action Log"
          >
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="font-semibold text-sm text-white">
                Table Chat &amp; Log
              </span>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
              {gameState.chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg p-2 ${
                    msg.isSystem
                      ? 'bg-slate-900/70 text-amber-300/90 border border-amber-500/20'
                      : 'bg-slate-900 text-slate-200'
                  }`}
                >
                  <span className="font-semibold text-amber-400">
                    {msg.senderName}:{' '}
                  </span>
                  <span>{msg.text}</span>
                  {msg.emote && <span className="ml-1 text-base">{msg.emote}</span>}
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatInput.trim()) return;
                onSendChat(chatInput.trim());
                setChatInput('');
              }}
              className="p-2.5 border-t border-slate-800 flex items-center gap-2"
            >
              <label htmlFor="table-chat-input" className="sr-only">
                Chat Message
              </label>
              <input
                id="table-chat-input"
                type="text"
                placeholder="Send message to table..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Send
              </button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
};
