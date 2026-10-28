/* Leitura de comprovantes sem IA: extrai os campos do texto (PDF ou OCR) com regras para bancos brasileiros. */
(function (root) {
  const MESES = { jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12 };

  function iso(d, m, y) {
    y = Number(y); if (y < 100) y += 2000;
    d = Number(d); m = Number(m);
    if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2000 && y <= 2100)) return '';
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function datesIn(s) {
    const out = [];
    const re1 = /(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{4}|\d{2})(?!\d)/g;
    let m; while ((m = re1.exec(s))) { const v = iso(m[1], m[2], m[3]); if (v) out.push({ v, i: m.index }); }
    const re2 = /(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s*(?:de\s+)?(\d{4})/gi;
    while ((m = re2.exec(s))) { const v = iso(m[1], MESES[m[2].toLowerCase()], m[3]); if (v) out.push({ v, i: m.index }); }
    return out.sort((a, b) => a.i - b.i);
  }
  function money(s) {
    const n = parseFloat(String(s).replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
    return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  const MONEY_RE = /R\s?\$\s*(\d{1,3}(?:[.\s]?\d{3})*,\d{2})|(?<![\d,.])(\d{1,3}(?:\.\d{3})*,\d{2})(?![\d])/g;
  function amountsIn(s) {
    const out = []; let m; MONEY_RE.lastIndex = 0;
    while ((m = MONEY_RE.exec(s))) out.push({ v: money(m[1] || m[2]), rs: !!m[1], i: m.index });
    return out;
  }
  const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/^[\s:\-–|]+|[\s:\-–|]+$/g, '').trim();
  const LABEL_RE = /^(nome|para|destino|favorecido|recebedor|benefici[aá]rio|quem recebeu|cpf|cnpj|institui[cç][aã]o|banco|ag[eê]ncia|conta|chave|tipo|valor|data|de|origem|pagador|id)\b/i;
  const LABEL = { test: n => LABEL_RE.test(n) && n.length <= 26 && !/\d/.test(n) && n.split(/\s+/).length <= 3 &&
    !/\b(s\.?a\.?|ltda|eireli)\b/i.test(n) && (n !== n.toUpperCase() || n.split(/\s+/).length === 1) };

  function valueAfter(lines, i, labelRe) {
    const m = lines[i].match(labelRe);
    const same = lines[i].slice(m ? m[0].length : 0);
    // só vale como rótulo se a linha é só o rótulo ou tem ":" logo depois dele
    if (clean(same) && !/[:\-–]\s*$/.test(m ? m[0] : '') && !/^\s*[:\-–]/.test(same) && !LABEL.test(lines[i])) return '';
    const v = clean(same);
    if (v && !LABEL.test(v)) return v;
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
      const n = clean(lines[j]);
      if (n && !LABEL.test(n)) return n;
      if (n) break;
    }
    return '';
  }
  function findIn(lines, labelRe) {
    for (let i = 0; i < lines.length; i++) if (labelRe.test(lines[i])) { const v = valueAfter(lines, i, labelRe); if (v) return v; }
    return '';
  }

  function parse(text) {
    const raw = String(text || '');
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const flat = lines.join('\n');

    // bloco do favorecido (destino) e bloco do pagador (origem)
    const DEST = /^(dados\s+do\s+)?(destino|destinat[aá]rio|para|favorecido|recebedor|benefici[aá]rio|quem recebeu|dados do recebedor|dados do favorecido|cedente)\b/i;
    const ORIG = /^(dados\s+do\s+)?(origem|pagador|quem pagou|de\b|dados do pagador|remetente|sacado)/i;
    let dStart = lines.findIndex(l => DEST.test(l));
    let dLines = [];
    if (dStart >= 0) {
      for (let j = dStart; j < Math.min(lines.length, dStart + 18); j++) {
        if (j > dStart && ORIG.test(lines[j])) break;
        dLines.push(lines[j]);
      }
    }
    const scope = dLines.length ? dLines : lines;

    // favorecido
    let fav = findIn(scope, /^(nome( do (favorecido|recebedor|benefici[aá]rio))?|favorecido|recebedor|benefici[aá]rio|raz[aã]o social|cedente)\s*[:\-]?\s*/i);
    if (!fav && dLines.length) {
      const v = valueAfter(dLines, 0, DEST);
      if (v && /[a-zA-ZÀ-ú]{3}/.test(v) && !/\d{3}/.test(v)) fav = v;
    }
    fav = fav.replace(/\b(cpf|cnpj)\b.*$/i, '').trim();

    const doc = (scope.join(' ').match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|[\d*•]{3}\.[\d*•]{3}\.[\d*•]{3}-[\d*•]{2})/) || [])[1] || '';
    let banco = findIn(scope, /^(institui[cç][aã]o( financeira)?|banco)\s*[:\-]?\s*/i);
    const ag = (scope.join(' ').match(/ag[eê]ncia\s*[:\-]?\s*(\d{3,5}(?:-\d)?)/i) || [])[1] || '';
    const cc = (scope.join(' ').match(/conta(?:\s*(?:corrente|pagamento|poupan[cç]a))?\s*[:\-]?\s*([\d.]{3,}-?[\dxX]?)/i) || [])[1] || '';
    const pix = findIn(scope, /^chave(\s*pix)?\s*[:\-]?\s*/i);

    // valor: linha com "valor"; senão o maior com R$; senão o maior
    let valor = 0;
    for (let i = 0; i < lines.length && !valor; i++) {
      if (/(valor|total)\s*(pago|cobrado|da transfer[eê]ncia|do pagamento|do pix|transferido|total)|total pago|voc[eê] (transferiu|pagou|enviou)/i.test(lines[i])) {
        const a = amountsIn(lines[i]).concat(i + 1 < lines.length ? amountsIn(lines[i + 1]) : []);
        if (a.length) valor = a[0].v;
      }
    }
    for (let i = 0; i < lines.length && !valor; i++) {
      if (/valor|total|pago|quantia/i.test(lines[i]) && !/desconto|juros|multa|tarifa/i.test(lines[i])) {
        const a = amountsIn(lines[i]).concat(i + 1 < lines.length ? amountsIn(lines[i + 1]) : []);
        if (a.length) valor = a[0].v;
      }
    }
    if (!valor) { const a = amountsIn(flat); const rs = a.filter(x => x.rs); valor = Math.max(0, ...(rs.length ? rs : a).map(x => x.v)); }

    // datas
    let data = '', venc = '';
    for (let i = 0; i < lines.length; i++) {
      const ds = datesIn(lines[i] + ' ' + (lines[i + 1] || ''));
      if (!ds.length) continue;
      if (!venc && /vencimento/i.test(lines[i])) venc = ds[0].v;
      else if (!data && /(pagamento|pago|realizad|efetuad|transfer|data|em\b|hor[aá]rio|debitad|transa[cç])/i.test(lines[i])) data = ds[0].v;
    }
    if (!data) { const ds = datesIn(flat).filter(d => d.v !== venc); if (ds.length) data = ds[0].v; }

    let tipo = 'Transferência';
    if (/boleto|c[oó]digo de barras|linha digit[aá]vel/i.test(flat)) tipo = 'Boleto';
    else if (/\bpix\b/i.test(flat)) tipo = 'Pix';
    else if (/\bted\b/i.test(flat)) tipo = 'TED';
    else if (/\bdoc\b/i.test(flat)) tipo = 'DOC';
    else if (/cart[aã]o/i.test(flat)) tipo = 'Cartão';

    const idm = flat.match(/\b(E\d{8}[0-9A-Za-z]{20,24})\b/) ||
      flat.match(/(?:id(?:entificador)?(?: da transa[cç][aã]o)?|autentica[cç][aã]o|c[oó]digo da transa[cç][aã]o|protocolo)\s*[:\-]?\s*\n?\s*([A-Za-z0-9.\-]{10,})/i);

    if (banco && /^\d+$/.test(banco)) banco = '';
    return {
      favorecido: fav.slice(0, 120), documento: doc, banco: clean(banco).slice(0, 80), agencia: ag, conta: cc.replace(/\.$/, ''),
      chavePix: clean(pix).slice(0, 120), data, vencimento: venc, valor, tipo, pagador: '',
      idTransacao: idm ? idm[1] : '', confianca: 'baixa'
    };
  }

  const api = { parse, datesIn, amountsIn, money };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ComprovanteParser = api;
})(this);
