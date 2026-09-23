import Link from 'next/link';
import { Board, type CellState } from '@/components/board';
import { APP_NAME } from '@/lib/config';

const DEMO: Record<number, CellState> = { 2: 'paid', 3: 'paid', 5: 'reserved', 7: 'winner', 8: 'paid', 10: 'reserved' };

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-5 py-12">
      <h1 className="text-5xl font-black leading-none sm:text-6xl">{APP_NAME}</h1>
      <p className="mt-4 max-w-md text-lg text-slate-600">
        Tablero de números, pagos y sorteo en un solo lugar. Los datos quedan guardados en la nube.
      </p>
      <div className="mt-8">
        <Board total={10} getCell={(n) => ({ state: DEMO[n] ?? 'available' })} />
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link href="/login" className="btn btn-primary">
          Entrar al panel
        </Link>
        <p className="text-sm text-slate-500">¿Buscas una rifa? Pídele el enlace al organizador.</p>
      </div>
    </main>
  );
}
