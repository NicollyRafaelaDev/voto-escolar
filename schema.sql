-- Voto Escolar — Etapa 1: tabela de eleitores
-- Rode este script no Supabase: SQL Editor > New query > Run.

create table if not exists public.eleitores (
  id              uuid primary key default gen_random_uuid(),
  nome_completo   text not null check (char_length(trim(nome_completo)) between 5 and 120),
  data_nascimento date not null check (data_nascimento between date '1900-01-01' and current_date),
  municipio       text not null default 'São Joaquim de Bicas - MG',
  criado_em       timestamptz not null default now()
);

alter table public.eleitores enable row level security;

-- Nesta etapa (sem login), a chave anon pode cadastrar e listar eleitores.
-- Quando o login/painel administrativo existir, essas políticas serão restringidas.
drop policy if exists "anon pode cadastrar eleitores" on public.eleitores;
create policy "anon pode cadastrar eleitores"
  on public.eleitores for insert
  to anon
  with check (true);

drop policy if exists "anon pode listar eleitores" on public.eleitores;
create policy "anon pode listar eleitores"
  on public.eleitores for select
  to anon
  using (true);
