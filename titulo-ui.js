/* Título digital compartilhado: usado pela página de cadastro e pela página pública (titulo.html). */
(function () {
  "use strict";

  function formatarData(iso) {
    // iso = "YYYY-MM-DD"; evita new Date() para não deslocar o dia por fuso horário
    const [a, m, d] = String(iso).split("-");
    return d + "/" + m + "/" + a;
  }

  function siteConfigurado() {
    return !!(window.SITE_URL && String(window.SITE_URL).trim());
  }

  // Pasta onde o site está hospedado (com "/" no final).
  function baseDoSite() {
    if (siteConfigurado()) {
      return String(window.SITE_URL).trim().replace(/\/+$/, "") + "/";
    }
    return window.location.href.split(/[?#]/)[0].replace(/[^/]*$/, "");
  }

  // URL pública do título: só carrega o UUID daquele eleitor.
  function urlDoTitulo(publicId) {
    return baseDoSite() + "titulo.html?id=" + encodeURIComponent(publicId);
  }

  // No computador (arquivo local ou localhost), o celular não consegue abrir o link do QR.
  function enderecoSoDoComputador() {
    if (siteConfigurado()) return false;
    const h = window.location.hostname;
    return (
      window.location.protocol === "file:" ||
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "[::1]" ||
      h === "::1"
    );
  }

  function criarQR(texto) {
    if (typeof window.qrcode !== "function") return null;

    const qr = window.qrcode(0, "M");
    qr.addData(texto);
    qr.make();

    const n = qr.getModuleCount();
    const margem = 4; // zona de silêncio exigida pelo padrão do QR Code
    const tam = n + margem * 2;
    const NS = "http://www.w3.org/2000/svg";

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + tam + " " + tam);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "QR Code do título digital");
    svg.setAttribute("shape-rendering", "crispEdges");

    const fundo = document.createElementNS(NS, "rect");
    fundo.setAttribute("width", tam);
    fundo.setAttribute("height", tam);
    fundo.setAttribute("fill", "#ffffff");
    svg.appendChild(fundo);

    let d = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += "M" + (c + margem) + " " + (r + margem) + "h1v1h-1z";
      }
    }
    const modulos = document.createElementNS(NS, "path");
    modulos.setAttribute("d", d);
    modulos.setAttribute("fill", "#000000");
    svg.appendChild(modulos);

    return svg;
  }

  function campo(rotulo, valor, largo) {
    const bloco = document.createElement("div");
    bloco.className = "campo-titulo" + (largo ? " largo" : "");
    const dt = document.createElement("dt");
    dt.textContent = rotulo;
    const dd = document.createElement("dd");
    dd.textContent = valor;
    bloco.append(dt, dd);
    return bloco;
  }

  // e = { nome_completo, data_nascimento, municipio, numero_inscricao, zona, secao,
  //       data_emissao, presidente_secao, public_id }
  function renderizarTitulo(container, e, opcoes) {
    const mostrarLink = !!(opcoes && opcoes.mostrarLink);
    const url = urlDoTitulo(e.public_id);

    const titulo = document.createElement("article");
    titulo.className = "titulo";
    titulo.setAttribute("aria-label", "Título de eleitor digital");

    const topo = document.createElement("div");
    topo.className = "titulo-topo";
    const t1 = document.createElement("strong");
    t1.textContent = "Título de Eleitor Digital";
    const t2 = document.createElement("span");
    t2.textContent = "Voto Escolar · eleição fictícia";
    topo.append(t1, t2);

    const dados = document.createElement("dl");
    dados.className = "titulo-dados";
    dados.append(
      campo("Nome completo", e.nome_completo, true),
      campo("Data de nascimento", formatarData(e.data_nascimento), false),
      campo("Data de emissão", formatarData(e.data_emissao), false),
      campo("Município", e.municipio, true),
      campo("Nº de inscrição", e.numero_inscricao, true),
      campo("Zona", e.zona, false),
      campo("Seção", e.secao, false),
      campo("Presidente da seção", e.presidente_secao, true)
    );

    const areaQR = document.createElement("div");
    areaQR.className = "titulo-qr";

    const svg = criarQR(url);
    if (svg) {
      areaQR.appendChild(svg);
    } else {
      const falha = document.createElement("p");
      falha.className = "aviso-local";
      falha.textContent = "Não foi possível gerar o QR Code (a biblioteca não carregou). Verifique a internet.";
      areaQR.appendChild(falha);
    }

    const uuid = document.createElement("p");
    uuid.className = "uuid";
    uuid.textContent = "ID público: " + e.public_id;
    areaQR.appendChild(uuid);

    if (mostrarLink) {
      const link = document.createElement("a");
      link.className = "titulo-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Abrir página pública do título";
      areaQR.appendChild(link);

      if (enderecoSoDoComputador()) {
        const aviso = document.createElement("p");
        aviso.className = "aviso-local";
        aviso.textContent =
          "Você está usando o site neste computador (endereço local). O QR Code só abre no celular " +
          "depois que o site for publicado na internet. Se já estiver publicado, defina window.SITE_URL em js/config.js.";
        areaQR.appendChild(aviso);
      }
    }

    titulo.append(topo, dados, areaQR);
    container.replaceChildren(titulo);
    container.hidden = false;
  }

  window.TituloUI = {
    renderizarTitulo: renderizarTitulo,
    urlDoTitulo: urlDoTitulo,
    formatarData: formatarData,
  };
})();
