'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { ErrorBox, Spinner } from './ui';
import type { Draw, Participant, Raffle, Ticket } from '@/lib/types';

export interface Stats {
  total: number;
  available: number;
  reserved: number;
  paid: number;
  collected: number;
  pending: number;
  participants: number;
  occupancy: number;
}

interface RaffleContextValue {
  supabase: SupabaseClient;
  raffle: Raffle;
  participants: Participant[];
  tickets: Ticket[];
  draws: Draw[];
  activeDraw: Draw | null;
  ticketByNumber: Map<number, Ticket>;
  participantById: Map<string, Participant>;
  stats: Stats;
  reload: () => Promise<void>;
}

const RaffleContext = createContext<RaffleContextValue | null>(null);

export function useRaffle(): RaffleContextValue {
  const ctx = useContext(RaffleContext);
  if (!ctx) throw new Error('useRaffle debe usarse dentro de <RaffleProvider>');
  return ctx;
}

export function RaffleProvider({ raffleId, children }: { raffleId: string; children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [r, p, t, d] = await Promise.all([
      supabase.from('raffles').select('*').eq('id', raffleId).maybeSingle(),
      supabase.from('participants').select('*').eq('raffle_id', raffleId).order('name'),
      supabase.from('tickets').select('*').eq('raffle_id', raffleId).order('number'),
      supabase.from('draws').select('*').eq('raffle_id', raffleId).order('drawn_at', { ascending: false }),
    ]);
    const failure = r.error ?? p.error ?? t.error ?? d.error;
    if (failure) {
      setError(failure.message);
      return;
    }
    if (!r.data) {
      setError('No encontramos esta rifa. Puede que haya sido eliminada.');
      return;
    }
    setError(null);
    setRaffle(r.data as Raffle);
    setParticipants((p.data ?? []) as Participant[]);
    setTickets((t.data ?? []) as Ticket[]);
    setDraws((d.data ?? []) as Draw[]);
  }, [supabase, raffleId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const derived = useMemo(() => {
    const ticketByNumber = new Map(tickets.map((t) => [t.number, t]));
    const participantById = new Map(participants.map((p) => [p.id, p]));
    const price = raffle?.price ?? 0;
    let reserved = 0;
    let paid = 0;
    let collected = 0;
    let pending = 0;
    for (const t of tickets) {
      collected += Number(t.amount_paid);
      if (t.status === 'reserved') {
        reserved++;
        pending += Math.max(price - Number(t.amount_paid), 0);
      } else {
        paid++;
      }
    }
    const total = raffle?.total_numbers ?? 0;
    const stats: Stats = {
      total,
      available: Math.max(total - tickets.length, 0),
      reserved,
      paid,
      collected,
      pending,
      participants: participants.length,
      occupancy: total ? Math.round((tickets.length / total) * 100) : 0,
    };
    const activeDraw = draws.find((d) => !d.voided_at) ?? null;
    return { ticketByNumber, participantById, stats, activeDraw };
  }, [tickets, participants, draws, raffle]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorBox>{error}</ErrorBox>
      </div>
    );
  }
  if (!raffle) return <Spinner />;

  return (
    <RaffleContext.Provider value={{ supabase, raffle, participants, tickets, draws, reload, ...derived }}>
      {children}
    </RaffleContext.Provider>
  );
}
