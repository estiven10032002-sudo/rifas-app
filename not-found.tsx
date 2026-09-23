import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="text-7xl font-black text-brand-600">404</p>
      <h1 className="mt-3 text-2xl font-bold">No encontramos esa página</h1>
      <p className="mt-2 text-slate-600">Puede que la rifa ya no esté disponible o que el enlace tenga un error.</p>
      <Link href="/" className="btn btn-secondary mt-6">
        Ir al inicio
      </Link>
    </main>
  );
}
