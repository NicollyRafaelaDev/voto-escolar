-- Voto Escolar — Etapa 5: painel administrativo protegido por login (Supabase Auth)
-- Rode este script no Supabase: SQL Editor > New query > Run.
-- Pré-requisitos: etapas 1, 2 e 3 já rodadas (a etapa 4 é opcional: este script a substitui).
-- Pode ser rodado mais de uma vez sem quebrar nada.
--
-- Como a proteção funciona (é feita NO BANCO, não na página):
--   * A tabela "eleitores" continua fechada para o navegador (anon e authenticated).
--   * A lista só sai por UMA função, admin_listar_eleitores(), que confere se o usuário
--     logado (auth.uid()) está na tabela "administradores". Quem não está recebe erro.
--   * Estar logado NÃO basta: mesmo que alguém consiga criar uma conta no Supabase Auth,
--     só vira administrador quem você inserir em "administradores" (passo 5 abaixo).
--   * O cadastro público (cadastrar_eleitor) e o título público (obter_titulo) não mudam.

-- 0) Garante que a etapa 3 foi aplicada ---------------------------------------
do $$
begin
  if to_regprocedure('public.obter_titulo(uuid)') is null then
    raise exception 'Rode antes o supabase/etapa3_titulo_publico.sql.';
  end if;
end;
$$;

-- 1) Remove o acesso por chave da etapa 4 (agora o acesso é por login) -------------
drop function if exists public.listar_titulos_admin(text);
drop table    if exists public.admin_config;

-- 2) Lista de administradores autorizados ------------------------------------
create table if not exists public.administradores (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.administradores enable row level security;
revoke all on public.administradores from anon, authenticated;
-- (RLS ligado e sem policy: o navegador não lê nem escreve nesta tabela.)

-- 3) "Este usuário é administrador?" (uso interno das funções) ---------------
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.administradores a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.eh_admin() from public, anon, authenticated;

-- 4) Lista completa de eleitores — SOMENTE para administradores ---------------
create or replace function public.admin_listar_eleitores()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;

  return (
    select coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'nome_completo',    e.nome_completo,
                 'data_nascimento',  e.data_nascimento,
                 'municipio',        e.municipio,
                 'numero_inscricao', e.numero_inscricao,
                 'zona',             e.zona,
                 'secao',            e.secao,
                 'data_emissao',     e.data_emissao,
                 'presidente_secao', e.presidente_secao,
                 'public_id',        e.public_id
               )
               order by e.criado_em, e.id
             ),
             '[]'::jsonb
           )
      from public.eleitores e
  );
end;
$$;

-- anon (não logado) NÃO pode executar; só quem tem login (authenticated) — e, dentro
-- da função, só os que estão em "administradores".
revoke all on function public.admin_listar_eleitores() from public, anon;
grant execute on function public.admin_listar_eleitores() to authenticated;

-- 5) TORNAR ALGUÉM ADMINISTRADOR ---------------------------------------------
-- Antes: crie o usuário em Authentication > Users > Add user (e-mail + senha, com
-- "Auto Confirm User" marcado). Depois rode, SEPARADAMENTE, trocando o e-mail:
--
-- insert into public.administradores (user_id)
-- select id from auth.users where email = 'SEU-EMAIL@exemplo.com'
-- on conflict do nothing;
--
-- Para conferir quem é administrador:
-- select u.email, a.criado_em from public.administradores a join auth.users u on u.id = a.user_id;
