interface LoadingOverlayProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  progressPct?: number | null;
}

export function LoadingOverlay({
  visible,
  title,
  subtitle,
  progressPct = null,
}: LoadingOverlayProps) {
  if (!visible) return null;

  const hasNumericProgress =
    typeof progressPct === 'number' && Number.isFinite(progressPct);
  const clampedPct = hasNumericProgress
    ? Math.max(0, Math.min(100, Math.round(progressPct)))
    : null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#06090f] px-4 pt-safe pb-safe"
      role="status"
      aria-live="polite"
      aria-label={title}
      data-testid="global-loading-overlay"
    >
      <div className="w-full max-w-md border border-white/15 bg-[#0b1018] shadow-2xl">
        <div className="gt5-horizon-rule" />
        <div className="p-5 landscape-short:p-4 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono-tabular text-[10px] font-bold tracking-[0.22em] text-sky-400">
              Limit state <span className="text-white">.VYROX</span>
            </span>
            {clampedPct !== null ? (
              <span className="font-mono-tabular text-xs font-bold text-sky-300">
                {clampedPct}%
              </span>
            ) : (
              <span className="font-mono-tabular text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                Preparing
              </span>
            )}
          </div>

          <h2 className="font-display mt-2.5 text-lg font-bold tracking-wide text-white uppercase sm:text-xl">
            {title}
          </h2>

          {subtitle && (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
              {subtitle}
            </p>
          )}

          <div className="mt-5 h-1.5 w-full overflow-hidden border border-white/10 bg-black/70">
            {clampedPct !== null ? (
              <div
                className="h-full bg-sky-400 transition-[width] duration-150 ease-out"
                style={{ width: `${Math.max(4, clampedPct)}%` }}
              />
            ) : (
              <div className="h-full w-2/5 bg-sky-400 animate-[loading-slide_1.1s_ease-in-out_infinite]" />
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes loading-slide {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(260%); }
        }
      `}</style>
    </div>
  );
}
