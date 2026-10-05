/* Título eleitoral escolar (versão física) + PDF A4 em lote.
 * Depende de: pdf-lib (window.PDFLib) e qrcode-generator (window.qrcode).
 * Documento FICTÍCIO de eleição escolar: não usa brasão, nome nem identidade oficial.
 *
 * Uso: PDFTitulos.gerarPDF(eleitores, { urlDoTitulo: fn(publicId) }) -> Promise<Uint8Array>
 *
 * Cada título é desenhado a partir de UM único registro de eleitor: o texto e o QR Code
 * (gerado a partir do public_id desse mesmo registro) nunca passam por listas separadas.
 */
(function (root) {
  "use strict";

  const MM = 72 / 25.4; // pontos por milímetro

  // ---- Geometria (em mm, origem no canto superior esquerdo) ----
  const PAGINA = { w: 210, h: 297 };   // A4 retrato
  const TITULO = { w: 92, h: 64 };     // proporção 23:16, boa para recortar
  const ESPACO = { x: 6, y: 6 };       // espaço entre títulos (guia de corte)
  const COLUNAS = 2;
  const LINHAS = 4;
  const POR_PAGINA = COLUNAS * LINHAS; // 8 títulos por folha
  const MARGEM = {
    x: (PAGINA.w - (COLUNAS * TITULO.w + (COLUNAS - 1) * ESPACO.x)) / 2,
    y: (PAGINA.h - (LINHAS * TITULO.h + (LINHAS - 1) * ESPACO.y)) / 2,
  };

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const CAMPOS = [
    "nome_completo", "data_nascimento", "municipio", "numero_inscricao",
    "zona", "secao", "data_emissao", "presidente_secao", "public_id",
  ];

  // ---- Utilidades ----
  function formatarData(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    return m ? m[3] + "/" + m[2] + "/" + m[1] : String(iso);
  }

  const TROCAS = { "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Ħ": "H", "ħ": "h", "ı": "i" };

  // Standard fonts só aceitam o alfabeto Latin (WinAnsi): troca o que não existe, sem quebrar.
  function criarSanitizador(fonte) {
    const aceitos = new Set(fonte.getCharacterSet());
    return function (valor) {
      let saida = "";
      for (const ch of String(valor == null ? "" : valor).normalize("NFC")) {
        const cp = ch.codePointAt(0);
        if (cp < 32) continue;
        if (aceitos.has(cp)) { saida += ch; continue; }
        const base = TROCAS[ch] || ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const ok = base && Array.from(base).every(function (c) { return aceitos.has(c.codePointAt(0)); });
        saida += ok ? base : "?";
      }
      return saida;
    };
  }

  function matrizQR(texto) {
    if (typeof root.qrcode !== "function") {
      throw new Error("Biblioteca de QR Code não carregada.");
    }
    const qr = root.qrcode(0, "M");
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    const linhas = [];
    for (let r = 0; r < n; r++) {
      const linha = [];
      for (let c = 0; c < n; c++) linha.push(!!qr.isDark(r, c));
      linhas.push(linha);
    }
    return linhas;
  }

  function validar(eleitores) {
    const vistos = new Set();
    eleitores.forEach(function (e, i) {
      CAMPOS.forEach(function (campo) {
        if (!e || e[campo] == null || String(e[campo]) === "") {
          throw new Error("Eleitor #" + (i + 1) + " sem o campo " + campo + ".");
        }
      });
      if (!UUID_RE.test(e.public_id)) {
        throw new Error("Eleitor #" + (i + 1) + " com public_id inválido.");
      }
      const id = String(e.public_id).toLowerCase();
      if (vistos.has(id)) throw new Error("public_id repetido na lista: " + id);
      vistos.add(id);
    });
  }

  // ---- Desenho de um título ----
  function criarContexto(pdf, pagina, fontes) {
    const { rgb } = root.PDFLib;
    const limpar = criarSanitizador(fontes.negrito);
    return {
      pagina: pagina,
      f: fontes,
      limpar: limpar,
      cor: {
        verde: rgb(0.043, 0.365, 0.165),
        verdeMedio: rgb(0.18, 0.545, 0.341),
        faixa: rgb(0.867, 0.937, 0.89),
        fundo: rgb(0.965, 0.984, 0.969),
        rotulo: rgb(0.29, 0.42, 0.34),
        texto: rgb(0.07, 0.09, 0.08),
        branco: rgb(1, 1, 1),
        cinza: rgb(0.45, 0.45, 0.45),
      },
    };
  }

  const px = function (x) { return x * MM; };
  const py = function (y) { return (PAGINA.h - y) * MM; };

  function retangulo(ctx, x, y, w, h, opcoes) {
    ctx.pagina.drawRectangle(Object.assign({
      x: px(x), y: py(y + h), width: w * MM, height: h * MM,
    }, opcoes));
  }

  function escrever(ctx, str, o) {
    const s = ctx.limpar(str);
    let x = o.x;
    if (o.centroLargura != null) {
      x = o.x + (o.centroLargura - o.fonte.widthOfTextAtSize(s, o.tam) / MM) / 2;
    }
    ctx.pagina.drawText(s, { x: px(x), y: py(o.y), size: o.tam, font: o.fonte, color: o.cor });
  }

  function larguraMM(ctx, fonte, str, tam) {
    return fonte.widthOfTextAtSize(ctx.limpar(str), tam) / MM;
  }

  function tamanhoQueCabe(ctx, fonte, str, maxMM, tamMax, tamMin) {
    let t = tamMax;
    while (t > tamMin && larguraMM(ctx, fonte, str, t) > maxMM) t -= 0.25;
    return t;
  }

  // Nome: uma linha se couber (até 11pt); senão, duas linhas com a fonte maior possível.
  function nomeEmLinhas(ctx, nome, maxMM) {
    const fonte = ctx.f.negrito;
    const t1 = tamanhoQueCabe(ctx, fonte, nome, maxMM, 11, 7.5);
    if (larguraMM(ctx, fonte, nome, t1) <= maxMM) return { linhas: [nome], tam: t1 };

    const palavras = nome.split(" ");
    for (let tam = 7.5; tam >= 4.5; tam -= 0.25) {
      let melhor = null;
      for (let i = 1; i < palavras.length; i++) {
        const a = palavras.slice(0, i).join(" ");
        const b = palavras.slice(i).join(" ");
        const w = Math.max(larguraMM(ctx, fonte, a, tam), larguraMM(ctx, fonte, b, tam));
        if (!melhor || w < melhor.w) melhor = { a: a, b: b, w: w };
      }
      if (melhor && melhor.w <= maxMM) return { linhas: [melhor.a, melhor.b], tam: tam };
    }
    return { linhas: [nome.slice(0, 60), nome.slice(60, 118)], tam: 4.5 }; // limite do banco: 120
  }

  function caixa(ctx, x, y, w, h, rotulo) {
    retangulo(ctx, x, y, w, h, { color: ctx.cor.branco, borderColor: ctx.cor.verdeMedio, borderWidth: 0.6 });
    escrever(ctx, rotulo.toUpperCase(), { x: x + 1.3, y: y + 2.5, tam: 4.3, fonte: ctx.f.negrito, cor: ctx.cor.rotulo });
  }

  function campoSimples(ctx, x, y, w, h, rotulo, valor, tamMax, fonte) {
    caixa(ctx, x, y, w, h, rotulo);
    const f = fonte || ctx.f.negrito;
    const tam = tamanhoQueCabe(ctx, f, valor, w - 2.6, tamMax, 4.5);
    escrever(ctx, valor, { x: x + 1.3, y: y + h - 1.7, tam: tam, fonte: f, cor: ctx.cor.texto });
  }

  function desenharBorda(ctx, x0, y0) {
    const w = TITULO.w, h = TITULO.h;
    // Moldura externa verde-escura, faixa clara com padrão de losangos e filete interno.
    retangulo(ctx, x0, y0, w, h, { color: ctx.cor.verde });
    retangulo(ctx, x0 + 1.1, y0 + 1.1, w - 2.2, h - 2.2, { color: ctx.cor.faixa });

    const c = 2.35;        // linha central da faixa
    const r = 0.55;        // meia-diagonal do losango
    const passo = 2;
    const pontos = [];
    const nx = Math.round((w - 2 * c) / passo);
    const ny = Math.round((h - 2 * c) / passo);
    for (let i = 0; i <= nx; i++) {
      const x = c + (i * (w - 2 * c)) / nx;
      pontos.push([x, c], [x, h - c]);
    }
    for (let j = 1; j < ny; j++) {
      const y = c + (j * (h - 2 * c)) / ny;
      pontos.push([c, y], [w - c, y]);
    }
    let d = "";
    pontos.forEach(function (p) {
      d += "M" + (p[0] - r).toFixed(3) + " " + p[1].toFixed(3) +
        "L" + p[0].toFixed(3) + " " + (p[1] - r).toFixed(3) +
        "L" + (p[0] + r).toFixed(3) + " " + p[1].toFixed(3) +
        "L" + p[0].toFixed(3) + " " + (p[1] + r).toFixed(3) + "Z";
    });
    ctx.pagina.drawSvgPath(d, { x: px(x0), y: py(y0), scale: MM, color: ctx.cor.verde });

    retangulo(ctx, x0 + 3.6, y0 + 3.6, w - 7.2, h - 7.2, {
      color: ctx.cor.fundo, borderColor: ctx.cor.verde, borderWidth: 0.7,
    });
  }

  function desenharCabecalho(ctx, ix, iy, iw) {
    // Emblema próprio do "Voto Escolar": círculo verde com marca de verificação.
    const cx = ix + 4.9, cy = iy + 4.9;
    ctx.pagina.drawCircle({ x: px(cx), y: py(cy), size: 4.4 * MM, color: ctx.cor.verde });
    ctx.pagina.drawCircle({
      x: px(cx), y: py(cy), size: 3.6 * MM, borderColor: ctx.cor.branco, borderWidth: 0.6,
    });
    const traco = { thickness: 1.5, color: ctx.cor.branco, lineCap: root.PDFLib.LineCapStyle.Round };
    ctx.pagina.drawLine(Object.assign({ start: { x: px(cx - 1.9), y: py(cy + 0.1) }, end: { x: px(cx - 0.6), y: py(cy + 1.5) } }, traco));
    ctx.pagina.drawLine(Object.assign({ start: { x: px(cx - 0.6), y: py(cy + 1.5) }, end: { x: px(cx + 2), y: py(cy - 1.7) } }, traco));

    const tx = ix + 11, tw = iw - 11;
    const titulo = "TÍTULO ELEITORAL ESCOLAR";
    const tam = tamanhoQueCabe(ctx, ctx.f.negrito, titulo, tw, 11, 7);
    escrever(ctx, titulo, { x: tx, y: iy + 4.6, tam: tam, fonte: ctx.f.negrito, cor: ctx.cor.verde, centroLargura: tw });
    const sub = "VOTO ESCOLAR · ELEIÇÃO FICTÍCIA · SEM VALOR OFICIAL";
    const tsub = tamanhoQueCabe(ctx, ctx.f.negrito, sub, tw, 4.8, 3.5);
    escrever(ctx, sub, { x: tx, y: iy + 8.3, tam: tsub, fonte: ctx.f.negrito, cor: ctx.cor.rotulo, centroLargura: tw });

    retangulo(ctx, ix, iy + 9.3, iw, 0.35, { color: ctx.cor.verdeMedio });
  }

  function desenharQR(ctx, x, y, w, h, matriz, publicId) {
    retangulo(ctx, x, y, w, h, { color: ctx.cor.branco, borderColor: ctx.cor.verdeMedio, borderWidth: 0.6 });
    const lado = 20.4;
    const qx = x + (w - lado) / 2, qy = y + 0.7;
    const quiet = 2;
    const n = matriz.length;
    const modulo = lado / (n + 2 * quiet);
    let d = "";
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (matriz[r][c]) {
          const ini = c;
          while (c < n && matriz[r][c]) c++;
          d += "M" + (ini + quiet) + " " + (r + quiet) + "h" + (c - ini) + "v1h-" + (c - ini) + "z";
        } else {
          c++;
        }
      }
    }
    ctx.pagina.drawSvgPath(d, { x: px(qx), y: py(qy), scale: modulo * MM, color: ctx.cor.texto });
    escrever(ctx, "ID " + String(publicId).slice(0, 8).toUpperCase(), {
      x: x, y: y + h - 1.1, tam: 4.6, fonte: ctx.f.mono, cor: ctx.cor.rotulo, centroLargura: w,
    });
  }

  function desenharTitulo(ctx, e, url, x0, y0) {
    desenharBorda(ctx, x0, y0);

    const X = x0 + 3.6, iy = y0 + 3.6;
    const W = TITULO.w - 7.2;

    desenharCabecalho(ctx, X, iy + 0.6, W);

    // Nome do eleitor (destaque)
    const yNome = iy + 10.5, hNome = 10.8;
    caixa(ctx, X, yNome, W, hNome, "Nome do eleitor");
    const nome = nomeEmLinhas(ctx, ctx.limpar(e.nome_completo), W - 2.6);
    if (nome.linhas.length === 1) {
      escrever(ctx, nome.linhas[0], { x: X + 1.3, y: yNome + hNome - 2.4, tam: nome.tam, fonte: ctx.f.negrito, cor: ctx.cor.texto });
    } else {
      const lh = nome.tam * 1.12 / MM;
      escrever(ctx, nome.linhas[0], { x: X + 1.3, y: yNome + hNome - 1.7 - lh, tam: nome.tam, fonte: ctx.f.negrito, cor: ctx.cor.texto });
      escrever(ctx, nome.linhas[1], { x: X + 1.3, y: yNome + hNome - 1.7, tam: nome.tam, fonte: ctx.f.negrito, cor: ctx.cor.texto });
    }

    // Coluna esquerda: nascimento/emissão, inscrição, zona/seção
    const yR1 = yNome + hNome + 1;      // 1ª linha
    const hL = 7.4;
    const wEsq = 59, meia = (wEsq - 1) / 2;
    campoSimples(ctx, X, yR1, meia, hL, "Data de nascimento", formatarData(e.data_nascimento), 8.5);
    campoSimples(ctx, X + meia + 1, yR1, meia, hL, "Data de emissão", formatarData(e.data_emissao), 8.5);
    campoSimples(ctx, X, yR1 + hL + 1, wEsq, hL, "Nº de inscrição", String(e.numero_inscricao), 10);
    campoSimples(ctx, X, yR1 + 2 * (hL + 1), meia, hL, "Zona", String(e.zona), 9);
    campoSimples(ctx, X + meia + 1, yR1 + 2 * (hL + 1), meia, hL, "Seção", String(e.secao), 9);

    // Coluna direita: QR Code individual
    desenharQR(ctx, X + wEsq + 1, yR1, W - wEsq - 1, 3 * hL + 2, matrizQR(url), e.public_id);

    // Rodapé: município/UF e presidente da seção
    const yF = yR1 + 3 * (hL + 1);
    const metade = (W - 1) / 2;
    campoSimples(ctx, X, yF, metade, hL, "Município / UF", String(e.municipio), 7.5);
    campoSimples(ctx, X + metade + 1, yF, metade, hL, "Presidente da seção", String(e.presidente_secao), 7.5);
  }

  // ---- PDF em lote ----
  async function gerarPDF(eleitores, opcoes) {
    const P = root.PDFLib;
    if (!P) throw new Error("Biblioteca de PDF (pdf-lib) não carregada.");
    if (!Array.isArray(eleitores)) throw new Error("Lista de eleitores inválida.");
    if (!opcoes || typeof opcoes.urlDoTitulo !== "function") {
      throw new Error("Informe opcoes.urlDoTitulo.");
    }
    validar(eleitores);

    const pdf = await P.PDFDocument.create();
    pdf.setTitle("Títulos Eleitorais Escolares - Voto Escolar (eleição fictícia)");
    pdf.setCreator("Voto Escolar");
    pdf.setProducer("Voto Escolar");

    const fontes = {
      normal: await pdf.embedFont(P.StandardFonts.Helvetica),
      negrito: await pdf.embedFont(P.StandardFonts.HelveticaBold),
      mono: await pdf.embedFont(P.StandardFonts.Courier),
    };

    const totalPaginas = Math.max(1, Math.ceil(eleitores.length / POR_PAGINA));
    const aviso = "Voto Escolar · eleição escolar fictícia, sem valor oficial";

    let pagina = null, ctx = null;
    eleitores.forEach(function (e, i) {
      const pos = i % POR_PAGINA;
      if (pos === 0) {
        pagina = pdf.addPage([PAGINA.w * MM, PAGINA.h * MM]);
        ctx = criarContexto(pdf, pagina, fontes);
      }
      const col = pos % COLUNAS, lin = Math.floor(pos / COLUNAS);
      const x0 = MARGEM.x + col * (TITULO.w + ESPACO.x);
      const y0 = MARGEM.y + lin * (TITULO.h + ESPACO.y);
      // A URL do QR sai do public_id do MESMO registro que fornece o texto do título.
      desenharTitulo(ctx, e, opcoes.urlDoTitulo(e.public_id), x0, y0);
    });

    pdf.getPages().forEach(function (p, i) {
      const c = criarContexto(pdf, p, fontes);
      escrever(c, aviso + " · Página " + (i + 1) + " de " + totalPaginas, {
        x: 0, y: PAGINA.h - 6, tam: 6, fonte: fontes.normal, cor: c.cor.cinza, centroLargura: PAGINA.w,
      });
    });

    return pdf.save();
  }

  root.PDFTitulos = {
    gerarPDF: gerarPDF,
    POR_PAGINA: POR_PAGINA,
    geometria: { PAGINA: PAGINA, TITULO: TITULO, ESPACO: ESPACO, MARGEM: MARGEM, COLUNAS: COLUNAS, LINHAS: LINHAS },
  };
})(typeof window !== "undefined" ? window : globalThis);
