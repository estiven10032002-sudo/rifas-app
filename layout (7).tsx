import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminHeader } from '@/components/admin-header';
import { UIProvider } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Panel',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <UIProvider>
      <AdminHeader />
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">{children}</div>
    </UIProvider>
  );
}
