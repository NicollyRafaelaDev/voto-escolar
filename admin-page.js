/* Painel administrativo (etapa 5): login com Supabase Auth + lista de eleitores.
 *
 * Segurança: o que protege os dados é o BANCO (função admin_listar_eleitores, que só atende
 * administradores logados). Esta página só mostra o painel depois que o banco devolve a lista;
 * sem login, nenhum dado de eleitor chega ao navegador.
 */
(function () {
  "use strict";

  const $ = function (id) { return document.getElementById(id); };

  const estado = $("estado-admin");
  const secaoLogin = $("secao-login");
  const painel = $("painel");
  const formLogin = $("form-login");
  const inputEmail = $("login-email");
  const inputSenha = $("login-senha");
  const btnEntrar = $("btn-entrar");
  const msgLogin = $("mensagem-login");
  const msgAdmin = $("mensagem-admin");
  const totalEl = $("total-eleitores");
  const btnPdfTodos = $("btn-pdf-todos");
  const btnSair = $("btn-sair");
  const inputBusca = $("busca");
  const contagemBusca = $("contagem-busca");
  const corpo = $("corpo-eleitores");

  const TEXTO_PDF = btnPdfTodos.textContent;

  let cliente = null;
  let eleitores = [];   // ordem de cadastro (mesma ordem do PDF)
  let indice = [];      // [{ e, chave }] ordenado por nome, para exibir e pesquisar
  let urlPdf = null;
  let iframeImpressao = null;

  // ---- Utilidades ----
  function ver(qual) {
    estado.hidden = qual !== "estado";
    secaoLogin.hidden = qual !== "login";
    painel.hidden = qual !== "painel";
  }

  function mostrar(el, texto, ok, link) {
    el.textContent = texto;
    el.className = "mensagem " + (ok ? "ok" : "falha");
    if (link) {
      const a = document.createElement("a");
      a.href = link.href;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = link.texto;
      el.append(a);
      if (link.depois) el.append(link.depois);
    }
  }

  function normalizar(t) {
    return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function enderecoSoDoComputador() {
    if (window.SITE_URL && String(window.SITE_URL).trim()) return false;
    const h = window.location.hostname;
    return window.location.protocol === "file:" || h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
  }

  function confirmarEnderecoLocal() {
    if (!enderecoSoDoComputador()) return true;
    return window.confirm(
      "Você está usando o site em endereço local. Os QR Codes vão apontar para este computador " +
        "e não abrirão no celular. Defina window.SITE_URL em config.js depois de publicar o site.\n\n" +
        "Continuar mesmo assim?"
    );
  }

  function bibliotecasPdfOk() {
    return !!(window.PDFLib && window.PDFTitulos && typeof window.qrcode === "function" && window.TituloUI);
  }

  function limparPainel() {
    eleitores = [];
    indice = [];
    corpo.replaceChildren();
    totalEl.textContent = "0";
    inputBusca.value = "";
    contagemBusca.textContent = "";
    msgAdmin.textContent = "";
    msgAdmin.className = "mensagem";
    if (iframeImpressao) { iframeImpressao.remove(); iframeImpressao = null; }
    if (urlPdf) { URL.revokeObjectURL(urlPdf); urlPdf = null; }
  }

  // ---- Configuração ----
  const configurado =
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY &&
    !window.SUPABASE_URL.startsWith("COLE_AQUI") &&
    !window.SUPABASE_ANON_KEY.startsWith("COLE_AQUI");

  if (!configurado) {
    estado.textContent = "Supabase não configurado. Preencha config.js com a URL e a anon key do projeto.";
    return;
  }
  if (!window.supabase) {
    estado.textContent = "Não foi possível carregar a biblioteca do Supabase. Verifique a internet.";
    return;
  }

  cliente = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  // Se a sessão terminar (aqui ou em outra aba), esconde tudo e volta para o login.
  cliente.auth.onAuthStateChange(function (evento) {
    if (evento === "SIGNED_OUT") {
      limparPainel();
      ver("login");
    }
  });

  // ---- Login / sessão ----
  function traduzErroLogin(error) {
    const msg = String((error && error.message) || "").toLowerCase();
    if (msg.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
    if (msg.includes("email not confirmed")) return "E-mail ainda não confirmado. No Supabase, confirme o usuário (Auto Confirm User).";
    if ((error && error.status === 429) || msg.includes("rate limit")) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
    return "Não foi possível entrar: " + ((error && error.message) || "erro desconhecido");
  }

  async function sairDaSessao(mensagemLogin) {
    await cliente.auth.signOut({ scope: "local" });
    limparPainel();
    ver("login");
    if (mensagemLogin) mostrar(msgLogin, mensagemLogin, false);
    else { msgLogin.textContent = ""; msgLogin.className = "mensagem"; }
  }

  formLogin.addEventListener("submit", async function (evento) {
    evento.preventDefault();
    const email = inputEmail.value.trim();
    const senha = inputSenha.value;
    if (!email || !senha) {
      mostrar(msgLogin, "Informe e-mail e senha.", false);
      return;
    }
    btnEntrar.disabled = true;
    btnEntrar.textContent = "Entrando...";
    mostrar(msgLogin, "", true);

    const { error } = await cliente.auth.signInWithPassword({ email: email, password: senha });

    btnEntrar.disabled = false;
    btnEntrar.textContent = "Entrar";
    if (error) {
      mostrar(msgLogin, traduzErroLogin(error), false);
      return;
    }
    inputSenha.value = "";
    msgLogin.textContent = "";
    await carregar();
  });

  btnSair.addEventListener("click", function () { sairDaSessao(); });

  async function iniciar() {
    ver("estado");
    const { data, error } = await cliente.auth.getSession();
    if (error || !data || !data.session) {
      ver("login");
      return;
    }
    await carregar();
  }

  // ---- Lista ----
  async function carregar() {
    ver("estado");
    estado.textContent = "Carregando eleitores...";
    const { data, error } = await cliente.rpc("admin_listar_eleitores");

    if (error) {
      console.error("Erro ao carregar eleitores:", error);
      const msg = String(error.message || "").toLowerCase();
      if (error.code === "42501" || msg.includes("restrito") || msg.includes("permission denied")) {
        await sairDaSessao("Esta conta não tem permissão de administrador.");
      } else if (error.code === "PGRST301" || msg.includes("jwt")) {
        await sairDaSessao("Sua sessão expirou. Entre novamente.");
      } else if (error.code === "PGRST202" || msg.includes("could not find the function")) {
        estado.textContent = "O banco ainda não está preparado (rode supabase/etapa5_admin_auth.sql e recarregue a página).";
      } else {
        estado.textContent = "Não foi possível carregar a lista: " + error.message;
      }
      return;
    }
    if (!Array.isArray(data)) {
      estado.textContent = "Resposta inesperada do banco.";
      return;
    }

    eleitores = data;
    indice = data
      .map(function (e) { return { e: e, chave: normalizar(e.nome_completo) }; })
      .sort(function (a, b) { return a.chave.localeCompare(b.chave, "pt-BR"); });
    renderizar();
    ver("painel");
  }

  function celula(texto, classe) {
    const td = document.createElement("td");
    td.textContent = texto;
    if (classe) td.className = classe;
    return td;
  }

  function renderizar() {
    totalEl.textContent = String(eleitores.length);
    const termo = normalizar(inputBusca.value);
    const lista = termo ? indice.filter(function (i) { return i.chave.includes(termo); }) : indice;

    if (lista.length === 0) {
      const tr = document.createElement("tr");
      const td = celula(eleitores.length === 0 ? "Nenhum eleitor cadastrado ainda." : "Nenhum eleitor encontrado para a pesquisa.", "vazio");
      td.colSpan = 8;
      tr.appendChild(td);
      corpo.replaceChildren(tr);
    } else {
      const linhas = lista.map(function (item) {
        const e = item.e;
        const tr = document.createElement("tr");
        tr.append(
          celula(e.nome_completo),
          celula(window.TituloUI.formatarData(e.data_nascimento), "num"),
          celula(e.numero_inscricao, "num"),
          celula(e.zona, "num"),
          celula(e.secao, "num"),
          celula(e.municipio),
          celula(window.TituloUI.formatarData(e.data_emissao), "num")
        );

        const td = document.createElement("td");
        const caixa = document.createElement("div");
        caixa.className = "acoes";

        const abrir = document.createElement("a");
        abrir.className = "btn-tabela";
        abrir.href = window.TituloUI.urlDoTitulo(e.public_id);
        abrir.target = "_blank";
        abrir.rel = "noopener";
        abrir.textContent = "Abrir título";

        const imprimir = document.createElement("button");
        imprimir.type = "button";
        imprimir.className = "btn-tabela secundario";
        imprimir.dataset.id = e.public_id;
        imprimir.textContent = "Imprimir";

        caixa.append(abrir, imprimir);
        td.appendChild(caixa);
        tr.appendChild(td);
        return tr;
      });
      corpo.replaceChildren.apply(corpo, linhas);
    }

    if (eleitores.length === 0) contagemBusca.textContent = "";
    else if (termo) contagemBusca.textContent = "Mostrando " + lista.length + " de " + eleitores.length + " eleitor(es).";
    else contagemBusca.textContent = eleitores.length + " eleitor(es), em ordem alfabética.";
  }

  inputBusca.addEventListener("input", renderizar);

  // ---- PDF ----
  function criarUrlPdf(bytes) {
    if (urlPdf) URL.revokeObjectURL(urlPdf);
    urlPdf = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    return urlPdf;
  }

  function dataHoje() {
    const h = new Date();
    return [h.getFullYear(), String(h.getMonth() + 1).padStart(2, "0"), String(h.getDate()).padStart(2, "0")].join("-");
  }

  function baixar(href, nomeArquivo) {
    const a = document.createElement("a");
    a.href = href;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  btnPdfTodos.addEventListener("click", async function () {
    if (eleitores.length === 0) {
      mostrar(msgAdmin, "Nenhum eleitor cadastrado ainda.", false);
      return;
    }
    if (!bibliotecasPdfOk()) {
      mostrar(msgAdmin, "Não foi possível carregar as bibliotecas de PDF/QR Code. Verifique a internet.", false);
      return;
    }
    if (!confirmarEnderecoLocal()) return;

    btnPdfTodos.disabled = true;
    btnPdfTodos.textContent = "Gerando PDF...";
    mostrar(msgAdmin, "Gerando PDF de " + eleitores.length + " título(s)...", true);
    try {
      const bytes = await window.PDFTitulos.gerarPDF(eleitores, { urlDoTitulo: window.TituloUI.urlDoTitulo });
      const href = criarUrlPdf(bytes);
      baixar(href, "titulos-voto-escolar-" + dataHoje() + ".pdf");
      const folhas = Math.ceil(eleitores.length / window.PDFTitulos.POR_PAGINA);
      mostrar(msgAdmin, "PDF gerado: " + eleitores.length + " título(s) em " + folhas + " folha(s) A4. ", true,
        { href: href, texto: "Abrir PDF para imprimir" });
    } catch (erro) {
      console.error("Erro ao gerar PDF:", erro);
      mostrar(msgAdmin, "Erro ao gerar o PDF: " + (erro && erro.message ? erro.message : erro), false);
    } finally {
      btnPdfTodos.disabled = false;
      btnPdfTodos.textContent = TEXTO_PDF;
    }
  });

  // Impressão individual: gera um PDF só com o título (mesmo desenho do PDF em lote) e abre a impressão.
  function imprimirPDF(href) {
    if (iframeImpressao) iframeImpressao.remove();
    const f = document.createElement("iframe");
    f.title = "Impressão do título";
    f.setAttribute("aria-hidden", "true");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
    f.addEventListener("load", function () {
      setTimeout(function () {
        try { f.contentWindow.focus(); f.contentWindow.print(); } catch (_) { /* o link "abrir o PDF" cobre este caso */ }
      }, 400);
    });
    f.src = href;
    document.body.appendChild(f);
    iframeImpressao = f;
  }

  corpo.addEventListener("click", async function (evento) {
    const botao = evento.target.closest("button[data-id]");
    if (!botao) return;
    const e = eleitores.find(function (x) { return x.public_id === botao.dataset.id; });
    if (!e) return;

    if (!bibliotecasPdfOk()) {
      mostrar(msgAdmin, "Não foi possível carregar as bibliotecas de PDF/QR Code. Verifique a internet.", false);
      return;
    }
    if (!confirmarEnderecoLocal()) return;

    botao.disabled = true;
    const textoOriginal = botao.textContent;
    botao.textContent = "Preparando...";
    try {
      const bytes = await window.PDFTitulos.gerarPDF([e], { urlDoTitulo: window.TituloUI.urlDoTitulo });
      const href = criarUrlPdf(bytes);
      imprimirPDF(href);
      mostrar(msgAdmin, "Título de " + e.nome_completo + " pronto. Se a janela de impressão não abrir, ", true,
        { href: href, texto: "abra o PDF", depois: " e imprima em tamanho real (100%)." });
    } catch (erro) {
      console.error("Erro ao preparar impressão:", erro);
      mostrar(msgAdmin, "Erro ao preparar o título: " + (erro && erro.message ? erro.message : erro), false);
    } finally {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  });

  iniciar();
})();
