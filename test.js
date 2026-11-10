'use strict';
const assert = require('assert'), L = require('./logic');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const players = [];
for (let i = 1; i <= 10; i++) players.push({ name: 'P' + i, role: ['BAT', 'WK', 'AR', 'BOWL'][i % 4], base: [0.5, 1, 1.5, 2][i % 4] });
const mk = (o = {}) => { const r = L.createRoom('ABCDE', 'h', Object.assign({ purse: 20, squad: 3, step: 0.5, teams: ['A', 'B'], players }, o)); assert(r.room, r.error); return r.room; };
const live = o => { const r = mk(o); L.start(r); return r; };

t('base price normalises to 0.5/1/1.5/2 only', () => {
  assert.deepStrictEqual([0.5, 0.7, 0.8, 1.25, 1.6, 3, 0, 'x', 2].map(L.normBase), [0.5, 0.5, 1, 1, 1.5, 2, 0.5, 1, 2]);
  const r = mk({ players: players.map(p => ({ ...p, base: 7.3 })) }); assert(r.players.every(p => p.base === 2));
});
t('setup validation', () => {
  assert(L.createRoom('X', 'h', { purse: 20, squad: 3, step: .5, teams: ['A', 'B'], players: players.slice(0, 5) }).error);
  assert(L.createRoom('X', 'h', { purse: 20, squad: 2, step: .5, teams: ['A', 'B'], players }).error);
  assert(L.createRoom('X', 'h', { purse: 20, squad: 3, step: .5, teams: ['A'], players }).error);
  assert(L.createRoom('X', 'h', { purse: 20, squad: 3, step: .5, teams: ['A', 'a'], players }).error);
  assert(L.createRoom('X', 'h', { purse: 1, squad: 3, step: .5, teams: ['A', 'B'], players: players.map(p => ({ ...p, base: 2 })) }).error);
});
t('maxBid = purse - (slotsLeft-1) x lowest base', () => {
  const r = mk({ squad: 6, players: [...players, ...players] }); const a = r.teams[0];
  assert.strictEqual(r.lowest, 0.5); assert.strictEqual(L.maxBid(r, a), 17.5);
  a.purse = 17; a.squad.push({ pid: 1, price: 3 }); assert.strictEqual(L.maxBid(r, a), 15);
  a.squad = [1, 2, 3, 4, 5, 6]; assert.strictEqual(L.maxBid(r, a), 0);
});
t('first bid must equal base; raises are 1x/2x/4x only', () => {
  const r = live(), c = r.current, base = c.bid;
  assert(L.placeBid(r, 1, c.pid, base + 0.5).error);
  assert(L.placeBid(r, 1, c.pid, base).ok);
  assert(L.placeBid(r, 2, c.pid, base + 1.5).error);   // 3x not allowed
  assert(L.placeBid(r, 2, c.pid, base).error);          // not higher
  assert(L.placeBid(r, 2, c.pid, base + 2).ok);         // 4x
  assert(L.placeBid(r, 1, c.pid, base + 3).ok);         // 2x of 2.. current is base+2, +1
  assert.strictEqual(c.bid, base + 3); assert.strictEqual(c.leader, 1);
});
t('leader cannot bid again; stale player rejected', () => {
  const r = live(), c = r.current; L.placeBid(r, 1, c.pid, c.bid);
  assert(/leading/.test(L.placeBid(r, 1, c.pid, c.bid + 0.5).error));
  assert(L.placeBid(r, 2, c.pid + 99, c.bid + 0.5).error);
});
t('simultaneous bids: first received wins, second told to retry', () => {
  const r = live(), c = r.current; L.placeBid(r, 1, c.pid, c.bid);
  const seen = c.bid;                                   // both owners saw this price
  assert(L.placeBid(r, 2, c.pid, seen + 0.5).ok);       // first to arrive wins
  const late = L.placeBid(r, 1, c.pid, seen + 0.5);     // same amount, now stale
  assert(/first/.test(late.error)); assert.strictEqual(c.leader, 2);
});
t('cannot afford keeps lowest base per empty slot', () => {
  const r = live(); const a = r.teams[0], c = r.current; a.purse = 2; // 3 slots left, lowest 0.5 => max 1.0
  assert.strictEqual(L.maxBid(r, a), 1);
  c.bid = 1.5; c.leader = null; c.bids = [{ team: 2, amount: 1.5 }]; c.leader = 2;
  assert(/afford/.test(L.placeBid(r, 1, c.pid, 2).error));
});
t('squad full cannot bid', () => {
  const r = live(); r.teams[0].squad = [{}, {}, {}]; assert(/full/.test(L.placeBid(r, 1, r.current.pid, r.current.bid).error));
});
t('undo restores previous leader and price', () => {
  const r = live(), c = r.current, base = c.bid;
  assert(L.undo(r).error);
  L.placeBid(r, 1, c.pid, base); L.placeBid(r, 2, c.pid, base + 1);
  L.undo(r); assert.strictEqual(c.leader, 1); assert.strictEqual(c.bid, base);
  L.undo(r); assert.strictEqual(c.leader, null); assert.strictEqual(c.bid, base);
});
t('sold: pays price, fills squad, next lot opens', () => {
  const r = live(), c = r.current, first = c.pid; assert(L.sell(r).error);
  L.placeBid(r, 1, c.pid, c.bid); const price = r.current.bid;
  assert(L.sell(r).ok); const a = r.teams[0];
  assert.strictEqual(a.purse, 20 - price); assert.deepStrictEqual(a.squad, [{ pid: first, price }]);
  assert.notStrictEqual(r.current.pid, first); assert.strictEqual(r.last.type, 'sold');
});
t('unsold, round end, re-auction, then finish', () => {
  const r = live({ squad: 3 }); let guard = 0;
  while (r.current && guard++ < 50) L.markUnsold(r);
  assert(r.roundEnd && r.phase === 'auction' && r.unsold.length === 10);
  assert(L.reauction(r).ok); assert.strictEqual(r.round, 2); assert.strictEqual(r.lotNo, 1);
  assert(r.current && r.queue.length === 9 && r.unsold.length === 0);
  L.endAuction(r); assert.strictEqual(r.phase, 'done');
});
t('ends when all squads are full', () => {
  const r = live({ purse: 100, squad: 3, players: [...players, ...players] });
  for (let i = 0; i < 6; i++) { L.placeBid(r, i % 2 + 1, r.current.pid, r.current.bid); L.sell(r); }
  assert.strictEqual(r.phase, 'done'); assert.strictEqual(r.current, null);
});
t('full team is skipped; remaining team can still fill and auction ends', () => {
  const r = live({ purse: 100, squad: 3 });
  for (let i = 0; i < 3; i++) { L.placeBid(r, 1, r.current.pid, r.current.bid); L.sell(r); }
  assert(/full/.test(L.placeBid(r, 1, r.current.pid, r.current.bid).error));
  for (let i = 0; i < 3; i++) { L.placeBid(r, 2, r.current.pid, r.current.bid); L.sell(r); }
  assert.strictEqual(r.phase, 'done');
});
t('reset clears squads, keeps claims', () => {
  const r = live(); r.teams[0].ownerToken = 'tok'; L.placeBid(r, 1, r.current.pid, r.current.bid); L.sell(r); L.reset(r);
  assert.strictEqual(r.phase, 'lobby'); assert.strictEqual(r.teams[0].purse, 20); assert.strictEqual(r.teams[0].ownerToken, 'tok');
});
t('public state hides tokens', () => {
  const r = mk(); r.teams[0].ownerToken = 'secret'; const s = JSON.stringify(L.publicState(r, {}));
  assert(!s.includes('secret') && !s.includes('"h"') && !s.includes('hostToken'));
});
console.log(`\n${n} test groups passed`);
