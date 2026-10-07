-- Общее хранилище дашборда: одна таблица, одна строка на сущность.
-- Выполнить один раз в Supabase: SQL Editor -> New query -> Run.

create table if not exists public.items (
  workspace  text        not null,
  kind       text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (workspace, kind, id)
);

alter table public.items enable row level security;

-- Доступ без входа: читать и менять может любой, у кого есть ссылка на дашборд.
-- Когда появятся аккаунты, замените эти правила на проверку auth.uid().
drop policy if exists "items_read" on public.items;
drop policy if exists "items_insert" on public.items;
drop policy if exists "items_update" on public.items;
create policy "items_read"   on public.items for select using (true);
create policy "items_insert" on public.items for insert with check (true);
create policy "items_update" on public.items for update using (true) with check (true);

-- Изменения сразу прилетают всем открытым вкладкам.
alter publication supabase_realtime add table public.items;
