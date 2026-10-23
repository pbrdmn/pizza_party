// Pure game rules for Pizza Party. No networking here so it is easy to test.

export const SIDES = ['T', 'R', 'B', 'L'];

export const INGREDIENTS = {
  cheese: { id: 'cheese', name: 'Mozzarella', icon: '🧀', color: '#f4c84a', dark: '#d9a72e', kind: 'cheese' },
  pepperoni: { id: 'pepperoni', name: 'Pepperoni', icon: '🍖', color: '#c93b2b', dark: '#8f2419', kind: 'pepperoni' },
  tomato: { id: 'tomato', name: 'Tomato', icon: '🍅', color: '#e94f37', dark: '#a92c1c', kind: 'tomato' },
  basil: { id: 'basil', name: 'Basil', icon: '🥬', color: '#4fae4a', dark: '#2e7d32', kind: 'basil' },
  olive: { id: 'olive', name: 'Olive', icon: '🫒', color: '#4c5b2f', dark: '#242d16', kind: 'olive' },
  mushroom: { id: 'mushroom', name: 'Mushroom', icon: '🍄', color: '#e8d6b3', dark: '#a98d63', kind: 'mushroom' },
  pineapple: { id: 'pineapple', name: 'Pineapple', icon: '🍍', color: '#f2c744', dark: '#c08d17', kind: 'pineapple' },
  onion: { id: 'onion', name: 'Onion', icon: '🧅', color: '#b79bdc', dark: '#7257a0', kind: 'onion' },
};

export const ACCENT_IDS = ['pepperoni', 'tomato', 'basil', 'olive', 'mushroom', 'pineapple', 'onion'];

export const MODES = {
  party: { id: 'party', name: 'Pizza Party', blurb: 'Cook a set number of perfect pizzas together.' },
  rush: { id: 'rush', name: 'Rush Hour', blurb: 'Beat the clock and bake as many pizzas as you can.' },
  chefs: { id: 'chefs', name: "Chef's Special", blurb: 'No recipe, no rules. Create your own masterpieces.' },
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function idx(size, r, c) {
  return r * size + c;
}

function uniquePalette(rng, count = 3) {
  return shuffle(ACCENT_IDS, rng).slice(0, count);
}

function addClusters(mask, size, rng, clusterCount, mirror) {
  const half = Math.ceil(size / 2);
  for (let n = 0; n < clusterCount; n++) {
    let r = Math.floor(rng() * size);
    let c = Math.floor(rng() * size);
    const length = Math.floor(size * 0.55) + Math.floor(rng() * (size + 1));
    for (let i = 0; i < length; i++) {
      mask.add(idx(size, r, c));
      if (mirror) {
        mask.add(idx(size, r, size - 1 - c));
        mask.add(idx(size, size - 1 - r, c));
        mask.add(idx(size, size - 1 - r, size - 1 - c));
      }
      const dir = Math.floor(rng() * 4);
      if (dir === 0) r = clamp(r - 1, 0, size - 1);
      else if (dir === 1) r = clamp(r + 1, 0, size - 1);
      else if (dir === 2) c = clamp(c - 1, 0, size - 1);
      else c = clamp(c + 1, 0, size - 1);
    }
  }
  return mask;
}

function buildMask(style, size, rng) {
  const mask = new Set();
  const cr = (size - 1) / 2;
  const cc = (size - 1) / 2;
  if (style === 'scatter') {
    addClusters(mask, size, rng, 2 + Math.floor(size / 3), false);
  } else if (style === 'mirror') {
    addClusters(mask, size, rng, 2 + Math.floor(size / 4), true);
  } else if (style === 'ring') {
    const radius = size <= 4 ? 0.95 : size * 0.32;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const d = Math.hypot(r - cr, c - cc);
        if (Math.abs(d - radius) < 0.85) mask.add(idx(size, r, c));
      }
    }
  } else if (style === 'flower') {
    const petals = [
      [cr - 1.5, cc], [cr + 1.5, cc], [cr, cc - 1.5], [cr, cc + 1.5],
      [cr - 1, cc - 1], [cr + 1, cc + 1], [cr - 1, cc + 1], [cr + 1, cc - 1],
    ];
    for (const [r, c] of petals) {
      const rr = Math.round(r);
      const ccc = Math.round(c);
      if (rr >= 0 && rr < size && ccc >= 0 && ccc < size) mask.add(idx(size, rr, ccc));
    }
    if (size >= 5) mask.add(idx(size, Math.floor(cr), Math.floor(cc)));
  } else if (style === 'stripes') {
    const step = 3;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if ((r + c) % step === 0) mask.add(idx(size, r, c));
      }
    }
  } else if (style === 'checker') {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if ((r + c) % 2 === 0 && rng() < 0.8) mask.add(idx(size, r, c));
      }
    }
  } else if (style === 'cross') {
    const mid = Math.floor(size / 2);
    for (let i = 0; i < size; i++) {
      mask.add(idx(size, mid, i));
      mask.add(idx(size, i, mid));
    }
  } else if (style === 'smiley') {
    const eyeRow = Math.max(1, Math.floor(size * 0.3));
    const eyeA = Math.max(1, Math.floor(size * 0.28));
    const eyeB = Math.min(size - 2, Math.ceil(size * 0.72));
    mask.add(idx(size, eyeRow, eyeA));
    mask.add(idx(size, eyeRow, eyeB));
    const mouthRow = Math.min(size - 2, Math.ceil(size * 0.68));
    for (let c = eyeA; c <= eyeB; c++) {
      const t = (c - eyeA) / Math.max(1, eyeB - eyeA);
      const curve = Math.round(Math.sin(t * Math.PI) * (size * 0.18));
      mask.add(idx(size, clamp(mouthRow + curve, 0, size - 1), c));
    }
  }
  return mask;
}

/**
 * Generate a pizza target and a guaranteed solution that starts from a
 * fully-cheese pizza. Every row can be rebuilt from either side by pushing
 * the target row in from that edge, so no generated pizza can become
 * unsolvable.
 */
export function generateRecipe(size, rng = Math.random, options = {}) {
  const palette = options.palette ? [...options.palette] : uniquePalette(rng, 3);
  const styles = ['scatter', 'mirror', 'ring', 'flower', 'stripes', 'checker', 'cross'];
  if (size >= 5) styles.push('smiley');
  const style = options.style || styles[Math.floor(rng() * styles.length)];
  let mask = buildMask(style, size, rng);

  // Keep the pizza readable: not too sparse, not wall-to-wall toppings.
  const maxAccents = Math.max(3, Math.floor(size * size * 0.38));
  if (mask.size > maxAccents) {
    mask = new Set(shuffle([...mask], rng).slice(0, maxAccents));
  }
  const minAccents = Math.min(5, Math.max(3, Math.floor(size * 0.9)));
  while (mask.size < minAccents) {
    mask.add(Math.floor(rng() * size * size));
  }
  // Give most rows a little love so the finished pizza looks generous.
  for (let r = 0; r < size; r++) {
    const rowHasAccent = [...mask].some((i) => Math.floor(i / size) === r);
    if (!rowHasAccent && rng() < 0.65) {
      mask.add(idx(size, r, Math.floor(rng() * size)));
    }
  }

  // Assign toppings in soft patches using nearest seeds.
  const cells = shuffle([...mask], rng);
  const seedCells = [];
  for (let i = 0; i < palette.length; i++) seedCells.push(cells[i % cells.length]);
  const target = Array(size * size).fill('cheese');
  for (const cell of mask) {
    const r = Math.floor(cell / size);
    const c = cell % size;
    let best = 0;
    let bestD = Infinity;
    seedCells.forEach((seed, i) => {
      const sr = Math.floor(seed / size);
      const sc = seed % size;
      const d = Math.hypot(r - sr, c - sc);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    target[cell] = palette[best];
  }
  // Ensure every dealt ingredient actually appears on the pizza.
  for (let i = 0; i < palette.length; i++) {
    if (!target.includes(palette[i])) {
      target[cells[i % cells.length]] = palette[i];
    }
  }

  const solution = solveRecipe(target, size, rng);
  return { target, palette, style, solution, par: solution.length };
}

/** A short, guaranteed solution: fix each row from its cheaper side. */
export function solveRecipe(target, size, rng = Math.random) {
  const solution = [];
  for (let r = 0; r < size; r++) {
    const accents = [];
    for (let c = 0; c < size; c++) if (target[idx(size, r, c)] !== 'cheese') accents.push(c);
    if (!accents.length) continue;
    const first = accents[0];
    const last = accents[accents.length - 1];
    const fromLeft = last + 1 < size - first ? true : last + 1 > size - first ? false : rng() < 0.5;
    if (fromLeft) {
      // Pushing from the left stacks each new topping on top of the previous
      // one, so the row is rebuilt by pushing the target prefix in reverse.
      for (let c = last; c >= 0; c--) {
        solution.push({ ingredient: target[idx(size, r, c)], side: 'L', lane: r });
      }
    } else {
      for (let c = first; c < size; c++) {
        solution.push({ ingredient: target[idx(size, r, c)], side: 'R', lane: r });
      }
    }
  }
  return solution;
}

export function emptyBoard(size) {
  return Array(size * size).fill('cheese');
}

// ---------------------------------------------------------------------------
// Dough rolling
// ---------------------------------------------------------------------------

/** A fresh ball of dough in the middle of the grid. */
export function createDough(size) {
  const dough = Array(size * size).fill(false);
  if (size % 2 === 1) {
    const mid = Math.floor(size / 2);
    dough[idx(size, mid, mid)] = true;
  } else {
    const a = size / 2 - 1;
    const b = size / 2;
    for (const r of [a, b]) {
      for (const c of [a, b]) dough[idx(size, r, c)] = true;
    }
  }
  return dough;
}

export function doughComplete(dough) {
  return Array.isArray(dough) && dough.length > 0 && dough.every(Boolean);
}

export function doughCount(dough) {
  return Array.isArray(dough) ? dough.reduce((n, covered) => n + (covered ? 1 : 0), 0) : 0;
}

/**
 * Rolling a side pushes the dough one cell toward that edge, lane by lane.
 * The dough starts as a small ball and grows into an irregular (or neatly
 * rectangular) sheet, which is exactly what the chefs are aiming for.
 */
export function rollDough(game, { side, playerId } = {}) {
  if (!SIDES.includes(side)) return { ok: false, error: 'Pick a side of the pizza to roll toward.' };
  if (game.stage !== 'dough') return { ok: false, error: 'The dough is already rolled out.' };
  if (!Array.isArray(game.dough) || game.dough.length !== game.size * game.size) {
    return { ok: false, error: 'There is no dough to roll.' };
  }
  const next = [...game.dough];
  let added = 0;
  if (side === 'L' || side === 'R') {
    for (let r = 0; r < game.size; r++) {
      let min = Infinity;
      let max = -1;
      for (let c = 0; c < game.size; c++) {
        if (next[idx(game.size, r, c)]) {
          min = Math.min(min, c);
          max = Math.max(max, c);
        }
      }
      if (max === -1) continue;
      const c = side === 'L' ? min - 1 : max + 1;
      if (c >= 0 && c < game.size) {
        next[idx(game.size, r, c)] = true;
        added += 1;
      }
    }
  } else {
    for (let c = 0; c < game.size; c++) {
      let min = Infinity;
      let max = -1;
      for (let r = 0; r < game.size; r++) {
        if (next[idx(game.size, r, c)]) {
          min = Math.min(min, r);
          max = Math.max(max, r);
        }
      }
      if (max === -1) continue;
      const r = side === 'T' ? min - 1 : max + 1;
      if (r >= 0 && r < game.size) {
        next[idx(game.size, r, c)] = true;
        added += 1;
      }
    }
  }
  if (!added) return { ok: false, error: 'That edge is already rolled out.' };
  game.dough = next;
  game.rolls += 1;
  game.lastRoll = { side, playerId, at: Date.now() };
  return { ok: true, added, complete: doughComplete(next) };
}

/** Which sides can still push the dough outward? */
export function validRollSides(dough, size) {
  if (!Array.isArray(dough)) return [];
  const sides = [];
  for (const side of SIDES) {
    const probe = { size, dough: [...dough], stage: 'dough', rolls: 0 };
    const res = rollDough(probe, { side });
    if (res.ok) sides.push(side);
  }
  return sides;
}

export function makeHand(mode, palette, rng = Math.random) {
  if (mode === 'chefs') {
    const options = ['cheese', ...palette];
    // Four cards, always at least one cheese so chefs can push things around.
    const hand = shuffle(options, rng).slice(0, 4);
    if (!hand.includes('cheese')) hand[0] = 'cheese';
    return hand;
  }
  // Recipe pizzas use exactly cheese + three accent toppings, so the four
  // dealt cards always contain every ingredient the recipe needs.
  return shuffle(['cheese', ...palette.slice(0, 3)], rng);
}

export function applyPushToBoard(board, size, side, lane, ingredient) {
  const next = [...board];
  if (side === 'T') {
    for (let r = size - 1; r > 0; r--) next[idx(size, r, lane)] = board[idx(size, r - 1, lane)];
    next[idx(size, 0, lane)] = ingredient;
  } else if (side === 'B') {
    for (let r = 0; r < size - 1; r++) next[idx(size, r, lane)] = board[idx(size, r + 1, lane)];
    next[idx(size, size - 1, lane)] = ingredient;
  } else if (side === 'L') {
    for (let c = size - 1; c > 0; c--) next[idx(size, lane, c)] = board[idx(size, lane, c - 1)];
    next[idx(size, lane, 0)] = ingredient;
  } else if (side === 'R') {
    for (let c = 0; c < size - 1; c++) next[idx(size, lane, c)] = board[idx(size, lane, c + 1)];
    next[idx(size, lane, size - 1)] = ingredient;
  } else {
    throw new Error('Bad side');
  }
  return next;
}

export function boardsMatch(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export function mismatches(board, target) {
  if (!target) return 0;
  let n = 0;
  for (let i = 0; i < target.length; i++) if (board[i] !== target[i]) n++;
  return n;
}

export function remainingCounts(board, target) {
  const counts = {};
  if (!target) return counts;
  for (let i = 0; i < target.length; i++) {
    if (board[i] !== target[i] && target[i] !== 'cheese') {
      counts[target[i]] = (counts[target[i]] || 0) + 1;
    }
  }
  return counts;
}

export function createPizza({ mode, size, pizzaIndex = 0, rng = Math.random }) {
  let recipe;
  if (mode === 'chefs') {
    recipe = {
      target: null,
      palette: shuffle(ACCENT_IDS, rng).slice(0, 5),
      style: 'freeform',
      solution: [],
      par: 0,
    };
  } else {
    recipe = generateRecipe(size, rng);
  }
  return {
    mode,
    size,
    pizzaIndex,
    palette: recipe.palette,
    target: recipe.target,
    style: recipe.style,
    solution: recipe.solution,
    par: recipe.par,
    stage: 'dough',
    dough: createDough(size),
    rolls: 0,
    sauceUntil: 0,
    board: emptyBoard(size),
    hand: [],
    moves: 0,
    turnPlayerId: null,
    startedAt: Date.now(),
    lastMove: null,
    lastRoll: null,
    history: [],
    resets: 0,
  };
}

export function push(game, { ingredient, side, lane, playerId }) {
  if (game.stage !== 'toppings') return { ok: false, error: 'Roll out the dough and add sauce first.' };
  if (!SIDES.includes(side)) return { ok: false, error: 'Pick a side of the pizza.' };
  if (!Number.isInteger(lane) || lane < 0 || lane >= game.size) {
    return { ok: false, error: 'That lane is off the pizza.' };
  }
  if (!game.hand.includes(ingredient)) return { ok: false, error: 'You do not have that ingredient card.' };
  if (game.mode !== 'chefs' && !game.palette.includes(ingredient) && ingredient !== 'cheese') {
    return { ok: false, error: 'That ingredient is not in this recipe.' };
  }
  const snapshot = {
    board: [...game.board],
    hand: [...game.hand],
    moves: game.moves,
    turnPlayerId: game.turnPlayerId,
    lastMove: game.lastMove ? { ...game.lastMove } : null,
    playerId,
  };
  game.board = applyPushToBoard(game.board, game.size, side, lane, ingredient);
  game.moves += 1;
  game.lastMove = { ingredient, side, lane, playerId, at: Date.now() };
  game.history.push(snapshot);
  if (game.history.length > 80) game.history.shift();
  return { ok: true };
}

export function undo(game) {
  const snap = game.history.pop();
  if (!snap) return { ok: false, error: 'There is nothing to undo.' };
  game.board = snap.board;
  game.hand = snap.hand;
  game.moves = snap.moves;
  game.turnPlayerId = snap.turnPlayerId;
  game.lastMove = snap.lastMove;
  return { ok: true, snapshot: snap };
}

export function resetGameBoard(game) {
  game.board = emptyBoard(game.size);
  game.stage = 'dough';
  game.dough = createDough(game.size);
  game.rolls = 0;
  game.sauceUntil = 0;
  game.moves = 0;
  game.hand = [];
  game.history = [];
  game.lastMove = null;
  game.lastRoll = null;
  game.resets += 1;
  game.startedAt = Date.now();
}

// ---------------------------------------------------------------------------
// Oven mini-game
// ---------------------------------------------------------------------------

export const COOK = {
  duration: 10, // seconds
  decay: 24, // heat lost per second
  tapHeat: 11,
  bandLow: 42,
  bandHigh: 82,
  burnAbove: 88,
  maxHeat: 100,
};

export function createCook(duration = COOK.duration) {
  return {
    startedAt: Date.now(),
    elapsed: 0,
    duration,
    heat: 46,
    timeInBand: 0,
    burn: 0,
    quality: 0,
    taps: {},
    finished: false,
    result: null,
  };
}

export function tickCook(cook, dt) {
  if (cook.finished) return cook;
  const step = Math.min(dt, 0.25);
  cook.elapsed = Math.min(cook.duration, cook.elapsed + step);
  cook.heat = Math.max(0, cook.heat - COOK.decay * step);
  if (cook.heat >= COOK.bandLow && cook.heat <= COOK.bandHigh) cook.timeInBand += step;
  if (cook.heat > COOK.burnAbove) cook.burn += step;
  cook.quality = clamp((cook.timeInBand / cook.duration) * 100 - cook.burn * 1.6, 0, 100);
  if (cook.elapsed >= cook.duration - 1e-6) cook.finished = true;
  return cook;
}

export function tapCook(cook, playerId) {
  if (cook.finished) return;
  cook.heat = Math.min(COOK.maxHeat, cook.heat + COOK.tapHeat);
  cook.taps[playerId] = (cook.taps[playerId] || 0) + 1;
}

export function finishCook(cook) {
  const quality = Math.round(clamp((cook.timeInBand / cook.duration) * 100 - cook.burn * 1.6, 0, 100));
  cook.quality = quality;
  cook.finished = true;
  let label = 'Raw dough';
  let stars = 0;
  if (quality >= 95) { label = 'Legendary slice'; stars = 5; }
  else if (quality >= 80) { label = 'Perfectly baked'; stars = 4; }
  else if (quality >= 60) { label = 'Nicely golden'; stars = 3; }
  else if (quality >= 35) { label = 'A bit uneven'; stars = 2; }
  else if (quality >= 12) { label = 'Soggy centre'; stars = 1; }
  if (cook.burn > 3.5 && quality < 55) { label = 'Cremated crust'; stars = 0; }
  const result = { quality, label, stars, burn: Math.round(cook.burn * 10) / 10, timeInBand: Math.round(cook.timeInBand * 10) / 10 };
  cook.result = result;
  return result;
}

export function pizzaScore({ mode, size, moves, par, elapsedMs, quality, resets = 0 }) {
  const base = 400 + size * 90;
  const speedBonus = Math.max(0, Math.round(260 - (elapsedMs / 1000) * 2.2));
  const efficiencyBonus = par ? Math.max(0, Math.round((par * 2 - moves) * 8)) : 0;
  const resetPenalty = resets * 80;
  const cookBonus = Math.round((quality / 100) * 420);
  return Math.max(50, base + speedBonus + efficiencyBonus + cookBonus - resetPenalty);
}

export function scorePizza(game, { quality, elapsedMs }) {
  return pizzaScore({
    mode: game.mode,
    size: game.size,
    moves: game.moves,
    par: game.par,
    elapsedMs,
    quality,
    resets: game.resets,
  });
}
