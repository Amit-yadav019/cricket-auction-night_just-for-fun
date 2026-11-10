'use strict';
// Pure auction rules. No I/O, so it can be tested without a server.
const BASES = [0.5, 1, 1.5, 2], ROLES = ['BAT', 'WK', 'AR', 'BOWL'], RAISES = [1, 2, 4];
const r2 = x => Math.round(x * 100) / 100;
const normBase = b => { b = Number(b); if (!isFinite(b)) return 1; return BASES.reduce((a, c) => Math.abs(c - b) < Math.abs(a - b) ? c : a); };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clean = (s, n) => String(s == null ? '' : s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const P = (room, id) => room.players.find(p => p.id === id);
const T = (room, id) => room.teams.find(t => t.id === id);
function log(room, text) { room.log.push({ t: Date.now(), text }); if (room.log.length > 200) room.log.shift(); }
function maxBid(room, t) { const left = room.cfg.squad - t.squad.length; return left <= 0 ? 0 : r2(t.purse - (left - 1) * room.lowest); }

function createRoom(code, hostToken, input) {
  input = input || {};
  const purse = r2(Number(input.purse)), squad = parseInt(input.squad, 10), step = r2(Number(input.step));
  if (!(purse > 0 && purse <= 100000)) return { error: 'Purse must be a positive number.' };
  if (!(squad >= 3 && squad <= 15)) return { error: 'Squad size must be 3 to 15.' };
  if (!(step > 0 && step <= purse)) return { error: 'Bid step must be above 0 and no more than the purse.' };
  const names = (Array.isArray(input.teams) ? input.teams : []).map(n => clean(n, 24));
  if (names.length < 2 || names.length > 10 || names.some(n => !n)) return { error: 'Add 2 to 10 teams, each with a name.' };
  if (new Set(names.map(n => n.toLowerCase())).size !== names.length) return { error: 'Team names must be different.' };
  const players = (Array.isArray(input.players) ? input.players : []).slice(0, 300)
    .map(p => ({ name: clean(p && p.name, 40), role: String(p && p.role).toUpperCase(), base: normBase(p && p.base) }))
    .filter(p => p.name && ROLES.includes(p.role)).map((p, i) => ({ id: i + 1, name: p.name, role: p.role, base: p.base }));
  const need = names.length * squad;
  if (players.length < need) return { error: `Pick at least ${need} players (teams × squad size).` };
  const lowest = Math.min(...players.map(p => p.base));
  if (purse < squad * lowest) return { error: 'Purse is too small to fill a squad at the lowest base price.' };
  const room = {
    code, hostToken, createdAt: Date.now(), updatedAt: Date.now(),
    cfg: { purse, squad, step, suffix: clean(input.suffix, 4), shuffle: !!input.shuffle },
    lowest, players,
    teams: names.map((name, i) => ({ id: i + 1, name, purse, squad: [], ownerToken: null, ownerName: null })),
    phase: 'lobby', queue: [], unsold: [], current: null, roundEnd: false, round: 1, lotNo: 0, roundTotal: 0,
    last: null, seq: 0, log: []
  };
  log(room, 'Room created.');
  return { room };
}

function finish(room, why) { room.phase = 'done'; room.current = null; room.roundEnd = false; log(room, 'Auction over. ' + why); }
function advance(room) {
  room.current = null;
  if (room.teams.every(t => t.squad.length >= room.cfg.squad)) return finish(room, 'All squads are full.');
  if (room.queue.length) {
    const pid = room.queue.shift(); room.lotNo++;
    room.current = { pid, bid: P(room, pid).base, leader: null, bids: [] };
    return;
  }
  if (room.unsold.length) { room.roundEnd = true; log(room, `Round ${room.round} finished with ${room.unsold.length} unsold.`); return; }
  finish(room, 'No players left.');
}

function start(room) {
  if (room.phase !== 'lobby') return { error: 'Auction already started.' };
  const ids = room.players.map(p => p.id);
  room.queue = room.cfg.shuffle ? shuffle(ids) : ids;
  room.phase = 'auction'; room.round = 1; room.lotNo = 0; room.roundTotal = room.queue.length; room.unsold = [];
  log(room, 'Bidding started.'); advance(room); return { ok: true };
}

function placeBid(room, teamId, pid, amount) {
  const c = room.current;
  if (room.phase !== 'auction' || !c) return { error: 'No player is up for bidding.' };
  if (pid !== c.pid) return { error: 'That player is no longer up. Try again.' };
  const t = T(room, teamId); if (!t) return { error: 'Claim a team first.' };
  if (c.leader === t.id) return { error: 'You are already leading.' };
  if (t.squad.length >= room.cfg.squad) return { error: 'Your squad is full.' };
  amount = r2(Number(amount));
  const ok = c.bids.length === 0 ? amount === c.bid : RAISES.some(k => r2(c.bid + k * room.cfg.step) === amount);
  if (!ok) return { error: 'Someone bid first, try again.' };
  if (amount > maxBid(room, t)) return { error: 'You cannot afford that bid.' };
  c.bid = amount; c.leader = t.id; c.bids.push({ team: t.id, amount });
  return { ok: true };
}

function sell(room) {
  const c = room.current;
  if (room.phase !== 'auction' || !c) return { error: 'No player is up.' };
  if (!c.leader) return { error: 'No bids yet. Use Unsold instead.' };
  const t = T(room, c.leader), p = P(room, c.pid);
  t.purse = r2(t.purse - c.bid); t.squad.push({ pid: p.id, price: c.bid });
  room.last = { seq: ++room.seq, type: 'sold', pid: p.id, team: t.id, price: c.bid };
  log(room, `SOLD: ${p.name} to ${t.name} for ${c.bid}.`); advance(room); return { ok: true };
}
function markUnsold(room) {
  const c = room.current;
  if (room.phase !== 'auction' || !c) return { error: 'No player is up.' };
  const p = P(room, c.pid); room.unsold.push(p.id);
  room.last = { seq: ++room.seq, type: 'unsold', pid: p.id };
  log(room, `UNSOLD: ${p.name}.`); advance(room); return { ok: true };
}
function undo(room) {
  const c = room.current;
  if (room.phase !== 'auction' || !c) return { error: 'No player is up.' };
  if (!c.bids.length) return { error: 'No bids to undo.' };
  const gone = c.bids.pop(), prev = c.bids[c.bids.length - 1];
  c.leader = prev ? prev.team : null; c.bid = prev ? prev.amount : P(room, c.pid).base;
  log(room, `Undid ${T(room, gone.team).name}'s bid of ${gone.amount}.`); return { ok: true };
}
function reauction(room) {
  if (room.phase !== 'auction' || !room.roundEnd || !room.unsold.length) return { error: 'Nothing to re-auction.' };
  room.queue = room.unsold; room.unsold = []; room.round++; room.lotNo = 0; room.roundTotal = room.queue.length; room.roundEnd = false;
  log(room, `Round ${room.round}: re-auctioning ${room.queue.length} unsold players.`); advance(room); return { ok: true };
}
function endAuction(room) { if (room.phase === 'done') return { error: 'Already finished.' }; finish(room, 'Ended by host.'); return { ok: true }; }
function reset(room) {
  room.teams.forEach(t => { t.purse = room.cfg.purse; t.squad = []; });
  Object.assign(room, { phase: 'lobby', queue: [], unsold: [], current: null, roundEnd: false, round: 1, lotNo: 0, roundTotal: 0, last: null, log: [] });
  log(room, 'New auction. Squads and purses reset.'); return { ok: true };
}

function publicState(room, view) {
  return {
    code: room.code, phase: room.phase, cfg: room.cfg, lowest: room.lowest,
    players: room.players, current: room.current, roundEnd: room.roundEnd, round: room.round,
    lotNo: room.lotNo, roundTotal: room.roundTotal, unsoldCount: room.unsold.length,
    soldCount: room.teams.reduce((n, t) => n + t.squad.length, 0), last: room.last, log: room.log.slice(-80),
    teams: room.teams.map(t => ({
      id: t.id, name: t.name, owner: t.ownerName, claimed: !!t.ownerToken, purse: t.purse,
      spent: r2(room.cfg.purse - t.purse), squad: t.squad, slotsLeft: room.cfg.squad - t.squad.length, maxBid: maxBid(room, t)
    })),
    hostOnline: !!view.hostOnline, you: { isHost: !!view.isHost, teamId: view.teamId || null }
  };
}

module.exports = { BASES, ROLES, RAISES, r2, normBase, clean, createRoom, maxBid, start, placeBid, sell, markUnsold, undo, reauction, endAuction, reset, publicState, log };
