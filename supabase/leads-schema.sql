create table if not exists public.leads (
  id bigint generated always as identity primary key,
  nome text not null,
  whatsapp text not null,
  tipo text not null,
  veiculos integer not null check (veiculos > 0),
  created_at timestamptz not null default now()
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_nome_length_check'
  ) then
    alter table public.leads
      add constraint leads_nome_length_check
      check (char_length(nome) between 3 and 120) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_whatsapp_digits_check'
  ) then
    alter table public.leads
      add constraint leads_whatsapp_digits_check
      check (char_length(regexp_replace(whatsapp, '\D', '', 'g')) between 10 and 11) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_tipo_allowed_check'
  ) then
    alter table public.leads
      add constraint leads_tipo_allowed_check
      check (tipo in ('Pessoa fisica', 'Empresa / frota')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_veiculos_range_check'
  ) then
    alter table public.leads
      add constraint leads_veiculos_range_check
      check (veiculos between 1 and 9999) not valid;
  end if;
end $$;
