# Voto Escolar

Site para uma eleição escolar fictícia — município: São Joaquim de Bicas - MG.

**Etapa 1:** estrutura inicial + cadastro de eleitores salvo no Supabase.

## Estrutura

```
voto-escolar/
├── index.html           # formulário de cadastro + título digital do eleitor cadastrado
├── titulo.html          # página PÚBLICA do título (o link do QR Code): ?id=<uuid>
├── css/style.css        # estilos
├── js/config.js         # URL e anon key do Supabase (você preenche)
├── js/app.js            # validação e cadastro
├── js/titulo-ui.js      # desenha o título e o QR Code (usado pelas duas páginas)
├── js/titulo-page.js    # busca o título do UUID da URL na página pública
├── js/pdf-titulos.js    # título físico (borda verde, caixas, QR) + PDF A4 em lote (etapa 4)
├── admin.html           # painel administrativo, protegido por login (etapa 5)
├── js/admin-page.js     # login (Supabase Auth), lista, pesquisa, impressão e PDF (etapa 5)
├── supabase/schema.sql  # criação da tabela "eleitores" (etapa 1)
├── supabase/etapa2_dados_eleitorais.sql  # geração automática dos dados eleitorais (etapa 2)
├── supabase/etapa3_titulo_publico.sql    # consulta pública segura por UUID (etapa 3)
├── supabase/etapa5_admin_auth.sql        # administradores + lista protegida por login (etapa 5)
├── supabase/etapa6_nome_presidente.sql   # corrige o nome do presidente para "Kleiton Hiago" (etapa 6)
├── supabase/etapa6_teste_final.sql       # teste automático de dados e segurança do banco (etapa 6)
└── README.md
```

## Como configurar

1. Crie um projeto em https://supabase.com (ou use um existente).
2. No painel: **SQL Editor > New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings > API**, copie a **Project URL** e a chave **anon public**.
4. Abra `js/config.js` e substitua os dois valores.

> Use apenas a chave `anon`. Nunca coloque a `service_role` no código do site.

## Como testar o cadastro

1. Abra `index.html` no navegador (clique duas vezes ou use a extensão Live Server do VS Code).
2. Preencha **Nome completo** e **Data de nascimento** e clique em **Cadastrar eleitor**.
3. Deve aparecer "Eleitor cadastrado com sucesso!" (a partir da etapa 3, o título digital aparece logo abaixo).
4. Confirme no Supabase: **Table Editor > eleitores** — a linha deve estar lá, com município "São Joaquim de Bicas - MG".
5. Confira de novo no Table Editor depois de recarregar a página: o eleitor continua lá (a lista pública da página foi removida na etapa 3, por privacidade).
6. Teste a validação: nome com uma palavra só, ou data no futuro, deve mostrar erro e não salvar.
7. Para provar que o banco é compartilhado, cadastre em um navegador e confira no Table Editor do Supabase (ou abra o link do título em outro dispositivo, na etapa 3).

## Etapa 2 — dados eleitorais gerados automaticamente

A cada novo cadastro, o **próprio banco** (trigger no Supabase) gera e grava:

| Campo | Regra |
|---|---|
| `numero_inscricao` | 12 dígitos aleatórios, único |
| `zona` | 3 dígitos aleatórios (001–999) |
| `secao` | 4 dígitos aleatórios (0001–9999) |
| `data_emissao` | data do cadastro (fuso de São Paulo) |
| `public_id` | UUID único |
| `municipio` | sempre "São Joaquim de Bicas - MG" |
| `presidente_secao` | sempre "Kleiton Hiago" |

Depois de salvos, esses valores **não podem ser alterados** (o banco recusa qualquer tentativa de UPDATE neles). Valores enviados pelo navegador para esses campos são ignorados.

### Como ativar

1. No Supabase, **SQL Editor > New query**, cole o conteúdo de `supabase/etapa2_dados_eleitorais.sql` e clique em **Run**.
   - Eleitores já cadastrados na etapa 1 recebem os dados automaticamente.
   - Pode rodar mais de uma vez sem problema.
2. Substitua `index.html`, `css/style.css` e `js/app.js` pelas versões novas (o `js/config.js` com suas chaves continua o mesmo).

### Como testar

1. Abra o site, cadastre um eleitor. A mensagem de sucesso mostra o número de inscrição.
2. Na lista, o eleitor aparece com inscrição, zona, seção, emissão, presidente da seção e ID público.
3. Recarregue a página: os valores continuam exatamente iguais.
4. Confira no banco, em **SQL Editor**:

   ```sql
   select nome_completo, numero_inscricao, zona, secao, data_emissao,
          presidente_secao, municipio, public_id
   from public.eleitores
   order by criado_em desc
   limit 5;
   ```

5. (Opcional) Prove a imutabilidade — deve dar erro "Os dados eleitorais não podem ser alterados depois do cadastro":

   ```sql
   update public.eleitores set zona = '999' where id = (select id from public.eleitores limit 1);
   ```

## Etapa 3 — título digital + QR Code

Depois do cadastro, o site mostra o **título digital** (nome, nascimento, município, inscrição, zona, seção, emissão e presidente da seção) com um **QR Code individual**. O QR abre `titulo.html?id=<UUID do eleitor>`, uma página pública que mostra **somente** o título daquele UUID.

### Como a privacidade funciona

- A página pública faz uma única pergunta ao banco: "qual o título deste UUID?" (função `obter_titulo`). Não existe busca, listagem nem consulta por nome ou número.
- O UUID é aleatório e impossível de adivinhar; só quem tem o QR/link abre aquele título.
- Para isso valer de verdade, o `etapa3_titulo_publico.sql` **fecha o acesso direto à tabela** pela chave `anon`. O cadastro passa pela função `cadastrar_eleitor`. Por isso a lista de eleitores que ficava na página de cadastro foi removida. Você continua vendo todos os eleitores no **Table Editor** do Supabase.
- `titulo.html` usa `noindex` (buscadores não indexam) e `no-referrer`.

### Como ativar

1. Rode `supabase/etapa3_titulo_publico.sql` no **SQL Editor** (a etapa 2 precisa estar aplicada antes). Se aparecer pedido de confirmação por causa dos `drop`/`revoke`, confirme.
2. Substitua os arquivos do site pelas versões novas: `index.html`, `titulo.html`, `css/style.css`, `js/app.js`, `js/titulo-ui.js`, `js/titulo-page.js`. **Não substitua o `js/config.js`**, que tem as suas chaves.
3. **Publique o site** (GitHub Pages, Netlify, Vercel...) para o QR abrir no celular. Num arquivo aberto no computador (`file://` ou `localhost`), o QR aponta para o endereço do computador e o celular não consegue abrir; o site mostra um aviso quando isso acontece. Se o endereço público for diferente do que o navegador mostra, adicione ao `js/config.js`:

   ```js
   window.SITE_URL = "https://seu-usuario.github.io/voto-escolar";
   ```

### Como testar

1. Cadastre um eleitor: o título aparece com o QR Code.
2. Aponte a câmera do celular para o QR Code (com o site publicado): abre a página com o título desse eleitor.
3. Compare os dados do título com o **Table Editor > eleitores** (mesmo UUID em `public_id`).
4. Cadastre um segundo eleitor e abra o link do primeiro: continua mostrando só o primeiro.
5. Teste links inválidos: `titulo.html`, `titulo.html?id=abc` e `titulo.html?id=00000000-0000-4000-8000-000000000000` não mostram nenhum título.

## Etapa 4 — título físico + PDF com todos os títulos

`js/pdf-titulos.js` desenha o **título físico** (borda verde decorativa, campos em caixas, nome em destaque, nascimento, inscrição, zona, seção, município/UF, emissão, presidente da seção e **QR Code individual**) e monta **um único PDF A4** com 8 títulos por folha (2 × 4, cada um com 92 × 64 mm e 6 mm entre eles, para recortar). O cabeçalho do título e o rodapé de cada folha deixam claro que é um documento escolar **fictício**.

Cada título é desenhado a partir de um único registro; o QR é gerado com o `public_id` desse mesmo registro (o mesmo link do QR do título digital). O PDF recusa listas com `public_id` repetido ou campos faltando. Imprima em **A4, escala 100% / "tamanho real"**.

> O botão que chama esta função fica no painel da etapa 5. O acesso por "chave administrativa" da etapa 4 (`etapa4_admin_pdf.sql` e `js/admin.js`) foi **substituído por login** e pode ser apagado do projeto.

## Etapa 5 — painel administrativo com login

Página separada: **`admin.html`**. Sem login ela mostra só o formulário de entrada; a lista de eleitores nunca chega ao navegador de quem não é administrador.

No painel: total de eleitores e botão **Gerar PDF com todos os títulos** no topo; tabela com nome, nascimento, inscrição, zona, seção, município e emissão; pesquisa pelo nome (sem diferenciar maiúsculas nem acentos); **Abrir título** (abre `titulo.html?id=<UUID>` em nova aba); **Imprimir** (gera o PDF só daquele título e abre a impressão) e **Sair**.

### Como a proteção funciona

- A tabela `eleitores` continua **fechada** para o navegador (como na etapa 3).
- A lista só sai pela função `admin_listar_eleitores()`, que confere no banco se o usuário logado (`auth.uid()`) está na tabela `administradores`. Anônimo não executa a função; usuário logado que não é administrador recebe "Acesso restrito a administradores."
- Estar logado **não basta**: mesmo que alguém consiga criar conta no Supabase Auth, só vira administrador quem for inserido em `administradores`.
- O cadastro público, o título público e o QR Code não mudam.

### O que configurar no Supabase (nesta ordem)

1. **SQL Editor:** rode `supabase/etapa5_admin_auth.sql` (etapas 1 a 3 antes). Ele também remove a função e a tabela de chave da etapa 4.
2. **Authentication > Users > Add user > Create new user:** informe e-mail e uma senha forte e marque **Auto Confirm User**.
3. **SQL Editor** (rode separadamente, trocando o e-mail pelo do passo 2):

   ```sql
   insert into public.administradores (user_id)
   select id from auth.users where email = 'SEU-EMAIL@exemplo.com'
   on conflict do nothing;
   ```

4. **Recomendado:** desligue o cadastro aberto em **Authentication** (Sign In / Providers > Email) desmarcando **Allow new users to sign up** (o nome do menu pode variar). Não é o que protege a lista (isso é o passo 3), mas evita contas desconhecidas.
5. **Arquivos do site:** adicione `admin.html` e `js/admin-page.js`, substitua `css/style.css` e `index.html` (a versão nova é a original, sem o card da etapa 4) e apague `js/admin.js`. Mantenha `js/pdf-titulos.js`, `js/titulo-ui.js` e `js/config.js`.
6. Abra `admin.html` do site publicado e entre com o e-mail e a senha do passo 2.

### Como conferir o bloqueio no banco (SQL Editor)

```sql
-- Sem login: os dois devem dar "permission denied"
begin; set local role anon; select * from public.eleitores limit 1; rollback;
begin; set local role anon; select public.admin_listar_eleitores(); rollback;

-- Logado mas não administrador (troque pelo id de qualquer usuário que NÃO esteja em administradores):
-- deve dar "Acesso restrito a administradores."
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ID-DE-UM-USUARIO-COMUM","role":"authenticated"}', true);
select public.admin_listar_eleitores();
rollback;
```

### Como testar o painel

1. Sem login, abra `admin.html`: só aparece o formulário. Senha errada mostra erro.
2. Entre como administrador: aparecem o total e a lista. Recarregar a página mantém o login; **Sair** volta ao formulário.
3. Pesquise por parte do nome (com ou sem acento).
4. **Abrir título** abre o título digital daquele eleitor com o QR.
5. **Imprimir** abre a impressão do título individual (se não abrir, use o link "abra o PDF" que aparece); **Gerar PDF com todos os títulos** baixa o PDF completo.

## Etapa 6 — teste final e estabilização

Nenhuma função nova. Correções e conferências:

1. **Caminhos dos arquivos:** `index.html` e `admin.html` agora carregam `css/style.css` e `js/*.js` (como `titulo.html`). Antes, o painel administrativo ficava preso em "Verificando acesso..." e o PDF não podia ser gerado.
2. **Nome do presidente da seção:** `Kleiton Hiago` (antes `Cleiton Iago`). Rode `supabase/etapa6_nome_presidente.sql` para corrigir os eleitores já cadastrados e os próximos cadastros.
3. **Teste do banco:** rode `supabase/etapa6_teste_final.sql` no SQL Editor. Ele cria 2 eleitores de teste, confere cadastro, QR por UUID, bloqueio de visitantes, login comum x administrador e RLS, e desfaz tudo no final. O resultado aparece como uma mensagem de erro que começa com `RESULTADO DO TESTE` (é proposital): cada linha deve começar com `OK`.

## Próximas etapas (ainda não feitas)

edição/exclusão de eleitores e melhorias de design.
