/* Página pública do título: mostra SOMENTE o título do UUID presente na URL (?id=...). */
(function () {
  "use strict";

  const estado = document.getElementById("estado");
  const container = document.getElementById("titulo-container");
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function aviso(texto) {
    estado.textContent = texto;
    estado.hidden = false;
    container.hidden = true;
  }

  const id = new URLSearchParams(window.location.search).get("id");
  if (!id || !UUID_RE.test(id)) {
    aviso("Link inválido. Escaneie novamente o QR Code do título.");
    return;
  }

  const configurado =
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY &&
    !window.SUPABASE_URL.startsWith("COLE_AQUI") &&
    !window.SUPABASE_ANON_KEY.startsWith("COLE_AQUI");

  if (!configurado) {
    aviso("Supabase não configurado. Preencha js/config.js com a URL e a anon key do projeto.");
    return;
  }
  if (!window.supabase) {
    aviso("Não foi possível carregar a biblioteca do Supabase. Verifique a internet.");
    return;
  }

  const supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  // A única consulta possível: o título deste UUID. Não existe busca nem listagem.
  supabaseClient
    .rpc("obter_titulo", { p_public_id: id.toLowerCase() })
    .then(function (resposta) {
      if (resposta.error) {
        console.error("Erro ao buscar título:", resposta.error);
        const msg = String(resposta.error.message || "").toLowerCase();
        const faltaFuncao =
          resposta.error.code === "PGRST202" || msg.includes("could not find the function");
        aviso(
          faltaFuncao
            ? "O banco ainda não está preparado (rode supabase/etapa3_titulo_publico.sql)."
            : "Não foi possível carregar o título. Tente novamente."
        );
        return;
      }
      if (!resposta.data) {
        aviso("Título não encontrado.");
        return;
      }
      estado.hidden = true;
      window.TituloUI.renderizarTitulo(container, resposta.data, { mostrarLink: false });
    });
})();
