-- Voto Escolar — Etapa 3: título digital e consulta pública por UUID
-- Rode este script no Supabase: SQL Editor > New query > Run.
-- Pré-requisitos: schema.sql (etapa 1) e etapa2_dados_eleitorais.sql (etapa 2) já rodados.
-- Pode ser rodado mais de uma vez sem quebrar nada.
--
-- O que muda e por quê:
--   * A página pública do título (o link do QR Code) só pode fazer UMA pergunta ao banco:
--     "me dê o título do eleitor com ESTE UUID". Ela não consegue listar nem buscar ninguém.
--   * Para isso valer de verdade, o acesso direto à tabela "eleitores" pelo navegador
--     (chave anon) é fechado. Cadastro e consulta passam por duas funções controladas.
--   * Você continua vendo todos os eleitores normalmente em Table Editor / SQL Editor
--     do painel do Supabase.

-- 0) Garante que a etapa 2 foi aplicada ---------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'eleitores' and column_name = 'public_id'
  ) then
    raise exception 'Rode antes o supabase/etapa2_dados_eleitorais.sql (a tabela ainda não tem os dados eleitorais).';
  end if;
end;
$$;

-- 1) Cadastro: grava o eleitor e devolve o título completo ----------------------
create or replace function public.cadastrar_eleitor(p_nome text, p_nascimento date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.eleitores%rowtype;
begin
  insert into public.eleitores (nome_completo, data_nascimento)
  values (regexp_replace(trim(p_nome), '\s+', ' ', 'g'), p_nascimento)
  returning * into v;

  -- Inscrição, zona, seção, emissão, UUID, município e presidente são gerados
  -- pelo trigger da etapa 2; aqui só devolvemos o que foi gravado.
  return jsonb_build_object(
    'nome_completo',    v.nome_completo,
    'data_nascimento',  v.data_nascimento,
    'municipio',        v.municipio,
    'numero_inscricao', v.numero_inscricao,
    'zona',             v.zona,
    'secao',            v.secao,
    'data_emissao',     v.data_emissao,
    'presidente_secao', v.presidente_secao,
    'public_id',        v.public_id
  );
end;
$$;

-- 2) Consulta pública: devolve SOMENTE o título do UUID informado --------------
create or replace function public.obter_titulo(p_public_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
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
  from public.eleitores e
  where e.public_id = p_public_id
  limit 1;
$$;

-- 3) Permissões das funções ----------------------------------------------------
revoke all on function public.cadastrar_eleitor(text, date) from public;
revoke all on function public.obter_titulo(uuid)            from public;
grant execute on function public.cadastrar_eleitor(text, date) to anon, authenticated;
grant execute on function public.obter_titulo(uuid)            to anon, authenticated;

-- O gerador de inscrição só deve ser usado pelo trigger, não chamado de fora.
revoke all on function public.gerar_numero_inscricao() from public, anon, authenticated;

-- 4) Fecha o acesso direto à tabela para o navegador ---------------------------
drop policy if exists "anon pode cadastrar eleitores" on public.eleitores;
drop policy if exists "anon pode listar eleitores"    on public.eleitores;
revoke all on public.eleitores from anon, authenticated;
-- (RLS continua ligado: sem policy, o navegador não lê nem grava nada na tabela.)
