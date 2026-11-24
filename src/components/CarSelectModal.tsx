import { Check, Search, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CAR_THUMBNAILS } from '../data/carThumbnails';
import type { GarageCarSlot } from '../data/garageCars';
import type { CarModelId } from '../engine/SceneController';
import { CAR_CLASS_LABELS, type CarClassId } from '../shared/carTypes';

interface CarSelectModalProps {
  open: boolean;
  cars: GarageCarSlot[];
  selectedCarId: CarModelId;
  onSelectCar: (carId: CarModelId) => void;
  onClose: () => void;
}

type ClassFilterId = 'all' | CarClassId;
type SortModeId = 'bay' | 'pp_desc' | 'power_desc' | 'weight_asc';

function parseNumericStat(val: string): number {
  const num = Number(val.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function CarTileCard({
  car,
  selected,
  onSelect,
}: {
  car: GarageCarSlot;
  selected: boolean;
  onSelect: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const imgSrc = CAR_THUMBNAILS[car.id] ?? car.imageUrl ?? '';

  return (
    <button
      type="button"
      data-testid={`car-select-card-${car.id}`}
      onClick={onSelect}
      className={`group flex w-full shrink-0 flex-col overflow-hidden border text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
        selected
          ? 'border-sky-400 bg-[#0b1929]'
          : 'border-white/14 bg-[#0a0e15] hover:border-sky-400/65 hover:bg-[#0f1622]'
      }`}
    >
      {/* Large unobstructed thumbnail preview */}
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden border-b border-white/10 bg-[#05070b]">
        {!imgFailed && imgSrc ? (
          <img
            src={imgSrc}
            alt={car.imageAlt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-200 ease-out desktop:group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#101722] via-[#090d14] to-[#05070b] px-2 text-center">
            <Sparkles className="h-5 w-5 text-sky-400" />
            <span className="font-display text-[10px] font-bold tracking-wider text-slate-300 uppercase truncate max-w-full">
              {car.name}
            </span>
          </div>
        )}
      </div>

      {/* Minimal 2-line caption: Name + Class/Power/PP */}
      <div className="flex flex-col gap-1 px-2 py-2 sm:px-2.5">
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <h3 className="font-display text-xs sm:text-[13px] font-bold leading-tight text-white truncate">
            {car.name}
          </h3>
          {selected && (
            <Check className="h-3.5 w-3.5 text-sky-400 stroke-[3] shrink-0" />
          )}
        </div>

        <div className="font-mono-tabular flex items-center justify-between gap-2 text-[10px] sm:text-[10.5px] leading-none text-slate-400">
          <span className="truncate">
            {CAR_CLASS_LABELS[car.carClass]} · <span className="text-amber-300">{car.power}</span>
          </span>
          <span className="font-bold text-sky-300 whitespace-nowrap shrink-0">
            {car.pp} PP
          </span>
        </div>
      </div>
    </button>
  );
}

const FILTER_TABS: Array<{ id: ClassFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'gt3', label: CAR_CLASS_LABELS.gt3 },
  { id: 'hypercar', label: CAR_CLASS_LABELS.hypercar },
  { id: 'prototype', label: CAR_CLASS_LABELS.prototype },
  { id: 'street_rally', label: CAR_CLASS_LABELS.street_rally },
];

export function CarSelectModal({
  open,
  cars,
  selectedCarId,
  onSelectCar,
  onClose,
}: CarSelectModalProps) {
  const [classFilter, setClassFilter] = useState<ClassFilterId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortModeId>('bay');

  const classCounts = useMemo(() => {
    const counts: Record<ClassFilterId, number> = {
      all: cars.length,
      gt3: 0,
      hypercar: 0,
      prototype: 0,
      street_rally: 0,
    };
    for (const c of cars) {
      counts[c.carClass] = (counts[c.carClass] ?? 0) + 1;
    }
    return counts;
  }, [cars]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const mapped = cars
      .map((car, bayIndex) => ({ car, bayIndex }))
      .filter(({ car }) => {
        if (classFilter !== 'all' && car.carClass !== classFilter) return false;
        if (!q) return true;
        return (
          car.name.toLowerCase().includes(q) ||
          car.category.toLowerCase().includes(q) ||
          car.drivetrain.toLowerCase().includes(q) ||
          car.engineConfig.toLowerCase().includes(q) ||
          CAR_CLASS_LABELS[car.carClass].toLowerCase().includes(q)
        );
      });

    if (sortBy === 'pp_desc') {
      mapped.sort((a, b) => parseNumericStat(b.car.pp) - parseNumericStat(a.car.pp));
    } else if (sortBy === 'power_desc') {
      mapped.sort((a, b) => parseNumericStat(b.car.power) - parseNumericStat(a.car.power));
    } else if (sortBy === 'weight_asc') {
      mapped.sort((a, b) => parseNumericStat(a.car.weight) - parseNumericStat(b.car.weight));
    }
    return mapped;
  }, [cars, classFilter, searchQuery, sortBy]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-[#06080c]/95 p-0 sm:p-4"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Garage Vehicle Selection"
      data-testid="car-select-modal"
    >
      <div className="gt5-panel gt5-carbon flex h-[92dvh] sm:h-[86dvh] max-h-[820px] landscape-short:h-[96dvh] w-full max-w-5xl flex-col overflow-hidden border border-white/15 shadow-2xl">
        <div className="gt5-horizon-rule shrink-0" />

        {/* Compact Header */}
        <div className="flex items-center justify-between gap-2 border-b border-white/12 bg-black/60 px-3 py-2 sm:px-4 sm:py-2.5 shrink-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="font-display text-sm font-bold tracking-wider text-white uppercase sm:text-base truncate">
              Garage
            </h2>
            <span className="font-mono-tabular text-[11px] font-semibold text-sky-400 uppercase whitespace-nowrap">
              {filteredEntries.length} / {cars.length}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Vehicle Selection"
            className="inline-flex h-10 w-10 sm:h-8 sm:w-auto items-center justify-center gap-1.5 border border-white/16 bg-white/[0.05] sm:px-2.5 font-display text-[11px] font-bold tracking-wider text-slate-200 uppercase transition-colors hover:border-sky-400/70 hover:text-white whitespace-nowrap shrink-0"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>

        {/* Tight Class Filter + Search/Sort Toolbar */}
        <div className="flex flex-col gap-1.5 border-b border-white/10 bg-black/45 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4 shrink-0">
          <div
            className="flex items-center gap-1 overflow-x-auto no-scrollbar sm:flex-wrap"
            role="tablist"
            aria-label="Car Class Filter"
          >
            {FILTER_TABS.map((tab) => {
              const active = classFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setClassFilter(tab.id)}
                  className={`h-8 border px-2.5 py-1 font-display text-[10px] font-bold tracking-wider uppercase whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'border-sky-400 bg-sky-500/20 text-white'
                      : 'border-white/12 bg-black/50 text-slate-300 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {tab.label} ({classCounts[tab.id]})
                </button>
              );
            })}
          </div>

          <div className="flex w-full sm:w-auto sm:flex-1 items-center gap-1.5 sm:justify-end sm:min-w-[210px]">
            <label className="relative min-w-0 flex-1 sm:max-w-[230px]">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cars..."
                aria-label="Search garage vehicles"
                className="h-9 sm:h-8 w-full border border-white/15 bg-black/65 py-1 pr-2.5 pl-8 text-sm sm:text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
            </label>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortModeId)}
              aria-label="Sort garage vehicles"
              className="h-9 sm:h-8 max-w-[132px] sm:max-w-none border border-white/15 bg-black/75 px-2 py-1 font-mono-tabular text-xs sm:text-[11px] font-semibold text-slate-200 focus:border-sky-400 focus:outline-none shrink-0"
            >
              <option value="bay">Sort: Bay</option>
              <option value="pp_desc">Sort: Top PP</option>
              <option value="power_desc">Sort: Power</option>
              <option value="weight_asc">Sort: Lightest</option>
            </select>
          </div>
        </div>

        {/* Tight 2–3 Column Grid with Larger Car Thumbnails */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5 sm:p-3.5">
          <div className="grid grid-cols-2 auto-rows-max content-start items-stretch gap-2 sm:gap-2.5 md:grid-cols-3">
            {filteredEntries.map(({ car }) => {
              const isSelected = car.carModelId === selectedCarId;
              return (
                <CarTileCard
                  key={car.id}
                  car={car}
                  selected={isSelected}
                  onSelect={() => {
                    if (car.carModelId) {
                      onSelectCar(car.carModelId);
                      onClose();
                    }
                  }}
                />
              );
            })}
            {filteredEntries.length === 0 && (
              <div className="col-span-full border border-white/10 bg-black/50 py-10 text-center text-xs text-slate-400">
                No vehicles match &ldquo;{searchQuery}&rdquo; in {FILTER_TABS.find((t) => t.id === classFilter)?.label}.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
