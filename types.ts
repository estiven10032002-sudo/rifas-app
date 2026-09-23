export type TicketStatus = 'reserved' | 'paid' | 'winner';
export type RaffleStatus = 'active' | 'drawn' | 'closed';

export interface Raffle {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  total_numbers: number;
  draw_date: string | null;
  draw_time: string | null;
  prize_name: string | null;
  prize_description: string | null;
  prize_image_url: string | null;
  organizer_name: string | null;
  contact_info: string | null;
  rules: string | null;
  status: RaffleStatus;
  is_public: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  raffle_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: string;
  raffle_id: string;
  number: number;
  participant_id: string;
  status: TicketStatus;
  amount_paid: number;
  registered_at: string;
  updated_at: string;
}

export interface Draw {
  id: string;
  raffle_id: string;
  ticket_id: string | null;
  winning_number: number;
  participant_id: string | null;
  winner_name: string;
  winner_phone: string | null;
  prize_name: string | null;
  eligible_numbers: number[];
  include_reserved: boolean;
  previous_status: string;
  drawn_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface AuditEntry {
  id: number;
  raffle_id: string | null;
  table_name: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

/** Lo que devuelve get_public_raffle(): nunca incluye teléfonos ni pagos. */
export interface PublicRaffle {
  name: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  total_numbers: number;
  draw_date: string | null;
  draw_time: string | null;
  prize_name: string | null;
  prize_description: string | null;
  prize_image_url: string | null;
  organizer_name: string | null;
  contact_info: string | null;
  rules: string | null;
  status: RaffleStatus;
  tickets: { n: number; s: TicketStatus }[];
  winner: { number: number; name: string; drawn_at: string } | null;
}
