import {
  MODES,
  INGREDIENTS,
  SIDES,
  createPizza,
  rollDough,
  validRollSides,
  doughCount,
  makeHand,
  push,
  undo,
  resetGameBoard,
  boardsMatch,
  createCook,
  tickCook,
  tapCook,
  finishCook,
  scorePizza,
  clamp,
  shuffle,
} from './engine.js';

const TURN_MS = 75_000;
const RESULT_MS = 5_500;
const COOK_TICK_MS = 100;

export class GameError extends Error {}

function now() {
  return Date.now();
}

function cleanName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return name || 'Anonymous Chef';
}

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export class Room {
  constructor(code, { fast = false } = {}) {
    this.code = code;
    this.fast = fast;
    this.resultMs = fast ? 400 : RESULT_MS;
    this.cookDuration = fast ? 2 : 10;
    this.sauceDelay = fast ? 150 : 1_800;
    this.createdAt = now();
    this.players = new Map();
    this.hostId = null;
    this.phase = 'lobby';
    this.settings = {
      mode: 'party',
      size: 4,
      pizzas: 3,
      timeLimit: 300,
    };
    this.order = [];
    this.game = null;
    this.chat = [];
    this.chatSeq = 0;
    this.systemSeq = 0;
    this.turnDeadline = 0;
    this.resultUntil = 0;
    this.rushExpired = false;
    this.rushRemaining = null;
    this.lastTickBroadcast = 0;
    this.lastCookBroadcast = 0;
    this.timer = setInterval(() => this.tick(), 100);
    this.timer.unref?.();
  }

  // ---------------------------------------------------------------------
  // Players
  // ---------------------------------------------------------------------

  addPlayer(rawName, { spectator = false } = {}) {
    const name = cleanName(rawName);
    // Mid-game arrivals watch from the pass. Roles can be changed in the lobby.
    const midGame = this.phase !== 'lobby' && this.phase !== 'gameover';
    const player = {
      id: id('p'),
      name,
      spectator: midGame ? true : !!spectator,
      connected: true,
      joinedAt: now(),
      stats: { pushes: 0, rolls: 0, taps: 0, undos: 0 },
      lastChatAt: 0,
    };
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
    if (!player.spectator) this.order.push(player.id);
    if (this.phase === 'making' && !this.game?.turnPlayerId && !player.spectator) {
      this.beginTurn(player.id);
    }
    this.system(`${name} joined${player.spectator ? ' as a spectator' : ' the kitchen'}.`);
    return player;
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    const wasTurn = this.game?.turnPlayerId === playerId;
    this.players.delete(playerId);
    this.order = this.order.filter((p) => p !== playerId);
    if (this.hostId === playerId) this.transferHost();
    if (wasTurn && this.phase === 'making') this.nextTurn(playerId);
    this.system(`${player.name} left the party.`);
    if (!this.players.size) return;
  }

  setConnected(playerId, connected) {
    const player = this.players.get(playerId);
    if (!player) return;
    const wasConnected = player.connected;
    player.connected = connected;
    if (!connected && this.hostId === playerId) this.transferHost();
    if (!connected && this.phase === 'making' && this.game?.turnPlayerId === playerId) {
      this.nextTurn(playerId);
    }
    if (!connected && !wasConnected) return;
    this.broadcastState();
  }

  transferHost() {
    const candidates = [...this.players.values()].filter((p) => p.connected);
    const next = candidates.find((p) => !p.spectator) || candidates[0];
    if (next) {
      this.hostId = next.id;
      this.system(`${next.name} is now the host.`);
    } else {
      this.hostId = null;
    }
  }

  isHost(playerId) {
    return this.hostId === playerId;
  }

  requireHost(playerId) {
    if (!this.isHost(playerId)) throw new GameError('Only the host can do that.');
  }

  requirePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('You are not in this room.');
    return player;
  }

  setRole(playerId, spectator) {
    const player = this.requirePlayer(playerId);
    if (this.phase !== 'lobby') throw new GameError('Roles are locked once the game starts.');
    player.spectator = !!spectator;
    this.order = [...this.players.values()].filter((p) => !p.spectator).map((p) => p.id);
    this.broadcastState();
  }

  // ---------------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------------

  updateSettings(playerId, patch = {}) {
    this.requireHost(playerId);
    if (this.phase !== 'lobby') throw new GameError('Settings are locked once the game starts.');
    if (patch.mode !== undefined) {
      if (!MODES[patch.mode]) throw new GameError('Unknown game mode.');
      this.settings.mode = patch.mode;
    }
    if (patch.size !== undefined) {
      const size = Number(patch.size);
      if (!Number.isInteger(size) || size < 4 || size > 9) throw new GameError('Pizza size must be 4–9.');
      this.settings.size = size;
    }
    if (patch.pizzas !== undefined) {
      const pizzas = Number(patch.pizzas);
      if (!Number.isInteger(pizzas) || pizzas < 1 || pizzas > 8) throw new GameError('Choose between 1 and 8 pizzas.');
      this.settings.pizzas = pizzas;
    }
    if (patch.timeLimit !== undefined) {
      const t = Number(patch.timeLimit);
      if (!Number.isInteger(t) || t < 60 || t > 1800) throw new GameError('Time limit must be 1–30 minutes.');
      this.settings.timeLimit = t;
    }
    this.broadcastState();
  }

  start(playerId) {
    this.requireHost(playerId);
    if (this.phase !== 'lobby') throw new GameError('The game is already running.');
    const chefs = [...this.players.values()].filter((p) => !p.spectator && p.connected);
    if (!chefs.length) throw new GameError('You need at least one chef to start.');
    this.order = chefs.map((p) => p.id);
    for (const p of this.players.values()) p.stats = { pushes: 0, rolls: 0, taps: 0, undos: 0 };
    this.phase = 'making';
    this.game = {
      mode: this.settings.mode,
      size: this.settings.size,
      pizzaIndex: -1,
      totalPizzas: this.settings.mode === 'party' ? this.settings.pizzas : null,
      gameStartedAt: now(),
      totalScore: 0,
      pizzasCompleted: 0,
      results: [],
      rushExpired: false,
      pizza: null,
    };
    this.rushExpired = false;
    this.rushRemaining = this.settings.mode === 'rush' ? this.settings.timeLimit * 1000 : null;
    this.system(`The kitchen is open! ${MODES[this.settings.mode].name} — ${this.settings.size}×${this.settings.size} pizzas.`);
    this.nextPizza();
  }

  nextPizza() {
    if (!this.game) return;
    this.game.pizzaIndex += 1;
    const pizza = createPizza({
      mode: this.game.mode,
      size: this.game.size,
      pizzaIndex: this.game.pizzaIndex,
    });
    this.game.pizza = pizza;
    this.phase = 'making';
    this.resultUntil = 0;
    this.turnDeadline = 0;
    this.order = this.order.filter((pid) => this.players.has(pid));
    const first = this.firstConnectedChef();
    if (first) {
      this.beginTurn(first);
    } else {
      pizza.turnPlayerId = null;
      this.turnDeadline = 0;
    }
    this.system(
      this.game.mode === 'chefs'
        ? `Pizza ${this.game.pizzaIndex + 1} starts as a ball of dough. Roll it out, then create something delicious!`
        : `Pizza ${this.game.pizzaIndex + 1} starts as a ball of dough. Roll it out together!`,
    );
    this.broadcastState();
  }

  beginTurn(playerId) {
    if (!this.game?.pizza) return;
    const pizza = this.game.pizza;
    pizza.turnPlayerId = playerId;
    pizza.hand = pizza.stage === 'toppings' ? makeHand(pizza.mode, pizza.palette) : [];
    this.turnDeadline = now() + TURN_MS;
  }

  connectedChefs() {
    return this.order.filter((pid) => {
      const p = this.players.get(pid);
      return p && !p.spectator && p.connected;
    });
  }

  firstConnectedChef() {
    const chefs = this.connectedChefs();
    return chefs[0] || null;
  }

  nextTurn(afterPlayerId = this.game?.pizza?.turnPlayerId) {
    if (!this.game) return;
    const chefs = this.connectedChefs();
    if (!chefs.length) {
      this.game.pizza.turnPlayerId = null;
      this.turnDeadline = 0;
      this.broadcastState();
      return;
    }
    let i = chefs.indexOf(afterPlayerId);
    if (i === -1) i = -1;
    const next = chefs[(i + 1) % chefs.length];
    this.beginTurn(next);
    this.broadcastState();
  }

  // ---------------------------------------------------------------------
  // Making a pizza
  // ---------------------------------------------------------------------

  doPush(playerId, payload = {}) {
    const player = this.requirePlayer(playerId);
    if (player.spectator) throw new GameError('Spectators can watch, but not cook.');
    if (this.phase !== 'making' || !this.game?.pizza) throw new GameError('The kitchen is not taking pushes right now.');
    const pizza = this.game.pizza;
    if (pizza.turnPlayerId !== playerId) throw new GameError('Wait for your turn, chef.');
    if (this.game.mode === 'rush' && this.rushRemaining <= 0) throw new GameError('Time is up!');
    const res = push(pizza, {
      ingredient: payload.ingredient,
      side: payload.side,
      lane: Number(payload.lane),
      playerId,
    });
    if (!res.ok) throw new GameError(res.error);
    player.stats.pushes += 1;
    this.afterPush(player);
  }

  afterPush(player) {
    const pizza = this.game.pizza;
    if (pizza.mode !== 'chefs' && boardsMatch(pizza.board, pizza.target)) {
      this.completePizza();
      return;
    }
    this.nextTurn(player.id);
  }

  doRoll(playerId, payload = {}) {
    const player = this.requirePlayer(playerId);
    if (player.spectator) throw new GameError('Spectators can watch, but not roll.');
    if (this.phase !== 'making' || !this.game?.pizza) throw new GameError('The kitchen is not rolling dough right now.');
    const pizza = this.game.pizza;
    if (pizza.turnPlayerId !== playerId) throw new GameError('Wait for your turn, chef.');
    if (this.game.mode === 'rush' && this.rushRemaining <= 0) throw new GameError('Time is up!');
    const res = rollDough(pizza, { side: payload.side, playerId });
    if (!res.ok) throw new GameError(res.error);
    player.stats.rolls += 1;
    this.afterRoll(player, res);
  }

  afterRoll(player, res) {
    const pizza = this.game.pizza;
    if (res.complete) {
      this.applySauce(player);
      return;
    }
    this.nextTurn(player.id);
  }

  applySauce(player) {
    const pizza = this.game.pizza;
    pizza.stage = 'sauce';
    pizza.turnPlayerId = null;
    pizza.hand = [];
    pizza.sauceUntil = now() + this.sauceDelay;
    this.turnDeadline = 0;
    this.system(`${player.name} finished rolling the dough. Sauce time!`);
    this.broadcastState();
  }

  beginToppings() {
    const pizza = this.game?.pizza;
    if (!pizza || pizza.stage !== 'sauce') return;
    pizza.stage = 'toppings';
    pizza.sauceUntil = 0;
    this.system('Sauce applied. Now match the recipe, chefs!');
    const first = this.firstConnectedChef();
    if (first) this.beginTurn(first);
    else {
      pizza.turnPlayerId = null;
      this.turnDeadline = 0;
    }
    this.broadcastState();
  }

  autoTurn() {
    const stage = this.game?.pizza?.stage;
    if (stage === 'dough') this.autoRoll();
    else if (stage === 'toppings') this.autoPush();
  }

  autoRoll() {
    const pizza = this.game?.pizza;
    if (!pizza) return;
    const player = this.players.get(pizza.turnPlayerId);
    if (!player || !player.connected) {
      this.nextTurn();
      return;
    }
    const sides = validRollSides(pizza.dough, pizza.size);
    if (!sides.length) {
      this.applySauce(player);
      return;
    }
    const side = sides[Math.floor(Math.random() * sides.length)];
    const res = rollDough(pizza, { side, playerId: player.id });
    if (!res.ok) {
      this.nextTurn(player.id);
      return;
    }
    player.stats.rolls += 1;
    const sideName = { T: 'top', R: 'right', B: 'bottom', L: 'left' }[side];
    this.system(`${player.name}'s turn timed out — they rolled the dough toward the ${sideName}.`);
    this.afterRoll(player, res);
  }

  autoPush() {
    const pizza = this.game?.pizza;
    if (!pizza) return;
    const player = this.players.get(pizza.turnPlayerId);
    if (!player || !player.connected) {
      this.nextTurn();
      return;
    }
    const ingredient = pizza.hand[Math.floor(Math.random() * pizza.hand.length)];
    const side = SIDES[Math.floor(Math.random() * SIDES.length)];
    const lane = Math.floor(Math.random() * pizza.size);
    const res = push(pizza, { ingredient, side, lane, playerId: player.id });
    if (!res.ok) {
      this.nextTurn(player.id);
      return;
    }
    player.stats.pushes += 1;
    const ing = INGREDIENTS[ingredient];
    this.system(`${player.name}'s turn timed out — they shoved in ${ing.icon} ${ing.name}.`);
    this.afterPush(player);
  }

  doUndo(playerId) {
    const player = this.requirePlayer(playerId);
    if (player.spectator) throw new GameError('Only chefs can undo a push.');
    if (this.phase !== 'making' || !this.game?.pizza) throw new GameError('There is nothing to undo right now.');
    if (this.game.pizza.stage !== 'toppings') throw new GameError('You can only undo topping pushes.');
    const res = undo(this.game.pizza);
    if (!res.ok) throw new GameError(res.error);
    player.stats.undos += 1;
    this.turnDeadline = now() + TURN_MS;
    this.system(`${player.name} rewound the last push.`);
    this.broadcastState();
  }

  resetPizza(playerId) {
    this.requireHost(playerId);
    if (this.phase !== 'making' || !this.game?.pizza) throw new GameError('No pizza to reset.');
    resetGameBoard(this.game.pizza);
    this.turnDeadline = 0;
    const first = this.firstConnectedChef();
    if (first) this.beginTurn(first);
    this.system(`${this.players.get(playerId).name} scraped the pizza and started a fresh ball of dough.`);
    this.broadcastState();
  }

  bakeNow(playerId) {
    this.requireHost(playerId);
    if (this.game?.mode !== 'chefs') throw new GameError('This mode has a recipe — match it to bake!');
    if (this.phase !== 'making' || !this.game?.pizza) throw new GameError('No pizza to bake.');
    if (this.game.pizza.stage !== 'toppings') throw new GameError('Roll out the dough and sauce it first!');
    if (this.game.pizza.moves < 1) throw new GameError('Add at least one topping first!');
    this.completePizza();
  }

  completePizza() {
    const pizza = this.game.pizza;
    const elapsedMs = now() - pizza.startedAt;
    this.phase = 'cooking';
    this.turnDeadline = 0;
    this.cook = createCook(this.cookDuration);
    this.pendingResult = {
      elapsedMs,
      moves: pizza.moves,
      rolls: pizza.rolls,
      par: pizza.par,
      resets: pizza.resets,
      pizzaIndex: this.game.pizzaIndex,
      target: pizza.target,
      board: [...pizza.board],
      size: pizza.size,
      palette: pizza.palette,
    };
    this.system(
      this.game.mode === 'chefs'
        ? `Pizza ${this.game.pizzaIndex + 1} is sliding into the oven! Tap together to cook it evenly.`
        : `Recipe matched in ${pizza.moves} pushes! Into the oven it goes.`,
    );
    this.broadcastState();
  }

  tap(playerId) {
    const player = this.requirePlayer(playerId);
    if (player.spectator) return;
    if (this.phase !== 'cooking' || !this.cook || this.cook.finished) return;
    tapCook(this.cook, playerId);
    player.stats.taps += 1;
  }

  finishCooking() {
    if (this.phase !== 'cooking') return;
    const cook = this.cook;
    const cookResult = finishCook(cook);
    const pending = this.pendingResult;
    const score = scorePizza(
      {
        mode: this.game.mode,
        size: pending.size,
        moves: pending.moves,
        par: pending.par,
        resets: pending.resets,
      },
      { quality: cookResult.quality, elapsedMs: pending.elapsedMs },
    );
    const result = {
      ...cookResult,
      score,
      elapsedMs: pending.elapsedMs,
      moves: pending.moves,
      rolls: pending.rolls,
      turns: pending.moves + pending.rolls,
      par: pending.par,
      resets: pending.resets,
      pizzaIndex: pending.pizzaIndex,
      target: pending.target,
      board: pending.board,
      size: pending.size,
      palette: pending.palette,
      taps: { ...cook.taps },
      mode: this.game.mode,
    };
    this.game.totalScore += score;
    this.game.pizzasCompleted += 1;
    this.game.results.push(result);
    this.lastResult = result;
    this.phase = 'result';
    this.resultUntil = now() + this.resultMs;
    this.cook = null;
    this.system(
      `Pizza ${result.pizzaIndex + 1}: ${result.label} — ${result.quality}% quality, ${result.turns} turns, ${score} points.`,
    );
    this.broadcastState();
  }

  // ---------------------------------------------------------------------
  // Game lifecycle
  // ---------------------------------------------------------------------

  endGame(playerId, reason = 'host') {
    this.requireHost(playerId);
    if (this.phase === 'lobby' || this.phase === 'gameover') return;
    this.gameOver(reason);
  }

  gameOver(reason = 'completed') {
    if (!this.game) return;
    this.phase = 'gameover';
    this.turnDeadline = 0;
    this.resultUntil = 0;
    this.cook = null;
    this.rushExpired = false;
    const results = this.game.results;
    const totalMoves = results.reduce((n, r) => n + r.moves, 0);
    const totalRolls = results.reduce((n, r) => n + (r.rolls || 0), 0);
    const totalTime = results.reduce((n, r) => n + r.elapsedMs, 0);
    const best = results.reduce((a, r) => (!a || r.quality > a.quality ? r : a), null);
    const players = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      pushes: p.stats.pushes,
      rolls: p.stats.rolls,
      taps: p.stats.taps,
      undos: p.stats.undos,
    }));
    const mvp = players.reduce((a, p) => (!a || p.pushes * 2 + p.rolls + p.taps > a.pushes * 2 + a.rolls + a.taps ? p : a), null);
    this.summary = {
      reason,
      mode: this.game.mode,
      score: this.game.totalScore,
      pizzasCompleted: this.game.pizzasCompleted,
      totalPizzas: this.game.totalPizzas,
      results,
      totalMoves,
      totalRolls,
      totalTurns: totalMoves + totalRolls,
      totalTime,
      best,
      players,
      mvp,
      gameStartedAt: this.game.gameStartedAt,
      endedAt: now(),
    };
    this.system(
      reason === 'time'
        ? 'Time is up! The kitchen is closing.'
        : reason === 'host'
          ? 'The host closed the kitchen.'
          : 'Service complete! The kitchen is closing.',
    );
    this.broadcastState();
  }

  playAgain(playerId) {
    this.requireHost(playerId);
    if (this.phase !== 'gameover') throw new GameError('The game is still running.');
    this.phase = 'lobby';
    this.game = null;
    this.summary = null;
    this.lastResult = null;
    this.pendingResult = null;
    this.cook = null;
    this.order = [...this.players.values()].filter((p) => !p.spectator).map((p) => p.id);
    for (const p of this.players.values()) p.stats = { pushes: 0, rolls: 0, taps: 0, undos: 0 };
    this.system('Back to the lobby. Who is hungry for another round?');
    this.broadcastState();
  }

  // ---------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------

  system(text) {
    this.chatSeq += 1;
    const msg = {
      id: `m${this.chatSeq}`,
      system: true,
      name: 'Kitchen',
      text,
      at: now(),
    };
    this.chat.push(msg);
    if (this.chat.length > 120) this.chat.shift();
    this.broadcast({ t: 'chat', message: msg });
  }

  chatMessage(playerId, rawText) {
    const player = this.requirePlayer(playerId);
    const text = String(rawText ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!text) return;
    const t = now();
    if (t - player.lastChatAt < 400) throw new GameError('Easy there, chef — one message at a time.');
    player.lastChatAt = t;
    this.chatSeq += 1;
    const msg = {
      id: `m${this.chatSeq}`,
      playerId: player.id,
      name: player.name,
      text,
      at: t,
    };
    this.chat.push(msg);
    if (this.chat.length > 120) this.chat.shift();
    this.broadcast({ t: 'chat', message: msg });
  }

  // ---------------------------------------------------------------------
  // Tick loop
  // ---------------------------------------------------------------------

  tick() {
    const t = now();
    if (this.phase === 'cooking' && this.cook) {
      tickCook(this.cook, COOK_TICK_MS / 1000);
      if (t - this.lastCookBroadcast >= COOK_TICK_MS) {
        this.lastCookBroadcast = t;
        const c = this.cook;
        this.broadcast({
          t: 'cook',
          heat: Math.round(c.heat * 10) / 10,
          quality: Math.round(c.quality * 10) / 10,
          elapsed: Math.round(c.elapsed * 10) / 10,
          duration: c.duration,
          taps: { ...c.taps },
          finished: c.finished,
        });
      }
      if (this.cook.finished) {
        this.finishCooking();
        return;
      }
    }

    if (this.game && (this.phase === 'making' || this.phase === 'cooking' || this.phase === 'result')) {
      if (this.game.mode === 'rush' && !this.rushExpired) {
        this.rushRemaining = clamp(this.settings.timeLimit * 1000 - (t - this.game.gameStartedAt), 0, this.settings.timeLimit * 1000);
        if (this.rushRemaining <= 0) {
          if (this.phase === 'making') {
            this.gameOver('time');
            return;
          }
          if (this.phase === 'cooking' || this.phase === 'result') this.rushExpired = true;
        }
      }
      if (
        this.phase === 'making' &&
        this.game.pizza?.stage === 'sauce' &&
        this.game.pizza.sauceUntil &&
        t >= this.game.pizza.sauceUntil
      ) {
        this.beginToppings();
      }
      if (this.phase === 'making' && this.turnDeadline && t > this.turnDeadline) {
        this.autoTurn();
      }
      if (this.phase === 'result' && this.resultUntil && t > this.resultUntil) {
        this.advanceAfterResult();
        return;
      }
    }

    if (t - this.lastTickBroadcast >= 250) {
      this.lastTickBroadcast = t;
      const turnRemaining = this.phase === 'making' && this.turnDeadline ? Math.max(0, this.turnDeadline - t) : null;
      this.broadcast({
        t: 'tick',
        phase: this.phase,
        rushRemaining: this.game?.mode === 'rush' ? this.rushRemaining : null,
        turnRemaining,
      });
    }
  }

  advanceAfterResult() {
    if (!this.game) return;
    if (this.game.mode === 'rush' && (this.rushExpired || this.rushRemaining <= 0)) {
      this.gameOver('time');
      return;
    }
    if (this.game.mode === 'party' && this.game.pizzaIndex + 1 >= this.game.totalPizzas) {
      this.gameOver('completed');
      return;
    }
    this.nextPizza();
  }

  // ---------------------------------------------------------------------
  // Serialization / sending
  // ---------------------------------------------------------------------

  stateFor() {
    const players = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      spectator: p.spectator,
      connected: p.connected,
      isHost: p.id === this.hostId,
      pushes: p.stats.pushes,
      rolls: p.stats.rolls,
      taps: p.stats.taps,
    }));
    const g = this.game;
    const pizza = g?.pizza;
    return {
      code: this.code,
      phase: this.phase,
      serverNow: now(),
      hostId: this.hostId,
      settings: { ...this.settings },
      players,
      order: [...this.order],
      chat: this.chat.slice(-80),
      turnDeadline: this.phase === 'making' ? this.turnDeadline : 0,
      rushRemaining: g?.mode === 'rush' ? this.rushRemaining : null,
      game: g
        ? {
            mode: g.mode,
            size: g.size,
            pizzaIndex: g.pizzaIndex,
            totalPizzas: g.totalPizzas,
            totalScore: g.totalScore,
            pizzasCompleted: g.pizzasCompleted,
            gameStartedAt: g.gameStartedAt,
            pizza: pizza
              ? {
                  mode: pizza.mode,
                  size: pizza.size,
                  palette: pizza.palette,
                  target: pizza.target,
                  board: pizza.board,
                  stage: pizza.stage,
                  dough: pizza.dough,
                  doughCount: doughCount(pizza.dough),
                  rolls: pizza.rolls,
                  sauceUntil: pizza.sauceUntil,
                  hand: pizza.hand,
                  turnPlayerId: pizza.turnPlayerId,
                  moves: pizza.moves,
                  par: pizza.par,
                  style: pizza.style,
                  startedAt: pizza.startedAt,
                  lastMove: pizza.lastMove,
                  lastRoll: pizza.lastRoll,
                  resets: pizza.resets,
                  canUndo: pizza.stage === 'toppings' && pizza.history.length > 0,
                }
              : null,
            cook: this.cook
              ? {
                  heat: Math.round(this.cook.heat * 10) / 10,
                  quality: Math.round(this.cook.quality * 10) / 10,
                  elapsed: Math.round(this.cook.elapsed * 10) / 10,
                  duration: this.cook.duration,
                  taps: { ...this.cook.taps },
                  finished: this.cook.finished,
                }
              : null,
            result: this.phase === 'result' ? this.lastResult : null,
            summary: this.phase === 'gameover' ? this.summary : null,
          }
        : null,
    };
  }

  broadcast(msg) {
    for (const player of this.players.values()) {
      if (player.connected && player.send) {
        try {
          player.send(msg);
        } catch {
          /* socket is gone; close handler will clean up */
        }
      }
    }
  }

  broadcastState() {
    this.broadcast({ t: 'state', state: this.stateFor() });
  }

  destroy() {
    clearInterval(this.timer);
  }
}

export { TURN_MS };
