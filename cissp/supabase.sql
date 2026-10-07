-- 90-Day CISSP Challenge — database setup
-- Run once in Supabase → SQL Editor (same project as the chalet system is fine).
-- One row holds the whole tracker as JSON; the page upserts it on every change.

create table if not exists public.cissp_progress (
  id          text primary key,                       -- 'default' (see ROW_ID in index.html)
  data        jsonb not null default '{}'::jsonb,     -- startDate, done, questions, scores, notes, updatedAt
  updated_at  timestamptz not null default now()
);

-- Same access model as the chalet tables: the public (anon) key may read and write.
alter table public.cissp_progress enable row level security;

drop policy if exists "cissp anon select" on public.cissp_progress;
drop policy if exists "cissp anon insert" on public.cissp_progress;
drop policy if exists "cissp anon update" on public.cissp_progress;

create policy "cissp anon select" on public.cissp_progress for select to anon using (true);
create policy "cissp anon insert" on public.cissp_progress for insert to anon with check (true);
create policy "cissp anon update" on public.cissp_progress for update to anon using (true) with check (true);

-- Optional: live updates between devices (phone updates while the laptop is open).
-- Skip this line if it errors; the page still syncs on every load and save.
alter publication supabase_realtime add table public.cissp_progress;
