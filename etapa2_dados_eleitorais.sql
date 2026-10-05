-- Voto Escolar — Etapa 2: geração automática dos dados eleitorais
-- Rode este script no Supabase: SQL Editor > New query > Run.
-- Pré-requisito: já ter rodado supabase/schema.sql (etapa 1).
-- Pode ser rodado mais de uma vez sem quebrar nada.
--
-- A geração acontece DENTRO do banco (trigger), então os valores:
--   * são criados no momento exato do cadastro;
--   * não dependem do navegador (ninguém consegue escolher o próprio número);
--   * ficam gravados e, depois, não podem mais ser alterados.

-- 1) Novas colunas -----------------------------------------------------------
alter table public.eleitores
  add column if not exists numero_inscricao  text,
  add column if not exists zona              text,
  add column if not exists secao             text,
  add column if not exists data_emissao      date,
  add column if not exists presidente_secao  text,
  add column if not exists public_id         uuid not null default gen_random_uuid();

-- 2) Gerador do número de inscrição (12 dígitos, único) ------------------------
create or replace function public.gerar_numero_inscricao()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidato text;
begin
  loop
    candidato := lpad(floor(random() * 1000000000000)::bigint::text, 12, '0');
    exit when not exists (
      select 1 from public.eleitores where numero_inscricao = candidato
    );
  end loop;
  return candidato;
end;
$$;

-- 3) Preenche os eleitores que já foram cadastrados na etapa 1 ----------------
do $$
declare
  r record;
begin
  for r in select id, criado_em from public.eleitores where numero_inscricao is null loop
    update public.eleitores
       set numero_inscricao = public.gerar_numero_inscricao(),
           zona             = lpad((1 + floor(random() * 999))::int::text, 3, '0'),
           secao            = lpad((1 + floor(random() * 9999))::int::text, 4, '0'),
           data_emissao     = (r.criado_em at time zone 'America/Sao_Paulo')::date,
           presidente_secao = 'Kleiton Hiago'
     where id = r.id;
  end loop;
end;
$$;

-- 4) Regras de integridade ---------------------------------------------------
alter table public.eleitores
  alter column numero_inscricao set not null,
  alter column zona             set not null,
  alter column secao            set not null,
  alter column data_emissao     set not null,
  alter column presidente_secao set not null;

alter table public.eleitores drop constraint if exists eleitores_numero_inscricao_formato;
alter table public.eleitores add  constraint eleitores_numero_inscricao_formato
  check (numero_inscricao ~ '^[0-9]{12}$');

alter table public.eleitores drop constraint if exists eleitores_zona_formato;
alter table public.eleitores add  constraint eleitores_zona_formato
  check (zona ~ '^[0-9]{3}$');

alter table public.eleitores drop constraint if exists eleitores_secao_formato;
alter table public.eleitores add  constraint eleitores_secao_formato
  check (secao ~ '^[0-9]{4}$');

create unique index if not exists eleitores_numero_inscricao_unico on public.eleitores (numero_inscricao);
create unique index if not exists eleitores_public_id_unico        on public.eleitores (public_id);

-- 5) Trigger: gera os dados a cada novo cadastro -----------------------------
create or replace function public.eleitores_gerar_dados_eleitorais()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Tudo abaixo é decidido pelo banco; qualquer valor enviado pelo navegador é ignorado.
  new.criado_em        := now();
  new.municipio        := 'São Joaquim de Bicas - MG';
  new.presidente_secao := 'Kleiton Hiago';
  new.numero_inscricao := public.gerar_numero_inscricao();
  new.zona             := lpad((1 + floor(random() * 999))::int::text, 3, '0');
  new.secao            := lpad((1 + floor(random() * 9999))::int::text, 4, '0');
  new.data_emissao     := (new.criado_em at time zone 'America/Sao_Paulo')::date;
  new.public_id        := gen_random_uuid();
  return new;
end;
$$;

drop trigger if exists trg_eleitores_gerar_dados on public.eleitores;
create trigger trg_eleitores_gerar_dados
  before insert on public.eleitores
  for each row execute function public.eleitores_gerar_dados_eleitorais();

-- 6) Trigger: depois de salvos, os dados eleitorais não mudam mais -----------
create or replace function public.eleitores_bloquear_alteracao()
returns trigger
language plpgsql
as $$
begin
  if new.numero_inscricao is distinct from old.numero_inscricao
     or new.zona             is distinct from old.zona
     or new.secao            is distinct from old.secao
     or new.data_emissao     is distinct from old.data_emissao
     or new.presidente_secao is distinct from old.presidente_secao
     or new.public_id        is distinct from old.public_id
     or new.municipio        is distinct from old.municipio
     or new.criado_em        is distinct from old.criado_em
  then
    raise exception 'Os dados eleitorais não podem ser alterados depois do cadastro.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_eleitores_bloquear_alteracao on public.eleitores;
create trigger trg_eleitores_bloquear_alteracao
  before update on public.eleitores
  for each row execute function public.eleitores_bloquear_alteracao();
