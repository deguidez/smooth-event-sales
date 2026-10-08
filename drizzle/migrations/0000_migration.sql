
create type public.app_role as enum ('super_admin','producer','athlete');
create type public.event_category as enum ('esporte','show','congresso','curso','outro');
create type public.event_status as enum ('rascunho','publicado','encerrado','cancelado');
create type public.order_status as enum ('pendente','pago','vencido','estornado','cancelado');
create type public.payment_method as enum ('PIX','BOLETO','CREDIT_CARD');
create type public.producer_status as enum ('pendente','aprovado','suspenso');

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  cpf text,
  birth_date date,
  gender text,
  city text,
  state text,
  asaas_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'super_admin'));
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'super_admin'));
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- signup trigger: first user = super_admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.email)
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'athlete') on conflict do nothing;
  if not exists (select 1 from public.user_roles where role = 'super_admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'super_admin') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- platform settings (singleton, server-only)
create table public.platform_settings (
  id int primary key default 1 check (id = 1),
  site_name text not null default 'Inscreva',
  asaas_env text not null default 'sandbox',
  asaas_api_key text,
  asaas_webhook_token text,
  platform_wallet_id text,
  fee_percent numeric(6,2) not null default 8,
  fee_fixed numeric(10,2) not null default 2,
  fee_paid_by_buyer boolean not null default true,
  asaas_fee_pix numeric(10,2) not null default 1.99,
  asaas_fee_boleto numeric(10,2) not null default 1.99,
  asaas_fee_card_percent numeric(6,2) not null default 2.99,
  asaas_fee_card_fixed numeric(10,2) not null default 0.49,
  asaas_fee_paid_by text not null default 'plataforma',
  max_installments int not null default 12,
  boleto_due_days int not null default 3,
  enable_pix boolean not null default true,
  enable_boleto boolean not null default true,
  enable_card boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1);
grant all on public.platform_settings to service_role;
alter table public.platform_settings enable row level security;

-- producers
create table public.producers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  company_name text not null,
  document text not null,
  email text not null,
  phone text,
  birth_date date,
  company_type text,
  postal_code text,
  address text,
  address_number text,
  province text,
  income_value numeric(12,2),
  asaas_account_id text,
  asaas_wallet_id text,
  status public.producer_status not null default 'pendente',
  fee_percent numeric(6,2),
  fee_fixed numeric(10,2),
  created_at timestamptz not null default now()
);
grant select, insert, update on public.producers to authenticated;
grant all on public.producers to service_role;
alter table public.producers enable row level security;
create policy "producer own read" on public.producers for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'super_admin'));
create policy "producer own insert" on public.producers for insert to authenticated with check (user_id = auth.uid() and status = 'pendente' and fee_percent is null and fee_fixed is null and asaas_wallet_id is null);
create policy "admin update producers" on public.producers for update to authenticated using (public.has_role(auth.uid(),'super_admin'));

create or replace function public.my_producer_id() returns uuid language sql stable security definer set search_path = public as $$
  select id from public.producers where user_id = auth.uid() limit 1
$$;

-- events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id) on delete cascade,
  title text not null,
  slug text not null unique,
  category public.event_category not null default 'esporte',
  short_description text,
  description text,
  cover_url text,
  venue text,
  city text,
  state text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status public.event_status not null default 'rascunho',
  featured boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.events to anon;
grant select, insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;
create policy "public published events" on public.events for select to anon, authenticated using (status in ('publicado','encerrado'));
create policy "producer own events read" on public.events for select to authenticated using (producer_id = public.my_producer_id() or public.has_role(auth.uid(),'super_admin'));
create policy "producer insert events" on public.events for insert to authenticated with check (producer_id = public.my_producer_id());
create policy "producer update events" on public.events for update to authenticated using (producer_id = public.my_producer_id() or public.has_role(auth.uid(),'super_admin'));
create policy "producer delete events" on public.events for delete to authenticated using (producer_id = public.my_producer_id() or public.has_role(auth.uid(),'super_admin'));

-- ticket types (lotes / categorias)
create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  quantity int not null default 100,
  sold int not null default 0,
  sales_start timestamptz,
  sales_end timestamptz,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.ticket_types to anon;
grant select, insert, update, delete on public.ticket_types to authenticated;
grant all on public.ticket_types to service_role;
alter table public.ticket_types enable row level security;
create policy "public tickets" on public.ticket_types for select to anon, authenticated using (exists (select 1 from public.events e where e.id = event_id and e.status in ('publicado','encerrado')));
create policy "producer tickets read" on public.ticket_types for select to authenticated using (exists (select 1 from public.events e where e.id = event_id and (e.producer_id = public.my_producer_id() or public.has_role(auth.uid(),'super_admin'))));
create policy "producer tickets write" on public.ticket_types for all to authenticated using (exists (select 1 from public.events e where e.id = event_id and e.producer_id = public.my_producer_id())) with check (exists (select 1 from public.events e where e.id = event_id and e.producer_id = public.my_producer_id()));

-- orders (inscrições)
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  user_id uuid not null,
  event_id uuid not null references public.events(id) on delete restrict,
  ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
  producer_id uuid not null references public.producers(id) on delete restrict,
  participant_name text not null,
  participant_email text not null,
  participant_cpf text not null,
  participant_phone text,
  participant_birth_date date,
  participant_gender text,
  shirt_size text,
  team text,
  ticket_price numeric(10,2) not null,
  service_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  producer_amount numeric(10,2) not null,
  platform_amount numeric(10,2) not null,
  asaas_fee_estimate numeric(10,2) not null default 0,
  payment_method public.payment_method not null,
  status public.order_status not null default 'pendente',
  asaas_payment_id text unique,
  invoice_url text,
  bank_slip_url text,
  pix_qr_image text,
  pix_payload text,
  receipt_url text,
  due_date date,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.orders (user_id);
create index on public.orders (event_id);
create index on public.orders (producer_id);
grant select on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "orders read" on public.orders for select to authenticated using (user_id = auth.uid() or producer_id = public.my_producer_id() or public.has_role(auth.uid(),'super_admin'));

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  kind text not null,
  recipient text not null,
  status text not null,
  created_at timestamptz not null default now()
);
grant select on public.email_log to authenticated;
grant all on public.email_log to service_role;
alter table public.email_log enable row level security;
create policy "admin email log" on public.email_log for select to authenticated using (public.has_role(auth.uid(),'super_admin'));
