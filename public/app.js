(() => {
'use strict';
const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const r2 = x => Math.round(x * 100) / 100, num = n => String(+(+n).toFixed(2));
const BASES = [0.5, 1, 1.5, 2], ROLES = ['BAT', 'WK', 'AR', 'BOWL'];
const qs = new URLSearchParams(location.search);
const roomCode = (qs.get('room') || '').toUpperCase();
let hostTok = '', ownTok = '';
if (roomCode) {
  if (qs.get('host')) ls.set('ca_host_' + roomCode, qs.get('host'));
  hostTok = ls.get('ca_host_' + roomCode) || '';
  ownTok = ls.get('ca_tok_' + roomCode);
  if (!ownTok) { ownTok = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''); ls.set('ca_tok_' + roomCode, ownTok); }
}
let S = null, ws = null, connected = false, fatal = '', retry = 0, lastSeq = null, stamp = null;
const ui = { tab: 'auction', raise: 1, actTeam: null, nameDraft: ls.get('ca_name') || '' };
const fmt = n => '₹' + num(n) + (S && S.cfg.suffix ? ' ' + esc(S.cfg.suffix) : '');
const P = id => S.players.find(p => p.id === id), T = id => S.teams.find(t => t.id === id);
const shareUrl = () => location.origin + '/?room=' + roomCode;

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600); }
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Link copied'); } catch (e) { prompt('Copy this link', text); } }

// ---------- connection ----------
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); else toast('Offline. Reconnecting…'); }
function connect() {
  if (ws && ws.readyState <= 1) return;
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { connected = true; retry = 0; ws.send(JSON.stringify({ type: 'hello', room: roomCode, host: hostTok, token: ownTok })); render(); };
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.type === 'state') { S = m.state; onState(); render(); }
    else if (m.type === 'error') toast(m.msg);
    else if (m.type === 'fatal') { fatal = m.msg; render(); }
  };
  ws.onclose = () => { connected = false; render(); if (!fatal) setTimeout(connect, Math.min(5000, 400 * 2 ** retry++)); };
}
setInterval(() => { if (ws && ws.readyState === 1) ws.send('{"type":"ping"}'); }, 25000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && roomCode && !fatal) connect(); });

function onState() {
  const l = S.last;
  if (!l) { lastSeq = 0; return; }
  if (lastSeq === null) { lastSeq = l.seq; return; }
  if (l.seq !== lastSeq) { lastSeq = l.seq; stamp = { ...l, until: Date.now() + 2600 }; setTimeout(render, 2650); }
}

// ---------- room screens ----------
function head() {
  $('#conn').hidden = connected || !roomCode || !!fatal;
  const el = $('#prog');
  if (!roomCode) return el.textContent = '';
  if (!S) return el.textContent = 'Connecting…';
  if (S.phase === 'lobby') el.textContent = 'Lobby · ' + S.code;
  else if (S.phase === 'done') el.textContent = 'Final results';
  else if (S.roundEnd) el.textContent = `Round ${S.round} over · ${S.soldCount} sold`;
  else el.textContent = `${S.round > 1 ? 'Round ' + S.round + ' · ' : ''}Lot ${S.lotNo} of ${S.roundTotal} · ${S.soldCount} sold`;
}

function render() {
  head();
  if (!roomCode) return;
  const f = document.activeElement && document.activeElement.id;
  if (fatal) app.innerHTML = `<section class="card"><h2>${esc(fatal)}</h2><a class="btn" href="/">Back to start</a></section>`;
  else if (!S) app.innerHTML = '<p class="muted pad">Connecting to the room…</p>';
  else {
    const off = !S.you.isHost && !S.hostOnline && S.phase !== 'done' ? '<div class="banner">The host is offline. Bidding resumes when they return.</div>' : '';
    app.innerHTML = off + (S.phase === 'lobby' ? lobby() : S.phase === 'done' ? done() : auction());
  }
  if (f === 'nm' && $('#nm')) { const n = $('#nm'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
}

function teamRows() {
  const me = S.you;
  return S.teams.map(t => {
    let btn = '';
    if (me.isHost) btn = t.claimed ? `<button class="btn sec" data-a="release" data-id="${t.id}">Release</button>` : '';
    else if (!t.claimed && !me.teamId) btn = `<button class="btn" data-a="claim" data-id="${t.id}">Claim</button>`;
    else if (t.id === me.teamId) btn = '<span class="ok">You</span>';
    return `<div class="trow"><div><b>${esc(t.name)}</b><br><small>${t.claimed ? esc(t.owner) : 'Open. Host can bid for it.'}</small></div>${btn}</div>`;
  }).join('');
}
function claimBox() {
  return `<section class="card"><h3>Pick your team</h3><label>Your name<input id="nm" maxlength="20" autocomplete="nickname" value="${esc(ui.nameDraft)}"></label>${teamRows()}</section>`;
}
function lobby() {
  const me = S.you, c = S.cfg;
  let h = `<section class="card"><h2>Room ${esc(S.code)}</h2><p>Share this link so owners can join on their phones:</p>
    <input readonly value="${esc(shareUrl())}" aria-label="Share link" onclick="this.select()">
    <div class="row" style="margin-top:8px"><button class="btn" data-a="copy">Copy link</button>${navigator.share ? '<button class="btn sec" data-a="share">Share</button>' : ''}</div>
    <p class="muted">Purse ${fmt(c.purse)} · squad of ${c.squad} · bid step ${fmt(c.step)} · ${S.players.length} players</p></section>`;
  if (!me.isHost && !me.teamId) h += claimBox();
  else {
    h += `<section class="card"><h3>Teams</h3>${teamRows()}</section>`;
    if (!me.isHost) h += `<section class="card"><b>You are ${esc(T(me.teamId).name)}.</b> Waiting for the host to start bidding.</section>`;
  }
  if (me.isHost) h += `<p class="muted">Bookmark this page. Your host control stays with this browser and link.</p><button class="btn big acc" data-a="start">Start bidding</button>`;
  return h;
}

function why(t, amount) {
  const c = S.current;
  if (!connected) return 'Offline';
  if (c.leader === t.id) return 'Leading';
  if (t.slotsLeft <= 0) return 'Squad full';
  if (amount > t.maxBid) return 'Cannot afford';
  return '';
}
function controls() {
  const me = S.you, c = S.current, step = S.cfg.step;
  if (me.isHost && !T(ui.actTeam)) ui.actTeam = S.teams[0].id;
  const t = T(me.isHost ? ui.actTeam : me.teamId);
  let h = '';
  if (me.isHost) h += '<div class="paddles" role="group" aria-label="Bid for team">' + S.teams.map(x => {
    const r = x.id === c.leader ? 'Leading' : x.slotsLeft <= 0 ? 'Full' : 'max ' + num(x.maxBid);
    return `<button class="chip ${x.id === ui.actTeam ? 'on' : ''}" data-a="act" data-id="${x.id}">${esc(x.name)}<small>${r}</small></button>`;
  }).join('') + '</div>';
  if (t) {
    h += `<div class="tb"><b>${esc(t.name)}</b><span>Squad ${t.squad.length}/${S.cfg.squad}</span><span>Max bid ${fmt(t.maxBid)}</span><span>Left ${fmt(t.purse)}</span></div>`;
    const first = c.bids.length === 0, aff = k => r2(c.bid + k * step) <= t.maxBid;
    const k = first ? 1 : ([4, 2, 1].filter(x => x <= ui.raise).find(aff) || ui.raise);
    if (!first) h += '<div class="chips" role="group" aria-label="Raise by">' + [1, 2, 4].map(x =>
      `<button class="chip ${x === k ? 'on' : ''}" data-a="raise" data-k="${x}" ${aff(x) ? '' : 'disabled'}>+${num(x * step)}<small>${x}× step</small></button>`).join('') + '</div>';
    const amount = first ? c.bid : r2(c.bid + k * step), reason = why(t, amount);
    h += `<button class="btn big acc" data-a="bid" data-pid="${c.pid}" data-amt="${amount}" ${reason ? 'disabled' : ''}>${reason || 'Bid ' + fmt(amount)}</button>`;
  } else h += '<p class="muted">You are watching. Claim a team in the Squads tab if one is open.</p>';
  if (me.isHost) h += `<div class="row" style="margin-top:10px"><button class="btn acc" data-a="sold" ${c.leader ? '' : 'disabled'}>Sold</button><button class="btn sec" data-a="unsold">Unsold</button><button class="btn sec" data-a="undo" ${c.bids.length ? '' : 'disabled'}>Undo</button></div>`;
  return h;
}
function lastLine() {
  const l = S.last; if (!l) return '';
  const p = P(l.pid); return `<p class="muted">Last: ${esc(p.name)} ${l.type === 'sold' ? 'sold to ' + esc(T(l.team).name) + ' for ' + fmt(l.price) : 'went unsold'}.</p>`;
}
function tabAuction() {
  const me = S.you;
  if (S.roundEnd) {
    return `<section class="card"><h2>Round ${S.round} over</h2><p>${S.unsoldCount} player${S.unsoldCount === 1 ? '' : 's'} unsold.</p>
      ${me.isHost ? `<button class="btn big acc" data-a="reauction">Re-auction unsold (${S.unsoldCount})</button><button class="btn big sec" data-a="end">End auction</button>` : '<p class="muted">Waiting for the host.</p>'}</section>` + lastLine();
  }
  const c = S.current, p = P(c.pid), lead = c.leader ? T(c.leader) : null;
  const st = stamp && Date.now() < stamp.until ? `<div class="stamp ${stamp.type}">${stamp.type === 'sold' ? 'Sold' : 'Unsold'}<small>${esc(P(stamp.pid).name)}${stamp.type === 'sold' ? ' · ' + esc(T(stamp.team).name) + ' · ' + fmt(stamp.price) : ''}</small></div>` : '';
  const last4 = c.bids.slice(-4).reverse().map(b => `<li><span>${esc(T(b.team).name)}</span><b>${fmt(b.amount)}</b></li>`).join('') || '<li class="muted"><span>No bids yet</span></li>';
  return `<section class="card lot">${st}<div class="meta"><span class="role">${p.role}</span><span>Base ${fmt(p.base)}</span></div>
    <h2>${esc(p.name)}</h2><div class="big-num" aria-live="polite">${fmt(c.bid)}</div>
    <div class="lead">${lead ? 'Leading: ' + esc(lead.name) : 'Open at base price'}</div><ul class="bids">${last4}</ul></section>${controls()}${lastLine()}`;
}
function squads() {
  const pick = !S.you.isHost && !S.you.teamId && S.phase !== 'done' && S.teams.some(t => !t.claimed);
  return (pick ? claimBox() : '') + S.teams.map(t => `<section class="card"><h3>${esc(t.name)}${t.claimed ? ' <small>' + esc(t.owner) + '</small>' : ''}</h3>
    <small>Spent ${fmt(t.spent)} · Left ${fmt(t.purse)} · ${t.squad.length}/${S.cfg.squad} players</small>
    <ul class="sq">${t.squad.map(s => `<li><span>${esc(P(s.pid).name)} <span class="role">${P(s.pid).role}</span></span><b>${fmt(s.price)}</b></li>`).join('') || '<li class="muted"><span>No players yet</span></li>'}</ul></section>`).join('');
}
function logTab() { return `<section class="card log">${S.log.slice().reverse().map(l => `<div>${esc(l.text)}</div>`).join('')}</section>`; }
function auction() {
  const tabs = [['auction', 'Auction'], ['squads', 'Squads'], ['log', 'Log']];
  return `<div class="tabs" role="tablist">${tabs.map(([k, n]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" role="tab" aria-selected="${ui.tab === k}" data-a="tab" data-t="${k}">${n}</button>`).join('')}</div>` +
    (ui.tab === 'squads' ? squads() : ui.tab === 'log' ? logTab() : tabAuction());
}
function done() {
  let best = null;
  S.teams.forEach(t => t.squad.forEach(s => { if (!best || s.price > best.price) best = { ...s, team: t }; }));
  return `<section class="card"><h2>Auction complete</h2>${best ? `<div class="card best"><small>Biggest buy</small><h3>${esc(P(best.pid).name)}</h3><p>${esc(best.team.name)} paid <b>${fmt(best.price)}</b></p></div>` : '<p>No players were sold.</p>'}
    ${S.you.isHost ? '<button class="btn big acc" data-a="newAuction">Start a new auction</button>' : '<p class="muted">The host can start a new auction.</p>'}</section>` + squads();
}

// ---------- home + setup ----------
const cfg = { purse: 20, suffix: 'Cr', squad: 6, step: 0.5, shuffle: true, teams: ['Team A', 'Team B', 'Team C', 'Team D'] };
const pool = window.POOL;
function home() {
  app.innerHTML = `<section class="card hero"><h1>Cricket Auction Night</h1><p>Run a live IPL-style player auction with friends. No accounts. Share a link and everyone bids from their phone.</p><button class="btn big acc" data-a="setup">Host a new auction</button></section>
    <section class="card"><h3>Join with a code</h3><div class="row"><input id="jc" maxlength="5" placeholder="Room code" autocapitalize="characters" aria-label="Room code"><button class="btn" data-a="join">Join</button></div></section>`;
}
const selected = () => pool.filter(p => p.on);
function counts() {
  const s = selected(), need = cfg.teams.length * cfg.squad, by = r => s.filter(p => p.role === r).length;
  $('#counts').innerHTML = `${ROLES.map(r => r + ' ' + by(r)).join(' · ')} · <b class="${s.length >= need ? 'ok' : 'bad'}">${s.length} selected, need at least ${need}</b>`;
  $('#tcount').textContent = `(${cfg.teams.length})`;
}
function plist() {
  $('#plist').innerHTML = pool.map((p, i) => `<div class="prow"><label><input type="checkbox" data-pi="${i}" ${p.on ? 'checked' : ''}><span class="pn">${esc(p.name)}</span><span class="role">${p.role}</span></label>
    <select data-bi="${i}" aria-label="Base price for ${esc(p.name)}">${BASES.map(b => `<option ${b === p.base ? 'selected' : ''}>${b}</option>`).join('')}</select></div>`).join('');
}
function teamsHtml() { $('#teams').innerHTML = cfg.teams.map((n, i) => `<label>Team ${i + 1}<input data-ti="${i}" maxlength="24" value="${esc(n)}"></label>`).join(''); }
function setup() {
  app.innerHTML = `<section class="card"><h2>Set up the auction</h2><div class="grid2">
    <label>Purse per team<input id="purse" type="number" inputmode="decimal" min="1" step="0.5" value="${cfg.purse}"></label>
    <label>Suffix (optional)<input id="suffix" maxlength="4" placeholder="Cr or L" value="${esc(cfg.suffix)}"></label>
    <label>Squad size (3 to 15)<input id="squad" type="number" inputmode="numeric" min="3" max="15" value="${cfg.squad}"></label>
    <label>Bid step<input id="step" type="number" inputmode="decimal" min="0.1" step="0.1" value="${cfg.step}"></label></div>
    <label class="chk"><input id="shuffle" type="checkbox" ${cfg.shuffle ? 'checked' : ''}>Shuffle the order players come up</label></section>
    <section class="card"><h3>Teams <small id="tcount"></small></h3><div id="teams"></div>
    <div class="row" style="margin-top:10px"><button class="btn sec" data-a="tless">Remove team</button><button class="btn sec" data-a="tmore">Add team</button></div></section>
    <section class="card"><h3>Players</h3><div class="row wrap"><button class="btn sec" data-a="selall">Select all ${pool.length}</button><button class="btn sec" data-a="clear">Clear</button></div>
    <div class="row" style="margin-top:8px"><input id="rn" type="number" inputmode="numeric" min="1" value="30" aria-label="Random player count"><button class="btn sec" data-a="rand">Pick random</button></div>
    <p id="counts"></p>
    <label>Add your own players<textarea id="own" placeholder="One per line: Name, ROLE, base&#10;Example: Jane Doe, BAT, 1.5"></textarea></label>
    <button class="btn sec" style="margin-top:8px;width:100%" data-a="addown">Add players</button><div id="plist" class="plist"></div></section>
    <p id="serr" class="err" role="alert"></p><button class="btn big acc" id="create" data-a="create">Create room</button>`;
  teamsHtml(); plist(); counts();
}
function pickRandom(n) {
  const sh = a => a.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const by = ROLES.map(r => sh(pool.filter(p => p.role === r))), chosen = [];
  while (chosen.length < n && by.some(l => l.length)) for (const l of sh(by)) if (l.length && chosen.length < n) chosen.push(l.pop());
  pool.forEach(p => p.on = chosen.includes(p));
}
function addOwn() {
  let added = 0, bad = 0;
  $('#own').value.split('\n').forEach(line => {
    if (!line.trim()) return;
    const [name, role, base] = line.split(',').map(x => (x || '').trim());
    const R = (role || '').toUpperCase();
    if (!name || !ROLES.includes(R)) return bad++;
    const b = Number(base), nb = BASES.reduce((a, c) => Math.abs(c - b) < Math.abs(a - b) ? c : a);
    pool.push({ name: name.slice(0, 40), role: R, base: isFinite(b) && base !== '' ? nb : 1, on: true }); added++;
  });
  $('#own').value = ''; plist(); counts();
  toast(`${added} added${bad ? ', ' + bad + ' skipped (use Name, ROLE, base with ROLE = BAT, WK, AR or BOWL)' : ''}`);
  const l = $('#plist'); l.scrollTop = l.scrollHeight;
}
async function create() {
  const b = $('#create'); $('#serr').textContent = ''; b.disabled = true;
  try {
    const res = await fetch('/api/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cfg, players: selected().map(({ name, role, base }) => ({ name, role, base })) }) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'Could not create the room.');
    ls.set('ca_host_' + j.code, j.hostToken); location.href = `/?room=${j.code}&host=${j.hostToken}`;
  } catch (e) { $('#serr').textContent = e.message; b.disabled = false; }
}

// ---------- events ----------
const A = {
  setup, copy: () => copy(shareUrl()),
  share: () => navigator.share({ title: 'Cricket Auction Night', text: 'Join my cricket auction', url: shareUrl() }).catch(() => {}),
  join: () => { const c = ($('#jc').value || '').trim().toUpperCase(); if (c) location.href = '/?room=' + encodeURIComponent(c); },
  claim: el => { const name = (ui.nameDraft || '').trim(); if (!name) { toast('Type your name first'); const n = $('#nm'); if (n) n.focus(); return; } ls.set('ca_name', name); send({ type: 'claim', teamId: +el.dataset.id, name }); },
  release: el => send({ type: 'release', teamId: +el.dataset.id }),
  start: () => send({ type: 'start' }),
  tab: el => { ui.tab = el.dataset.t; render(); },
  raise: el => { ui.raise = +el.dataset.k; render(); },
  act: el => { ui.actTeam = +el.dataset.id; render(); },
  bid: el => send({ type: 'bid', pid: +el.dataset.pid, amount: +el.dataset.amt, teamId: ui.actTeam }),
  sold: () => send({ type: 'sold' }), unsold: () => send({ type: 'unsold' }), undo: () => send({ type: 'undo' }),
  reauction: () => send({ type: 'reauction' }),
  end: () => { if (confirm('End the auction now?')) send({ type: 'end' }); },
  newAuction: () => { if (confirm('Reset squads and purses for a new auction?')) send({ type: 'newAuction' }); },
  tless: () => { if (cfg.teams.length > 2) { cfg.teams.pop(); teamsHtml(); counts(); } },
  tmore: () => { if (cfg.teams.length < 10) { cfg.teams.push('Team ' + String.fromCharCode(65 + cfg.teams.length)); teamsHtml(); counts(); } },
  selall: () => { pool.forEach(p => p.on = true); plist(); counts(); },
  clear: () => { pool.forEach(p => p.on = false); plist(); counts(); },
  rand: () => { pickRandom(Math.max(1, parseInt($('#rn').value, 10) || 1)); plist(); counts(); },
  addown: addOwn, create
};
document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (el && !el.disabled && A[el.dataset.a]) A[el.dataset.a](el); });
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'nm') ui.nameDraft = el.value;
  else if (el.dataset.ti !== undefined) cfg.teams[+el.dataset.ti] = el.value;
  else if (el.id === 'purse' || el.id === 'step' || el.id === 'squad') { cfg[el.id] = Number(el.value); counts(); }
  else if (el.id === 'suffix') cfg.suffix = el.value;
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'shuffle') cfg.shuffle = el.checked;
  else if (el.dataset.pi !== undefined) { pool[+el.dataset.pi].on = el.checked; counts(); }
  else if (el.dataset.bi !== undefined) pool[+el.dataset.bi].base = Number(el.value);
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'jc') A.join(); });

if (roomCode) { render(); connect(); } else home();
})();
