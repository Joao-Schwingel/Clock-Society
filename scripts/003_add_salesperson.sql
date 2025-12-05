-- Add salesperson column to sales table
alter table public.sales add column if not exists salesperson text check (salesperson in ('A', 'B', 'C'));

-- Update existing sales to have a default salesperson (optional)
update public.sales set salesperson = 'C' where salesperson is null;
