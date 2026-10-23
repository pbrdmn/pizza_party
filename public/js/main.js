import { PizzaScene } from './scene.js';

const INGREDIENTS = {
  cheese: { name: 'Mozzarella', icon: '🧀' },
  pepperoni: { name: 'Pepperoni', icon: '🍖' },
  tomato: { name: 'Tomato', icon: '🍅' },
  basil: { name: 'Basil', icon: '🥬' },
  olive: { name: 'Olive', icon: '🫒' },
  mushroom: { name: 'Mushroom', icon: '🍄' },
  pineapple: { name: 'Pineapple', icon: '🍍' },
  onion: { name: 'Onion', icon: '🧅' },
};
const MODE_NAMES = { party: 'Pizza Party', rush: 'Rush Hour', chefs: "Chef's Special" };
const ACCENT_IDS = ['pepperoni', 'tomato', 'basil', 'olive', 'mushroom', 'pineapple', 'onion'];
const SIDE_ARROWS = { T: '↓', B: '↑', L: '→', R: '←' };
const SIDE_NAMES = { T: 'top', B: 'bottom', L: 'left', R: 'right' };
const AVATAR_COLORS = ['#d8492b', '#e8892c', '#67a84a', '#4a8ab5', '#8a6bb8', '#c05b8c', '#b58b32', '#3f8f83'];

const $ = (id) => document.getElementById(id);
const app = {
  ws: null,
  connected: false,
  playerId: null,
  token: null,
  code: null,
  state: null,
  screen: 'landing',
  selectedIndex: null,
  hints: true,
  scene: null,
  pizzaKey: null,
  pushSize: null,
  pushStage: null,
  recipeOpen: null,
  chatOpen: false,
  unread: 0,
  chatInitialized: false,
  chatIds: new Set(),
  serverOffset: 0,
  stateAt: 0,
  resultEndsAt: 0,
  gameoverKey: null,
  autoResuming: false,
  reconnectTimer: null,
  intentionalClose: false,
  lastMoveTimer: null,
  lastPhase: null,
  cookPizzaKey: null,
  modalResolve: null,
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function boot() {
  const savedName = storageGet('pizza.name');
  if (savedName) $('name-input').value = savedName;
  const params = new URLSearchParams(location.search);
  const code = (params.get('code') || '').replace(/\D/g, '').slice(0, 6);
  if (code) $('code-input').value = code;
  if (params.get('watch') === '1') $('spectator-join').checked = true;
  if (params.has('debug')) window.__pizza = app;

  bindEvents();
  connect();
  window.addEventListener('resize', () => requestAnimationFrame(positionPushControls));
  setInterval(updateLiveTimers, 200);
  setInterval(() => {
    if (app.ws && app.ws.readyState === WebSocket.OPEN) app.ws.send(JSON.stringify({ t: 'ping' }));
  }, 25000);
}

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  app.ws = ws;
  ws.addEventListener('open', () => {
    app.connected = true;
    const resume = getResume();
    if (resume) {
      app.autoResuming = true;
      send({ t: 'resume', code: resume.code, token: resume.token });
    }
  });
  ws.addEventListener('message', (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    handleMessage(msg);
  });
  ws.addEventListener('close', () => {
    app.connected = false;
    if (app.intentionalClose) return;
    if (app.state) toast('Connection lost — trying to get back to the kitchen…', 'error');
    clearTimeout(app.reconnectTimer);
    app.reconnectTimer = setTimeout(connect, 1800);
  });
  ws.addEventListener('error', () => {});
}

function send(msg) {
  if (!app.ws || app.ws.readyState !== WebSocket.OPEN) {
    toast('Still connecting to the kitchen…', 'error');
    return false;
  }
  app.ws.send(JSON.stringify(msg));
  return true;
}

function handleMessage(msg) {
  if (msg.t === 'welcome') {
    const previousCode = app.code;
    app.playerId = msg.playerId;
    app.token = msg.token;
    app.code = msg.code;
    app.autoResuming = false;
    storageSet('pizza.resume', JSON.stringify({ code: msg.code, token: msg.token }));
    if (previousCode !== msg.code) {
      clearChat();
      app.chatInitialized = false;
      app.pizzaKey = null;
      app.pushSize = null;
      app.pushStage = null;
      app.gameoverKey = null;
    }
    return;
  }
  if (msg.t === 'state') {
    onState(msg.state);
    return;
  }
  if (msg.t === 'chat') {
    appendChat(msg.message, true);
    return;
  }
  if (msg.t === 'cook') {
    updateCookUI(msg);
    return;
  }
  if (msg.t === 'tick') {
    if (app.state) {
      if (msg.turnRemaining !== null && msg.turnRemaining !== undefined) app.turnRemaining = msg.turnRemaining;
      if (msg.rushRemaining !== null && msg.rushRemaining !== undefined) app.rushRemaining = msg.rushRemaining;
    }
    return;
  }
  if (msg.t === 'error') {
    if (app.autoResuming) {
      app.autoResuming = false;
      storageRemove('pizza.resume');
      return;
    }
    toast(msg.message, 'error');
    return;
  }
  if (msg.t === 'pong') return;
}

function onState(state) {
  const prev = app.state;
  const prevPhase = prev?.phase;
  app.lastPhase = prevPhase;
  app.state = state;
  app.stateAt = Date.now();
  app.serverOffset = Date.now() - (state.serverNow || Date.now());
  app.rushRemaining = state.rushRemaining;
  app.turnRemaining = state.turnDeadline ? Math.max(0, state.turnDeadline - serverNow()) : null;

  if (state.phase === 'lobby') {
    setScreen('lobby');
    hideAllOverlays();
    renderLobby();
  } else {
    setScreen('game');
    renderGame(prev);
  }
  renderChatFromState(state);
  updateChatVisibility();
}

// ---------------------------------------------------------------------------
// Screen / lobby
// ---------------------------------------------------------------------------
function setScreen(name) {
  if (app.screen === name) return;
  app.screen = name;
  for (const s of ['landing', 'lobby', 'game']) {
    $(`screen-${s}`).classList.toggle('hidden', s !== name);
  }
  $('chat-root').classList.toggle('hidden', name === 'landing');
  if (name === 'game') {
    ensureScene();
    requestAnimationFrame(() => app.scene?.resize());
  }
}

function ensureScene() {
  if (app.scene) return;
  app.scene = new PizzaScene($('scene-canvas'));
  app.scene.setHints(app.hints);
  app.scene.onCameraChange = positionPushControls;
  requestAnimationFrame(() => app.scene.resize());
}

function renderLobby() {
  const state = app.state;
  if (!state) return;
  $('lobby-code').textContent = state.code;
  $('game-code').textContent = state.code;
  $('lobby-mode-chip').textContent = MODE_NAMES[state.settings.mode] || 'Pizza Party';
  const host = state.hostId === app.playerId;
  $('host-badge').classList.toggle('hidden', !host);

  const me = state.players.find((p) => p.id === app.playerId);
  const spectator = !!me?.spectator;
  $('role-toggle').checked = spectator;
  $('role-title').textContent = spectator ? "You're watching" : "You're cooking";
  $('role-sub').textContent = spectator ? 'Sit back, heckle politely, and chat.' : "You'll take turns rolling dough and pushing toppings.";
  $('role-toggle').disabled = state.phase !== 'lobby';

  const chefs = state.players.filter((p) => !p.spectator).length;
  const watching = state.players.length - chefs;
  $('player-count').textContent = `${chefs} chef${chefs === 1 ? '' : 's'}${watching ? ` • ${watching} watching` : ''}`;
  renderPlayerList(state);
  renderSettings(state, host);
}

function renderPlayerList(state) {
  const list = $('player-list');
  list.innerHTML = '';
  for (const p of state.players) {
    const row = document.createElement('div');
    row.className = `player-row${p.id === app.playerId ? ' you' : ''}`;
    const av = document.createElement('div');
    av.className = 'avatar';
    av.style.background = avatarColor(p.name);
    av.textContent = initials(p.name);
    const info = document.createElement('div');
    info.className = 'player-info';
    const name = document.createElement('div');
    name.className = 'player-name';
    name.textContent = p.name;
    if (p.isHost) {
      const crown = document.createElement('span');
      crown.className = 'crown';
      crown.textContent = '♛';
      name.appendChild(crown);
    }
    const sub = document.createElement('div');
    sub.className = 'player-sub';
    sub.textContent = p.id === app.playerId ? 'You' : p.isHost ? 'Hosting the kitchen' : 'Ready to cook';
    info.append(name, sub);
    const tags = document.createElement('div');
    tags.className = 'player-tags';
    if (p.spectator) {
      const t = document.createElement('span');
      t.className = 'tag spectator';
      t.textContent = 'watching';
      tags.appendChild(t);
    } else {
      const t = document.createElement('span');
      t.className = 'tag chef';
      t.textContent = 'chef';
      tags.appendChild(t);
    }
    if (!p.connected) {
      const t = document.createElement('span');
      t.className = 'tag offline';
      t.textContent = 'away';
      tags.appendChild(t);
    }
    row.append(av, info, tags);
    list.appendChild(row);
  }
}

function renderSettings(state, host) {
  const s = state.settings;
  $('settings-owner').textContent = host ? 'Only the host can change the recipe.' : 'The host is picking the menu.';
  document.querySelectorAll('.mode-card').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === s.mode);
    btn.disabled = !host;
  });
  document.querySelectorAll('#size-segmented button').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.size) === s.size);
    btn.disabled = !host;
  });
  document.querySelectorAll('#time-segmented button').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.time) === s.timeLimit);
    btn.disabled = !host;
  });
  $('pizzas-value').textContent = s.pizzas;
  document.querySelectorAll('#pizzas-stepper button').forEach((btn) => { btn.disabled = !host; });
  $('pizzas-group').classList.toggle('hidden', s.mode !== 'party');
  $('time-group').classList.toggle('hidden', s.mode !== 'rush');
  $('chefs-note').classList.toggle('hidden', s.mode !== 'chefs');
  const sizeHints = {
    4: 'A quick, snackable puzzle.',
    5: 'A little room to stretch.',
    6: 'A proper family pie.',
    7: 'The big table order.',
    8: 'Feeding the whole street.',
    9: 'The legendary banquet pie.',
  };
  $('size-hint').textContent = sizeHints[s.size] || '';
  const chefs = state.players.filter((p) => !p.spectator).length;
  const modeLine = s.mode === 'party'
    ? `${s.pizzas} pizza${s.pizzas === 1 ? '' : 's'}`
    : s.mode === 'rush'
      ? `${Math.round(s.timeLimit / 60)} minute rush`
      : 'freeform baking';
  $('start-summary').textContent = `${modeLine} • ${s.size}×${s.size} • ${chefs} chef${chefs === 1 ? '' : 's'}`;
  const startBtn = $('start-btn');
  startBtn.disabled = !host || chefs < 1;
  startBtn.innerHTML = host ? 'Start the kitchen <span>→</span>' : 'Waiting for the host…';
  const hint = $('start-hint');
  if (!host) hint.textContent = 'The host will open the kitchen when everyone is ready.';
  else if (chefs < 1) hint.textContent = 'At least one chef needs to be ready.';
  else hint.textContent = 'Everyone ready? The oven is hot.';
}

// ---------------------------------------------------------------------------
// Game rendering
// ---------------------------------------------------------------------------
function renderGame(prev) {
  const state = app.state;
  if (!state || !state.game) return;
  const game = state.game;
  const pizza = game.pizza;
  const phase = state.phase;
  const me = state.players.find((p) => p.id === app.playerId);
  const spectator = !!me?.spectator;
  const isHost = state.hostId === app.playerId;
  const stage = pizza?.stage || 'toppings';
  const canAct = stage === 'dough' || stage === 'toppings';
  const yourTurn = !!pizza && pizza.turnPlayerId === app.playerId && !spectator && phase === 'making' && canAct;
  if (!yourTurn || stage !== 'toppings') app.selectedIndex = null;

  $('game-code').textContent = state.code;
  const stageLabel = stage === 'dough' ? ' • Rolling dough' : stage === 'sauce' ? ' • Saucing' : '';
  $('pizza-progress-label').textContent = game.mode === 'party'
    ? `Pizza ${Math.min(game.pizzaIndex + 1, game.totalPizzas)} of ${game.totalPizzas}${stageLabel}`
    : game.mode === 'rush'
      ? `Pizza ${game.pizzaIndex + 1} • Rush Hour${stageLabel}`
      : `Pizza ${game.pizzaIndex + 1} • Chef's Special${stageLabel}`;
  const progress = game.mode === 'party'
    ? Math.min(100, ((game.pizzaIndex + (phase === 'making' ? 0 : 1)) / game.totalPizzas) * 100)
    : game.mode === 'rush'
      ? Math.max(0, Math.min(100, (app.rushRemaining / (state.settings.timeLimit * 1000)) * 100))
      : Math.min(100, ((game.pizzaIndex + 1) / 8) * 100);
  $('pizza-progress-bar').style.width = `${progress}%`;

  renderRecipePanel(state, pizza, phase, stage);
  applyRecipePanel();
  renderTurnBanner(state, pizza, phase, spectator, stage);
  renderHand(state, pizza, phase, spectator, yourTurn, stage);
  buildPushControls(pizza?.size || state.settings.size, stage);
  updateRollButtons(pizza);
  updatePushControls(yourTurn, phase, stage);
  renderActions(state, pizza, phase, spectator, isHost, stage);

  if (pizza && phase === 'making' && stage === 'toppings' && pizza.lastMove) {
    const ing = INGREDIENTS[pizza.lastMove.ingredient] || { name: pizza.lastMove.ingredient, icon: '•' };
    const who = state.players.find((p) => p.id === pizza.lastMove.playerId);
    showLastMove(`${who?.name || 'A chef'} pushed ${ing.icon} ${ing.name} from the ${SIDE_NAMES[pizza.lastMove.side]} into ${pizza.lastMove.side === 'T' || pizza.lastMove.side === 'B' ? 'column' : 'row'} ${pizza.lastMove.lane + 1}`);
  } else if (phase !== 'making' || stage !== 'toppings') {
    hideLastMove();
  }

  const scene = app.scene;
  if (scene && pizza) {
    const key = `${game.pizzaIndex}:${pizza.startedAt}`;
    const newPizza = key !== app.pizzaKey;
    if (newPizza) {
      app.pizzaKey = key;
      scene.resetPizza();
      app.selectedIndex = null;
      hideAllOverlays();
      scene.updateBoard(pizza.board, pizza.target, null, true);
    } else if (phase === 'making') {
      scene.updateBoard(pizza.board, pizza.target, pizza.lastMove);
    }
    scene.setStage(stage, pizza.dough);
    scene.setHints(app.hints);
    $('hint-toggle').style.opacity = app.hints ? '1' : '0.45';
    if (phase === 'cooking' && prev?.phase !== 'cooking') {
      scene.slideToOven();
      showCooking(state);
    }
  }

  if (phase === 'cooking') {
    if (!$('cooking-overlay').classList.contains('hidden')) {
      updateCookUI(state.game.cook || {});
    }
  } else if (phase === 'result') {
    showResult(state);
  } else if (phase === 'gameover') {
    showGameover(state);
  } else if (phase === 'making') {
    hideCooking();
    hideResult();
    hideGameover();
  }

  positionPushControls();
  requestAnimationFrame(positionPushControls);
}

function applyRecipePanel() {
  const panel = $('recipe-panel');
  const toggle = $('recipe-toggle');
  if (!panel || !toggle) return;
  if (app.recipeOpen === null) app.recipeOpen = window.innerWidth > 720;
  panel.classList.toggle('collapsed', !app.recipeOpen);
  toggle.textContent = app.recipeOpen ? '▴' : '▾';
  toggle.setAttribute('aria-expanded', String(!!app.recipeOpen));
}

function renderRecipePanel(state, pizza, phase, stage = 'toppings') {
  const game = state.game;
  const mode = game.mode;
  const size = pizza?.size || state.settings.size;
  const target = pizza?.target;
  const board = pizza?.board;
  const targetGrid = $('target-grid');
  const remaining = $('remaining-list');
  const title = $('recipe-title');
  targetGrid.style.setProperty('--n', size);
  targetGrid.style.display = '';

  if (stage === 'dough' || stage === 'sauce') {
    const dough = pizza?.dough || [];
    const covered = pizza?.doughCount ?? dough.filter(Boolean).length;
    title.textContent = stage === 'sauce' ? 'Sauce time!' : 'Roll out the dough';
    targetGrid.innerHTML = '';
    targetGrid.style.setProperty('--n', size);
    for (let i = 0; i < size * size; i++) {
      const cell = document.createElement('div');
      cell.className = `target-cell ${dough[i] ? (stage === 'sauce' ? 'sauce' : 'dough') : 'empty'}`;
      targetGrid.appendChild(cell);
    }
    remaining.innerHTML = '';
    const chip = document.createElement('span');
    chip.className = 'remaining-chip';
    chip.textContent = stage === 'sauce'
      ? '🍅 Spreading the sauce…'
      : `🫓 Dough ${covered}/${size * size}`;
    remaining.appendChild(chip);
    $('target-ghost-label').textContent = stage === 'sauce' ? 'next up: the toppings' : 'roll from any edge';
    $('target-ghost-label').style.display = '';
    $('push-label').textContent = 'Rolls';
    $('push-count').textContent = pizza?.rolls ?? 0;
    $('par-count').textContent = '–';
    $('pizza-time').textContent = formatClock(pizza ? serverNow() - pizza.startedAt : 0);
    return;
  }

  if (mode === 'chefs') {
    title.textContent = "Chef's Special";
    targetGrid.innerHTML = '';
    const palette = pizza?.palette || [];
    const icons = palette.slice(0, 6);
    targetGrid.style.setProperty('--n', 3);
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'target-cell accent';
      const ing = INGREDIENTS[icons[i % Math.max(1, icons.length)]];
      cell.textContent = ing ? ing.icon : '🍕';
      cell.style.opacity = i < icons.length * 2 ? '1' : '0.3';
      targetGrid.appendChild(cell);
    }
    remaining.innerHTML = '';
    for (const ing of palette) {
      const chip = document.createElement('span');
      chip.className = 'remaining-chip';
      chip.innerHTML = `<span>${INGREDIENTS[ing]?.icon || '•'}</span> ${INGREDIENTS[ing]?.name || ing}`;
      remaining.appendChild(chip);
    }
    $('target-ghost-label').textContent = 'freeform — bake when ready';
    $('par-count').textContent = '–';
  } else {
    title.textContent = recipeTitle(pizza?.palette || []);
    targetGrid.innerHTML = '';
    if (target) {
      for (let i = 0; i < target.length; i++) {
        const t = target[i];
        const b = board?.[i];
        const cell = document.createElement('div');
        cell.className = 'target-cell';
        const ing = INGREDIENTS[t];
        if (t === 'cheese') {
          cell.classList.add('cheese');
          const span = document.createElement('span');
          span.textContent = ing?.icon || '🧀';
          cell.appendChild(span);
        } else {
          cell.classList.add('accent');
          cell.textContent = ing?.icon || '•';
          if (b === t) cell.classList.add('done');
          else if (b && b !== 'cheese') cell.classList.add('wrong');
        }
        targetGrid.appendChild(cell);
      }
    }
    const counts = {};
    if (target && board) {
      for (let i = 0; i < target.length; i++) {
        if (target[i] !== 'cheese' && board[i] !== target[i]) counts[target[i]] = (counts[target[i]] || 0) + 1;
      }
    }
    remaining.innerHTML = '';
    const keys = Object.keys(counts);
    if (!keys.length) {
      const chip = document.createElement('span');
      chip.className = 'remaining-chip all-done';
      chip.textContent = '✓ Recipe matched!';
      remaining.appendChild(chip);
    } else {
      for (const k of keys) {
        const chip = document.createElement('span');
        chip.className = 'remaining-chip';
        chip.innerHTML = `<span>${INGREDIENTS[k]?.icon || '•'}</span> ${INGREDIENTS[k]?.name || k} ×${counts[k]}`;
        remaining.appendChild(chip);
      }
    }
    $('target-ghost-label').textContent = 'ghost toppings show the target';
    $('par-count').textContent = pizza?.par ?? '–';
  }
  $('push-label').textContent = 'Pushes';
  $('push-count').textContent = pizza?.moves ?? 0;
  $('pizza-time').textContent = formatClock(pizza ? serverNow() - pizza.startedAt : 0);
  $('target-ghost-label').style.display = mode === 'chefs' ? 'none' : '';
}

function recipeTitle(palette) {
  if (palette.includes('pineapple')) return 'Hawaiian Dream';
  if (palette.includes('basil') && palette.includes('tomato')) return 'Garden Party';
  if (palette.includes('pepperoni') && palette.includes('olive')) return 'Meat Lovers';
  if (palette.includes('mushroom')) return 'Forest Floor';
  if (palette.includes('onion')) return 'Onion Situation';
  return 'The Works';
}

function renderTurnBanner(state, pizza, phase, spectator, stage = 'toppings') {
  const banner = $('turn-banner');
  const nameEl = $('turn-name');
  const subEl = $('turn-sub');
  const clock = $('turn-clock');
  banner.classList.remove('your-turn');
  clock.textContent = '';
  clock.classList.remove('urgent');
  if (phase === 'making' && stage === 'sauce') {
    nameEl.textContent = 'Sauce time!';
    subEl.textContent = 'The sauce is going on — get ready for toppings.';
    return;
  }
  if (phase === 'cooking') {
    nameEl.textContent = 'Into the oven!';
    subEl.textContent = spectator ? 'The chefs are tapping together.' : 'Tap together and keep it even.';
    return;
  }
  if (phase === 'result') {
    nameEl.textContent = 'Pizza complete!';
    subEl.textContent = 'Next one is coming up.';
    return;
  }
  if (phase === 'gameover') {
    nameEl.textContent = 'Kitchen closed';
    subEl.textContent = 'Time to eat.';
    return;
  }
  const current = pizza?.turnPlayerId ? state.players.find((p) => p.id === pizza.turnPlayerId) : null;
  if (!current) {
    nameEl.textContent = 'Waiting for the kitchen…';
    subEl.textContent = 'The next chef is getting ready.';
    return;
  }
  if (current.id === app.playerId && !spectator) {
    banner.classList.add('your-turn');
    nameEl.textContent = 'Your turn, chef!';
    subEl.textContent = stage === 'dough'
      ? 'Pick an edge and roll the dough toward it.'
      : app.selectedIndex === null ? 'Pick an ingredient card below.' : 'Push it in from any edge.';
  } else {
    nameEl.textContent = `${current.name}'s turn`;
    subEl.textContent = spectator
      ? 'You are watching this one — say hi in chat.'
      : stage === 'dough' ? 'Watch them roll out the dough.' : 'Watch their move, then get ready.';
  }
  const remaining = app.turnRemaining ?? (pizza && state.turnDeadline ? Math.max(0, state.turnDeadline - serverNow()) : 0);
  if (pizza && state.phase === 'making') {
    const secs = Math.max(0, Math.ceil(remaining / 1000));
    clock.textContent = `${secs}s`;
    clock.classList.toggle('urgent', secs <= 15);
  }
}

function renderHand(state, pizza, phase, spectator, yourTurn, stage = 'toppings') {
  const hand = $('hand');
  const title = $('hand-title');
  const sub = $('hand-sub');
  const current = pizza?.turnPlayerId ? state.players.find((p) => p.id === pizza.turnPlayerId) : null;
  hand.classList.toggle('single', phase !== 'making' || stage === 'dough' || stage === 'sauce');

  if (phase === 'making' && (stage === 'dough' || stage === 'sauce')) {
    hand.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'dough-card';
    if (stage === 'sauce') {
      card.innerHTML = '<span class="card-icon">🍅</span><span class="card-copy"><span class="card-name">Sauce spreading</span><span class="card-hotkey">next up: toppings</span></span>';
      title.textContent = 'Sauce time';
      sub.textContent = 'The sauce is going on…';
    } else {
      card.innerHTML = `<span class="card-icon">🫓</span><span class="card-copy"><span class="card-name">Ball of dough</span><span class="card-hotkey">${yourTurn ? 'pick an edge to roll' : 'rolling out'}</span></span>`;
      title.textContent = yourTurn ? 'Your rolling pin' : current ? `${current.name}'s rolling pin` : 'Rolling pin';
      sub.textContent = yourTurn
        ? 'Pick an edge to roll the dough toward'
        : spectator ? 'The chefs are rolling out the dough' : 'Waiting for their roll';
    }
    hand.appendChild(card);
    return;
  }

  if (phase !== 'making' || !pizza?.hand?.length) {
    hand.innerHTML = '';
    title.textContent = phase === 'cooking' ? 'Cooking time' : 'Cards';
    sub.textContent = phase === 'cooking' ? 'Tap together!' : '';
    return;
  }
  title.textContent = yourTurn ? 'Your cards' : current ? `${current.name}'s cards` : 'Cards';
  sub.textContent = yourTurn
    ? 'Choose one, then push from any edge'
    : spectator ? 'The chefs are cooking' : 'Waiting for their push';
  hand.innerHTML = '';
  pizza.hand.forEach((ing, index) => {
    const data = INGREDIENTS[ing] || { name: ing, icon: '•' };
    const card = document.createElement('button');
    card.className = `card${app.selectedIndex === index ? ' selected' : ''}`;
    card.disabled = !yourTurn;
    card.dataset.index = index;
    card.dataset.ingredient = ing;
    card.innerHTML = `<span class="card-icon">${data.icon}</span><span class="card-copy"><span class="card-name">${data.name}</span><span class="card-hotkey">${index + 1} · ${ing === 'cheese' ? 'base' : 'topping'}</span></span>`;
    card.addEventListener('click', () => selectCard(index));
    hand.appendChild(card);
  });
}

function selectCard(index) {
  const state = app.state;
  const pizza = state?.game?.pizza;
  if (!pizza || state.phase !== 'making' || pizza.turnPlayerId !== app.playerId) return;
  const me = state.players.find((p) => p.id === app.playerId);
  if (me?.spectator) return;
  app.selectedIndex = app.selectedIndex === index ? null : index;
  renderHand(state, pizza, state.phase, false, true);
  renderTurnBanner(state, pizza, state.phase, false);
  updatePushControls(true, 'making');
  app.scene?.clearHighlight();
}

function positionPushControls() {
  const scene = app.scene;
  const stage = $('board-stage');
  if (!scene || !stage || app.screen !== 'game') return;
  const rect = scene.boardScreenRect();
  if (!rect) return;
  const stageRect = stage.getBoundingClientRect();
  const left = rect.left - stageRect.left;
  const top = rect.top - stageRect.top;
  const right = rect.right - stageRect.left;
  const bottom = rect.bottom - stageRect.top;
  const gap = 12;
  const maxTop = stageRect.height;

  const topRow = $('push-top');
  const bottomRow = $('push-bottom');
  const leftCol = $('push-left');
  const rightCol = $('push-right');

  topRow.style.left = `${(left + right) / 2}px`;
  topRow.style.top = `${Math.max(0, top - topRow.offsetHeight - gap)}px`;
  topRow.style.bottom = 'auto';

  bottomRow.style.left = `${(left + right) / 2}px`;
  bottomRow.style.top = `${Math.min(maxTop - bottomRow.offsetHeight, bottom + gap)}px`;
  bottomRow.style.bottom = 'auto';

  leftCol.style.left = `${Math.max(4, left - leftCol.offsetWidth - gap)}px`;
  leftCol.style.top = `${(top + bottom) / 2}px`;
  leftCol.style.right = 'auto';
  leftCol.style.bottom = 'auto';

  rightCol.style.left = `${Math.min(stageRect.width - rightCol.offsetWidth - 4, right + gap)}px`;
  rightCol.style.top = `${(top + bottom) / 2}px`;
  rightCol.style.right = 'auto';
  rightCol.style.bottom = 'auto';
}

function buildPushControls(size, stage = 'toppings') {
  if (app.pushSize === size && app.pushStage === stage) return;
  app.pushSize = size;
  app.pushStage = stage;
  const rolling = stage === 'dough';
  for (const side of ['T', 'B', 'L', 'R']) {
    const container = $(`push-${side === 'T' ? 'top' : side === 'B' ? 'bottom' : side === 'L' ? 'left' : 'right'}`);
    container.innerHTML = '';
    if (rolling) {
      const btn = document.createElement('button');
      btn.className = 'push-btn roll-btn';
      btn.dataset.side = side;
      btn.title = `Roll the dough toward the ${SIDE_NAMES[side]}`;
      btn.innerHTML = `<span class="push-arrow">${SIDE_ARROWS[side]}</span><span class="push-lane">roll</span>`;
      container.appendChild(btn);
      continue;
    }
    for (let lane = 0; lane < size; lane++) {
      const btn = document.createElement('button');
      btn.className = 'push-btn';
      btn.dataset.side = side;
      btn.dataset.lane = lane;
      btn.title = `Push ${SIDE_NAMES[side]} into ${side === 'T' || side === 'B' ? 'column' : 'row'} ${lane + 1}`;
      btn.innerHTML = `<span class="push-arrow">${SIDE_ARROWS[side]}</span><span class="push-lane">${lane + 1}</span>`;
      container.appendChild(btn);
    }
  }
}

// Mirrors the server's rollDough rule: a side is usable while it can still
// push at least one lane of dough outward.
function canRollSide(dough, size, side) {
  if (!Array.isArray(dough) || dough.length !== size * size) return false;
  if (side === 'L' || side === 'R') {
    for (let r = 0; r < size; r++) {
      let min = Infinity;
      let max = -1;
      for (let c = 0; c < size; c++) {
        if (dough[r * size + c]) {
          min = Math.min(min, c);
          max = Math.max(max, c);
        }
      }
      if (max === -1) continue;
      const c = side === 'L' ? min - 1 : max + 1;
      if (c >= 0 && c < size) return true;
    }
    return false;
  }
  for (let c = 0; c < size; c++) {
    let min = Infinity;
    let max = -1;
    for (let r = 0; r < size; r++) {
      if (dough[r * size + c]) {
        min = Math.min(min, r);
        max = Math.max(max, r);
      }
    }
    if (max === -1) continue;
    const r = side === 'T' ? min - 1 : max + 1;
    if (r >= 0 && r < size) return true;
  }
  return false;
}

function updateRollButtons(pizza) {
  const buttons = document.querySelectorAll('.push-btn.roll-btn');
  if (!buttons.length) return;
  for (const btn of buttons) {
    const usable = pizza?.stage === 'dough' && canRollSide(pizza.dough, pizza.size, btn.dataset.side);
    btn.disabled = !usable;
    btn.classList.toggle('spent', !usable);
  }
}

function updatePushControls(yourTurn, phase, stage = 'toppings') {
  const rolling = stage === 'dough';
  const active = phase === 'making' && (rolling ? yourTurn : yourTurn && app.selectedIndex !== null);
  $('push-controls').classList.toggle('active', active);
  $('push-controls').classList.toggle('rolling', rolling);
  const prompt = $('push-prompt');
  if (phase !== 'making') {
    prompt.classList.add('hidden');
    return;
  }
  prompt.classList.remove('hidden');
  if (stage === 'sauce') {
    prompt.textContent = 'Sauce is spreading…';
    prompt.style.color = 'rgba(255,245,225,.5)';
  } else if (rolling) {
    prompt.textContent = yourTurn ? 'Pick an edge to roll the dough toward' : 'Waiting for the next chef…';
    prompt.style.color = yourTurn ? 'var(--gold-soft)' : 'rgba(255,245,225,.4)';
  } else if (yourTurn) {
    prompt.textContent = app.selectedIndex === null ? 'Pick an ingredient card to start pushing' : 'Now push it in from any edge';
    prompt.style.color = app.selectedIndex === null ? 'rgba(255,245,225,.5)' : 'var(--gold-soft)';
  } else {
    prompt.textContent = 'Waiting for the next chef…';
    prompt.style.color = 'rgba(255,245,225,.4)';
  }
}

function renderActions(state, pizza, phase, spectator, isHost, stage = 'toppings') {
  const undo = $('undo-btn');
  const reset = $('reset-btn');
  const bake = $('bake-btn');
  const end = $('end-btn');
  undo.disabled = !pizza?.canUndo || phase !== 'making' || spectator || stage !== 'toppings';
  undo.classList.toggle('hidden', phase === 'cooking' || phase === 'result' || stage !== 'toppings');
  reset.classList.toggle('hidden', !isHost || phase !== 'making');
  bake.classList.toggle('hidden', !isHost || state.game.mode !== 'chefs' || phase !== 'making' || stage !== 'toppings');
  end.classList.toggle('hidden', !isHost || phase === 'gameover');
}

function showLastMove(text) {
  const el = $('last-move');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(app.lastMoveTimer);
  app.lastMoveTimer = setTimeout(hideLastMove, 4200);
}
function hideLastMove() {
  $('last-move').classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Cooking
// ---------------------------------------------------------------------------
function showCooking(state) {
  const pizza = state.game.pizza;
  const overlay = $('cooking-overlay');
  const key = `${state.game.pizzaIndex}:${pizza?.startedAt}`;
  if (app.cookPizzaKey !== key) {
    app.cookPizzaKey = key;
    renderCookPizza(pizza);
  }
  overlay.classList.remove('hidden');
  $('result-overlay').classList.add('hidden');
  const me = state.players.find((p) => p.id === app.playerId);
  const spectator = !!me?.spectator;
  const btn = $('tap-btn');
  btn.disabled = spectator;
  btn.innerHTML = spectator
    ? '<span class="tap-icon">👀</span><span><strong>CHEFS ARE COOKING</strong><small>watch the heat</small></span>'
    : '<span class="tap-icon">🔥</span><span><strong>STOKE THE FIRE</strong><small>tap or press space</small></span>';
  updateCookUI(state.game.cook || {});
}

function renderCookPizza(pizza) {
  const wrap = $('cook-toppings');
  wrap.innerHTML = '';
  if (!pizza) return;
  const size = pizza.size;
  const board = pizza.board;
  for (let i = 0; i < board.length; i++) {
    const ing = board[i];
    if (ing === 'cheese') continue;
    const r = Math.floor(i / size);
    const c = i % size;
    const span = document.createElement('span');
    span.className = 'cook-topping';
    span.textContent = INGREDIENTS[ing]?.icon || '•';
    span.style.left = `${((c + 0.5) / size) * 100}%`;
    span.style.top = `${((r + 0.5) / size) * 100}%`;
    span.style.transform = `translate(-50%, -50%) rotate(${(i * 37) % 40 - 20}deg)`;
    wrap.appendChild(span);
  }
}

function updateCookUI(cook) {
  if (!cook || cook.heat === undefined) return;
  const heat = Math.max(0, Math.min(100, cook.heat));
  $('heat-fill').style.height = `${heat}%`;
  $('heat-needle').style.bottom = `${heat}%`;
  $('heat-value').textContent = `${Math.round(heat)}°`;
  const quality = Math.max(0, Math.min(100, cook.quality || 0));
  $('quality-fill').style.width = `${quality}%`;
  $('quality-pct').textContent = `${Math.round(quality)}%`;
  const duration = cook.duration || 10;
  const elapsed = cook.elapsed || 0;
  $('cook-timer').textContent = `${Math.max(0, duration - elapsed).toFixed(1)}s`;
  const burnWarning = $('burn-warning');
  const burning = heat > 88;
  burnWarning.classList.toggle('hidden', !burning);
  const burnEl = $('cook-burn');
  if (burnEl) burnEl.style.opacity = burning ? `${Math.min(0.75, (heat - 86) / 18)}` : '0';
  const state = app.state;
  if (state) {
    const contrib = $('cook-contrib');
    contrib.innerHTML = '';
    const taps = cook.taps || {};
    for (const p of state.players.filter((x) => !x.spectator)) {
      const chip = document.createElement('span');
      chip.className = 'contrib-chip';
      const av = document.createElement('span');
      av.className = 'avatar';
      av.style.width = '18px';
      av.style.height = '18px';
      av.style.fontSize = '8px';
      av.style.background = avatarColor(p.name);
      av.textContent = initials(p.name);
      const label = document.createElement('span');
      label.textContent = `${p.name} `;
      const b = document.createElement('b');
      b.textContent = taps[p.id] || 0;
      chip.append(av, label, b);
      contrib.appendChild(chip);
    }
  }
}

function tapOven() {
  if (app.state?.phase !== 'cooking') return;
  const me = app.state.players.find((p) => p.id === app.playerId);
  if (me?.spectator) return;
  send({ t: 'tap' });
  const btn = $('tap-btn');
  btn.classList.add('tapped');
  setTimeout(() => btn.classList.remove('tapped'), 90);
}

// ---------------------------------------------------------------------------
// Result / game over
// ---------------------------------------------------------------------------
function showResult(state) {
  const result = state.game.result;
  if (!result) return;
  hideCooking();
  const overlay = $('result-overlay');
  overlay.classList.remove('hidden');
  const stars = '★'.repeat(result.stars) + `<span class="off">${'★'.repeat(5 - result.stars)}</span>`;
  $('result-stars').innerHTML = stars;
  $('result-kicker').textContent = `PIZZA ${result.pizzaIndex + 1} COMPLETE`;
  $('result-label').textContent = result.label;
  $('result-quality').textContent = `${result.quality}%`;
  $('result-pushes').textContent = result.turns ?? (result.moves + (result.rolls || 0));
  $('result-time').textContent = formatClock(result.elapsedMs);
  $('result-score').textContent = `+${result.score}`;
  app.resultEndsAt = Date.now() + 5500;
  $('result-next').textContent = 'Next pizza in 5…';
}

function hideResult() {
  $('result-overlay').classList.add('hidden');
}
function hideCooking() {
  $('cooking-overlay').classList.add('hidden');
}

function showGameover(state) {
  const summary = state.game.summary;
  if (!summary) return;
  const key = `${summary.endedAt}:${summary.reason}`;
  const first = app.gameoverKey !== key;
  app.gameoverKey = key;
  hideCooking();
  hideResult();
  $('gameover-overlay').classList.remove('hidden');
  const title = summary.reason === 'time'
    ? "Time's up!"
    : summary.reason === 'host'
      ? 'Kitchen closed!'
      : 'Service complete!';
  $('gameover-title').textContent = title;
  $('gameover-sub').textContent = summary.reason === 'time'
    ? `You baked ${summary.pizzasCompleted} pizza${summary.pizzasCompleted === 1 ? '' : 's'} before the clock ran out.`
    : `You made ${summary.pizzasCompleted} pizza${summary.pizzasCompleted === 1 ? '' : 's'} together. Grab a slice.`;
  $('final-score').textContent = summary.score.toLocaleString();
  $('final-pizzas').textContent = summary.pizzasCompleted;
  $('final-moves').textContent = summary.totalTurns ?? summary.totalMoves;
  $('final-time').textContent = formatClock(summary.totalTime);
  $('final-best').textContent = summary.best ? `${summary.best.quality}%` : '–';
  const results = $('final-results');
  results.innerHTML = '';
  summary.results.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'final-result-row';
    row.innerHTML = `<span class="pizza-num">#${r.pizzaIndex + 1}</span><span class="pizza-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span><span class="pizza-label">${escapeHtml(r.label)}</span><span class="pizza-score">${r.quality}% · ${r.score} pts</span>`;
    results.appendChild(row);
  });
  const players = $('final-players');
  players.innerHTML = '';
  summary.players.forEach((p) => {
    const chip = document.createElement('span');
    chip.className = 'final-player';
    chip.innerHTML = `<span class="avatar" style="background:${avatarColor(p.name)}">${escapeHtml(initials(p.name))}</span>${escapeHtml(p.name)}${summary.mvp?.id === p.id ? ' ⭐' : ''} · ${p.rolls || 0} rolls · ${p.pushes} pushes · ${p.taps} taps`;
    players.appendChild(chip);
  });
  const isHost = state.hostId === app.playerId;
  $('play-again-btn').classList.toggle('hidden', !isHost);
  $('gameover-wait').classList.toggle('hidden', isHost);
  if (first) spawnConfetti();
}

function spawnConfetti() {
  const wrap = $('confetti');
  wrap.innerHTML = '';
  const colors = ['#d8492b', '#f6c552', '#67a84a', '#ef8b2c', '#8a6bb8', '#fff5e1'];
  for (let i = 0; i < 42; i++) {
    const c = document.createElement('i');
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = `${2.4 + Math.random() * 2.6}s`;
    c.style.animationDelay = `${Math.random() * 1.2}s`;
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    c.style.width = `${4 + Math.random() * 6}px`;
    c.style.height = `${8 + Math.random() * 10}px`;
    wrap.appendChild(c);
  }
}

function hideGameover() {
  $('gameover-overlay').classList.add('hidden');
}
function hideAllOverlays() {
  hideCooking();
  hideResult();
  hideGameover();
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
function updateChatVisibility() {
  $('chat-root').classList.toggle('hidden', app.screen === 'landing');
  if (app.state) {
    const chefs = app.state.players.filter((p) => !p.spectator).length;
    $('chat-sub').textContent = `${app.state.players.length} in the kitchen${chefs ? ` · ${chefs} cooking` : ''}`;
  }
  updateChatBadge();
}

function clearChat() {
  $('chat-messages').innerHTML = '';
  app.chatIds = new Set();
  app.chatInitialized = false;
  app.unread = 0;
  updateChatBadge();
}

function renderChatFromState(state) {
  if (!state.chat) return;
  if (!app.chatInitialized) {
    app.chatInitialized = true;
    for (const msg of state.chat) appendChat(msg, false, true);
    if (app.chatOpen) scrollChat();
    return;
  }
  for (const msg of state.chat) {
    if (!app.chatIds.has(msg.id)) appendChat(msg, false);
  }
}

function appendChat(msg, live = false, initial = false) {
  if (!msg || app.chatIds.has(msg.id)) return;
  app.chatIds.add(msg.id);
  const list = $('chat-messages');
  const el = document.createElement('div');
  if (msg.system) {
    el.className = 'chat-system';
    el.textContent = msg.text;
  } else {
    const mine = msg.playerId === app.playerId;
    el.className = `chat-msg${mine ? ' you' : ''}`;
    const name = document.createElement('div');
    name.className = 'msg-name';
    name.textContent = msg.name;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = msg.text;
    el.append(name, bubble);
  }
  list.appendChild(el);
  while (list.children.length > 140) list.firstChild.remove();
  if (app.chatOpen) scrollChat();
  if (live && !initial && !app.chatOpen && !msg.system && msg.playerId !== app.playerId) {
    app.unread += 1;
    updateChatBadge();
  }
}

function updateChatBadge() {
  const badge = $('chat-badge');
  if (app.unread > 0) {
    badge.textContent = app.unread > 99 ? '99+' : String(app.unread);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function scrollChat() {
  const list = $('chat-messages');
  list.scrollTop = list.scrollHeight;
}

function toggleChat(open = !app.chatOpen) {
  app.chatOpen = open;
  $('chat-root').classList.toggle('open', open);
  if (open) {
    app.unread = 0;
    updateChatBadge();
    scrollChat();
    setTimeout(() => $('chat-input').focus(), 300);
  }
}

// ---------------------------------------------------------------------------
// Live timers
// ---------------------------------------------------------------------------
function serverNow() {
  return Date.now() - app.serverOffset;
}

function updateLiveTimers() {
  const state = app.state;
  if (!state) return;
  if (state.phase === 'making' && state.turnDeadline) {
    const remaining = Math.max(0, state.turnDeadline - serverNow());
    app.turnRemaining = remaining;
    const clock = $('turn-clock');
    if (clock) {
      clock.textContent = `${Math.ceil(remaining / 1000)}s`;
      clock.classList.toggle('urgent', remaining <= 15000);
    }
  }
  const timerEl = $('game-timer-value');
  const timerWrap = $('game-timer');
  if (timerEl && state.game) {
    if (state.game.mode === 'rush' && state.rushRemaining !== null) {
      const remaining = Math.max(0, state.rushRemaining - (Date.now() - app.stateAt));
      timerEl.textContent = formatClock(remaining);
      timerWrap.classList.toggle('urgent', remaining <= 30000);
    } else if (state.game.gameStartedAt) {
      timerEl.textContent = formatClock(Math.max(0, serverNow() - state.game.gameStartedAt));
      timerWrap.classList.remove('urgent');
    }
  }
  if (state.game?.pizza && state.phase === 'making') {
    const pt = $('pizza-time');
    if (pt) pt.textContent = formatClock(Math.max(0, serverNow() - state.game.pizza.startedAt));
  }
  if (state.phase === 'result' && app.resultEndsAt) {
    const secs = Math.max(0, Math.ceil((app.resultEndsAt - Date.now()) / 1000));
    const next = $('result-next');
    if (next) next.textContent = secs > 0 ? `Next pizza in ${secs}…` : 'Next pizza coming up…';
  }
}

// ---------------------------------------------------------------------------
// UI bindings
// ---------------------------------------------------------------------------
function bindEvents() {
  $('host-btn').addEventListener('click', hostGame);
  $('join-btn').addEventListener('click', joinGame);
  $('code-input').addEventListener('input', () => {
    $('code-input').value = $('code-input').value.replace(/\D/g, '').slice(0, 6);
  });
  $('code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
  $('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') hostGame(); });
  $('lobby-code-copy').addEventListener('click', () => copyCode($('lobby-code').textContent));
  $('game-code-copy').addEventListener('click', () => copyCode($('game-code').textContent));
  $('lobby-leave').addEventListener('click', () => leaveRoom());
  $('game-leave').addEventListener('click', () => leaveRoom());
  $('gameover-leave').addEventListener('click', () => leaveRoom());

  $('role-toggle').addEventListener('change', (e) => {
    send({ t: 'setRole', spectator: e.target.checked });
  });

  $('mode-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-card');
    if (!btn || btn.disabled) return;
    send({ t: 'settings', settings: { mode: btn.dataset.mode } });
  });
  $('size-segmented').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    send({ t: 'settings', settings: { size: Number(btn.dataset.size) } });
  });
  $('time-segmented').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    send({ t: 'settings', settings: { timeLimit: Number(btn.dataset.time) } });
  });
  $('pizzas-stepper').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    const current = app.state?.settings.pizzas ?? 3;
    const next = Math.max(1, Math.min(8, current + Number(btn.dataset.step)));
    if (next !== current) send({ t: 'settings', settings: { pizzas: next } });
  });
  $('start-btn').addEventListener('click', () => {
    if ($('start-btn').disabled) return;
    send({ t: 'start' });
  });

  $('hint-toggle').addEventListener('click', () => {
    app.hints = !app.hints;
    app.scene?.setHints(app.hints);
    $('hint-toggle').style.opacity = app.hints ? '1' : '0.45';
    toast(app.hints ? 'Target ghosts on' : 'Target ghosts off');
  });
  $('recipe-toggle').addEventListener('click', () => {
    app.recipeOpen = !app.recipeOpen;
    applyRecipePanel();
  });
  $('undo-btn').addEventListener('click', () => send({ t: 'undo' }));
  $('reset-btn').addEventListener('click', async () => {
    const ok = await confirmDialog('Scrap this pizza?', 'The pizza goes back to a fresh ball of dough. Your time, rolls and pushes reset for this pizza, but the kitchen clock keeps going.', 'Scrap it');
    if (ok) send({ t: 'resetPizza' });
  });
  $('bake-btn').addEventListener('click', async () => {
    const ok = await confirmDialog('Into the oven?', 'This freeform creation is done. Time to cook it together.', 'Bake it');
    if (ok) send({ t: 'bakeNow' });
  });
  $('end-btn').addEventListener('click', async () => {
    const ok = await confirmDialog('Close the kitchen?', 'This ends the round and shows the team score.', 'Close up');
    if (ok) send({ t: 'endGame' });
  });
  $('play-again-btn').addEventListener('click', () => send({ t: 'playAgain' }));

  $('push-controls').addEventListener('click', (e) => {
    const btn = e.target.closest('.push-btn');
    if (!btn || !$('push-controls').classList.contains('active')) return;
    const state = app.state;
    const pizza = state?.game?.pizza;
    if (!pizza) return;
    const stage = pizza.stage || 'toppings';
    if (stage === 'dough') {
      send({ t: 'roll', side: btn.dataset.side });
      app.scene?.clearHighlight();
      return;
    }
    if (app.selectedIndex === null) return;
    const ingredient = pizza.hand[app.selectedIndex];
    if (!ingredient) return;
    send({ t: 'push', ingredient, side: btn.dataset.side, lane: Number(btn.dataset.lane) });
    app.selectedIndex = null;
    app.scene?.clearHighlight();
  });
  $('push-controls').addEventListener('pointerover', (e) => {
    const btn = e.target.closest('.push-btn');
    if (!btn || !$('push-controls').classList.contains('active')) return;
    if (app.state?.game?.pizza?.stage === 'dough') {
      app.scene?.highlightEdge(btn.dataset.side);
      return;
    }
    app.scene?.highlightLane(btn.dataset.side, Number(btn.dataset.lane));
  });
  $('push-controls').addEventListener('pointerout', (e) => {
    if (e.target.closest('.push-btn')) app.scene?.clearHighlight();
  });

  $('tap-btn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    tapOven();
  });
  $('tap-btn').addEventListener('click', (e) => e.preventDefault());

  $('chat-toggle').addEventListener('click', () => toggleChat(true));
  $('chat-close').addEventListener('click', () => toggleChat(false));
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text) return;
    if (send({ t: 'chat', text })) input.value = '';
  });

  $('modal-cancel').addEventListener('click', () => closeModal(false));
  $('modal-confirm').addEventListener('click', () => closeModal(true));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('modal-root').classList.contains('hidden')) closeModal(false);
      else if (app.chatOpen) toggleChat(false);
      return;
    }
    if (app.state?.phase === 'cooking' && e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      tapOven();
      return;
    }
    if (app.state?.phase === 'making' && e.key >= '1' && e.key <= '4') {
      const pizza = app.state.game?.pizza;
      if (!pizza || pizza.turnPlayerId !== app.playerId) return;
      const me = app.state.players.find((p) => p.id === app.playerId);
      if (me?.spectator) return;
      const index = Number(e.key) - 1;
      if (pizza.hand?.[index]) selectCard(index);
    }
  });
}

function hostGame() {
  const name = getChefName();
  if (!name) return;
  storageSet('pizza.name', name);
  send({ t: 'create', name });
}

function joinGame() {
  const name = getChefName();
  if (!name) return;
  const code = $('code-input').value.replace(/\D/g, '');
  if (code.length !== 6) {
    toast('Enter the six digit kitchen code.', 'error');
    $('code-input').focus();
    return;
  }
  storageSet('pizza.name', name);
  send({ t: 'join', code, name, spectator: $('spectator-join').checked });
}

function getChefName() {
  const input = $('name-input');
  const name = input.value.trim().replace(/\s+/g, ' ');
  if (!name) {
    toast('Give your chef a name first.', 'error');
    input.focus();
    return '';
  }
  input.value = name;
  return name;
}

async function leaveRoom() {
  const inGame = app.state && app.state.phase !== 'lobby' && app.state.phase !== 'gameover';
  if (inGame) {
    const ok = await confirmDialog('Leave the kitchen?', 'Your seat will be held for a few minutes, but the other chefs will keep cooking.', 'Leave');
    if (!ok) return;
  }
  send({ t: 'leave' });
  storageRemove('pizza.resume');
  app.state = null;
  app.code = null;
  app.playerId = null;
  app.token = null;
  app.pizzaKey = null;
  app.pushSize = null;
  app.pushStage = null;
  app.gameoverKey = null;
  app.selectedIndex = null;
  hideAllOverlays();
  clearChat();
  toggleChat(false);
  setScreen('landing');
}

function copyCode(code) {
  const text = String(code || '').replace(/\D/g, '');
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(`Kitchen code ${text} copied`, 'good')).catch(() => toast(`Kitchen code: ${text}`));
  } else {
    toast(`Kitchen code: ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Toasts / modal
// ---------------------------------------------------------------------------
function toast(message, type = '') {
  const wrap = $('toasts');
  const el = document.createElement('div');
  el.className = `toast${type ? ` ${type}` : ''}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-6px)';
    el.style.transition = 'opacity .25s, transform .25s';
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

function confirmDialog(title, body, confirmText = 'Yes, chef') {
  return new Promise((resolve) => {
    app.modalResolve = resolve;
    $('modal-title').textContent = title;
    $('modal-body').textContent = body;
    $('modal-confirm').textContent = confirmText;
    $('modal-root').classList.remove('hidden');
    $('modal-confirm').focus();
  });
}

function closeModal(result) {
  $('modal-root').classList.add('hidden');
  if (app.modalResolve) {
    const resolve = app.modalResolve;
    app.modalResolve = null;
    resolve(result);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function avatarColor(name) {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatClock(ms) {
  if (!ms || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
function getResume() {
  try {
    const raw = storageGet('pizza.resume');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.code && data?.token) return data;
  } catch { /* ignore */ }
  return null;
}

boot();
