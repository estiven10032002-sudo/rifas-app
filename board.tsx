import { STATUS_LABEL } from '@/lib/format';

export type CellState = 'available' | 'reserved' | 'paid' | 'winner' | 'selected' | 'disabled';

export interface CellInfo {
  state: CellState;
  /** Texto pequeño bajo el número (p. ej. el nombre). */
  label?: string | null;
  /** false = se ve pero no se puede tocar. */
  clickable?: boolean;
}

const STYLES: Record<CellState, string> = {
  available: 'border-slate-200 bg-white text-slate-700',
  reserved: 'border-amber-300 bg-amber-50 text-amber-900',
  paid: 'border-emerald-400 bg-emerald-50 text-emerald-900',
  winner: 'border-amber-500 bg-gradient-to-br from-yellow-200 to-amber-400 text-amber-950 shadow-md',
  selected: 'border-brand-600 bg-brand-600 text-white',
  disabled: 'border-slate-100 bg-slate-100 text-slate-400',
};

const HOVER: Partial<Record<CellState, string>> = {
  available: 'hover:border-brand-400 hover:bg-brand-50',
  reserved: 'hover:border-amber-400',
  paid: 'hover:border-emerald-500',
  winner: 'hover:brightness-105',
  selected: 'hover:bg-brand-700',
};

interface BoardProps {
  total: number;
  getCell: (n: number) => CellInfo;
  onSelect?: (n: number) => void;
}

/** Tablero de números. Sin estado propio: sirve tanto en servidor como en cliente. */
export function Board({ total, getCell, onSelect }: BoardProps) {
  const numbers = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10" role="list">
      {numbers.map((n) => {
        const cell = getCell(n);
        const interactive = !!onSelect && cell.state !== 'disabled' && cell.clickable !== false;
        const statusText = cell.state === 'selected' ? 'Seleccionado' : cell.state === 'disabled' ? 'Ocupado' : STATUS_LABEL[cell.state];
        const cls = `stub relative min-h-[3.6rem] rounded-xl border-2 px-1.5 pb-1.5 pt-2 text-center transition ${STYLES[cell.state]} ${
          interactive ? `cursor-pointer active:scale-95 ${HOVER[cell.state] ?? ''}` : ''
        }`;
        const inner = (
          <>
            <span className="block text-lg font-extrabold leading-none tabular-nums">{n}</span>
            <span className="mt-1 block h-3 truncate text-[10px] font-medium leading-3 opacity-80">
              {cell.state === 'winner' ? '★ Ganador' : cell.label ?? ''}
            </span>
          </>
        );
        return interactive ? (
          <button key={n} type="button" role="listitem" onClick={() => onSelect!(n)} className={cls} aria-label={`Puesto ${n}: ${statusText}`}>
            {inner}
          </button>
        ) : (
          <div key={n} role="listitem" className={cls} aria-label={`Puesto ${n}: ${statusText}`}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export function Legend({ selected = false }: { selected?: boolean }) {
  const items: { state: CellState; label: string }[] = [
    { state: 'available', label: 'Disponible' },
    { state: 'reserved', label: 'Reservado' },
    { state: 'paid', label: 'Pagado' },
    { state: 'winner', label: 'Ganador' },
  ];
  if (selected) items.push({ state: 'selected', label: 'Elegido' });
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
      {items.map((i) => (
        <span key={i.state} className="inline-flex items-center gap-1.5">
          <span className={`h-4 w-4 rounded-md border-2 ${STYLES[i.state]}`} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
