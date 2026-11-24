import { Flag, Swords, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MAP_REGISTRY, type MapId } from '../Maps/mapRegistry';
import type { PartyInviteNotification } from '../shared/socialTypes';

export interface RaceInviteToastProps {
  invite: PartyInviteNotification | null;
  onAccept: (invite: PartyInviteNotification) => void;
  onDismiss: () => void;
}

export function RaceInviteToast({ invite, onAccept, onDismiss }: RaceInviteToastProps) {
  const durationMs = invite
    ? Math.max(
        5000,
        invite.expiresAt && invite.expiresAt > invite.createdAt
          ? invite.expiresAt - invite.createdAt
          : 25000,
      )
    : 25000;

  const [remainingMs, setRemainingMs] = useState<number>(durationMs);

  useEffect(() => {
    if (!invite) return;
    const startedAt = Date.now();
    setRemainingMs(durationMs);
    const timer = window.setInterval(() => {
      const left = Math.max(0, durationMs - (Date.now() - startedAt));
      setRemainingMs(left);
      if (left <= 0) {
        window.clearInterval(timer);
        onDismiss();
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [invite?.id, durationMs, onDismiss]);

  if (!invite) return null;

  const resolvedMapTitle =
    MAP_REGISTRY[invite.mapId as MapId]?.shortName ??
    MAP_REGISTRY[invite.mapTitle as MapId]?.shortName ??
    invite.mapTitle;

  const secLeft = Math.ceil(remainingMs / 1000);
  const progressPct = Math.max(0, Math.min(100, (remainingMs / durationMs) * 100));
  const isUrgent = progressPct <= 30;
  const isChallenge = Boolean(invite.isDirectChallenge || invite.activityMode === 'race');

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="Live race invitation"
      className="pointer-events-auto fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-50 w-[min(94vw,440px)] -translate-x-1/2 gt5-panel shadow-2xl"
    >
      <div className="gt5-horizon-rule" />
      <div className="p-3 sm:p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center border ${
                isChallenge
                  ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                  : 'border-sky-400/50 bg-sky-500/15 text-sky-300'
              }`}
            >
              {isChallenge ? <Swords className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`font-display text-[11px] font-bold tracking-wider uppercase ${
                    isChallenge ? 'text-amber-300' : 'text-sky-300'
                  }`}
                >
                  {invite.isDirectChallenge ? 'Direct Race Challenge' : 'Live Party Invite'}
                </span>
                <span className="font-mono-tabular text-[11px] font-bold text-slate-300 tabular-nums">
                  {secLeft}s
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs font-semibold text-white">
                <span className="text-sky-300">@{invite.fromUsername}</span>{' '}
                {invite.activityMode === 'race' ? 'challenged you on' : 'invited you to'}{' '}
                <span className="text-amber-200">{resolvedMapTitle}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss race invite"
            className="flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center text-slate-400 transition-colors hover:bg-white/10 hover:text-white shrink-0"
          >
            <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </button>
        </div>

        <div className="font-mono-tabular mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-slate-400 uppercase">
          <span className="text-slate-200">
            {invite.activityMode === 'race' ? 'Race' : 'Free-Roam'}
          </span>
          {invite.mapType && (
            <>
              <span>·</span>
              <span>{invite.mapType}</span>
            </>
          )}
          {invite.difficulty && (
            <>
              <span>·</span>
              <span>{invite.difficulty}</span>
            </>
          )}
          <span>·</span>
          <span>Room #{invite.roomCode}</span>
        </div>

        <div className="mt-2.5 h-1 w-full overflow-hidden bg-white/10">
          <div
            className={`h-full transition-[width] duration-100 ease-linear ${
              isUrgent ? 'bg-amber-400' : 'bg-sky-400'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="mt-2.5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="h-10 sm:h-auto border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:border-white/30 hover:text-white whitespace-nowrap shrink-0"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => onAccept(invite)}
            className="inline-flex h-10 sm:h-auto items-center gap-1.5 bg-sky-500 px-3.5 py-1.5 font-display text-[11px] font-bold tracking-wider text-slate-950 uppercase transition-colors hover:bg-sky-400 whitespace-nowrap shrink-0"
          >
            <Flag className="h-3.5 w-3.5" />
            <span>Accept &amp; Race</span>
          </button>
        </div>
      </div>
    </div>
  );
}
