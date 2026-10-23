import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createPizzaServer } from '../server/index.js';
import { solveRecipe, boardsMatch, validRollSides } from '../server/engine.js';

class Client {
  constructor(ws) {
    this.ws = ws;
    this.queue = [];
    this.waiters = [];
    this.closed = false;
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      this.queue.push(msg);
      this.flush();
    });
    ws.on('close', () => { this.closed = true; });
  }

  static async connect(port) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    return new Client(ws);
  }

  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }

  flush() {
    for (let i = 0; i < this.waiters.length; i++) {
      const waiter = this.waiters[i];
      const idx = this.queue.findIndex(waiter.predicate);
      if (idx !== -1) {
        const [msg] = this.queue.splice(idx, 1);
        this.waiters.splice(i, 1);
        i--;
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      }
    }
  }

  waitFor(predicate, timeout = 6000) {
    return new Promise((resolve, reject) => {
      const idx = this.queue.findIndex(predicate);
      if (idx !== -1) {
        const [msg] = this.queue.splice(idx, 1);
        resolve(msg);
        return;
      }
      const waiter = { predicate, resolve, reject };
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error('Timed out waiting for message'));
      }, timeout);
      this.waiters.push(waiter);
    });
  }

  waitState(predicate, timeout = 6000) {
    return this.waitFor((m) => m.t === 'state' && (!predicate || predicate(m.state)), timeout).then((m) => m.state);
  }

  close() {
    this.ws.close();
  }
}

async function setup() {
  const app = createPizzaServer({ port: 0, fast: true });
  const addr = await app.listen();
  return { app, port: addr.port };
}

async function createAndJoin(port, { mode = 'party', size = 4, pizzas = 1 } = {}) {
  const host = await Client.connect(port);
  host.send({ t: 'create', name: 'Ana' });
  const hostWelcome = await host.waitFor((m) => m.t === 'welcome');
  host.playerId = hostWelcome.playerId;
  const lobby = await host.waitState((s) => s.phase === 'lobby');
  const guest = await Client.connect(port);
  guest.send({ t: 'join', code: lobby.code, name: 'Ben' });
  const guestWelcome = await guest.waitFor((m) => m.t === 'welcome');
  guest.playerId = guestWelcome.playerId;
  await host.waitState((s) => s.players.length === 2);
  host.send({ t: 'settings', settings: { mode, size, pizzas, timeLimit: 120 } });
  await host.waitState((s) => s.settings.mode === mode && s.settings.size === size);
  return { host, guest, code: lobby.code, hostWelcome, guestWelcome };
}

function findCard(state, ingredient) {
  const pizza = state.game.pizza;
  assert.ok(pizza.hand.includes(ingredient), `hand ${pizza.hand} should contain ${ingredient}`);
}

async function rollOutDough(host, guest, initial = null) {
  let state = initial || await host.waitState((s) => s.phase === 'making' && s.game.pizza);
  let guard = 0;
  while (state.phase === 'making' && state.game.pizza.stage !== 'toppings' && guard++ < 200) {
    const pizza = state.game.pizza;
    if (pizza.stage === 'sauce') {
      state = await host.waitState((s) => s.phase === 'cooking' || s.game.pizza.stage === 'toppings');
      continue;
    }
    const sides = validRollSides(pizza.dough, pizza.size);
    assert.ok(sides.length > 0, 'dough should still have a valid roll');
    const client = pizza.turnPlayerId === host.playerId ? host : guest;
    const rollsBefore = pizza.rolls;
    client.send({ t: 'roll', side: sides[0] });
    state = await host.waitState(
      (s) => s.phase === 'cooking' ||
        (s.game.pizza.stage === 'dough' && s.game.pizza.rolls > rollsBefore) ||
        s.game.pizza.stage === 'sauce',
    );
  }
  return state;
}

async function playRecipe(host, guest, initial = null, { onMove } = {}) {
  let state = initial || await host.waitState((s) => s.phase === 'making');
  if (state.game.pizza.stage !== 'toppings') {
    state = await rollOutDough(host, guest, state);
  }
  const solution = solveRecipe(state.game.pizza.target, state.game.pizza.size);
  for (const move of solution) {
    if (state.phase === 'cooking') break;
    const pizza = state.game.pizza;
    const turnId = pizza.turnPlayerId;
    const client = turnId === host.playerId ? host : guest;
    findCard(state, move.ingredient);
    const movesBefore = pizza.moves;
    client.send({ t: 'push', ingredient: move.ingredient, side: move.side, lane: move.lane });
    if (onMove) onMove(move, state);
    state = await host.waitState(
      (s) =>
        s.phase === 'cooking' ||
        (s.phase === 'making' && s.game.pizza.moves === movesBefore + 1),
    );
  }
  return state;
}

async function tapFor(seconds, ...clients) {
  const until = Date.now() + seconds * 1000;
  let i = 0;
  while (Date.now() < until) {
    // About two taps a second is the sweet spot: enough to hold the heat,
    // not enough to incinerate the crust.
    clients[i++ % clients.length].send({ t: 'tap' });
    await new Promise((r) => setTimeout(r, 400));
  }
}

test('lobby creation, join, chat, spectator and invalid code', async (t) => {
  const { app, port } = await setup();
  t.after(() => app.close());
  const host = await Client.connect(port);
  host.send({ t: 'create', name: 'Ana' });
  const welcome = await host.waitFor((m) => m.t === 'welcome');
  const state = await host.waitState((s) => s.phase === 'lobby');
  assert.match(state.code, /^\d{6}$/);
  assert.equal(state.players.length, 1);
  assert.equal(state.players[0].isHost, true);

  const watcher = await Client.connect(port);
  watcher.send({ t: 'join', code: state.code, name: 'Watcher', spectator: true });
  await watcher.waitFor((m) => m.t === 'welcome');
  const joined = await host.waitState((s) => s.players.length === 2);
  assert.equal(joined.players.find((p) => p.name === 'Watcher').spectator, true);

  watcher.send({ t: 'chat', text: 'Hello chefs!' });
  const chat = await host.waitFor((m) => m.t === 'chat' && m.message.text === 'Hello chefs!');
  assert.equal(chat.message.name, 'Watcher');

  // With every human watching, there is nobody to cook.
  host.send({ t: 'setRole', spectator: true });
  await host.waitState((s) => s.players.every((p) => p.spectator));
  host.send({ t: 'start' });
  const err = await host.waitFor((m) => m.t === 'error');
  assert.match(err.message, /at least one chef/i);
  host.send({ t: 'setRole', spectator: false });
  await host.waitState((s) => s.players.some((p) => !p.spectator));

  const bad = await Client.connect(port);
  bad.send({ t: 'join', code: '000000', name: 'Lost' });
  const badErr = await bad.waitFor((m) => m.t === 'error');
  assert.match(badErr.message, /No kitchen/i);

  host.close();
  watcher.close();
  bad.close();
});

test('the round starts with dough, then sauce, then toppings', async (t) => {
  const { app, port } = await setup();
  t.after(() => app.close());
  const { host, guest } = await createAndJoin(port, { pizzas: 1 });
  host.send({ t: 'start' });
  const started = await host.waitState((s) => s.phase === 'making' && s.game.pizza);
  assert.equal(started.game.pizza.stage, 'dough');
  assert.equal(started.game.pizza.hand.length, 0);
  assert.ok(started.game.pizza.doughCount < started.game.pizza.size * started.game.pizza.size);

  // Only the player whose turn it is may roll.
  const wrongClient = started.game.pizza.turnPlayerId === host.playerId ? guest : host;
  wrongClient.send({ t: 'roll', side: 'L' });
  const err = await wrongClient.waitFor((m) => m.t === 'error');
  assert.match(err.message, /turn/i);

  const topped = await rollOutDough(host, guest, started);
  assert.equal(topped.game.pizza.stage, 'toppings');
  assert.equal(topped.game.pizza.hand.length, 4);
  assert.equal(topped.game.pizza.doughCount, topped.game.pizza.size * topped.game.pizza.size);
  assert.ok(topped.game.pizza.rolls > 0);

  host.close();
  guest.close();
});

test('a full co-op pizza can be solved, cooked and scored', async (t) => {
  const { app, port } = await setup();
  t.after(() => app.close());
  const { host, guest } = await createAndJoin(port, { pizzas: 1 });
  host.send({ t: 'start' });
  const started = await host.waitState((s) => s.phase === 'making' && s.game.pizza);
  assert.equal(started.game.pizza.target.length, 16);
  assert.equal(started.game.pizza.turnPlayerId, host.playerId);

  const solved = await playRecipe(host, guest, started);
  assert.equal(solved.phase, 'cooking');
  assert.ok(boardsMatch(solved.game.pizza.board, solved.game.pizza.target));
  assert.equal(solved.game.pizza.moves, solved.game.pizza.par);

  await tapFor(2.2, host, guest);
  const result = await host.waitState((s) => s.phase === 'result', 7000);
  assert.ok(result.game.result.quality > 20, `quality ${result.game.result.quality}`);
  assert.ok(result.game.result.score > 0);
  assert.equal(result.game.pizzasCompleted, 1);

  const over = await host.waitState((s) => s.phase === 'gameover', 5000);
  assert.equal(over.game.summary.pizzasCompleted, 1);
  assert.ok(over.game.summary.score > 0);
  assert.equal(over.game.summary.mvp.pushes > 0, true);

  host.close();
  guest.close();
});

test('undo works and spectators cannot push', async (t) => {
  const { app, port } = await setup();
  t.after(() => app.close());
  const { host, guest, code } = await createAndJoin(port, { pizzas: 1 });
  const spectator = await Client.connect(port);
  spectator.send({ t: 'join', code, name: 'Peanut Gallery', spectator: true });
  await spectator.waitFor((m) => m.t === 'welcome');
  await host.waitState((s) => s.players.length === 3);

  host.send({ t: 'start' });
  const started = await rollOutDough(host, guest, await host.waitState((s) => s.phase === 'making'));
  assert.equal(started.game.pizza.stage, 'toppings');
  const before = [...started.game.pizza.board];
  const hand = started.game.pizza.hand;
  const ingredient = hand.find((i) => i !== 'cheese');
  host.send({ t: 'push', ingredient, side: 'L', lane: 0 });
  const after = await host.waitState((s) => s.game.pizza.moves === 1);
  assert.notDeepEqual(after.game.pizza.board, before);

  spectator.send({ t: 'push', ingredient: 'cheese', side: 'L', lane: 0 });
  const err = await spectator.waitFor((m) => m.t === 'error');
  assert.match(err.message, /Spectators/i);

  host.send({ t: 'undo' });
  const undone = await host.waitState((s) => s.game.pizza.moves === 0);
  assert.deepEqual(undone.game.pizza.board, before);
  assert.equal(undone.game.pizza.turnPlayerId, host.playerId);

  host.close();
  guest.close();
  spectator.close();
});

test("Chef's Special bakes a freeform pizza on demand", async (t) => {
  const { app, port } = await setup();
  t.after(() => app.close());
  const { host, guest } = await createAndJoin(port, { mode: 'chefs', pizzas: 1 });
  host.send({ t: 'start' });
  const started = await rollOutDough(host, guest, await host.waitState((s) => s.phase === 'making'));
  assert.equal(started.game.pizza.target, null);
  assert.equal(started.game.pizza.stage, 'toppings');
  const hand = started.game.pizza.hand;
  host.send({ t: 'push', ingredient: hand[0], side: 'T', lane: 1 });
  await host.waitState((s) => s.game.pizza.moves === 1);

  // Only the host can call for the oven.
  guest.send({ t: 'bakeNow' });
  const err = await guest.waitFor((m) => m.t === 'error');
  assert.match(err.message, /host/i);

  host.send({ t: 'bakeNow' });
  const cooking = await host.waitState((s) => s.phase === 'cooking');
  assert.equal(cooking.game.pizza.target, null);
  await tapFor(2.2, host, guest);
  const result = await host.waitState((s) => s.phase === 'result', 7000);
  assert.equal(result.game.result.target, null);
  assert.ok(result.game.result.board.includes(hand[0]));

  host.close();
  guest.close();
});

test('host controls settings and the next pizza starts after a result', async (t) => {
  const { app, port } = await setup();
  t.after(() => app.close());
  const { host, guest } = await createAndJoin(port, { pizzas: 2 });
  // Guest cannot change settings.
  guest.send({ t: 'settings', settings: { size: 8 } });
  const err = await guest.waitFor((m) => m.t === 'error');
  assert.match(err.message, /host/i);

  // The host can pick the largest pizza in the brief.
  host.send({ t: 'settings', settings: { size: 9 } });
  const big = await host.waitState((s) => s.settings.size === 9);
  assert.equal(big.settings.size, 9);
  host.send({ t: 'settings', settings: { size: 4 } });
  await host.waitState((s) => s.settings.size === 4);

  host.send({ t: 'start' });
  const started = await host.waitState((s) => s.phase === 'making');
  let solved = await playRecipe(host, guest, started);
  assert.equal(solved.phase, 'cooking');
  await tapFor(2.2, host, guest);
  const result = await host.waitState((s) => s.phase === 'result', 7000);
  assert.equal(result.game.pizzaIndex, 0);
  const next = await host.waitState((s) => s.phase === 'making' && s.game.pizzaIndex === 1, 5000);
  assert.equal(next.game.pizzaIndex, 1);
  assert.equal(next.game.pizzasCompleted, 1);

  solved = await playRecipe(host, guest, next);
  await tapFor(2.2, host, guest);
  await host.waitState((s) => s.phase === 'result', 7000);
  const over = await host.waitState((s) => s.phase === 'gameover', 5000);
  assert.equal(over.game.summary.pizzasCompleted, 2);
  assert.equal(over.game.summary.results.length, 2);

  host.send({ t: 'playAgain' });
  const lobby = await host.waitState((s) => s.phase === 'lobby');
  assert.equal(lobby.players.length, 2);
  assert.equal(lobby.game, null);

  host.close();
  guest.close();
});

test('resume restores a disconnected chef seat', async (t) => {
  const { app, port } = await setup();
  t.after(() => app.close());
  const { host, guest, code, guestWelcome } = await createAndJoin(port, { pizzas: 1 });
  guest.close();
  const disconnected = await host.waitState((s) => s.players.find((p) => p.id === guestWelcome.playerId)?.connected === false);
  assert.ok(disconnected);

  const resumed = await Client.connect(port);
  resumed.send({ t: 'resume', code, token: guestWelcome.token });
  const welcome = await resumed.waitFor((m) => m.t === 'welcome');
  assert.equal(welcome.playerId, guestWelcome.playerId);
  const state = await resumed.waitState((s) => s.players.find((p) => p.id === guestWelcome.playerId)?.connected === true);
  assert.ok(state);
  host.close();
  resumed.close();
});
