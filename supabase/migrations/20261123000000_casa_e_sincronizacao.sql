-- Conta na sua Mão: casa compartilhada, membros (limite por plano), convites e sincronização.
-- Rodar uma vez no Supabase: SQL Editor → New query → colar tudo → Run.

-- ---------- Tabelas ----------

create table if not exists public.casas (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Minha casa',
  -- Quantas pessoas podem entrar na casa. Plano grátis: 2. Só o servidor (service_role) muda isso
  -- (ex.: assinatura com mais pessoas no futuro).
  max_membros int not null default 2 check (max_membros between 1 and 20),
  plano text not null default 'gratis',
  criada_em timestamptz not null default now()
);

create table if not exists public.membros (
  casa_id uuid not null references public.casas on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  nome text,
  papel text not null default 'membro' check (papel in ('dono', 'membro')),
  entrou_em timestamptz not null default now(),
  primary key (casa_id, user_id),
  unique (user_id) -- cada conta participa de uma casa só
);

create table if not exists public.convites (
  codigo text primary key,
  casa_id uuid not null references public.casas on delete cascade,
  criado_por uuid not null default auth.uid() references auth.users on delete cascade,
  expira_em timestamptz not null default now() + interval '7 days'
);

-- Cada linha é um registro do banco local do app (compra, item, preço, lista...).
create table if not exists public.registros (
  casa_id uuid not null references public.casas on delete cascade,
  tabela text not null,
  chave text not null,
  dados jsonb,
  apagado boolean not null default false,
  atualizado_em timestamptz not null default clock_timestamp(),
  atualizado_por uuid default auth.uid(),
  primary key (casa_id, tabela, chave)
);
create index if not exists registros_casa_atualizado on public.registros (casa_id, atualizado_em);

create or replace function public.marcar_atualizacao() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := clock_timestamp();
  new.atualizado_por := auth.uid();
  return new;
end $$;

drop trigger if exists registros_atualizacao on public.registros;
create trigger registros_atualizacao before insert or update on public.registros
  for each row execute function public.marcar_atualizacao();

-- ---------- Limite de pessoas (vale para qualquer caminho, não só pelo app) ----------

create or replace function public.conferir_limite_membros() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  limite int;
  atuais int;
begin
  select max_membros into limite from casas where id = new.casa_id for update;
  select count(*) into atuais from membros where casa_id = new.casa_id;
  if atuais >= limite then
    raise exception 'A casa já tem o máximo de % pessoas do plano.', limite using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists membros_limite on public.membros;
create trigger membros_limite before insert on public.membros
  for each row execute function public.conferir_limite_membros();

-- ---------- Funções usadas pelo app ----------

-- Casa da pessoa logada (null se ainda não tem).
create or replace function public.minha_casa() returns uuid
language sql stable security definer set search_path = public as $$
  select casa_id from membros where user_id = auth.uid()
$$;

create or replace function public.criar_casa(p_nome text, p_meu_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  nova uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  if exists (select 1 from membros where user_id = auth.uid()) then
    raise exception 'Esta conta já participa de uma casa.';
  end if;
  insert into casas (nome) values (coalesce(nullif(trim(p_nome), ''), 'Minha casa')) returning id into nova;
  insert into membros (casa_id, user_id, nome, papel) values (nova, auth.uid(), nullif(trim(p_meu_nome), ''), 'dono');
  return nova;
end $$;

-- Gera um código de convite (6 letras/números) válido por 7 dias.
create or replace function public.criar_convite() returns text
language plpgsql security definer set search_path = public as $$
declare
  casa uuid := minha_casa();
  limite int;
  atuais int;
  cod text;
begin
  if casa is null then raise exception 'Você ainda não tem uma casa.'; end if;
  select max_membros into limite from casas where id = casa;
  select count(*) into atuais from membros where casa_id = casa;
  if atuais >= limite then
    raise exception 'A casa já tem o máximo de % pessoas do plano.', limite using errcode = 'P0001';
  end if;
  delete from convites where casa_id = casa and expira_em < now();
  loop
    -- 6 caracteres sem letras/números que confundem (0/O, 1/I/L).
    cod := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 6));
    exit when length(cod) = 6 and not exists (select 1 from convites where codigo = cod);
  end loop;
  insert into convites (codigo, casa_id) values (cod, casa);
  return cod;
end $$;

create or replace function public.entrar_na_casa(p_codigo text, p_meu_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  conv convites%rowtype;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  if exists (select 1 from membros where user_id = auth.uid()) then
    raise exception 'Esta conta já participa de uma casa.';
  end if;
  select * into conv from convites where codigo = upper(trim(p_codigo));
  if not found or conv.expira_em < now() then
    raise exception 'Convite inválido ou vencido. Peça um código novo.';
  end if;
  insert into membros (casa_id, user_id, nome) values (conv.casa_id, auth.uid(), nullif(trim(p_meu_nome), ''));
  delete from convites where codigo = conv.codigo;
  return conv.casa_id;
end $$;

-- O dono tira alguém da casa; qualquer um pode sair. Se sair o último, a casa é apagada.
create or replace function public.remover_membro(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  casa uuid := minha_casa();
begin
  if casa is null then raise exception 'Você não tem uma casa.'; end if;
  if p_user <> auth.uid() and not exists (select 1 from membros where casa_id = casa and user_id = auth.uid() and papel = 'dono') then
    raise exception 'Só quem criou a casa pode tirar outra pessoa.';
  end if;
  delete from membros where casa_id = casa and user_id = p_user;
  if not exists (select 1 from membros where casa_id = casa) then
    delete from casas where id = casa;
  elsif not exists (select 1 from membros where casa_id = casa and papel = 'dono') then
    update membros set papel = 'dono' where casa_id = casa and user_id = (select user_id from membros where casa_id = casa order by entrou_em limit 1);
  end if;
end $$;

create or replace function public.mudar_meu_nome(p_nome text) returns void
language sql security definer set search_path = public as $$
  update membros set nome = nullif(trim(p_nome), '') where user_id = auth.uid()
$$;

-- ---------- Quem vê o quê (Row Level Security) ----------

alter table public.casas enable row level security;
alter table public.membros enable row level security;
alter table public.convites enable row level security;
alter table public.registros enable row level security;

drop policy if exists "ver a minha casa" on public.casas;
create policy "ver a minha casa" on public.casas for select to authenticated using (id = public.minha_casa());
drop policy if exists "renomear a minha casa" on public.casas;
create policy "renomear a minha casa" on public.casas for update to authenticated using (id = public.minha_casa()) with check (id = public.minha_casa());
-- Pelo app só dá para mudar o nome; o limite de pessoas e o plano ficam com o servidor.
revoke update on public.casas from authenticated, anon;
grant update (nome) on public.casas to authenticated;

drop policy if exists "ver quem é da casa" on public.membros;
create policy "ver quem é da casa" on public.membros for select to authenticated using (casa_id = public.minha_casa());

drop policy if exists "ver convites da casa" on public.convites;
create policy "ver convites da casa" on public.convites for select to authenticated using (casa_id = public.minha_casa());

drop policy if exists "dados da minha casa" on public.registros;
create policy "dados da minha casa" on public.registros for all to authenticated
  using (casa_id = public.minha_casa()) with check (casa_id = public.minha_casa());

-- Entradas em membros/convites/casas só pelas funções acima.
revoke insert, delete on public.membros, public.convites, public.casas from authenticated, anon;

revoke execute on function public.minha_casa, public.criar_casa, public.criar_convite, public.entrar_na_casa, public.remover_membro, public.mudar_meu_nome from anon, public;
grant execute on function public.minha_casa, public.criar_casa, public.criar_convite, public.entrar_na_casa, public.remover_membro, public.mudar_meu_nome to authenticated;

-- ---------- Tempo real (o outro celular recebe na hora) ----------

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'registros') then
    alter publication supabase_realtime add table public.registros;
  end if;
end $$;
