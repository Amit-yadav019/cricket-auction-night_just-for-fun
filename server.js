'use strict';
const express = require('express'), http = require('http'), path = require('path'), fs = require('fs'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const L = require('./logic');

const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_FILE || path.join(__dirname, 'data', 'rooms.json');
const TTL = 72 * 3600e3, MAX_ROOMS = 300;
const rooms = new Map();

// ---- persistence: in-memory is the truth, JSON file is a backup ----
function load() {
  try { for (const r of JSON.parse(fs.readFileSync(DATA, 'utf8'))) if (Date.now() - r.updatedAt < TTL) rooms.set(r.code, r); } catch (e) { /* first run */ }
}
function saveNow() {
  try { fs.mkdirSync(path.dirname(DATA), { recursive: true }); const tmp = DATA + '.tmp'; fs.writeFileSync(tmp, JSON.stringify([...rooms.values()])); fs.renameSync(tmp, DATA); }
  catch (e) { console.error('Backup failed:', e.message); }
}
let timer = null;
const saveSoon = () => { if (!timer) timer = setTimeout(() => { timer = null; saveNow(); }, 400); };
setInterval(() => { for (const [c, r] of rooms) if (Date.now() - r.updatedAt > TTL) rooms.delete(c); saveSoon(); }, 3600e3).unref();
load();

// ---- http ----
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (q, r) => r.send('ok'));

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', hits = new Map();
const newCode = () => { for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += ALPHA[crypto.randomInt(ALPHA.length)]; if (!rooms.has(c)) return c; } };

app.post('/api/create', (req, res) => {
  const now = Date.now(), h = (hits.get(req.ip) || []).filter(t => now - t < 3600e3);
  if (h.length >= 20) return res.status(429).json({ error: 'Too many rooms from this network. Try again later.' });
  if (rooms.size >= MAX_ROOMS) return res.status(503).json({ error: 'Server is full. Try again later.' });
  const code = newCode(), hostToken = crypto.randomBytes(16).toString('hex');
  const out = L.createRoom(code, hostToken, req.body);
  if (out.error) return res.status(400).json({ error: out.error });
  h.push(now); hits.set(req.ip, h);
  rooms.set(code, out.room); saveSoon();
  res.json({ code, hostToken });
});

// ---- websocket ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 4096 });
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const safeEq = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };

function broadcast(code) {
  const room = rooms.get(code); if (!room) return;
  const members = [...wss.clients].filter(c => c.meta && c.meta.code === code);
  const hostOnline = members.some(c => c.meta.isHost && c.readyState === 1);
  for (const c of members) {
    const team = c.meta.token && room.teams.find(t => t.ownerToken === c.meta.token);
    send(c, { type: 'state', state: L.publicState(room, { isHost: c.meta.isHost, teamId: team && team.id, hostOnline }) });
  }
}

function act(room, meta, m) {
  const mine = meta.token && room.teams.find(t => t.ownerToken === meta.token);
  if (m.type === 'claim') {
    if (room.phase === 'done') return 'The auction is over.';
    const t = room.teams.find(x => x.id === Number(m.teamId)); if (!t) return 'Unknown team.';
    if (!meta.token) return 'Reload the page and try again.';
    if (mine && mine !== t) return 'You already have a team.';
    if (t.ownerToken && t.ownerToken !== meta.token) return 'That team was just taken.';
    const name = L.clean(m.name, 20); if (!name) return 'Type your name first.';
    t.ownerToken = meta.token; t.ownerName = name; L.log(room, `${name} claimed ${t.name}.`); return null;
  }
  if (m.type === 'bid') {
    const teamId = meta.isHost ? Number(m.teamId) : mine && mine.id;
    const r = L.placeBid(room, teamId, Number(m.pid), m.amount); return r.error || null;
  }
  if (!meta.isHost) return 'Only the host can do that.';
  const hostActs = { start: L.start, sold: L.sell, unsold: L.markUnsold, undo: L.undo, reauction: L.reauction, end: L.endAuction, newAuction: L.reset };
  if (hostActs[m.type]) return hostActs[m.type](room).error || null;
  if (m.type === 'release') {
    const t = room.teams.find(x => x.id === Number(m.teamId)); if (!t || !t.ownerToken) return null;
    L.log(room, `Host released ${t.name} (${t.ownerName}).`); t.ownerToken = null; t.ownerName = null; return null;
  }
  return null;
}

wss.on('connection', ws => {
  ws.meta = null; ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('error', () => {});
  ws.on('close', () => { if (ws.meta) broadcast(ws.meta.code); });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.type === 'ping') return send(ws, { type: 'pong' });
    if (m.type === 'hello') {
      const room = rooms.get(String(m.room || '').toUpperCase());
      if (!room) return send(ws, { type: 'fatal', msg: 'Room not found. It may have expired or the server restarted.' });
      ws.meta = { code: room.code, isHost: !!m.host && safeEq(m.host, room.hostToken), token: String(m.token || '').slice(0, 64) };
      return broadcast(room.code);
    }
    if (!ws.meta) return;
    const room = rooms.get(ws.meta.code); if (!room) return;
    const err = act(room, ws.meta, m);
    if (err) return send(ws, { type: 'error', msg: err });
    room.updatedAt = Date.now(); saveSoon(); broadcast(room.code);
  });
});
// keep idle connections alive through proxies, drop dead ones
setInterval(() => wss.clients.forEach(ws => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); }), 30000).unref();

const bye = () => { saveNow(); process.exit(0); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
server.listen(PORT, () => console.log(`Cricket Auction Night on http://localhost:${PORT}`));
