create extension if not exists pgcrypto;

create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  external_message_id text unique,
  phone text,
  type text not null check (type in ('income','expense')),
  value numeric(14,2) not null check (value > 0),
  description text not null,
  category text not null,
  date date not null,
  status text not null default 'paid',
  method text not null default 'WhatsApp',
  raw_text text,
  created_at timestamptz not null default now()
);

create index if not exists finance_entries_date_idx
  on public.finance_entries(date desc);

create index if not exists finance_entries_phone_idx
  on public.finance_entries(phone);

alter table public.finance_entries enable row level security;
