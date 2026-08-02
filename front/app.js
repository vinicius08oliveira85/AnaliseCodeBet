const LINHAS_GOLS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
const LINHAS_HT = [0.5, 1.5, 2.5, 3.5];
const LINHAS_ESC = [7.5, 8.5, 9.5, 10.5, 11.5, 12.5];

const REC_GOLS = [[1.5, 'over'], [3.5, 'under'], [4.5, 'under']];
const REC_HT = [[0.5, 'over'], [2.5, 'under']];
const REC_ESC = [[7.5, 'over'], [11.5, 'under'], [12.5, 'under']];

let data = null;
let dataFiltro = null;
const picks = [];
const pickSeq = {};
const calP = {};

function pct(x) { return (100 * x).toFixed(1) + '%'; }
function clsP(x) { return x >= 0.75 ? 'ok' : x >= 0.6 ? 'med' : 'bad'; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function rotuloData(iso) {
  const d = new Date(iso);
  const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return dias[d.getUTCDay()] + ', ' + String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

function renderFiltro() {
  const el = document.getElementById('filtro');
  const dias = [...new Set(data.jogos.map(g => g.data.slice(0, 10)))].sort();
  const cnt = d => data.jogos.filter(g => g.data.slice(0, 10) === d).length;
  const btn = (key, label) => `<button class="${dataFiltro === key ? 'act' : ''}" onclick="setFiltro('${key}')">${label}</button>`;
  el.innerHTML = btn('', 'Todos <span class="cnt">(' + data.jogos.length + ')</span>') +
    dias.map(d => btn(d, rotuloData(d) + ' <span class="cnt">(' + cnt(d) + ')</span>')).join('');
}

function setFiltro(key) {
  dataFiltro = key || null;
  renderFiltro();
  renderJogos();
}

function aba(nome) {
  document.getElementById('sec-prev').hidden = nome !== 'prev';
  document.getElementById('sec-vivo').hidden = nome !== 'vivo';
  document.getElementById('tab-prev').classList.toggle('act', nome === 'prev');
  document.getElementById('tab-vivo').classList.toggle('act', nome === 'vivo');
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
  document.getElementById('vivo-n').textContent = av && av.n ? String(av.n) : '';
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
      `<span class="pick-badge ${pk.ok ? 'ok' : 'bad'}">${pk.ok ? '✓' : '✗'} ${esc(pk.nome)} <span class="p">${pct(pk.p)}</span></span>`).join('');
    return `<div class="vjogo"><div class="linha1"><span>${esc(g.casa)} x ${esc(g.fora)}</span>
      <span class="resultado">${g.hg} – ${g.ag}</span><span class="pl">${esc(g.hora_br)}</span>
      ${g.lam_esc ? `<span class="pl">⚽ ${g.lam} · 🟨 ${g.lam_esc}</span>` : ''}
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
  const c = calP[jogoIdx];
  if (tipo === 'x12') return c && c.x12 ? c.x12[li] : [pr.x1, pr.x, pr.x2][li];
  const idx = liIdx(tipo, li);
  if (tipo === 'gols_over') return c && c.g25 && idx === 2 ? c.g25.over : pr.gols_over[idx];
  if (tipo === 'gols_under') return c && c.g25 && idx === 2 ? c.g25.under : pr.gols_under[idx];
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
  return `<button class="pick ${pickSeq[pickId(j, tipo, li)] ? 'sel' : ''} ${top ? 'top' : ''}"
    onclick="addPick(${j},'${tipo}',${li},${p.toFixed(6)},'${nomeMercado(tipo, li)}')">
    <span class="mk">${label}${top ? ' <span class="star">✦</span>' : ''}</span><small>${pct(p)}</small></button>`;
}

function renderStats() {
  const v = data.validacao;
  const cal = data.cal || {};
  const cards = [
    ['Resultado (probabilidade ≥ 75%)', v.x12['0.75'], ''],
    ['Resultado + odds', cal.x12 && cal.x12.taxa ? { taxa: cal.x12.taxa, n: cal.x12.n } : null, 'cal'],
    ['Dupla chance 1X (≥ 75%)', v.dc && v.dc['1x'] && v.dc['1x']['0.75'], ''],
    ['Dupla chance X2 (≥ 75%)', v.dc && v.dc['x2'] && v.dc['x2']['0.75'], ''],
    ['Gols: mais de 1.5', v.gols_over['1.5'], ''],
    ['Gols: menos de 5.5', v.gols_under['5.5'], ''],
    ['Primeiro tempo: mais de 0.5', v.ht_over['0.5'], ''],
    ['Primeiro tempo: menos de 2.5', v.ht_under['2.5'], ''],
    ['Escanteios: mais de 7.5', v.esc_over['7.5'], ''],
    ['Escanteios: menos de 12.5', v.esc_under['12.5'], ''],
  ];
  document.getElementById('stats').innerHTML = cards.map(([l, e, extra]) => {
    if (!e) return `<div class="stat"><div class="l">${l}</div><div class="v">—</div></div>`;
    return `<div class="stat ${clsP(e.taxa)} ${extra}">
      <div class="l">${l}</div><div class="v">${pct(e.taxa)}</div><div class="n">amostra: ${e.n}</div></div>`;
  }).join('');
}

function mktRow(j, nome, buts) {
  if (!buts) return `<div class="mkt-row"><span class="mkt-name">${nome}</span><span class="sem">sem dados</span></div>`;
  return `<div class="mkt-row"><span class="mkt-name">${nome}</span>${buts}</div>`;
}

function renderJogos() {
  const el = document.getElementById('jogos');
  const idxs = data.jogos
    .map((g, i) => i)
    .filter(i => !dataFiltro || data.jogos[i].data.slice(0, 10) === dataFiltro);
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

    return `<div class="card mc">
      <div class="mc-head">${esc(g.casa)} <span class="vs">x</span> ${esc(g.fora)}
        <span class="badge ${g.dados === 'completo' ? 'ok' : 'med'}">${g.dados}</span>
        ${calP[j] ? '<span class="badge ok">com odds</span>' : ''}</div>
      <div class="mc-meta"><span>${esc(g.liga)}</span><span>${g.hora_br}</span>
        <span>⚽ ${g.lam} gols esperados</span>${g.lam_esc ? `<span>🟨 ${g.lam_esc} escanteios esperados</span>` : ''}</div>
      ${mktRow(j, 'Resultado', x12 + dc)}
      ${mktRow(j, 'Gols', golsB)}
      ${mktRow(j, 'Primeiro tempo', htB)}
      ${mktRow(j, 'Escanteios', escB)}
      ${full}
    </div>`;
  }).join('');
  const n = idxs.length;
  document.getElementById('meta2').textContent =
    (dataFiltro ? '· mostrando ' + n + ' de ' + data.jogos.length + ' jogos' : '· ' + data.jogos.length + ' jogos') +
    ' · clique para selecionar (✦ = maior chance do mercado)';
}

function renderCombo() {
  const el = document.getElementById('combo');
  if (!picks.length) {
    el.innerHTML = '<div class="vazio">Clique em um palpite (✦ = melhor P) nos jogos acima para montar a combinação.</div>';
    return;
  }
  let pTot = 1, eTot = 1;
  const items = picks.map(p => {
    pTot *= p.p; eTot *= p.taxa;
    return `<div class="combo-item">
      <div class="nome">${p.label}</div>
      <div style="display:flex;align-items:center;gap:6px"><span class="p ${clsP(p.taxa)}">${pct(p.taxa)}</span>
      <button class="x" onclick="removePick('${p.id}')">✕</button></div>
    </div>`;
  }).join('');
  const badge = eTot >= 0.75 ? 'ok' : eTot >= 0.6 ? 'med' : 'bad';
  el.innerHTML = items + `
    <div class="totais">
      <div>Probabilidade do modelo: <b class="p ${clsP(pTot)}">${pct(pTot)}</b></div>
      <div>Expectativa pela validação: <b class="p ${clsP(eTot)}">${pct(eTot)}</b>
        <span class="badge big ${badge}">${eTot >= 0.75 ? '≥75% bom' : eTot >= 0.6 ? 'risco' : 'ruim'}</span></div>
    </div>
    <div style="margin-top:8px"><button class="btn" onclick="limparPicks()">Limpar combinação</button></div>`;
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

function buildCal(g, o) {
  const c12 = (data.cal && data.cal.x12) || { w: 0 };
  const c25 = (data.cal && data.cal.gols_over && data.cal.gols_over['2.5']) || { w: 0 };
  const cp = {};
  if (o && o.h && o.d && o.a) {
    const inv = [1 / o.h, 1 / o.d, 1 / o.a];
    const s = inv.reduce((a, b) => a + b, 0);
    const pm = inv.map(x => x / s);
    const po = [g.prob.x1, g.prob.x, g.prob.x2];
    cp.x12 = pm.map((a, k) => c12.w * a + (1 - c12.w) * po[k]);
  }
  if (o && o.over && o.under) {
    const po = (1 / o.over) / (1 / o.over + 1 / o.under);
    cp.g25 = {
      over: c25.w * po + (1 - c25.w) * g.prob.gols_over[2],
      under: 1 - (c25.w * po + (1 - c25.w) * g.prob.gols_over[2]),
    };
  }
  return Object.keys(cp).length ? cp : null;
}

function autoCal() {
  data.jogos.forEach((g, i) => { calP[i] = g.odds ? buildCal(g, g.odds) : null; });
}

function aplicarOdds() {
  const l12 = document.getElementById('odds12').value.trim();
  const l25 = document.getElementById('odds25').value.trim();
  const o12 = l12 ? l12.split('\n')
    .map(s => s.split(',').map(x => parseFloat(x.trim())))
    .filter(r => r.length === 3 && r.every(x => x > 1)) : [];
  const o25 = l25 ? l25.split('\n')
    .map(s => s.split(',').map(x => parseFloat(x.trim())))
    .filter(r => r.length === 2 && r.every(x => x > 1)) : [];
  data.jogos.forEach((g, i) => {
    if (o12[i] || o25[i]) {
      const o = {
        h: o12[i] ? o12[i][0] : null, d: o12[i] ? o12[i][1] : null, a: o12[i] ? o12[i][2] : null,
        over: o25[i] ? o25[i][0] : null, under: o25[i] ? o25[i][1] : null,
      };
      const cp = buildCal(g, o);
      calP[i] = cp || (g.odds ? buildCal(g, g.odds) : null);
    } else if (g.odds) {
      calP[i] = buildCal(g, g.odds);
    }
  });
  renderJogos();
  autoCombos();
}

function limparOdds() {
  document.getElementById('odds12').value = '';
  document.getElementById('odds25').value = '';
  autoCal();
  renderJogos();
  autoCombos();
}

fetch('analise.json')
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(d => {
    data = d;
    const q = d.jogos.length;
    const gerado = new Date(d.gerado_em).toLocaleString('pt-BR',
      { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const nOdds = d.jogos.filter(g => g.odds).length;
    document.getElementById('sub').textContent =
      'Gerado em ' + gerado + ' · ' + q + ' jogos · peso de chutes no alvo: ' + d.w_sot +
      (nOdds ? ' · odds da ESPN embutidas em ' + nOdds + ' jogos' : '');
    document.getElementById('meta1').textContent = '· validação fora de amostra';
    if (d.cal && d.cal.x12) {
      document.getElementById('w12').textContent = d.cal.x12.w.toFixed(2);
      document.getElementById('w25').textContent =
        (d.cal.gols_over && d.cal.gols_over['2.5']) ? d.cal.gols_over['2.5'].w.toFixed(2) : '—';
    }
    autoCal();
    renderFiltro();
    renderStats();
    renderJogos();
    renderCombo();
    autoCombos();
    renderAoVivo();
  })
  .catch(e => {
    document.getElementById('sub').textContent =
      'Erro ao carregar analise.json: ' + e.message + ' (sirva a pasta via HTTP, ex.: python3 -m http.server)';
  });
