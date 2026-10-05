-- Voto Escolar — Etapa 6 (parte B): teste automático de dados e segurança do banco
-- Rode no Supabase: SQL Editor > New query > Run.
-- NÃO deixa nada gravado: o script cria 2 eleitores de teste, confere tudo e desfaz no final.
-- O resultado aparece como uma MENSAGEM DE ERRO que começa com "RESULTADO DO TESTE" — isso é
-- proposital (é o jeito de desfazer tudo). Cada linha começa com OK ou FALHOU.
-- Pré-requisitos: etapas 1, 2, 3, 5 e etapa6_nome_presidente.sql já rodadas.

do $teste$
declare
  r      text := '';
  v1     jsonb;
  v2     jsonb;
  t      jsonb;
  lista  jsonb;
  id1    uuid;
  id2    uuid;
  adm    uuid;
  total  int;
begin
  -- A) Cadastro pelo caminho público (visitante sem login) ---------------------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  v1 := public.cadastrar_eleitor('Teste Automatico Um', date '2005-05-05');
  v2 := public.cadastrar_eleitor('Teste Automatico Dois', date '2006-06-06');
  reset role;
  id1 := (v1->>'public_id')::uuid;
  id2 := (v2->>'public_id')::uuid;

  r := r || case when coalesce(v1->>'numero_inscricao' ~ '^[0-9]{12}$', false) then 'OK     ' else 'FALHOU ' end || 'inscrição com 12 dígitos' || E'\n';
  r := r || case when coalesce(v1->>'zona' ~ '^[0-9]{3}$' and v1->>'secao' ~ '^[0-9]{4}$', false) then 'OK     ' else 'FALHOU ' end || 'zona (3 dígitos) e seção (4 dígitos)' || E'\n';
  r := r || case when v1->>'municipio' = 'São Joaquim de Bicas - MG' then 'OK     ' else 'FALHOU ' end || 'município fixo' || E'\n';
  r := r || case when v1->>'presidente_secao' = 'Kleiton Hiago' and v2->>'presidente_secao' = 'Kleiton Hiago' then 'OK     ' else 'FALHOU ' end || 'presidente da seção = Kleiton Hiago' || E'\n';
  r := r || case when v1->>'data_emissao' is not null and id1 <> id2 then 'OK     ' else 'FALHOU ' end || 'data de emissão e UUIDs diferentes' || E'\n';

  select count(*) into total from public.eleitores where public_id in (id1, id2);
  r := r || case when total = 2 then 'OK     ' else 'FALHOU ' end || 'os 2 eleitores foram gravados na tabela' || E'\n';

  -- B) Consulta pública por UUID (QR Code) -------------------------------------
  set local role anon;
  t := public.obter_titulo(id1);
  r := r || case when t->>'nome_completo' = 'Teste Automatico Um' and t->>'numero_inscricao' = v1->>'numero_inscricao' then 'OK     ' else 'FALHOU ' end || 'QR do eleitor 1 devolve o título do eleitor 1' || E'\n';
  t := public.obter_titulo(id2);
  r := r || case when t->>'nome_completo' = 'Teste Automatico Dois' and t->>'numero_inscricao' = v2->>'numero_inscricao' then 'OK     ' else 'FALHOU ' end || 'QR do eleitor 2 devolve o título do eleitor 2' || E'\n';
  t := public.obter_titulo(gen_random_uuid());
  r := r || case when t is null then 'OK     ' else 'FALHOU ' end || 'UUID desconhecido não devolve nada' || E'\n';
  r := r || case when jsonb_typeof(public.obter_titulo(id1)) = 'object' and (select count(*) from jsonb_object_keys(public.obter_titulo(id1))) = 9 then 'OK     ' else 'FALHOU ' end || 'resposta pública tem só os 9 campos do título (um eleitor)' || E'\n';

  -- C) Visitante sem login não acessa nada protegido ---------------------------
  begin
    perform 1 from public.eleitores limit 1;
    r := r || 'FALHOU visitante conseguiu LER a tabela eleitores' || E'\n';
  exception when insufficient_privilege then
    r := r || 'OK     visitante NÃO consegue ler a tabela eleitores' || E'\n';
  end;

  begin
    insert into public.eleitores (nome_completo, data_nascimento) values ('Invasor Direto', date '2000-01-01');
    r := r || 'FALHOU visitante conseguiu GRAVAR direto na tabela' || E'\n';
  exception when insufficient_privilege then
    r := r || 'OK     visitante NÃO consegue gravar direto na tabela' || E'\n';
  end;

  begin
    lista := public.admin_listar_eleitores();
    r := r || 'FALHOU visitante conseguiu a lista administrativa' || E'\n';
  exception when insufficient_privilege then
    r := r || 'OK     visitante sem login NÃO consegue a lista administrativa' || E'\n';
  end;

  begin
    perform public.eh_admin();
    r := r || 'FALHOU visitante conseguiu chamar eh_admin()' || E'\n';
  exception when insufficient_privilege then
    r := r || 'OK     visitante NÃO consegue chamar eh_admin()' || E'\n';
  end;

  begin
    perform public.gerar_numero_inscricao();
    r := r || 'FALHOU visitante conseguiu chamar gerar_numero_inscricao()' || E'\n';
  exception when insufficient_privilege then
    r := r || 'OK     visitante NÃO consegue escolher número de inscrição' || E'\n';
  end;
  reset role;

  -- D) Usuário logado que NÃO é administrador ----------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    lista := public.admin_listar_eleitores();
    r := r || 'FALHOU usuário comum logado conseguiu a lista administrativa' || E'\n';
  exception when others then
    r := r || case when sqlerrm like '%restrito%' then 'OK     ' else 'FALHOU ' end
              || 'usuário logado que não é administrador é recusado (' || sqlerrm || ')' || E'\n';
  end;
  begin
    perform 1 from public.eleitores limit 1;
    r := r || 'FALHOU usuário logado conseguiu LER a tabela eleitores' || E'\n';
  exception when insufficient_privilege then
    r := r || 'OK     usuário logado NÃO consegue ler a tabela eleitores' || E'\n';
  end;
  reset role;

  -- E) Administrador de verdade --------------------------------------------------
  select user_id into adm from public.administradores limit 1;
  select count(*) into total from public.eleitores;
  if adm is null then
    r := r || 'FALTA  nenhum administrador cadastrado (faça o passo 3 da etapa 5 e rode de novo)' || E'\n';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    lista := public.admin_listar_eleitores();
    reset role;
    r := r || case when jsonb_array_length(lista) = total then 'OK     ' else 'FALHOU ' end
              || 'administrador recebe a lista completa (' || jsonb_array_length(lista) || ' de ' || total || ')' || E'\n';
    r := r || case when exists (select 1 from jsonb_array_elements(lista) x where x->>'public_id' = id1::text)
                    and exists (select 1 from jsonb_array_elements(lista) x where x->>'public_id' = id2::text)
                   then 'OK     ' else 'FALHOU ' end || 'os eleitores de teste aparecem na lista do administrador' || E'\n';
  end if;

  -- F) Estrutura e proteção da tabela --------------------------------------------
  r := r || case when (select relrowsecurity from pg_class where oid = 'public.eleitores'::regclass) then 'OK     ' else 'FALHOU ' end || 'RLS ligado na tabela eleitores' || E'\n';
  r := r || case when not has_table_privilege('anon', 'public.eleitores', 'select')
                  and not has_table_privilege('authenticated', 'public.eleitores', 'select') then 'OK     ' else 'FALHOU ' end || 'anon/authenticated sem SELECT em eleitores' || E'\n';
  r := r || case when not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'eleitores') then 'OK     ' else 'FALHOU ' end || 'nenhuma policy aberta em eleitores' || E'\n';
  r := r || case when not has_table_privilege('anon', 'public.administradores', 'select')
                  and not has_table_privilege('authenticated', 'public.administradores', 'select') then 'OK     ' else 'FALHOU ' end || 'tabela administradores fechada para o navegador' || E'\n';
  select count(*) into total from public.eleitores where presidente_secao <> 'Kleiton Hiago';
  r := r || case when total = 0 then 'OK     ' else 'FALHOU ' end || 'nenhum eleitor com o nome antigo do presidente (' || total || ' encontrados)' || E'\n';

  -- G) Dados eleitorais não podem ser alterados ----------------------------------
  begin
    update public.eleitores set zona = '999' where public_id = id1;
    r := r || 'FALHOU a zona foi alterada depois do cadastro' || E'\n';
  exception when others then
    r := r || 'OK     dados eleitorais não podem ser alterados depois do cadastro' || E'\n';
  end;

  -- Desfaz TUDO (inclusive os 2 eleitores de teste) e mostra o relatório.
  raise exception E'RESULTADO DO TESTE (nada ficou gravado):\n%', r;
end;
$teste$;
