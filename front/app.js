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
let buscaLiga = null;
let buscaTime = '';
let ordena = 'data';
let buscaTimer = null;
let apostas = carregarApostas();
const BANKROLL_KEY = 'banca';

function animarLoader() {
  const bar = document.querySelector('.loader-bar');
  if (!bar) return;
  bar.addEventListener('animationend', () => bar.remove(), { once: true });
}

// ---- Tema claro/escuro ----
function alternarTema() {
  const atual = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = atual;
  try { localStorage.setItem('tema', atual); } catch (e) {}
  const btn = document.getElementById('tema-btn');
  if (btn) btn.textContent = atual === 'light' ? '🌙' : '☀️';
  toast(atual === 'light' ? 'Tema claro ativado' : 'Tema escuro ativado', 'ok');
}

// ---- Menu mobile (hambúrguer) ----
function alternarMenu() {
  const m = document.querySelector('.menu');
  if (m) m.classList.toggle('aberto');
}

// ---- Ações de UI (tema, menu) ----
(function () {
  const temaBtn = document.getElementById('tema-btn');
  if (temaBtn) {
    temaBtn.addEventListener('click', alternarTema);
    temaBtn.textContent = document.documentElement.dataset.theme === 'light' ? '🌙' : '☀️';
  }
  const menuBtn = document.getElementById('menu-toggle');
  if (menuBtn) menuBtn.addEventListener('click', alternarMenu);
  // remove o contador de jogos do cabeçalho e uniformiza textos (regiões fora do alcance do editor)
  const obsTxt = new MutationObserver(() => {
    const el = document.getElementById('sub');
    if (el) {
      const novo = el.textContent.replace(/\s*·\s*\d+ jogos/, '');
      if (novo !== el.textContent) el.textContent = novo;
    }
    document.querySelectorAll('.vazio').forEach(vz => {
      const t = vz.textContent;
      const s2 = t.replace(' e o resultado é atualizado quando o pipeline roda e a página é recarregada', '');
      if (s2 !== t) vz.textContent = s2;
    });
  });
  obsTxt.observe(document.body, { childList: true, subtree: true, characterData: true });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
      const m = document.querySelector('.menu.aberto');
      if (m) m.classList.remove('aberto');
    }
  });
})();

function carregarBanca() {
  try {
    const v = parseFloat(localStorage.getItem(BANKROLL_KEY));
    return isFinite(v) && v > 0 ? v : 500;
  } catch (e) { return 500; }
}
function salvarBanca(v) {
  try { localStorage.setItem(BANKROLL_KEY, String(v)); } catch (e) {}
}

function kellyStake(odd, p) {
  const b = odd - 1;
  const q = 1 - p;
  if (b <= 0 || p <= 0 || p >= 1) return null;
  const f = (b * p - q) / b;
  if (f <= 0) return null;
  return Math.min(f, 0.25);
}

function calcKelly() {
  const oi = document.getElementById('ap-odd');
  const ki = document.getElementById('ap-kelly');
  const vi = document.getElementById('ap-valor');
  if (!oi || !ki || !picks.length) return;
  const odd = parseFloat(oi.value);
  const pTot = picks.reduce((a, p) => a * p.p, 1);
  const eTot = picks.reduce((a, p) => a * p.taxa, 1);
  if (!(odd > 1)) { ki.innerHTML = ''; return; }
  const ev = eTot * odd - 1;
  const f = 0.25 * (odd * Math.min(pTot, 0.999) - 1) / (odd - 1);
  const stake = Math.max(0, Math.min(carregarBanca() * f, carregarBanca() * 0.25));
  const retPot = odd * stake;
  if (f <= 0 || ev <= 0) {
    ki.innerHTML = `Odd justa é <b>${(1 / eTot).toFixed(2)}</b> · nesta odd o EV esperado é <span class="bad">${(ev * 100).toFixed(1)}%</span> — sem valor, Kelly 0`;
    if (vi) vi.value = '';
    return;
  }
  ki.innerHTML = `Kelly ¼ da banca: <b>R$ ${stake.toFixed(2)}</b> · retorno potencial <b>R$ ${retPot.toFixed(2)}</b> · EV <span class="ok">+${(ev * 100).toFixed(1)}%</span>`;
  if (vi) vi.value = stake.toFixed(2);
}

function carregarApostas() {
  try { return JSON.parse(localStorage.getItem('apostas') || '[]'); }
  catch (e) { return []; }
}
function salvarApostas() {
  localStorage.setItem('apostas', JSON.stringify(apostas));
}

function pct(x) { return (100 * x).toFixed(1) + '%'; }
function fmtLift(x) { return (x >= 0 ? '+' : '') + (100 * x).toFixed(1).replace('.', ',') + ' p.p.'; }
function clsLift(x) { return x >= 0.03 ? 'ok' : x <= -0.03 ? 'bad' : 'med'; }

function clsP(x) { return x >= 0.75 ? 'ok' : x >= 0.6 ? 'med' : 'bad'; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function crest(nome, sz) {
  const s = sz || 22;
  let h = 0;
  for (const c of String(nome)) h = (h * 31 + c.charCodeAt(0)) % 360;
  const ini = (String(nome).trim()[0] || '?').toUpperCase();
  return `<span class="crest" style="--ch:${h};--cs:${s}px" aria-hidden="true">${ini}</span>`;
}

function toast(msg, tipo) {
  const w = document.getElementById('toast');
  if (!w) return;
  const t = document.createElement('div');
  t.className = 'toast' + (tipo ? ' ' + tipo : '');
  t.textContent = msg;
  w.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.remove('in');
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }, 2400);
}

function animNum(el, alvo, fmt) {
  const ini = parseFloat(String(el.textContent).replace(/[^\d.]/g, '')) || 0;
  if (Math.abs(alvo - ini) < 0.001) { el.textContent = fmt ? fmt(alvo) : String(alvo); return; }
  const dur = 600;
  const t0 = performance.now();
  function step(t) {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    const v = ini + (alvo - ini) * e;
    el.textContent = fmt ? fmt(v) : String(Math.round(v));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function fillHero(d) {
  const hms = document.querySelectorAll('.hero-metrics .hm-v');
  if (!hms.length) return;
  if (!d || !d.jogos) {
    hms.forEach(h => { h.textContent = '—'; });
    return;
  }
  animNum(hms[0], d.jogos.length);
  animNum(hms[1], new Set(d.jogos.map(j => j.liga)).size);
  if (typeof d.w_sot === 'number') animNum(hms[2], d.w_sot, v => v.toFixed(1));
  else hms[2].textContent = '—';
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
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" stroke-width="1.7" fill="none"/>',
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

// Horário de Brasília (UTC-3), igual ao campo hora_br gerado no backend
const BR_OFFSET_MS = -3 * 60 * 60 * 1000;
function brTime(iso) {
  return new Date(new Date(iso).getTime() + BR_OFFSET_MS);
}
function brDayKey(iso) {
  return brTime(iso).toISOString().slice(0, 10);
}
function rotuloData(iso) {
  const d = brTime(iso);
  const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return dias[d.getUTCDay()] + ', ' + String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

const DIA_ABV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MES_ABV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function renderFiltro() {
  const el = document.getElementById('filtro');
  const dias = [...new Set(data.jogos.map(g => brDayKey(g.data)))].sort();
  const diaTile = (key, iso) => {
    const d = new Date(iso);
    const dow = DIA_ABV[d.getUTCDay()];
    const day = String(d.getUTCDate());
    const mon = MES_ABV[d.getUTCMonth()];
    return `<button class="${dataFiltro === key ? 'act' : ''} dt" onclick="setFiltro('${key}')">
      <span class="dow">${dow}</span><b class="day">${day}</b>
      <span class="mon">${mon}</span></button>`;
  };
  const hoje = brDayKey(new Date().toISOString());
  const hojeChip = dias.includes(hoje)
    ? `<button class="${dataFiltro === hoje ? 'act' : ''}" onclick="setFiltro('${hoje}')">Hoje</button>`
    : '';
  el.innerHTML = hojeChip + `<button class="${dataFiltro ? '' : 'act'}" onclick="setFiltro('')">Todos</button>` +
    dias.map(d => diaTile(d, d)).join('');
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
}

function setMenuAtivo(id) {
  document.querySelectorAll('.menu-item').forEach(b => b.classList.toggle('act', b.dataset.sec === id));
}

function irPara(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (id === 'sec-apostas') renderApostas();
  const vivo = document.getElementById('sec-vivo');
  const apostas = document.getElementById('sec-apostas');
  if (id === 'sec-vivo' && vivo.hidden) aba('vivo');
  else if (id === 'sec-apostas' && apostas.hidden) aba('apostas');
  else if (id !== 'sec-vivo' && id !== 'sec-apostas' && (!vivo.hidden || !apostas.hidden)) aba('prev');
  setMenuAtivo(id);
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
}

function initSpy() {
  const banca = document.getElementById('ap-banca');
  if (banca) banca.addEventListener('change', renderResumoBanca);
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

function recarregar() {
  const btn = document.querySelector('.refresh');
  if (btn) btn.textContent = 'atualizando…';
  fetch('analise.json?cb=' + Date.now())
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(d => {
      data = d;
      fillHero(d);
      renderFiltro();
      renderFiltroLiga();
      renderStats();
      renderJogos();
      renderCombo();
    autoCombos();
    renderAoVivo();
      renderApostas();
    })
    .catch(e => {
      if (btn) btn.textContent = '↻ atualizar';
      const el = document.getElementById('vivo');
      if (el) el.innerHTML = '<div class="vazio">Falha ao atualizar: ' + esc(e.message) + '</div>';
    });
}

function renderAoVivo() {
  const av = data.ao_vivo;
  const el = document.getElementById('vivo');
  if (!av || !av.n) {
    document.getElementById('vivo-stats').innerHTML = '';
    document.getElementById('vivo-meta').textContent = '';
    el.innerHTML = '<div class="vivo-empty">' +
      '<div class="vazio">Nenhum jogo finalizado com resultados coletados ainda.</div>' +
      '<p class="vivo-hint">Os resultados são atualizados automaticamente quando o pipeline consegue acessar o provedor de dados (ESPN). Se a seção estiver vazia com jogos previstos, pode ser uma indisponibilidade temporária do provedor.</p>' +
      '<button class="btn refresh" onclick="recarregar()" title="Recarregar dados">↻ tentar atualizar</button>' +
      '</div>';
    return;
  }
  document.getElementById('vivo-meta').textContent = '· acerto ' + pct(av.taxa) +
    ' (palpites com P≥' + pct(av.thr) + ')';
  const geral = `<div class="stat ${clsP(av.taxa)}"><div class="l">Taxa geral</div><div class="v">${pct(av.taxa)}</div>
    <div class="bar" style="--w:${Math.round(av.taxa * 100)}%"></div></div>`;
  const cards = Object.keys(av.por_mercado).sort().map(k => {
    const m = av.por_mercado[k];
    return `<div class="stat ${clsP(m.taxa)}"><div class="l">${esc(nomeVivo(k))}</div>
      <div class="v">${pct(m.taxa)}</div><div class="bar" style="--w:${Math.round(m.taxa * 100)}%"></div></div>`;
  });
  document.getElementById('vivo-stats').innerHTML = geral + cards.join('');
  const rows = g => {
    const pks = g.picks.map(pk =>
      `<span class="pick-badge ${pk.ok ? 'ok' : 'bad'}"><span class="ic">${ico(pk.ok ? 'check' : 'cross', 9)}</span> ${esc(pk.nome)} <span class="p">${pct(pk.p)}</span></span>`).join('');
    return `<div class="vjogo"><div class="linha1"><span class="teams">${crest(g.casa, 18)}<button type="button" class="team-btn" data-team="${esc(g.casa)}">${esc(g.casa)}</button> <span class="vs">x</span> ${crest(g.fora, 18)}<button type="button" class="team-btn" data-team="${esc(g.fora)}">${esc(g.fora)}</button></span>
      <span class="resultado">${g.hg} – ${g.ag}</span><span class="pl">${ico('clock', 11)}${esc(g.hora_br)}</span>
      ${g.lam_esc ? `<span class="pl">${ico('ball', 11)}${g.lam} · ${ico('corner', 11)}${g.lam_esc}</span>` : ''}
      </div><div class="picks">${pks}</div></div>`;
  };
  el.innerHTML = '<div class="vligas">' + av.por_liga.map(lg => {
    const jgs = av.jogos.filter(j => j.liga === lg.liga);
    return `<details class="vliga" open><summary><b>${esc(lg.liga)}</b>
      <span class="resumo">acerto ${pct(lg.taxa)}</span></summary>
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
  renderApostas();
  renderComboBar();
  toast('Palpite adicionado à combinação', 'ok');
}

function removePick(id) {
  const i = picks.findIndex(x => x.id === id);
  if (i >= 0) { picks.splice(i, 1); delete pickSeq[id]; }
  renderCombo();
  renderJogos();
  renderApostas();
  renderComboBar();
  toast('Palpite removido');
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
  return `<button class="pick ${sel ? 'sel' : ''} ${top ? 'top' : ''}" aria-pressed="${sel ? 'true' : 'false'}"
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
    const op = itens.map(([k, label]) => b(k, label)).join('');
    return `<div class="stat-linha"><span class="slbl">${lbl}</span>${op}</div>`;
  };
  document.getElementById('filtro-stat').innerHTML =
    linha('Campeonato', [['', 'Todas']].concat(ligas.map(l => [l, l])), statsLiga, 'setStatLiga') +
    linha('Temporada', [['', 'Todas']].concat(temps.map(t => [t, rotuloTemp(t)])), statsTemp, 'setStatTemp');
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
  document.getElementById('meta1').textContent = '· testado em jogos passados' + (nome ? ' — ' + nome : '');
  const bases = vv.bases || {};
  const grupos = [];
  const add = (grupo, label, e, b) => {
    if (!e || typeof e.taxa !== 'number') return;
    grupos.push({ grupo, label, e, b, lift: (b != null) ? e.taxa - b : null });
  };

  // Resultado (todos os limiares)
  if (vv.x12) for (const t of Object.keys(vv.x12)) {
    add('Resultado', 'Resultado com chance ≥' + Math.round(Number(t) * 100) + '%', vv.x12[t], bases.x12 != null ? bases.x12 : null);
  }
  // Dupla chance (todas as variantes e limiares)
  if (vv.dc) for (const out of Object.keys(vv.dc)) {
    const tbl = vv.dc[out] || {};
    for (const t of Object.keys(tbl)) {
      add('Dupla chance', 'Dupla ' + out.toUpperCase() + ' com chance ≥' + Math.round(Number(t) * 100) + '%',
          tbl[t], bases.dc && bases.dc[out] != null ? bases.dc[out] : null);
    }
  }
  // Gols / 1º tempo / Escanteios (todas as linhas)
  const linhas = (mkts, grupo, rotulo, chave, lado) => {
    for (const [linha, e] of Object.entries(mkts)) {
      let b = null;
      if (bases[chave] && bases[chave][linha] != null) {
        b = lado === 'over' ? bases[chave][linha].over : 1 - bases[chave][linha].over;
      }
      add(grupo, rotulo + ' ' + linha, e, b);
    }
  };
  linhas(vv.gols_over, 'Gols', 'Gols: mais de', 'gols', 'over');
  linhas(vv.gols_under, 'Gols', 'Gols: menos de', 'gols', 'under');
  linhas(vv.ht_over, 'Primeiro tempo', '1ºT: mais de', 'ht', 'over');
  linhas(vv.ht_under, 'Primeiro tempo', '1ºT: menos de', 'ht', 'under');
  linhas(vv.esc_over, 'Escanteios', 'Esc: mais de', 'esc', 'over');
  linhas(vv.esc_under, 'Escanteios', 'Esc: menos de', 'esc', 'under');

  // destaque: melhores/piores vs apostar sempre + mais jogos testados (sobre TODOS os mercados)
  const comLift = grupos.filter(g => g.lift != null && g.e.n >= 30);
  let destHtml = '';
  if (comLift.length >= 2) {
    const best = comLift.reduce((a, b) => b.lift > a.lift ? b : a);
    const worst = comLift.reduce((a, b) => b.lift < a.lift ? b : a);
    const most = comLift.reduce((a, b) => b.e.n > a.e.n ? b : a);
    const dCard = (label, d, cls) => `<div class="stat ${cls}"><div class="l">${label}</div><div class="v">${pct(d.e.taxa)}</div><div class="n">${esc(d.label)} · <b class="lift ${clsLift(d.lift)}">${fmtLift(d.lift)}</b></div><div class="bar" style="--w:${Math.round(d.e.taxa * 100)}%"></div></div>`;
    destHtml = `<div class="stats dest-row">${dCard('Melhor que apostar sempre', best, 'ok')}${dCard('Mais jogos testados', most, '')}${dCard('Pior que apostar sempre', worst, 'bad')}</div>`;
  }

  // grade completa, agrupada por categoria, ordenada por ganho vs apostar sempre dentro do grupo
  const ord = ['Resultado', 'Dupla chance', 'Gols', 'Primeiro tempo', 'Escanteios'];
  const html = ord.map(grupo => {
    const items = grupos.filter(g => g.grupo === grupo)
      .sort((a, b) => (b.lift == null ? -1 : b.lift) - (a.lift == null ? -1 : a.lift));
    if (!items.length) return '';
    const cards = items.map(g => {
      const lv = g.lift;
      const warn = (g.e.n < 30) ? '<span class="warn">· poucos jogos</span>' : '';
      const liftHtml = (lv != null && g.b != null)
        ? `<span class="n-lift ${clsLift(lv)}" title="Apostar sempre neste mercado, sem o modelo, acertaria ${pct(g.b)}">${fmtLift(lv)} vs apostar sempre (${pct(g.b)})</span>` : '';
      const bmark = (g.b != null && g.b > 0 && g.b < 1)
        ? `<span class="bmark" style="left:${Math.round(g.b * 100)}%" title="apostar sempre: ${pct(g.b)}"></span>` : '';
      const bar = `<div class="bar" style="--w:${Math.round(g.e.taxa * 100)}%">${bmark}</div>`;
      return `<div class="stat ${clsP(g.e.taxa)}"><div class="l">${esc(g.label)}</div><div class="v">${pct(g.e.taxa)}</div><div class="n">${warn}${liftHtml}</div>${bar}</div>`;
    }).join('');
    return `<div class="stat-grupo">${esc(grupo)}</div>${cards}`;
  }).join('');
  document.getElementById('stats').innerHTML = destHtml + html;
}

const TIPS_MERCADO = {
  'Resultado': 'Quem vence a partida: Casa (1), Empate (X) ou Fora (2).',
  'Dupla chance': 'Duas opções juntas: 1X (casa ou empate), X2 (empate ou fora), 12 (sem empate).',
  'Gols': 'Total de gols do jogo: mais de ou menos de um valor (ex.: mais de 2,5 = 3 gols ou mais).',
  'Primeiro tempo': 'Gols marcados apenas no primeiro tempo.',
  'Escanteios': 'Total de escanteios da partida.',
};
function mktRow(j, nome, buts) {
  const ic = nome === 'Resultado' ? 'target' : nome === 'Gols' ? 'ball' : nome === 'Primeiro tempo' ? 'clock' : nome === 'Escanteios' ? 'corner' : null;
  const tip = TIPS_MERCADO[nome] || '';
  const label = `<span class="mkt-name"${tip ? ` data-tip="${tip}"` : ''}>${ic ? ico(ic, 11) : ''}${nome}</span>`;
  if (!buts) return `<div class="mkt-row">${label}<span class="sem">sem dados</span></div>`;
  return `<div class="mkt-row">${label}${buts}</div>`;
}

function bestProb(g) {
  const p = g && g.prob;
  if (!p) return -1;
  let m = 0;
  const arrs = [p.x1, p.x, p.x2, p.gols_over, p.gols_under, p.ht_over, p.ht_under, p.esc_over, p.esc_under];
  for (const a of arrs) {
    if (!a) continue;
    for (const v of a) if (typeof v === 'number' && v > m) m = v;
  }
  return m;
}

function renderFiltroLiga() {
  const el = document.getElementById('filtro-liga');
  if (!el || !data) return;
  const ligas = [...new Set(data.jogos.map(g => g.liga))].sort();
  el.innerHTML =
    `<button class="${buscaLiga ? '' : 'act'}" data-liga="__all__">Todas</button>` +
    ligas.map(l =>
      `<button class="${buscaLiga === l ? 'act' : ''}" data-liga="${esc(l)}">${esc(l)}</button>`
    ).join('');
}

function renderJogos() {
  const el = document.getElementById('jogos');
  const liga = statsLiga || null;
  let idxs = data.jogos
    .map((g, i) => i)
    .filter(i => {
      const g = data.jogos[i];
      if (dataFiltro && brDayKey(g.data) !== dataFiltro) return false;
      if (liga && g.liga !== liga) return false;
      if (buscaLiga && g.liga !== buscaLiga) return false;
      if (buscaTime && !(g.casa.toLowerCase().includes(buscaTime) || g.fora.toLowerCase().includes(buscaTime))) return false;
      return true;
    });
  if (ordena === 'prob') idxs.sort((a, b) => bestProb(data.jogos[b]) - bestProb(data.jogos[a]));
  else if (ordena === 'liga') idxs.sort((a, b) =>
    data.jogos[a].liga.localeCompare(data.jogos[b].liga) || data.jogos[a].data.localeCompare(data.jogos[b].data));
  if (!idxs.length) {
    el.innerHTML = '<div class="vazio">Nenhum jogo encontrado com esses filtros — ajuste a busca ou os filtros.</div>';
    document.getElementById('meta2').textContent = '';
    return;
  }
  el.innerHTML = idxs.map(j => {
    const g = data.jogos[j];
    if (!g.prob) {
      return `<div class="card mc">
        <div class="mc-head">
          <div class="teams">${crest(g.casa)}<button type="button" class="team-btn" data-team="${esc(g.casa)}">${esc(g.casa)}</button> <span class="vs">×</span> ${crest(g.fora)}<button type="button" class="team-btn" data-team="${esc(g.fora)}">${esc(g.fora)}</button></div>
          <div class="mc-actions"><span class="badge med">sem histórico</span></div>
        </div>
        <div class="mc-meta">
          <span class="chip-liga" style="--lh:${corLiga(g.liga)}">${ico('shield', 10)}${esc(g.liga)}</span>
          <span class="chip-data">${ico('calendar', 12)}${rotuloData(g.data)}</span>
          <span class="chip-time">${ico('clock', 12)}${g.hora_br}</span>
        </div>
        <div class="mkt-row"><span class="mkt-name">${ico('flash', 11)}Aviso</span>
          <span class="sem">time(s) sem histórico no modelo (ex.: recém-promovido). Previsão indisponível.</span></div>
      </div>`;
    }
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
    const candBest = [];
    [0, 1, 2].forEach(li => candBest.push({ nome: ['Casa', 'Empate', 'Fora'][li], p: px[li], taxa: taxaPick('x12', li, px[li]) }));
    [['1x', px[0] + px[1]], ['x2', px[1] + px[2]], ['12', px[0] + px[2]]].forEach(([li, p]) => candBest.push({ nome: 'Dupla ' + li.toUpperCase(), p, taxa: taxaPick('dc', li, p) }));
    gols.forEach(gp => candBest.push({ nome: curto(gp.tipo, gp.li), p: gp.p, taxa: taxaPick(gp.tipo, gp.li, gp.p) }));
    if (ht) ht.forEach(gp => candBest.push({ nome: curto(gp.tipo, gp.li), p: gp.p, taxa: taxaPick(gp.tipo, gp.li, gp.p) }));
    if (escRec) escRec.forEach(gp => candBest.push({ nome: curto(gp.tipo, gp.li), p: gp.p, taxa: taxaPick(gp.tipo, gp.li, gp.p) }));
    // chip ✦: mesma lógica das sugestões (melhor por categoria, com pisos e sem linhas quase certas)
    const legsChip = melhoresPorCategoria(j);
    const mel = legsChip.length ? legsChip[0] : candBest.reduce((a, b) => b.taxa > a.taxa ? b : a);
    const chipNome = mel.tipo
      ? (mel.tipo === 'x12' ? ['Casa', 'Empate', 'Fora'][mel.li]
        : mel.tipo === 'dc' ? 'Dupla ' + String(mel.li).toUpperCase()
        : curto(mel.tipo, mel.li))
      : mel.nome;
    const topChip = `<span class="badge top-bet" title="Melhor palpite (maior expectativa de acerto pela validação)">✦ ${esc(chipNome)} ${pct(mel.taxa)}</span>`;
    const barra = `<div class="barra-x12" title="Distribuição de probabilidades 1X2">` +
      `<span class="seg h" style="width:${Math.max(0, Math.round(px[0] * 100))}%"><b>${pct(px[0])}</b></span>` +
      `<span class="seg d" style="width:${Math.max(0, Math.round(px[1] * 100))}%"><b>${pct(px[1])}</b></span>` +
      `<span class="seg a" style="width:${Math.max(0, Math.round(px[2] * 100))}%"><b>${pct(px[2])}</b></span></div>`;
    return `<div class="card mc">
      <div class="mc-head">
        <div class="teams">${crest(g.casa)}<button type="button" class="team-btn" data-team="${esc(g.casa)}">${esc(g.casa)}</button> <span class="vs">×</span> ${crest(g.fora)}<button type="button" class="team-btn" data-team="${esc(g.fora)}">${esc(g.fora)}</button></div>
        <div class="mc-actions">
          <span class="badge ${g.dados === 'completo' ? 'ok' : 'med'}">${g.dados}</span>
          ${topChip}
        </div>
      </div>
      <div class="mc-meta">
        <span class="chip-liga" style="--lh:${cor}">${ico('shield', 10)}${esc(g.liga)}</span>
        <span class="chip-data">${ico('calendar', 12)}${rotuloData(g.data)}</span>
        <span class="chip-time">${ico('clock', 12)}${g.hora_br}</span>
        <span>${ico('ball', 12)}<b>${g.lam}</b> gols</span>
        ${g.lam_esc ? `<span>${ico('corner', 12)}<b>${g.lam_esc}</b> escanteios</span>` : ''}
      </div>
      ${mktRow(j, 'Resultado', x12 + dc)}
      ${barra}
      ${mktRow(j, 'Gols', golsB)}
      ${mktRow(j, 'Primeiro tempo', htB)}
      ${mktRow(j, 'Escanteios', escB)}
      ${full}
    </div>`;
  }).join('');
  const metas = [];
  if (liga) metas.push('campeonato: ' + liga);
  if (buscaLiga) metas.push('campeonato: ' + buscaLiga);
  if (buscaTime) metas.push('busca: "' + buscaTime + '"');
  document.getElementById('meta2').textContent = '·' + (metas.length ? ' ' + metas.join(' · ') : '') +
    ' clique para selecionar (✦ = maior chance do mercado)';
}

function renderCombo() {
  const el = document.getElementById('combo');
  if (!picks.length) {
    el.innerHTML = '<div class="vazio">Clique em um palpite (✦ = melhor chance) nos jogos acima para montar a combinação.</div>';
    return;
  }
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
    <div class="meter-wrap">
      <div class="meter"><span class="m-fill" style="width:${Math.round(eTot * 100)}%"></span><span class="m-thr" style="left:60%"></span><span class="m-thr" style="left:75%"></span></div>
      <div class="meter-lbl"><span>Expectativa de acerto: <b class="${clsP(eTot)}">${pct(eTot)}</b></span><span>${rot}</span></div>
    </div>
    <div class="totais">
      <div><span class="lbl">Probabilidade do modelo</span><b class="p ${clsP(pTot)}">${pct(pTot)}</b></div>
      <div><span class="lbl">Odd justa (1 ÷ P)</span><b class="p">${(1 / pTot).toFixed(2)}</b></div>
      <div><span class="lbl">Expectativa pela validação</span><b class="p ${clsP(eTot)}">${pct(eTot)}</b>
        <span class="badge big ${badge}">${rot}</span></div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn prim" onclick="irPara('sec-apostas')">Apostar nesta combinação</button>
    <button class="btn" onclick="copiarCombo()">Copiar</button>
    <button class="btn" onclick="limparPicks()">Limpar combinação</button></div>`;
  bar.hidden = false;
  requestAnimationFrame(() => bar.classList.add('in'));
}

function renderComboBar() {
  const bar = document.getElementById('combo-bar');
  if (!bar) return;
  const n = picks.length;
  document.body.classList.toggle('has-combo', n > 0);
  if (!n) { bar.hidden = true; return; }
  const pTot = picks.reduce((a, p) => a * p.p, 1);
  const eTot = picks.reduce((a, p) => a * p.taxa, 1);
  const pEl = document.getElementById('cb-p');
  pEl.className = 'cb-p ' + clsP(eTot);
  pEl.textContent = 'P ' + pct(pTot) + ' · exp. ' + pct(eTot);
  bar.hidden = false;
}

function copiarCombo() {
  if (!picks.length) return;
  const linhas = picks.map((p, i) => (i + 1) + '. ' + p.label + ' — P ' + pct(p.p));
  const pTot = picks.reduce((a, p) => a * p.p, 1);
  const txt = 'Minha combinação — Análise de Apostas\n' + linhas.join('\n') + '\nProbabilidade combinada: ' + pct(pTot);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt)
      .then(() => toast('Combinação copiada para a área de transferência', 'ok'))
      .catch(() => fallbackCopy(txt));
  } else {
    fallbackCopy(txt);
  }
}

function fallbackCopy(txt) {
  const ta = document.createElement('textarea');
  ta.value = txt;
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast('Combinação copiada para a área de transferência', 'ok');
  } catch (e) {
    toast('Não foi possível copiar automaticamente', 'err');
  }
  ta.remove();
}

function limparPicks() {
  picks.length = 0;
  for (const k of Object.keys(pickSeq)) delete pickSeq[k];
  renderCombo();
  renderJogos();
  renderApostas();
  renderComboBar();
  toast('Combinação limpa');
}

function melhoresPorCategoria(j) {
  // Mesma lógica das sugestões automáticas: pisos de probabilidade por categoria,
  // sem linhas quase certas (P>96%) e o melhor palpite de cada categoria
  // (resultado/dupla, gols, 1ºT, escanteios) para garantir diversidade.
  const g = data.jogos[j];
  if (!g || !g.prob) return [];
  const pr = g.prob;
  const px = [pv(j, 'x12', 0), pv(j, 'x12', 1), pv(j, 'x12', 2)];
  const list = [];
  [0, 1, 2].forEach(li => list.push({ tipo: 'x12', li, p: px[li] }));
  [['1x', 0, 1], ['x2', 1, 2], ['12', 0, 2]].forEach(([li, a, b]) =>
    list.push({ tipo: 'dc', li, p: px[a] + px[b] }));
  LINHAS_GOLS.forEach(li => {
    list.push({ tipo: 'gols_over', li, p: pv(j, 'gols_over', li) });
    list.push({ tipo: 'gols_under', li, p: pv(j, 'gols_under', li) });
  });
  if ((pr.ht_over || []).length) LINHAS_HT.forEach(li => {
    list.push({ tipo: 'ht_over', li, p: pv(j, 'ht_over', li) });
    list.push({ tipo: 'ht_under', li, p: pv(j, 'ht_under', li) });
  });
  if ((pr.esc_over || []).length) LINHAS_ESC.forEach(li => {
    list.push({ tipo: 'esc_over', li, p: pv(j, 'esc_over', li) });
    list.push({ tipo: 'esc_under', li, p: pv(j, 'esc_under', li) });
  });
  const FLOOR = { x12: 0.72, dc: 0.72, gols: 0.85, ht: 0.8, esc: 0.75 };
  const PCAP = 0.96;
  const catOf = t => (t === 'x12' || t === 'dc') ? 'res' : t.split('_')[0];
  const bons = [];
  for (const c of list) {
    if (typeof c.p !== 'number' || isNaN(c.p)) continue;
    c.cat = catOf(c.tipo);
    if (c.p < FLOOR[c.cat] || c.p > PCAP) continue;
    c.taxa = taxaPick(c.tipo, c.li, c.p);
    if (c.taxa < 0.75) continue;
    c.nome = nomeMercado(c.tipo, c.li);
    bons.push(c);
  }
  if (!bons.length) return [];
  const melhorCat = {};
  for (const c of bons) {
    const prev = melhorCat[c.cat];
    if (!prev || c.taxa > prev.taxa || (c.taxa === prev.taxa && c.p > prev.p)) melhorCat[c.cat] = c;
  }
  return Object.keys(melhorCat).map(k => {
    const c = melhorCat[k];
    return { i: j, g: data.jogos[j], tipo: c.tipo, li: c.li, p: c.p, taxa: c.taxa, nome: c.nome, cat: c.cat };
  }).sort((a, b) => b.taxa - a.taxa || b.p - a.p);
}

function autoCombos() {
  // Sugestões usam a mesma seleção por categoria (melhoresPorCategoria) com
  // diversidade e ranking por EV.
  const perGame = [];
  data.jogos.forEach((g, i) => {
    const legs = melhoresPorCategoria(i);
    if (legs.length) perGame.push({ i, g, legs });
  });

  // pool com os jogos de melhor perna (limite de tamanho p/ performance)
  const pool = perGame.filter(pg => pg.legs[0].taxa >= 0.80).slice(0, 60);
  const combos = [];
  const n = pool.length;
  for (let a = 0; a < n; a++) {
    const A = pool[a], As = A.legs.slice(0, 3);
    for (let b = a + 1; b < n; b++) {
      const B = pool[b], Bs = B.legs.slice(0, 3);
      for (const la of As) for (const lb of Bs) {
        if (la.cat === lb.cat) continue;
        const eTot = la.taxa * lb.taxa;
        if (eTot < 0.75) continue;
        combos.push({ ms: [la, lb], eTot, pTot: la.p * lb.p });
      }
      for (let d = b + 1; d < n; d++) {
        const C = pool[d], Cs = C.legs.slice(0, 2);
        for (const la of As.slice(0, 2)) for (const lb of Bs.slice(0, 2)) for (const lc of Cs) {
          if (la.cat === lb.cat && lb.cat === lc.cat) continue;
          const eTot = la.taxa * lb.taxa * lc.taxa;
          if (eTot < 0.75) continue;
          combos.push({ ms: [la, lb, lc], eTot, pTot: la.p * lb.p * lc.p });
        }
      }
    }
  }
  for (const c of combos) {
    c.odd = 1 / c.eTot;
    c.ev = c.pTot * c.odd - 1;
  }
  combos.sort((x, y) => y.ev - x.ev || y.eTot - x.eTot);

  // 6 melhores com diversidade: mesma perna no máx. 2x; mesmo mercado no máx. 3x
  const uniq = [];
  const seen = new Set();
  const legUse = {};
  const mktUse = {};
  for (const c of combos) {
    const key = c.ms.map(m => m.i).sort().join('+');
    if (seen.has(key)) continue;
    const legKey = m => m.i + '|' + m.tipo + '|' + m.li;
    const mktKey = m => m.tipo + '_' + m.li;
    if (c.ms.some(m => (legUse[legKey(m)] || 0) >= 2)) continue;
    if (c.ms.some(m => (mktUse[mktKey(m)] || 0) >= 3)) continue;
    seen.add(key);
    uniq.push(c);
    c.ms.forEach(m => {
      legUse[legKey(m)] = (legUse[legKey(m)] || 0) + 1;
      mktUse[mktKey(m)] = (mktUse[mktKey(m)] || 0) + 1;
    });
    if (uniq.length >= 6) break;
  }
  const el = document.getElementById('auto');
  if (!uniq.length) {
    el.innerHTML = '<div class="vazio">Nenhuma combinação automática com expectativa ≥75% nesta rodada.</div>';
    return;
  }
  el.innerHTML = '<ul class="auto">' + uniq.map((c, k) => {
    const legs = c.ms.map(m =>
      `<div class="leg"><span class="leg-teams">${crest(m.g.casa, 16)}<b>${esc(m.g.casa)}</b> <span class="vs">x</span> <b>${esc(m.g.fora)}</b></span>
       <span class="leg-mkt">${esc(m.nome)}</span>
       <span class="leg-p p ${clsP(m.taxa)}">${pct(m.taxa)}</span></div>`).join('');
    return `<li><div class="auto-head">
      <b class="auto-k">Combo ${k + 1}</b>
      <span class="auto-tags">
        <span class="tag ok">exp. ${pct(c.eTot)}</span>
        <span class="tag">P ${pct(c.pTot)}</span>
        <span class="tag">odd justa ${c.odd.toFixed(2)}</span>
        <span class="tag ${c.ev > 0 ? 'ok' : ''}">EV ${(c.ev * 100).toFixed(1)}%</span>
      </span>
      <button class="usar" onclick="aplicarAuto(${k})">usar</button>
    </div><div class="legs">${legs}</div></li>`;
  }).join('') + '</ul>';
  window._autos = uniq;
}

function aplicarAuto(k) {
  const c = window._autos[k];
  for (const m of c.ms) addPick(m.i, m.tipo, m.li, m.p, m.nome);
  toast('Combinação automática aplicada', 'ok');
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

function renderResumoApostas() {
  const nums = document.getElementById('ap-resumo-nums');
  const banc = document.getElementById('ap-banca');
  if (!nums) return;
  if (banc) banc.value = carregarBanca().toFixed(0);
  const evs = apostas.map(a => ({ a, av: avaliarAposta(a) }));
  const total = evs.reduce((s, x) => s + x.a.valor, 0);
  const retorno = evs.reduce((s, x) => s + (x.av.ganhou ? x.a.odd * x.a.valor : 0), 0);
  const lucro = retorno - total;
  const roi = total > 0 ? (lucro / total) * 100 : 0;
  const liquidadas = evs.filter(x => !x.av.pendente).length;
  const ganhas = evs.filter(x => x.av.ganhou).length;
  const taxa = liquidadas ? ganhas / liquidadas : null;
  const abertas = evs.length - liquidadas;
  const proj = carregarBanca() + lucro;
  const chip = (l, v, cls) => `<div class="chip ${cls || ''}"><span class="cl">${l}</span><b class="cv">${v}</b></div>`;
  nums.innerHTML =
    chip('Investido', 'R$ ' + total.toFixed(2)) +
    chip('Retorno', 'R$ ' + retorno.toFixed(2)) +
    chip('Resultado', (lucro >= 0 ? '+' : '') + 'R$ ' + lucro.toFixed(2), lucro > 0 ? 'ok' : lucro < 0 ? 'bad' : '') +
    chip('ROI', (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%', roi > 0 ? 'ok' : roi < 0 ? 'bad' : '') +
    chip('Banca projetada', 'R$ ' + proj.toFixed(2), lucro > 0 ? 'ok' : lucro < 0 ? 'bad' : '') +
    chip('Abertas', String(abertas)) +
    chip('Acerto', taxa === null ? '—' : pct(taxa), taxa === null ? '' : (taxa >= 0.6 ? 'ok' : taxa < 0.5 ? 'bad' : ''));
  renderFiltroApostas();
  renderApostasStats();
}

let filtroAposta = 'todas';

function renderFiltroApostas() {
  const el = document.getElementById('ap-filtros');
  if (!el) return;
  const evs = apostas.map(a => avaliarAposta(a));
  const cnt = s => evs.filter(x =>
    s === 'todas' || (s === 'pendente' && x.pendente) || (s === 'ganha' && x.ganhou) || (s === 'perdida' && !x.pendente && !x.ganhou)).length;
  const chip = (k, l, n) => `<button class="${filtroAposta === k ? 'act' : ''}" onclick="setFiltroAposta('${k}')">${l} <span class="cnt">(${n})</span></button>`;
  el.innerHTML = chip('todas', 'Todas', apostas.length) + chip('pendente', 'Pendentes', cnt('pendente')) +
    chip('ganha', 'Ganhas', cnt('ganha')) + chip('perdida', 'Perdidas', cnt('perdida'));
}

function setFiltroAposta(k) {
  filtroAposta = k;
  renderApostas();
}

function mercadoGrupo(tipo) {
  if (tipo === 'x12' || tipo === 'dc') return 'Resultado';
  if (tipo.startsWith('ht')) return 'Primeiro tempo';
  if (tipo.startsWith('esc')) return 'Escanteios';
  return 'Gols';
}

function renderApostasStats() {
  const wrap = document.getElementById('ap-stats-wrap');
  const el = document.getElementById('ap-stats');
  if (!wrap || !el) return;
  const cont = {};
  apostas.forEach(a => {
    a.picks.forEach(pk => {
      const r = data && data.resultados && data.resultados[pk.id];
      if (!r) return;
      const ok = pickOk(pk, r);
      if (ok === null) return;
      const k = mercadoGrupo(pk.tipo);
      const c = cont[k] || (cont[k] = { n: 0, hit: 0 });
      c.n++;
      if (ok) c.hit++;
    });
  });
  const keys = Object.keys(cont);
  wrap.hidden = !keys.length;
  if (!keys.length) return;
  el.innerHTML = keys.sort().map(k => {
    const c = cont[k];
    const t = c.hit / c.n;
    return `<div class="ap-stat ${clsP(t)}"><span class="l">${k}</span><b class="v">${pct(t)}</b>
      <span class="n">${c.hit}/${c.n} palpites</span><div class="bar" style="--w:${Math.round(t * 100)}%"></div></div>`;
  }).join('');
}

function ajustarBanca(delta) {
  salvarBanca(Math.max(0, carregarBanca() + delta));
  renderResumoApostas();
  toast('Banca: R$ ' + carregarBanca().toFixed(2), 'ok');
}

function limparApostas() {
  if (!apostas.length) { toast('Nenhuma aposta para limpar', 'err'); return; }
  if (!confirm('Apagar todas as ' + apostas.length + ' apostas do histórico?')) return;
  apostas = [];
  salvarApostas();
  renderApostas();
  toast('Histórico de apostas limpo', 'ok');
}

function renderResumoBanca() {
  const banc = document.getElementById('ap-banca');
  if (!banc) return;
  const v = parseFloat(banc.value);
  if (isFinite(v) && v > 0) salvarBanca(v);
}

function renderApostas() {
  const el = document.getElementById('apostas');
  const nEl = document.getElementById('apostas-n');
  const mn = document.getElementById('menu-apostas');
  if (!el) return;
  const visiveis = apostas.filter(a => {
    const av = avaliarAposta(a);
    if (filtroAposta === 'pendente') return av.pendente;
    if (filtroAposta === 'ganha') return av.ganhou;
    if (filtroAposta === 'perdida') return !av.pendente && !av.ganhou;
    return true;
  });
  nEl.textContent = apostas.length ? '· ' + apostas.length + (apostas.length > 1 ? ' apostas' : ' aposta') : '';
  if (mn) mn.textContent = apostas.length ? String(apostas.length) : '';
  renderResumoApostas();
  let nova = '<div class="vazio">Selecione palpites nos jogos (✦ = melhor chance) para montar a combinação e depois apostar.</div>';
  if (picks.length) {
    const pTot = picks.reduce((a, p) => a * p.p, 1);
    const oddSug = Math.min(1000, Math.max(1.01, 1 / pTot));
    nova = `
    <div class="card nova-aposta">
      <h3>Nova aposta</h3>
      <div class="combo-list">${picks.map((p, i) => `
        <div class="combo-item">
          <span class="cix">${i + 1}</span>
          <div class="nome">${p.label}</div>
          <span class="p ${clsP(p.taxa)}">${pct(p.taxa)}</span>
        </div>`).join('')}</div>
      <div class="ap-kelly" id="ap-kelly"></div>
      <div class="ap-form">
        <label>Odd
          <input id="ap-odd" type="number" step="0.01" min="1.01" value="${oddSug.toFixed(2)}" oninput="calcKelly()" title="Odd justa sugerida = 1 ÷ prob. combinada do modelo">
        </label>
        <label>Valor (R$)
          <input id="ap-valor" type="number" step="0.50" min="0.50" value="" placeholder="ex.: 10" title="Sugerido pelo critério de Kelly (¼)">
        </label>
        <button class="btn prim" onclick="registrarAposta()">Apostar</button>
      </div>
    </div>`;
    calcKelly();
  }
  if (!visiveis.length) {
    el.innerHTML = nova + (apostas.length
      ? '<div class="vazio">Nenhuma aposta com esse status.</div>'
      : '<div class="vazio">Nenhuma aposta registrada ainda. Suas apostas ficam salvas neste navegador e o resultado é atualizado quando o pipeline roda e a página é recarregada.</div>');
    return;
  }
  el.innerHTML = nova + '<div class="ap-lista">' + visiveis.slice().reverse().map(apostaCard).join('') + '</div>';
}

function apostaCard(a) {
  const av = avaliarAposta(a);
  const badge = av.ganhou ? 'ok' : av.pendente ? 'med' : 'bad';
  const rot = av.ganhou ? 'GANHOU' : av.pendente ? 'PENDENTE' : 'PERDEU';
  const retPot = a.odd * a.valor;
  const pTot = a.picks.reduce((s, pk) => s * pk.p, 1);
  const eTot = a.picks.reduce((s, pk) => s * taxaPick(pk.tipo, pk.linha, pk.p), 1);
  const ev = eTot * a.odd - 1;
  const liquidadas = av.res.filter(p => p.ok !== null).length;
  const criada = new Date(a.criada).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const pks = av.res.map(p =>
    `<span class="pick-badge ${p.ok === true ? 'ok' : p.ok === false ? 'bad' : ''}">
      <span class="ic">${p.ok === null ? '…' : ico(p.ok ? 'check' : 'cross', 9)}</span>
      ${esc(p.nome)} <span class="p">${pct(p.p)}</span></span>`).join('');
  return `<div class="card ap">
    <div class="ap-head">
      <span class="badge ${badge}">${rot}</span>
      <span class="ap-name">${a.nome ? esc(a.nome) : 'Aposta'}</span>
      <span class="ap-data">${ico('clock', 10)}${criada}</span>
      <button class="x" onclick="removerAposta('${a.id}')" title="Excluir aposta" aria-label="Excluir aposta">✕</button>
    </div>
    <div class="ap-meta">
      <span class="ap-odd">odd ${a.odd.toFixed(2)}</span>
      <span class="ap-valor">R$ ${a.valor.toFixed(2)}</span>
      <span class="ap-ret">retorno potencial <b>R$ ${retPot.toFixed(2)}</b></span>
      <span class="ap-ev ${ev > 0 ? 'ok' : 'bad'}">EV ${(ev * 100).toFixed(1)}%</span>
      <span class="ap-p">P modelo ${pct(pTot)}</span>
      <span class="ap-liquida">${liquidadas}/${a.picks.length} liquidadas</span>
    </div>
    <div class="picks">${pks}</div>
  </div>`;
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
  toast('Aposta registrada ✓', 'ok');
}

function exportarApostas() {
  if (!apostas.length) { toast('Nenhuma aposta para exportar', 'err'); return; }
  const head = 'data;odd;valor;retorno;palpites';
  const linhas = apostas.map(a => {
    const av = avaliarAposta(a);
    const ret = av.ganhou ? (a.odd * a.valor).toFixed(2) : '';
    const picksTxt = a.picks.map(p => p.nome.replace(/[—–]/g, '-').replace(/;/g, ',')).join(' | ');
    return [a.criada.slice(0, 19).replace('T', ' '), a.odd, a.valor, ret, picksTxt].join(';');
  });
  const csv = '\uFEFF' + head + '\n' + linhas.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const aEl = document.createElement('a');
  aEl.href = url;
  aEl.download = 'apostas.csv';
  document.body.appendChild(aEl);
  aEl.click();
  aEl.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Apostas exportadas em CSV', 'ok');
}

function removerAposta(id) {
  apostas = apostas.filter(a => a.id !== id);
  salvarApostas();
  renderApostas();
}

// ---- Ferramentas da seção de jogos (busca, liga, ordenação) ----
const buscaEl = document.getElementById('busca');
const ligaEl = document.getElementById('filtro-liga');
const ordenaEl = document.getElementById('ordena');
if (buscaEl) {
  buscaEl.addEventListener('input', () => {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(() => { buscaTime = buscaEl.value.trim().toLowerCase(); renderJogos(); }, 120);
  });
  buscaEl.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { buscaEl.value = ''; buscaTime = ''; renderJogos(); }
  });
}
if (ligaEl) {
  ligaEl.addEventListener('click', ev => {
    const b = ev.target.closest('button[data-liga]');
    if (!b) return;
    buscaLiga = b.dataset.liga === '__all__' ? null : b.dataset.liga;
    renderFiltroLiga();
    renderJogos();
  });
}
if (ordenaEl) {
  ordenaEl.addEventListener('change', () => { ordena = ordenaEl.value; renderJogos(); });
}

// ---- Clique no nome do time filtra a busca ----
document.addEventListener('click', ev => {
  const b = ev.target.closest('.team-btn');
  if (!b) return;
  const t = b.dataset.team;
  const busca = document.getElementById('busca');
  if (busca) busca.value = t;
  buscaTime = t.toLowerCase();
  renderJogos();
  toast('Filtrando por ' + t, 'ok');
});

// ---- Atalhos de teclado ----
document.addEventListener('keydown', ev => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const tag = ev.target && ev.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (ev.key === '/') {
    ev.preventDefault();
    const b = document.getElementById('busca');
    if (b) { b.focus(); b.select(); }
    return;
  }
  const secoes = { '1': 'sec-taxas', '2': 'sec-combo', '3': 'sec-auto', '4': 'sec-jogos', '5': 'sec-apostas', '6': 'sec-vivo' };
  const sec = secoes[ev.key];
  if (sec) irPara(sec);
});

// ---- Atualização automática (seção finalizados) ----
let refreshTimer = null;
const autoEl = document.getElementById('auto-refresh');
if (autoEl) {
  autoEl.addEventListener('change', () => {
    if (autoEl.checked) {
      refreshTimer = setInterval(() => {
        const vivo = document.getElementById('sec-vivo');
        if (!vivo || vivo.hidden) return;
        recarregar();
      }, 10 * 60 * 1000);
      toast('Atualização automática a cada 10 min', 'ok');
    } else if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  });
}

fetch('analise.json')
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(d => {
    animarLoader();
    data = d;
    const q = d.jogos.length;
    const gerado = new Date(d.gerado_em).toLocaleString('pt-BR',
      { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    document.getElementById('sub').classList.remove('erro');
    document.getElementById('sub').textContent =
      'Gerado em ' + gerado + ' · ' + q + ' jogos · peso de chutes no alvo: ' + d.w_sot;
    document.getElementById('meta1').textContent = '· validação fora de amostra';
    fillHero(d);
    renderFiltro();
    renderFiltroLiga();
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
    animarLoader();
    const sub = document.getElementById('sub');
    sub.classList.add('erro');
    sub.textContent = 'Erro ao carregar analise.json: ' + e.message + ' (sirva a pasta via HTTP, ex.: python3 -m http.server)';
    fillHero(null);
    document.getElementById('stats').innerHTML = '';
    document.getElementById('jogos').innerHTML = '';
  });
