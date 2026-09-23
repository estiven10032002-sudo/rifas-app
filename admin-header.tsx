'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { APP_NAME } from '@/lib/config';

export function AdminHeader() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function logout() {
    setBusy(true);
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/admin" className="text-lg font-black tracking-tight">
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-3">
          {email && <span className="hidden max-w-[16rem] truncate text-sm text-slate-500 sm:block">{email}</span>}
          <button type="button" onClick={logout} disabled={busy} className="btn btn-secondary btn-sm">
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  );
}
