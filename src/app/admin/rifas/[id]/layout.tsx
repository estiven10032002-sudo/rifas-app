import type { ReactNode } from 'react';
import { RaffleShell } from '@/components/raffle-shell';

export default function RaffleLayout({ children, params }: { children: ReactNode; params: { id: string } }) {
  return <RaffleShell id={params.id}>{children}</RaffleShell>;
}
