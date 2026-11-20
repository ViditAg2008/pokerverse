import React from 'react';

export const AVATAR_OPTIONS = [
  { id: 'crown', label: 'Sovereign Crown', color: 'from-amber-500 to-yellow-700' },
  { id: 'shield', label: 'Iron Aegis', color: 'from-emerald-500 to-teal-800' },
  { id: 'diamond', label: 'Royal Diamond', color: 'from-sky-400 to-blue-800' },
  { id: 'flame', label: 'Crimson Blaze', color: 'from-rose-500 to-red-800' },
  { id: 'spade', label: 'Obsidian Spade', color: 'from-slate-600 to-slate-900' },
  { id: 'star', label: 'Golden Astral', color: 'from-amber-400 to-orange-700' },
  { id: 'zap', label: 'Volt Striker', color: 'from-teal-400 to-emerald-800' },
];

interface AvatarIconProps {
  avatar: string;
  size?: 'sm' | 'md' | 'lg';
  isAI?: boolean;
  active?: boolean;
}

export const AvatarIcon: React.FC<AvatarIconProps> = ({
  avatar,
  size = 'md',
  active = false,
}) => {
  const option =
    AVATAR_OPTIONS.find((a) => a.id === avatar) || AVATAR_OPTIONS[0];

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-11 h-11',
    lg: 'w-14 h-14',
  }[size];

  const iconSize = {
    sm: 16,
    md: 22,
    lg: 28,
  }[size];

  return (
    <div
      className={`${sizeClasses} rounded-full bg-gradient-to-br ${option.color} flex items-center justify-center relative shrink-0 shadow-md ${
        active
          ? 'ring-2 ring-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.5)]'
          : 'border border-white/20'
      }`}
      aria-hidden="true"
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        className="text-white drop-shadow"
      >
        {avatar === 'crown' && (
          <path
            d="M3 18h18v2H3v-2zm0-2l2-9 5 4 2-6 2 6 5-4 2 9H3z"
            fill="currentColor"
          />
        )}
        {avatar === 'shield' && (
          <path
            d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm0 4.5l4 1.5v4.1c0 3.1-2.1 5.9-4 6.9-1.9-1-4-3.8-4-6.9V8l4-1.5z"
            fill="currentColor"
          />
        )}
        {avatar === 'diamond' && (
          <path d="M12 2L20 12L12 22L4 12L12 2Z" fill="currentColor" />
        )}
        {avatar === 'flame' && (
          <path
            d="M13.5 2C13.5 2 18 6.5 18 11.5C18 15.64 14.64 19 10.5 19C9.8 19 9.1 18.9 8.5 18.7C10.5 17.5 11.5 15.2 11.5 13C11.5 10.5 9.5 8.5 9.5 8.5C9.5 11 7 12 7 15C7 17.2 8.2 19.1 10 20.1C6.6 19.4 4 16.4 4 12.8C4 7.8 9 4.5 13.5 2Z"
            fill="currentColor"
          />
        )}
        {avatar === 'spade' && (
          <path
            d="M12 2C7 7 4 10.5 4 14C4 16.5 6 18.5 8.5 18.5C10 18.5 11.2 17.8 11.6 17L10 22H14L12.4 17C12.8 17.8 14 18.5 15.5 18.5C18 18.5 20 16.5 20 14C20 10.5 17 7 12 2Z"
            fill="currentColor"
          />
        )}
        {avatar === 'star' && (
          <path
            d="M12 2L14.9 8.6L22 9.3L16.6 14L18.2 21L12 17.3L5.8 21L7.4 14L2 9.3L9.1 8.6L12 2Z"
            fill="currentColor"
          />
        )}
        {avatar === 'zap' && (
          <path
            d="M13 2L4 14H11L10 22L20 10H13L13 2Z"
            fill="currentColor"
          />
        )}
        {!['crown', 'shield', 'diamond', 'flame', 'spade', 'star', 'zap'].includes(
          avatar
        ) && (
          <circle cx="12" cy="12" r="7" fill="currentColor" />
        )}
      </svg>
    </div>
  );
};
