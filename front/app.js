const LINHAS_GOLS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
const LINHAS_HT = [0.5, 1.5, 2.5, 3.5];
const LINHAS_ESC = [7.5, 8.5, 9.5, 10.5, 11.5, 12.5];

const REC_GOLS = [[1.5, 'over'], [3.5, 'under'], [4.5, 'under']];
const REC_HT = [[0.5, 'over'], [2.5, 'under']];
const REC_ESC = [[7.5, 'over'], [11.5, 'under'], [12.5, 'under']];

let data = null;
let dataFiltro = null;
let statsLiga = null;
let statsTemp = null;
const picks = [];
const pickSeq = {};
let apostas = carregarApostas();

function carregarApostas() {
  try { return JSON.parse(localStorage.getItem('apostas') || '[]'); }
  catch (e) { return []; }
}
function salvarApostas() {
  localStorage.setItem('apostas', JSON.stringify(apostas));
}

function pct(x) { return (100 * x).toFixed(1) + '%'; }
function clsP(x) { return x >= 0.75 ? 'ok' : x >= 0.6 ? 'med' : 'bad'; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ICO_PATHS = {
  clock: '<path d="M12 6v6l4 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7" fill="none"/>',
  ball: '<path d="M12 21c4.97 0 9-4.03 9-9S16.97 3 12 3 3 7.03 3 12s4.03 9 9 9z" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M3.6 9h16.8M3.6 15h16.8M12 3.5v17" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="8" cy="6.6" r=".9" fill="currentColor"/><circle cx="16.2" cy="17.4" r=".9" fill="currentColor"/>',
  corner: '<path d="M5 21V5a3 3 0 0 1 3-3h11" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M16 2l5 5M21 2l-5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/>',
  check: '<path d="m5 12 4.5 4.5L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  cross: '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>',
  target: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7" fill="none"/><circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="1.7" fill="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>',
  flash: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor"/>',
};
function ico(name, size) {
  const s = size || 12;
  return `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" style="flex:none">${ICO_PATHS[name] || ICO_PATHS.flash}</svg>`;
}
function corLiga(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function rotuloData(iso) {
  const d = new Date(iso);
  const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return dias[d.getUTCDay()] + ', ' + String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

const DIA_ABV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MES_ABV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function renderFiltro() {
  const el = document.getElementById('filtro');
  const dias = [...new Set(data.jogos.map(g => g.data.slice(0, 10)))].sort();
  const cnt = d => data.jogos.filter(g => g.data.slice(0, 10) === d).length;
  const diaTile = (key, iso, n) => {
    const d = new Date(iso);
    const dow = DIA_ABV[d.getUTCDay()];
    const day = String(d.getUTCDate());
    const mon = MES_ABV[d.getUTCMonth()];
    return `<button class="${dataFiltro === key ? 'act' : ''} dt" onclick="setFiltro('${key}')">
      <span class="dow">${dow}</span><b class="day">${day}</b>
      <span class="mon">${mon}</span><span class="cnt">${n}</span></button>`;
  };
  el.innerHTML = `<button class="${dataFiltro ? '' : 'act'}" onclick="setFiltro('')">Todos
      <span class="cnt">(${data.jogos.length})</span></button>` +
    dias.map(d => diaTile(d, d, cnt(d))).join('');
}

function setFiltro(key) {
  dataFiltro = key || null;
  renderFiltro();
  renderJogos();
}

function aba(nome) {
  document.getElementById('sec-prev').hidden = nome !== 'prev';
  document.getElementById('sec-vivo').hidden = nome !== 'vivo';
  document.getElementById('sec-apostas').hidden = nome !== 'apostas';
  const tp = document.getElementById('tab-prev');
  if (tp) tp.classList.toggle('act', nome === 'prev');
  const tv = document.getElementById('tab-vivo');
  if (tv) tv.classList.toggle('act', nome === 'vivo');
  const ta = document.getElementById('tab-apostas');
  if (ta) ta.classList.toggle('act', nome === 'apostas');
}

function setMenuAtivo(id) {
  document.querySelectorAll('.menu-item').forEach(b => b.classList.toggle('act', b.dataset.sec === id));
}

function irPara(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const vivo = document.getElementById('sec-vivo');
  const apostas = document.getElementById('sec-apostas');
  if (id === 'sec-vivo' && vivo.hidden) aba('vivo');
  else if (id === 'sec-apostas' && apostas.hidden) aba('apostas');
  else if (id !== 'sec-vivo' && id !== 'sec-apostas' && (!vivo.hidden || !apostas.hidden)) aba('prev');
  setMenuAtivo(id);
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
}

function initSpy() {
  if (!('IntersectionObserver' in window)) return;
  const secs = ['sec-taxas', 'sec-combo', 'sec-auto', 'sec-jogos', 'sec-vivo', 'sec-apostas']
    .map(id => document.getElementById(id)).filter(Boolean);
  const obs = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) setMenuAtivo(e.target.id);
  }, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });
  secs.forEach(s => obs.observe(s));
}

function nomeVivo(k) {
  const p = k.split('_');
  if (p[0] === 'x12') return 'Resultado: ' + ['Casa', 'Empate', 'Fora'][Number(p[1])];
  if (p[0] === 'dc') return 'Dupla ' + p[1].toUpperCase();
  const mkt = p[0] === 'gols' ? 'Gols' : p[0] === 'ht' ? '1º tempo' : 'Escanteios';
  return mkt + ': ' + (p[1] === 'over' ? 'mais de ' : 'menos de ') + p[2];
}

function renderAoVivo() {
  const av = data.ao_vivo;
  const vn = document.getElementById('vivo-n');
  if (vn) vn.textContent = av && av.n ? String(av.n) : '';
  const mv = document.getElementById('menu-vivo');
  if (mv) mv.textContent = av && av.n ? String(av.n) : '';
  const el = document.getElementById('vivo');
  if (!av || !av.n) {
    document.getElementById('vivo-stats').innerHTML = '';
    document.getElementById('vivo-meta').textContent = '';
    el.innerHTML = '<div class="vazio">Nenhum jogo previsto foi finalizado ainda. Rode o pipeline periodicamente ' +
      '(ex.: uma vez ao dia) para coletar os resultados dos jogos já previstos.</div>';
    return;
  }
  document.getElementById('vivo-meta').textContent = '· ' + av.n + ' jogos · ' + av.picks_n +
    ' palpites (P≥' + pct(av.thr) + ') · acerto ' + pct(av.taxa);
  const cards = Object.keys(av.por_mercado).sort().map(k => {
    const m = av.por_mercado[k];
    return `<div class="stat ${clsP(m.taxa)}"><div class="l">${esc(nomeVivo(k))}</div>
      <div class="v">${pct(m.taxa)}</div><div class="n">${m.hit}/${m.n} palpites</div></div>`;
  });
  document.getElementById('vivo-stats').innerHTML = cards.join('');
  const rows = g => {
    const pks = g.picks.map(pk =>
      `<span class="pick-badge ${pk.ok ? 'ok' : 'bad'}"><span class="ic">${ico(pk.ok ? 'check' : 'cross', 9)}</span> ${esc(pk.nome)} <span class="p">${pct(pk.p)}</span></span>`).join('');
    return `<div class="vjogo"><div class="linha1"><span>${esc(g.casa)} x ${esc(g.fora)}</span>
      <span class="resultado">${g.hg} – ${g.ag}</span><span class="pl">${ico('clock', 11)}${esc(g.hora_br)}</span>
      ${g.lam_esc ? `<span class="pl">${ico('ball', 11)}${g.lam} · ${ico('corner', 11)}${g.lam_esc}</span>` : ''}
      </div><div class="picks">${pks}</div></div>`;
  };
  el.innerHTML = '<div class="vligas">' + av.por_liga.map(lg => {
    const jgs = av.jogos.filter(j => j.liga === lg.liga);
    return `<details class="vliga" open><summary><b>${esc(lg.liga)}</b>
      <span class="resumo">${lg.games} jogos · ${lg.picks_n} palpites · acerto ${pct(lg.taxa)}</span></summary>
      <div class="vjogos">${jgs.map(rows).join('')}</div></details>`;
  }).join('') + '</div>';
}

function taxaPick(tipo, linha, p) {
  const v = data.validacao[tipo];
  if (!v) return p;
  if (tipo === 'x12' || tipo === 'dc') {
    const tbl = tipo === 'dc' ? (v[linha] || {}) : v;
    const thrs = Object.keys(tbl).map(Number).sort((a, b) => b - a);
    for (const t of thrs) if (p >= t) return tbl[t].taxa;
    return p;
  }
  const e = v[String(linha)];
  return e ? e.taxa : p;
}

function liIdx(tipo, li) {
  if (tipo === 'x12') return li;
  const s = tipo.split('_');
  const lines = s[0] === 'esc' ? LINHAS_ESC : s[0] === 'ht' ? LINHAS_HT : LINHAS_GOLS;
  return lines.indexOf(li);
}

function pv(jogoIdx, tipo, li) {
  const pr = data.jogos[jogoIdx].prob;
  if (tipo === 'x12') return [pr.x1, pr.x, pr.x2][li];
  const idx = liIdx(tipo, li);
  if (tipo === 'gols_over') return pr.gols_over[idx];
  if (tipo === 'gols_under') return pr.gols_under[idx];
  if (tipo === 'ht_over') return pr.ht_over[idx];
  if (tipo === 'ht_under') return pr.ht_under[idx];
  if (tipo === 'esc_over') return pr.esc_over[idx];
  return pr.esc_under[idx];
}

function pickId(j, tipo, li) { return j + '|' + tipo + '|' + li; }

function addPick(jogoIdx, tipo, li, p, label) {
  const jogo = data.jogos[jogoIdx];
  const id = pickId(jogoIdx, tipo, li);
  if (pickSeq[id]) return;
  const taxa = taxaPick(tipo, li, p);
  picks.push({ id, jogoIdx, tipo, linha: li, p, taxa, label: label + ' — ' + esc(jogo.casa) + ' x ' + esc(jogo.fora) });
  pickSeq[id] = true;
  renderCombo();
  renderJogos();
}

function removePick(id) {
  const i = picks.findIndex(x => x.id === id);
  if (i >= 0) { picks.splice(i, 1); delete pickSeq[id]; }
  renderCombo();
  renderJogos();
}

function nomeMercado(tipo, li) {
  if (tipo === 'x12') return ['Casa', 'Empate', 'Fora'][li];
  if (tipo === 'dc') return 'Dupla chance ' + String(li).toUpperCase();
  const s = tipo.split('_');
  const lado = s[1] === 'over' ? 'mais de' : 'menos de';
  const mkt = s[0] === 'esc' ? 'escanteios' : s[0] === 'ht' ? 'gols no primeiro tempo' : 'gols';
  return lado + ' ' + li + ' ' + mkt;
}

function curto(tipo, li) {
  if (tipo === 'x12') return ['Casa', 'Empate', 'Fora'][li];
  if (tipo === 'dc') return String(li).toUpperCase();
  const s = tipo.split('_');
  return (s[1] === 'over' ? 'Mais de ' : 'Menos de ') + li;
}

function button(j, tipo, li, p, label, top) {
  const sel = pickSeq[pickId(j, tipo, li)];
  return `<button class="pick ${sel ? 'sel' : ''} ${top ? 'top' : ''}"
    onclick="addPick(${j},'${tipo}',${li},${p.toFixed(6)},'${nomeMercado(tipo, li)}')">
    <span class="mk">${sel ? '<span class="chk">' + ico('check', 9) + '</span>' : ''}${label}${top ? ' <span class="star">✦</span>' : ''}</span><small>${pct(p)}</small></button>`;
}

function renderStatsSel() {
  const v = data.validacao;
  const ligas = v.por_liga ? Object.keys(v.por_liga).sort() : [];
  const temps = v.por_temporada ? Object.keys(v.por_temporada).sort() : [];
  const linha = (lbl, itens, sel, cb) => {
    const b = (k, label) => {
      const at = sel === null ? k === '' : sel === k;
      return `<button class="${at ? 'act' : ''}" onclick="${cb}('${k}')">${esc(label)}</button>`;
    };
    const op = itens.map(([k, label, n]) => b(k, label + (n ? ` <span class="cnt">(${n})</span>` : ''))).join('');
    return `<div class="stat-linha"><span class="slbl">${lbl}</span>${op}</div>`;
  };
  const nl = k => (v.por_liga[k] ? v.por_liga[k].n : 0);
  const nt = k => (v.por_temporada[k] ? v.por_temporada[k].n : 0);
  document.getElementById('filtro-stat').innerHTML =
    linha('Campeonato', [['', 'Todas']].concat(ligas.map(l => [l, l, nl(l)])), statsLiga, 'setStatLiga') +
    linha('Temporada', [['', 'Todas']].concat(temps.map(t => [t, rotuloTemp(t), nt(t)])), statsTemp, 'setStatTemp');
}

function setStatLiga(k) { statsLiga = k === '' ? null : k; renderStatsSel(); renderStats(); renderJogos(); }
function setStatTemp(k) { statsTemp = k === '' ? null : k; renderStatsSel(); renderStats(); }

function rotuloTemp(s) {
  if (/^20\d{2}$/.test(s)) return s;
  if (/^\d{4}$/.test(s)) return s.slice(0, 2) + '/' + s.slice(2);
  return s;
}

function renderStats() {
  const v = data.validacao;
  let vv = v, nome = null;
  if (statsLiga && statsTemp) {
    const s = v.por_liga[statsLiga] && v.por_liga[statsLiga].por_temporada[statsTemp];
    if (s) { vv = s.validacao; nome = statsLiga + ' · ' + rotuloTemp(statsTemp); }
  } else if (statsLiga) {
    const s = v.por_liga[statsLiga];
    if (s) { vv = s.validacao; nome = statsLiga; }
  } else if (statsTemp) {
    const s = v.por_temporada[statsTemp];
    if (s) { vv = s.validacao; nome = rotuloTemp(statsTemp); }
  }
  document.getElementById('meta1').textContent = '· validação fora de amostra' + (nome ? ' — ' + nome : '');
  const cards = [
    ['Resultado (probabilidade ≥ 75%)', vv.x12['0.75'], ''],
    ['Dupla chance 1X (≥ 75%)', vv.dc && vv.dc['1x'] && vv.dc['1x']['0.75'], ''],
    ['Dupla chance X2 (≥ 75%)', vv.dc && vv.dc['x2'] && vv.dc['x2']['0.75'], ''],
    ['Gols: mais de 1.5', vv.gols_over['1.5'], ''],
    ['Gols: menos de 5.5', vv.gols_under['5.5'], ''],
    ['Primeiro tempo: mais de 0.5', vv.ht_over['0.5'], ''],
    ['Primeiro tempo: menos de 2.5', vv.ht_under['2.5'], ''],
    ['Escanteios: mais de 7.5', vv.esc_over['7.5'], ''],
    ['Escanteios: menos de 12.5', vv.esc_under['12.5'], ''],
  ];
  document.getElementById('stats').innerHTML = cards.map(([l, e, extra]) => {
    if (!e) return `<div class="stat"><div class="l">${l}</div><div class="v">—</div></div>`;
    const warn = (e.n < 30) ? '<span class="warn">· amostra pequena</span>' : '';
    return `<div class="stat ${clsP(e.taxa)} ${extra}">
      <div class="l">${l}</div><div class="v">${pct(e.taxa)}</div><div class="n">amostra: ${e.n}${warn}</div></div>`;
  }).join('');
}

function mktRow(j, nome, buts) {
  const ic = nome === 'Resultado' ? 'target' : nome === 'Gols' ? 'ball' : nome === 'Primeiro tempo' ? 'clock' : nome === 'Escanteios' ? 'corner' : null;
  const label = `<span class="mkt-name">${ic ? ico(ic, 11) : ''}${nome}</span>`;
  if (!buts) return `<div class="mkt-row">${label}<span class="sem">sem dados</span></div>`;
  return `<div class="mkt-row">${label}${buts}</div>`;
}

function renderJogos() {
  const el = document.getElementById('jogos');
  const liga = statsLiga || null;
  const idxs = data.jogos
    .map((g, i) => i)
    .filter(i => {
      const g = data.jogos[i];
      if (dataFiltro && g.data.slice(0, 10) !== dataFiltro) return false;
      if (liga && g.liga !== liga) return false;
      return true;
    });
  el.innerHTML = idxs.map(j => {
    const g = data.jogos[j];
    const pr = g.prob;
    const rec = (lines, mkts) => lines
      .map(([li, side]) => {
        const tipo = mkts + '_' + side;
        const p = pv(j, tipo, li);
        return { li, tipo, p };
      });

    const x12 = [0, 1, 2].map(li => {
      const p = pv(j, 'x12', li);
      return button(j, 'x12', li, p, ['Casa', 'Empate', 'Fora'][li], false);
    }).join('');

    const px = [pv(j, 'x12', 0), pv(j, 'x12', 1), pv(j, 'x12', 2)];
    const dc = [['1x', px[0] + px[1]], ['x2', px[1] + px[2]], ['12', px[0] + px[2]]]
      .map(([li, p]) => button(j, 'dc', li, p, String(li).toUpperCase(), false)).join('');

    const gols = rec(REC_GOLS, 'gols');
    const gTop = Math.max(...gols.map(g => g.p));
    const golsB = gols.map(g => button(j, g.tipo, g.li, g.p, curto(g.tipo, g.li), g.p === gTop)).join('');

    const htDisp = (pr.ht_over || []).length;
    const ht = htDisp ? rec(REC_HT, 'ht') : null;
    let htB = null;
    if (ht) {
      const tTop = Math.max(...ht.map(g => g.p));
      htB = ht.map(g => button(j, g.tipo, g.li, g.p, curto(g.tipo, g.li), g.p === tTop)).join('');
    }

    const escDisp = (pr.esc_over || []).length;
    const escRec = escDisp ? rec(REC_ESC, 'esc') : null;
    let escB = null;
    if (escRec) {
      const eTop = Math.max(...escRec.map(g => g.p));
      escB = escRec.map(g => button(j, g.tipo, g.li, g.p, curto(g.tipo, g.li), g.p === eTop)).join('');
    }

    const full = `<details><summary>Ver todas as linhas (${pr.gols_over.length + (pr.ht_over ? pr.ht_over.length : 0) + escDisp} mercados)</summary>
      <div class="full">
        ${LINHAS_GOLS.map((l, li) => `<div><div class="lbl">Gols ${l}</div>
          ${button(j, 'gols_over', l, pv(j, 'gols_over', l), 'Mais de ' + l, false)}
          ${button(j, 'gols_under', l, pv(j, 'gols_under', l), 'Menos de ' + l, false)}</div>`).join('')}
        ${htDisp ? LINHAS_HT.map((l, li) => `<div><div class="lbl">Primeiro tempo ${l}</div>
          ${button(j, 'ht_over', l, pv(j, 'ht_over', l), 'Mais de ' + l, false)}
          ${button(j, 'ht_under', l, pv(j, 'ht_under', l), 'Menos de ' + l, false)}</div>`).join('') : ''}
        ${escDisp ? LINHAS_ESC.map((l, li) => `<div><div class="lbl">Escanteios ${l}</div>
          ${button(j, 'esc_over', l, pv(j, 'esc_over', l), 'Mais de ' + l, false)}
          ${button(j, 'esc_under', l, pv(j, 'esc_under', l), 'Menos de ' + l, false)}</div>`).join('') : ''}
      </div></details>`;

    const cor = corLiga(g.liga);
    return `<div class="card mc">
      <div class="mc-head">
        <div class="teams"><b>${esc(g.casa)}</b> <span class="vs">×</span> <b>${esc(g.fora)}</b></div>
        <div class="mc-actions">
          <span class="badge ${g.dados === 'completo' ? 'ok' : 'med'}">${g.dados}</span>
        </div>
      </div>
      <div class="mc-meta">
        <span class="chip-liga" style="--lh:${cor}">${ico('shield', 10)}${esc(g.liga)}</span>
        <span>${ico('clock', 12)}${g.hora_br}</span>
        <span>${ico('ball', 12)}<b>${g.lam}</b> gols</span>
        ${g.lam_esc ? `<span>${ico('corner', 12)}<b>${g.lam_esc}</b> escanteios</span>` : ''}
      </div>
      ${mktRow(j, 'Resultado', x12 + dc)}
      ${mktRow(j, 'Gols', golsB)}
      ${mktRow(j, 'Primeiro tempo', htB)}
      ${mktRow(j, 'Escanteios', escB)}
      ${full}
    </div>`;
  }).join('');
  const n = idxs.length;
  let nota = dataFiltro ? 'mostrando ' + n + ' de ' + data.jogos.length + ' jogos' : data.jogos.length + ' jogos';
  if (liga) nota += ' · campeonato: ' + liga;
  document.getElementById('meta2').textContent = '· ' + nota + ' · clique para selecionar (✦ = maior chance do mercado)';
}

function renderCombo() {
  const el = document.getElementById('combo');
  const nEl = document.getElementById('combo-n');
  const mn = document.getElementById('menu-combo');
  if (!picks.length) {
    nEl.textContent = '';
    if (mn) mn.textContent = '';
    el.innerHTML = '<div class="vazio">Clique em um palpite (✦ = melhor P) nos jogos acima para montar a combinação.</div>';
    return;
  }
  nEl.textContent = '· ' + picks.length + (picks.length > 1 ? ' palpites' : ' palpite');
  if (mn) mn.textContent = String(picks.length);
  let pTot = 1, eTot = 1;
  const items = picks.map((p, i) => {
    pTot *= p.p; eTot *= p.taxa;
    return `<div class="combo-item">
      <span class="cix">${i + 1}</span>
      <div class="nome">${p.label}</div>
      <div style="display:flex;align-items:center;gap:6px"><span class="p ${clsP(p.taxa)}">${pct(p.taxa)}</span>
      <button class="x" onclick="removePick('${p.id}')">✕</button></div>
    </div>`;
  }).join('');
  const badge = eTot >= 0.75 ? 'ok' : eTot >= 0.6 ? 'med' : 'bad';
  const rot = eTot >= 0.75 ? '≥75% bom' : eTot >= 0.6 ? 'risco' : 'ruim';
  el.innerHTML = items + `
    <div class="totais">
      <div><span class="lbl">Probabilidade do modelo</span><b class="p ${clsP(pTot)}">${pct(pTot)}</b></div>
      <div><span class="lbl">Expectativa pela validação</span><b class="p ${clsP(eTot)}">${pct(eTot)}</b>
        <span class="badge big ${badge}">${rot}</span></div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn prim" onclick="irPara('sec-apostas')">Apostar nesta combinação</button>
    <button class="btn" onclick="limparPicks()">Limpar combinação</button></div>`;
}

function limparPicks() {
  picks.length = 0;
  for (const k of Object.keys(pickSeq)) delete pickSeq[k];
  renderCombo();
  renderJogos();
}

function autoCombos() {
  const cands = data.jogos.map((g, i) => {
    const pr = g.prob;
    const list = [];
    const px = [pv(i, 'x12', 0), pv(i, 'x12', 1), pv(i, 'x12', 2)];
    const mx = Math.max(...px);
    list.push({ tipo: 'x12', li: px.indexOf(mx), p: mx, nome: ['Casa', 'Empate', 'Fora'][px.indexOf(mx)] });
    list.push({ tipo: 'dc', li: '1x', p: px[0] + px[1], nome: 'Dupla chance 1X' });
    list.push({ tipo: 'dc', li: '12', p: px[0] + px[2], nome: 'Dupla chance 12' });
    list.push({ tipo: 'dc', li: 'x2', p: px[1] + px[2], nome: 'Dupla chance X2' });
    for (const li of [1, 3, 4, 5]) {
      list.push({ tipo: 'gols_over', li: LINHAS_GOLS[li], p: pv(i, 'gols_over', LINHAS_GOLS[li]) });
      list.push({ tipo: 'gols_under', li: LINHAS_GOLS[li], p: pv(i, 'gols_under', LINHAS_GOLS[li]) });
    }
    if ((pr.ht_over || []).length) {
      for (const li of [0, 2]) {
        list.push({ tipo: 'ht_over', li: LINHAS_HT[li], p: pv(i, 'ht_over', LINHAS_HT[li]) });
        list.push({ tipo: 'ht_under', li: LINHAS_HT[li], p: pv(i, 'ht_under', LINHAS_HT[li]) });
      }
    }
    if ((pr.esc_over || []).length) {
      for (const li of [0, 4, 5]) {
        list.push({ tipo: 'esc_over', li: LINHAS_ESC[li], p: pv(i, 'esc_over', LINHAS_ESC[li]) });
        list.push({ tipo: 'esc_under', li: LINHAS_ESC[li], p: pv(i, 'esc_under', LINHAS_ESC[li]) });
      }
    }
    for (const c of list) {
      if (typeof c.p !== 'number' || isNaN(c.p)) continue;
      c.taxa = taxaPick(c.tipo, c.li, c.p);
      c.nome = nomeMercado(c.tipo, c.li);
    }
    const bons = list.filter(c => c.taxa >= 0.75 && c.p >= 0.85);
    bons.sort((a, b) => b.p - a.p);
    return bons.length ? { i, g, best: bons[0] } : null;
  }).filter(Boolean);

  const combos = [];
  for (let a = 0; a < cands.length; a++) {
    for (let b = a + 1; b < cands.length; b++) {
      const c = { ms: [cands[a], cands[b]], eTot: cands[a].best.taxa * cands[b].best.taxa, pTot: cands[a].best.p * cands[b].best.p };
      if (c.eTot >= 0.75) combos.push(c);
      for (let d = b + 1; d < cands.length; d++) {
        const c3 = { ms: [cands[a], cands[b], cands[d]], eTot: c.eTot * cands[d].best.taxa, pTot: c.pTot * cands[d].best.p };
        if (c3.eTot >= 0.75) combos.push(c3);
      }
    }
  }
  combos.sort((x, y) => y.pTot - x.pTot);
  const uniq = [];
  const seen = new Set();
  for (const c of combos) {
    const key = c.ms.map(m => m.i).sort().join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(c);
    if (uniq.length >= 6) break;
  }
  const el = document.getElementById('auto');
  if (!uniq.length) {
    el.innerHTML = '<div class="vazio">Nenhuma combinação automática com expectativa ≥75% nesta rodada.</div>';
    return;
  }
  el.innerHTML = '<ul class="auto">' + uniq.map((c, k) =>
    `<li><b>Combo ${k + 1}</b> — expectativa ${pct(c.eTot)} · probabilidade do modelo ${pct(c.pTot)}
      <button class="usar" onclick="aplicarAuto(${k})">usar</button>
      <div class="d">${c.ms.map(m => esc(m.g.casa) + ' x ' + esc(m.g.fora) + ' → ' + m.best.nome).join(' · ')}</div></li>`
  ).join('') + '</ul>';
  window._autos = uniq;
}

function aplicarAuto(k) {
  const c = window._autos[k];
  for (const m of c.ms) addPick(m.i, m.best.tipo, m.best.li, m.best.p, m.best.nome);
}

function pickOk(pk, r) {
  const t = pk.tipo, li = pk.linha;
  if (t === 'x12') {
    const k = r.hg > r.ag ? 0 : r.hg < r.ag ? 2 : 1;
    return li === k;
  }
  if (t === 'dc') {
    if (li === '1x') return r.hg >= r.ag;
    if (li === 'x2') return r.hg <= r.ag;
    return r.hg !== r.ag;
  }
  if (t === 'gols_over') return r.hg + r.ag > li;
  if (t === 'gols_under') return r.hg + r.ag < li;
  if (r.hhg == null || r.hag == null || r.hc == null || r.ac == null) {
    if (t.startsWith('esc') || t.startsWith('ht')) return null;
  }
  if (t === 'ht_over') return r.hhg + r.hag > li;
  if (t === 'ht_under') return r.hhg + r.hag < li;
  if (t === 'esc_over') return r.hc + r.ac > li;
  if (t === 'esc_under') return r.hc + r.ac < li;
  return null;
}

function avaliarAposta(a) {
  const res = a.picks.map(pk => {
    const r = data.resultados && data.resultados[pk.id];
    if (!r) return { ...pk, ok: null };
    return { ...pk, ok: pickOk(pk, r) };
  });
  const pendente = res.some(p => p.ok === null);
  const ganhou = !pendente && res.every(p => p.ok === true);
  return { res, pendente, ganhou };
}

function renderApostas() {
  const el = document.getElementById('apostas');
  const nEl = document.getElementById('apostas-n');
  const mn = document.getElementById('menu-apostas');
  if (!el) return;
  nEl.textContent = apostas.length ? '· ' + apostas.length + (apostas.length > 1 ? ' apostas' : ' aposta') : '';
  if (mn) mn.textContent = apostas.length ? String(apostas.length) : '';
  const nova = !picks.length ? '<div class="vazio">Selecione palpites nos jogos (✦ = melhor chance) para montar a combinação e depois apostar.</div>' : `
    <div class="card">
      <h3>Nova aposta</h3>
      <div class="combo-list">${picks.map((p, i) => `
        <div class="combo-item">
          <span class="cix">${i + 1}</span>
          <div class="nome">${p.label}</div>
          <span class="p ${clsP(p.taxa)}">${pct(p.taxa)}</span>
        </div>`).join('')}</div>
      <div class="ap-form">
        <label>Odd da aposta
          <input id="ap-odd" type="number" step="0.01" min="1.01" placeholder="ex.: 2.50">
        </label>
        <label>Valor (R$)
          <input id="ap-valor" type="number" step="0.50" min="0.50" placeholder="ex.: 10">
        </label>
        <button class="btn prim" onclick="registrarAposta()">Apostar</button>
      </div>
    </div>`;
  if (!apostas.length) {
    el.innerHTML = nova + '<div class="vazio">Nenhuma aposta registrada ainda. Suas apostas ficam salvas neste navegador e o resultado é atualizado quando você rodar o pipeline e recarregar.</div>';
    return;
  }
  const retorno = a => a.ganhou ? (a.odd * a.valor).toFixed(2) : null;
  el.innerHTML = nova + '<div class="ap-lista">' + apostas.slice().reverse().map((a, i) => {
    const av = avaliarAposta(a);
    const badge = a.ganhou ? 'ok' : av.pendente ? 'med' : 'bad';
    const rot = a.ganhou ? 'GANHOU' : av.pendente ? 'PENDENTE' : 'PERDEU';
    const r = a.ganhou ? a.odd * a.valor : 0;
    const pks = av.res.map(p =>
      `<span class="pick-badge ${p.ok === true ? 'ok' : p.ok === false ? 'bad' : ''}">
        <span class="ic">${p.ok === null ? '…' : ico(p.ok ? 'check' : 'cross', 9)}</span>
        ${esc(p.nome)} <span class="p">${pct(p.p)}</span></span>`).join('');
    return `<div class="card ap">
      <div class="ap-head">
        <span class="badge ${badge}">${rot}</span>
        <span class="ap-odd">odd ${a.odd.toFixed(2)}</span>
        <span class="ap-valor">R$ ${a.valor.toFixed(2)}</span>
        <span class="ap-ret">retorno <b class="${a.ganhou ? 'ok' : ''}">R$ ${a.ganhou ? r.toFixed(2) : '—'}</b></span>
        <button class="x" onclick="removerAposta('${a.id}')" title="Excluir aposta">✕</button>
      </div>
      <div class="picks">${pks}</div>
    </div>`;
  }).join('') + '</div>';
}

function registrarAposta() {
  if (!picks.length) return;
  const odd = parseFloat(document.getElementById('ap-odd').value);
  const valor = parseFloat(document.getElementById('ap-valor').value);
  if (!(odd > 1)) { alert('Informe a odd da aposta (ex.: 2.50).'); return; }
  if (!(valor > 0)) { alert('Informe o valor apostado (R$).'); return; }
  const a = {
    id: 'ap' + Date.now().toString(36),
    criada: new Date().toISOString(),
    odd, valor,
    picks: picks.map(p => {
      const g = data.jogos[p.jogoIdx];
      return { id: g.id, casa: g.casa, fora: g.fora, tipo: p.tipo, linha: p.linha, p: p.p, nome: p.label };
    }),
  };
  apostas.push(a);
  salvarApostas();
  limparPicks();
  renderCombo();
  renderJogos();
  renderApostas();
}

function removerAposta(id) {
  apostas = apostas.filter(a => a.id !== id);
  salvarApostas();
  renderApostas();
}

fetch('analise.json')
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(d => {
    data = d;
    const q = d.jogos.length;
    const gerado = new Date(d.gerado_em).toLocaleString('pt-BR',
      { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    document.getElementById('sub').classList.remove('erro');
    document.getElementById('sub').textContent =
      'Gerado em ' + gerado + ' · ' + q + ' jogos · peso de chutes no alvo: ' + d.w_sot;
    document.getElementById('meta1').textContent = '· validação fora de amostra';
    renderFiltro();
    renderStatsSel();
    renderStats();
    renderJogos();
    renderCombo();
    autoCombos();
    renderAoVivo();
    renderApostas();
    initSpy();
  })
  .catch(e => {
    const sub = document.getElementById('sub');
    sub.classList.add('erro');
    sub.textContent = 'Erro ao carregar analise.json: ' + e.message + ' (sirva a pasta via HTTP, ex.: python3 -m http.server)';
    document.getElementById('stats').innerHTML = '';
    document.getElementById('jogos').innerHTML = '';
  });
