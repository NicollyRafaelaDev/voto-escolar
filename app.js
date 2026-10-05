(function () {
  "use strict";

  const form = document.getElementById("form-cadastro");
  const inputNome = document.getElementById("nome");
  const inputNasc = document.getElementById("nascimento");
  const erroNome = document.getElementById("erro-nome");
  const erroNasc = document.getElementById("erro-nascimento");
  const btnSalvar = document.getElementById("btn-salvar");
  const mensagem = document.getElementById("mensagem");
  const secaoTitulo = document.getElementById("secao-titulo");
  const containerTitulo = document.getElementById("titulo-container");

  // Data máxima do campo = hoje (no fuso do navegador)
  const hoje = new Date();
  const hojeISO = [
    hoje.getFullYear(),
    String(hoje.getMonth() + 1).padStart(2, "0"),
    String(hoje.getDate()).padStart(2, "0"),
  ].join("-");
  inputNasc.max = hojeISO;
  inputNasc.min = "1900-01-01";

  // ---- Supabase ----
  const configurado =
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY &&
    !window.SUPABASE_URL.startsWith("COLE_AQUI") &&
    !window.SUPABASE_ANON_KEY.startsWith("COLE_AQUI");

  let supabaseClient = null;

  if (!configurado) {
    mostrarMensagem(
      "Supabase não configurado. Preencha js/config.js com a URL e a anon key do projeto.",
      false
    );
    btnSalvar.disabled = true;
  } else if (!window.supabase) {
    mostrarMensagem("Não foi possível carregar a biblioteca do Supabase. Verifique a internet.", false);
    btnSalvar.disabled = true;
  } else {
    supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }

  // ---- Utilidades ----
  function mostrarMensagem(texto, ok) {
    mensagem.textContent = texto;
    mensagem.className = "mensagem " + (ok ? "ok" : "falha");
  }

  function limparErros() {
    erroNome.textContent = "";
    erroNasc.textContent = "";
    inputNome.classList.remove("invalido");
    inputNasc.classList.remove("invalido");
  }

  function normalizarNome(nome) {
    return nome.trim().replace(/\s+/g, " ");
  }

  // Se uma migração do Supabase ainda não foi rodada, indica qual.
  function dicaMigracao(error) {
    const texto = ((error && error.message) || "").toLowerCase();
    const codigo = (error && error.code) || "";
    if (codigo === "PGRST202" || codigo === "42883" || texto.includes("could not find the function")) {
      return " (Rode supabase/etapa3_titulo_publico.sql no SQL Editor do Supabase.)";
    }
    if (
      codigo === "42703" ||
      codigo === "PGRST204" ||
      texto.includes("does not exist") ||
      texto.includes("schema cache")
    ) {
      return " (Rode supabase/etapa2_dados_eleitorais.sql no SQL Editor do Supabase.)";
    }
    return "";
  }

  function validar(nome, nascimento) {
    let valido = true;
    limparErros();

    if (nome.length < 5 || nome.split(" ").length < 2) {
      erroNome.textContent = "Informe o nome completo (nome e sobrenome).";
      inputNome.classList.add("invalido");
      valido = false;
    }

    if (!nascimento) {
      erroNasc.textContent = "Informe a data de nascimento.";
      inputNasc.classList.add("invalido");
      valido = false;
    } else if (nascimento > hojeISO) {
      erroNasc.textContent = "A data de nascimento não pode ser no futuro.";
      inputNasc.classList.add("invalido");
      valido = false;
    } else if (nascimento < "1900-01-01") {
      erroNasc.textContent = "Data de nascimento inválida.";
      inputNasc.classList.add("invalido");
      valido = false;
    }

    return valido;
  }

  // ---- Cadastro ----
  form.addEventListener("submit", async function (evento) {
    evento.preventDefault();
    if (!supabaseClient) return;

    const nome = normalizarNome(inputNome.value);
    const nascimento = inputNasc.value;

    if (!validar(nome, nascimento)) {
      mostrarMensagem("Corrija os campos destacados.", false);
      return;
    }

    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
    mostrarMensagem("", true);

    // Inscrição, zona, seção, emissão, UUID, município e presidente da seção
    // são gerados pelo banco; a função devolve o título completo já salvo.
    const { data: eleitor, error } = await supabaseClient.rpc("cadastrar_eleitor", {
      p_nome: nome,
      p_nascimento: nascimento,
    });

    btnSalvar.disabled = false;
    btnSalvar.textContent = "Cadastrar eleitor";

    if (error || !eleitor) {
      console.error("Erro ao salvar:", error);
      mostrarMensagem(
        "Não foi possível salvar: " + (error ? error.message : "resposta vazia") + dicaMigracao(error),
        false
      );
      return;
    }

    form.reset();
    limparErros();
    mostrarMensagem("Eleitor cadastrado com sucesso! Inscrição: " + eleitor.numero_inscricao, true);

    window.TituloUI.renderizarTitulo(containerTitulo, eleitor, { mostrarLink: true });
    secaoTitulo.hidden = false;
    secaoTitulo.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
