-- Voto Escolar — Etapa 6 (parte A): corrige o nome do presidente da seção para "Kleiton Hiago"
-- Rode no Supabase: SQL Editor > New query > Run. Pode ser rodado mais de uma vez.
-- Pré-requisito: etapas 1, 2, 3 e 5 já rodadas.
--
-- Por que existe: a etapa 2 gravou "Cleiton Iago" nos eleitores já cadastrados e o banco
-- impede alterar dados eleitorais depois do cadastro. Aqui o bloqueio é desligado só durante
-- este UPDATE e religado em seguida (tudo acontece de uma vez; se algo falhar, nada muda).

-- 1) Novos cadastros passam a receber o nome correto --------------------------
create or replace function public.eleitores_gerar_dados_eleitorais()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

-- 2) Eleitores já cadastrados são corrigidos -----------------------------------
alter table public.eleitores disable trigger trg_eleitores_bloquear_alteracao;

update public.eleitores
   set presidente_secao = 'Kleiton Hiago'
 where presidente_secao is distinct from 'Kleiton Hiago';

alter table public.eleitores enable trigger trg_eleitores_bloquear_alteracao;

-- 3) Conferência: deve mostrar apenas "Kleiton Hiago" -------------------------
select presidente_secao, count(*) as eleitores
  from public.eleitores
 group by presidente_secao;
