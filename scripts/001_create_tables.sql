-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create companies table
create table if not exists public.companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  code text unique not null,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now()
);

-- Create sales table (Vendas)
create table if not exists public.sales (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade,
  product_name text not null,
  quantity integer not null,
  unit_price decimal(10, 2) not null,
  total_price decimal(10, 2) not null,
  sale_date date not null,
  customer_name text,
  notes text,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now()
);

-- Create inventory table (Estoque)
create table if not exists public.inventory (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade,
  product_name text not null,
  quantity integer not null,
  unit_cost decimal(10, 2) not null,
  total_value decimal(10, 2) not null,
  location text,
  last_updated date not null,
  notes text,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now()
);

-- Create costs table (Custos)
create table if not exists public.costs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade,
  category text not null,
  description text not null,
  amount decimal(10, 2) not null,
  cost_date date not null,
  payment_method text,
  notes text,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table public.companies enable row level security;
alter table public.sales enable row level security;
alter table public.inventory enable row level security;
alter table public.costs enable row level security;

-- RLS Policies for companies
create policy "Users can view their own companies"
  on public.companies for select
  using (auth.uid() = user_id);

create policy "Users can insert their own companies"
  on public.companies for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own companies"
  on public.companies for update
  using (auth.uid() = user_id);

create policy "Users can delete their own companies"
  on public.companies for delete
  using (auth.uid() = user_id);

-- RLS Policies for sales
create policy "Users can view their own sales"
  on public.sales for select
  using (auth.uid() = user_id);

create policy "Users can insert their own sales"
  on public.sales for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own sales"
  on public.sales for update
  using (auth.uid() = user_id);

create policy "Users can delete their own sales"
  on public.sales for delete
  using (auth.uid() = user_id);

-- RLS Policies for inventory
create policy "Users can view their own inventory"
  on public.inventory for select
  using (auth.uid() = user_id);

create policy "Users can insert their own inventory"
  on public.inventory for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own inventory"
  on public.inventory for update
  using (auth.uid() = user_id);

create policy "Users can delete their own inventory"
  on public.inventory for delete
  using (auth.uid() = user_id);

-- RLS Policies for costs
create policy "Users can view their own costs"
  on public.costs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own costs"
  on public.costs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own costs"
  on public.costs for update
  using (auth.uid() = user_id);

create policy "Users can delete their own costs"
  on public.costs for delete
  using (auth.uid() = user_id);
