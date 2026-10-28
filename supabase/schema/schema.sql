-- ============================================================================
-- Tasks System — schema completo do Supabase
-- BOOTSTRAP LEGADO: não aplicar isoladamente nem em produção.
-- Em banco vazio, aplicar depois todas as migrations em ../migrations/.
-- ============================================================================
-- Gerado por introspecção direta do banco de produção (não é um dump genérico
-- de template) — reflete exatamente as tabelas, RLS e funções que o app usa.
--
-- Como aplicar num projeto Supabase novo (vazio):
--   1. Abra o SQL Editor do seu projeto Supabase
--   2. Cole o conteúdo inteiro deste arquivo e rode
--   3. Crie sua primeira conta admin manualmente (ver bloco no final do arquivo)
--
-- Não inclui: lt_members e lt_saved_views (tabelas legadas, não usadas mais
-- pelo app atual).
-- ============================================================================

-- ── Extensões ────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto with schema extensions;

-- ── profiles ─────────────────────────────────────────────────────────────────
-- Uma linha por conta de login. id = auth.users.id. Cadastro de conta é feito
-- só por admin (edge function admin-create-user), não existe auto-cadastro.
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text not null,
  color      text not null default '#3b82f6',
  initials   text not null,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── lt_projects ──────────────────────────────────────────────────────────────
create table public.lt_projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null,
  emoji      text not null,
  suspended  boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

-- ── lt_project_members ──────────────────────────────────────────────────────
-- Quem tem acesso a qual projeto.
create table public.lt_project_members (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.lt_projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member',
  created_at timestamptz not null default now()
);

-- ── lt_tasks ─────────────────────────────────────────────────────────────────
create table public.lt_tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text not null default '',
  status      text not null default 'todo',
  priority    text not null default 'none',
  project_id  uuid references public.lt_projects(id) on delete cascade,
  due_date    date,
  tags        text[] not null default '{}',
  recurring   text,
  position    integer not null default 0,
  assignee    text,
  created_at  timestamptz not null default now()
);

-- ── lt_task_comments ─────────────────────────────────────────────────────────
create table public.lt_task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.lt_tasks(id) on delete cascade,
  text       text not null,
  author_id  uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── lt_task_checklist ────────────────────────────────────────────────────────
create table public.lt_task_checklist (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.lt_tasks(id) on delete cascade,
  text       text not null,
  done       boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── lt_task_activity ─────────────────────────────────────────────────────────
create table public.lt_task_activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.lt_tasks(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);

-- ── lt_task_links ────────────────────────────────────────────────────────────
create table public.lt_task_links (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.lt_tasks(id) on delete cascade,
  title      text not null,
  url        text not null,
  created_at timestamptz not null default now()
);

-- ── lt_notifications ─────────────────────────────────────────────────────────
-- Convites de projeto (e outras notificações futuras). Qualquer usuário pode
-- convidar qualquer outro pra um projeto que ele já vê — o convite só vira
-- acesso de fato (linha em lt_project_members) quando o destinatário aceita.
create table public.lt_notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete set null,
  type         text not null,
  project_id   uuid references public.lt_projects(id) on delete cascade,
  task_id      uuid references public.lt_tasks(id) on delete cascade,
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);

-- ── lt_notes ─────────────────────────────────────────────────────────────────
-- Aberta pra qualquer conta logada (não é por projeto).
create table public.lt_notes (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default '',
  content    text not null default '',
  color      text not null default 'default',
  pinned     boolean not null default false,
  tags       text[] not null default '{}',
  task_id    uuid references public.lt_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── lt_inbox_items ───────────────────────────────────────────────────────────
create table public.lt_inbox_items (
  id                   uuid primary key default gen_random_uuid(),
  platform             text not null,
  url                  text not null,
  caption              text not null default '',
  transcript           text,
  suggested_project_id uuid references public.lt_projects(id),
  status               text not null default 'pending',
  chat_history         jsonb not null default '[]',
  created_at           timestamptz not null default now()
);

-- ── lt_vocal_* ───────────────────────────────────────────────────────────────
-- Aulas de canto — abertas pra qualquer conta logada (não é por projeto).
create table public.lt_vocal_videos (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  artist     text not null default '',
  style      text not null default '',
  platform   text not null,
  url        text not null,
  cover_url  text not null default '',
  tags       text[] not null default '{}',
  notes      text not null default '',
  mastery    integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.lt_vocal_references (
  id         uuid primary key default gen_random_uuid(),
  technique  text not null,
  artist     text not null default '',
  url        text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now()
);

create table public.lt_vocal_class_notes (
  id         uuid primary key default gen_random_uuid(),
  week_date  date not null,
  content    text not null default '',
  exercises  text not null default '',
  songs      text not null default '',
  created_at timestamptz not null default now()
);

create table public.lt_vocal_skills (
  id         uuid primary key default gen_random_uuid(),
  category   text not null,
  name       text not null,
  mastery    integer not null default 0,
  notes      text not null default '',
  created_at timestamptz not null default now()
);

create table public.lt_vocal_profile (
  id          uuid primary key default gen_random_uuid(),
  vocal_range text not null default '',
  updated_at  timestamptz not null default now()
);

-- ── lt_project_files ─────────────────────────────────────────────────────────
-- Metadados dos arquivos de cada projeto — o binário fica no bucket
-- "project-files" do Supabase Storage, no caminho "{project_id}/{arquivo}".
create table public.lt_project_files (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.lt_projects(id) on delete cascade,
  task_id     uuid references public.lt_tasks(id) on delete cascade,
  name        text not null,
  path        text not null,
  size        bigint not null default 0,
  mime_type   text not null default 'application/octet-stream',
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- Funções
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable security definer
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$;

create or replace function public.has_project_access(pid uuid)
returns boolean
language sql
stable security definer
as $$
  select public.is_admin() or exists (
    select 1 from public.lt_project_members where project_id = pid and user_id = auth.uid()
  );
$$;

-- Só admin pode suspender/reativar um projeto (função master), mesmo que
-- também seja dono. Bloqueia a alteração desse campo específico via trigger.
create or replace function public.prevent_non_admin_suspend_toggle()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.suspended is distinct from old.suspended and not public.is_admin() then
    raise exception 'Só administradores podem suspender ou reativar um projeto';
  end if;
  return new;
end;
$$;

create trigger lt_projects_suspend_guard
before update on public.lt_projects
for each row execute function public.prevent_non_admin_suspend_toggle();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles            enable row level security;
alter table public.lt_projects         enable row level security;
alter table public.lt_project_members  enable row level security;
alter table public.lt_notifications    enable row level security;
alter table public.lt_project_files    enable row level security;
alter table public.lt_tasks            enable row level security;
alter table public.lt_task_comments    enable row level security;
alter table public.lt_task_checklist   enable row level security;
alter table public.lt_task_activity    enable row level security;
alter table public.lt_task_links       enable row level security;
alter table public.lt_notes            enable row level security;
alter table public.lt_inbox_items      enable row level security;
alter table public.lt_vocal_videos     enable row level security;
alter table public.lt_vocal_references enable row level security;
alter table public.lt_vocal_class_notes enable row level security;
alter table public.lt_vocal_skills     enable row level security;
alter table public.lt_vocal_profile    enable row level security;

-- profiles
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);
create policy profiles_update_admin on public.profiles
  for update to authenticated using (public.is_admin());

-- lt_projects — só quem tem acesso (membro ou admin) vê; dono ou admin edita/apaga
create policy projects_select on public.lt_projects
  for select to authenticated using (public.has_project_access(id));
create policy projects_insert on public.lt_projects
  for insert to authenticated with check (created_by = auth.uid());
create policy projects_update on public.lt_projects
  for update to authenticated using (created_by = auth.uid() or public.is_admin());
create policy projects_delete on public.lt_projects
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());

-- lt_project_members
create policy project_members_select on public.lt_project_members
  for select to authenticated using (public.has_project_access(project_id));
create policy project_members_insert on public.lt_project_members
  for insert to authenticated with check (
    public.is_admin() or exists (
      select 1 from public.lt_projects p where p.id = project_id and p.created_by = auth.uid()
    )
  );
create policy project_members_delete on public.lt_project_members
  for delete to authenticated using (
    public.is_admin() or exists (
      select 1 from public.lt_projects p where p.id = project_id and p.created_by = auth.uid()
    )
  );
-- Permite que o próprio usuário se adicione (fluxo de aceitar convite)
create policy project_members_insert_self on public.lt_project_members
  for insert to authenticated with check (user_id = auth.uid());

-- lt_notifications — cada um só vê/mexe nas notificações que enviou ou recebeu
create policy notifications_select on public.lt_notifications
  for select to authenticated using (recipient_id = auth.uid() or actor_id = auth.uid());
create policy notifications_insert on public.lt_notifications
  for insert to authenticated with check (actor_id = auth.uid());
create policy notifications_update on public.lt_notifications
  for update to authenticated using (recipient_id = auth.uid());
create policy notifications_delete on public.lt_notifications
  for delete to authenticated using (recipient_id = auth.uid() or actor_id = auth.uid());

-- lt_project_files
create policy project_files_all on public.lt_project_files
  for all to authenticated
  using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

-- lt_tasks e sub-tabelas — acesso segue o projeto da tarefa. Projeto suspenso
-- vira só-leitura pra quem não é admin (é o que "suspender projeto" faz).
create policy tasks_select on public.lt_tasks
  for select to authenticated using (public.has_project_access(project_id));

create policy tasks_write on public.lt_tasks
  for insert to authenticated with check (
    public.has_project_access(project_id) and
    (public.is_admin() or not exists (select 1 from public.lt_projects p where p.id = project_id and p.suspended))
  );

create policy tasks_update on public.lt_tasks
  for update to authenticated
  using (public.has_project_access(project_id))
  with check (
    public.is_admin() or not exists (select 1 from public.lt_projects p where p.id = project_id and p.suspended)
  );

create policy tasks_delete on public.lt_tasks
  for delete to authenticated using (
    public.has_project_access(project_id) and
    (public.is_admin() or not exists (select 1 from public.lt_projects p where p.id = project_id and p.suspended))
  );

create policy task_comments_all on public.lt_task_comments
  for all to authenticated
  using (public.has_project_access((select project_id from public.lt_tasks where id = task_id)))
  with check (public.has_project_access((select project_id from public.lt_tasks where id = task_id)));

create policy task_checklist_all on public.lt_task_checklist
  for all to authenticated
  using (public.has_project_access((select project_id from public.lt_tasks where id = task_id)))
  with check (public.has_project_access((select project_id from public.lt_tasks where id = task_id)));

create policy task_activity_all on public.lt_task_activity
  for all to authenticated
  using (public.has_project_access((select project_id from public.lt_tasks where id = task_id)))
  with check (public.has_project_access((select project_id from public.lt_tasks where id = task_id)));

create policy task_links_all on public.lt_task_links
  for all to authenticated
  using (public.has_project_access((select project_id from public.lt_tasks where id = task_id)))
  with check (public.has_project_access((select project_id from public.lt_tasks where id = task_id)));

-- lt_notes, lt_inbox_items, lt_vocal_* — abertas pra qualquer conta logada
create policy notes_all on public.lt_notes
  for all to authenticated using (true) with check (true);
create policy inbox_items_all on public.lt_inbox_items
  for all to authenticated using (true) with check (true);
create policy vocal_videos_all on public.lt_vocal_videos
  for all to authenticated using (true) with check (true);
create policy vocal_references_all on public.lt_vocal_references
  for all to authenticated using (true) with check (true);
create policy vocal_class_notes_all on public.lt_vocal_class_notes
  for all to authenticated using (true) with check (true);
create policy vocal_skills_all on public.lt_vocal_skills
  for all to authenticated using (true) with check (true);
create policy vocal_profile_all on public.lt_vocal_profile
  for all to authenticated using (true) with check (true);

-- ============================================================================
-- Realtime — o app escuta lt_tasks e lt_inbox_items ao vivo
-- ============================================================================

alter publication supabase_realtime add table public.lt_tasks;
alter publication supabase_realtime add table public.lt_inbox_items;
alter publication supabase_realtime add table public.lt_notifications;
alter publication supabase_realtime add table public.lt_task_comments;

-- ============================================================================
-- Storage — arquivos de projeto (upload/download)
-- ============================================================================
-- Bucket privado; cada arquivo é salvo em "{project_id}/{nome-do-arquivo}" e
-- as policies abaixo usam esse primeiro segmento do caminho pra decidir quem
-- pode ler/enviar/apagar (mesma regra de has_project_access das tabelas).

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 26214400) -- 25MB por arquivo
on conflict (id) do nothing;

create policy storage_project_files_select on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.has_project_access(((storage.foldername(name))[1])::uuid));

create policy storage_project_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and public.has_project_access(((storage.foldername(name))[1])::uuid));

create policy storage_project_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and public.has_project_access(((storage.foldername(name))[1])::uuid));

-- ============================================================================
-- Bootstrap: primeira conta admin
-- ============================================================================
-- 1. Vá em Authentication → Users → Add user (no Dashboard do Supabase) e crie
--    sua conta com e-mail e senha. Copie o UUID gerado.
-- 2. Rode (trocando os valores):
--
-- insert into public.profiles (id, email, name, initials, is_admin)
-- values ('COLE-O-UUID-AQUI', 'seu@email.com', 'Seu Nome', 'SN', true);
--
-- Depois disso, faça login no app e crie as próximas contas pela tela
-- Usuários (Configurações → Usuários → Novo usuário) — não precisa mais SQL.
