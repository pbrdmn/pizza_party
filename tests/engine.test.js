import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRecipe,
  solveRecipe,
  applyPushToBoard,
  emptyBoard,
  boardsMatch,
  makeHand,
  push,
  undo,
  createPizza,
  createCook,
  tickCook,
  tapCook,
  finishCook,
  pizzaScore,
  mulberry32,
  mismatches,
  createDough,
  doughComplete,
  doughCount,
  rollDough,
  validRollSides,
  resetGameBoard,
} from '../server/engine.js';

test('recipes always have a valid solution from an all-cheese pizza', () => {
  for (const size of [4, 5, 6, 7, 8, 9]) {
    for (let seed = 0; seed < 30; seed++) {
      const recipe = generateRecipe(size, mulberry32(size * 1000 + seed));
      assert.equal(recipe.palette.length, 3);
      assert.equal(new Set(recipe.palette).size, 3);
      let board = emptyBoard(size);
      for (const move of recipe.solution) {
        board = applyPushToBoard(board, size, move.side, move.lane, move.ingredient);
      }
      assert.ok(boardsMatch(board, recipe.target), `size ${size} seed ${seed} should be solvable`);
      assert.ok(recipe.target.some((t) => t !== 'cheese'), 'target has toppings');
      assert.ok(recipe.target.every((t) => t === 'cheese' || recipe.palette.includes(t)));
      assert.equal(recipe.par, recipe.solution.length);
    }
  }
});

test('solveRecipe works on handcrafted targets from either side', () => {
  const size = 4;
  const target = [
    'cheese', 'cheese', 'cheese', 'cheese',
    'cheese', 'basil', 'pepperoni', 'cheese',
    'cheese', 'olive', 'tomato', 'cheese',
    'cheese', 'cheese', 'cheese', 'cheese',
  ];
  const solution = solveRecipe(target, size, mulberry32(3));
  let board = emptyBoard(size);
  for (const move of solution) board = applyPushToBoard(board, size, move.side, move.lane, move.ingredient);
  assert.deepEqual(board, target);
});

test('pushing shifts the lane and drops the far edge topping', () => {
  const size = 3;
  let board = emptyBoard(size);
  board[0] = 'tomato';
  board[1] = 'olive';
  const next = applyPushToBoard(board, size, 'L', 0, 'basil');
  assert.deepEqual(next.slice(0, 3), ['basil', 'tomato', 'olive']);
  const right = applyPushToBoard(next, size, 'R', 0, 'cheese');
  assert.deepEqual(right.slice(0, 3), ['tomato', 'olive', 'cheese']);
  const top = applyPushToBoard(board, size, 'T', 0, 'pepperoni');
  assert.deepEqual(top.slice(0, 3), ['pepperoni', 'olive', 'cheese']);
});

test('hands contain every recipe ingredient', () => {
  const palette = ['basil', 'olive', 'tomato'];
  for (let i = 0; i < 20; i++) {
    const hand = makeHand('party', palette, mulberry32(i));
    assert.equal(hand.length, 4);
    for (const ing of ['cheese', ...palette]) assert.ok(hand.includes(ing));
  }
});

test('push validates hand, lane and side; undo restores the board', () => {
  const game = createPizza({ mode: 'party', size: 4, rng: mulberry32(9) });
  game.stage = 'toppings';
  game.hand = makeHand('party', game.palette, mulberry32(1));
  game.turnPlayerId = 'p1';
  const before = [...game.board];
  assert.equal(push(game, { ingredient: game.palette[0], side: 'L', lane: 0, playerId: 'p1' }).ok, true);
  assert.notDeepEqual(game.board, before);
  assert.equal(push(game, { ingredient: game.palette[0], side: 'Z', lane: 0, playerId: 'p1' }).ok, false);
  assert.equal(push(game, { ingredient: 'cheese', side: 'L', lane: 99, playerId: 'p1' }).ok, false);
  const missing = ['pepperoni', 'tomato', 'basil', 'olive', 'mushroom', 'pineapple', 'onion'].find((i) => !game.hand.includes(i));
  assert.equal(push(game, { ingredient: missing, side: 'L', lane: 0, playerId: 'p1' }).ok, false);
  const result = undo(game);
  assert.equal(result.ok, true);
  assert.deepEqual(game.board, before);
  assert.equal(game.moves, 0);
});

test('win detection compares every cell, including cheese cells', () => {
  const target = ['cheese', 'cheese', 'cheese', 'cheese'];
  assert.equal(boardsMatch([...target], target), true);
  assert.equal(boardsMatch(['tomato', 'cheese', 'cheese', 'cheese'], target), false);
  assert.equal(mismatches(['tomato', 'cheese', 'cheese', 'cheese'], target), 1);
});

test('oven cooking rewards keeping the heat in the golden band', () => {
  const cook = createCook(10);
  cook.heat = 60;
  // Simulate a chef tapping to hold a steady temperature.
  for (let i = 0; i < 200; i++) {
    tickCook(cook, 0.05);
    if (cook.heat < 60) tapCook(cook, 'p1');
  }
  const result = finishCook(cook);
  assert.ok(result.quality > 60, `quality should be good, got ${result.quality}`);
  assert.ok(result.stars >= 3);
});

test('an untouched oven produces raw pizza and over-tapping burns it', () => {
  const raw = createCook(10);
  for (let i = 0; i < 220; i++) tickCook(raw, 0.05);
  const rawResult = finishCook(raw);
  assert.ok(rawResult.quality < 20);
  assert.equal(rawResult.stars, 0);

  const burnt = createCook(10);
  for (let i = 0; i < 220; i++) {
    tickCook(burnt, 0.05);
    tapCook(burnt, 'p1');
    tapCook(burnt, 'p2');
  }
  const burntResult = finishCook(burnt);
  assert.ok(burntResult.burn > 5);
  assert.ok(burntResult.quality < 50);
});

test('score rewards speed, efficiency and cooking quality', () => {
  const fast = pizzaScore({ mode: 'party', size: 4, moves: 10, par: 12, elapsedMs: 30_000, quality: 100 });
  const slow = pizzaScore({ mode: 'party', size: 4, moves: 10, par: 12, elapsedMs: 300_000, quality: 30 });
  assert.ok(fast > slow);
  assert.ok(fast > 1000);
});

test('a pizza starts as a ball of dough and can be rolled out from every edge', () => {
  for (const size of [4, 5, 6, 7, 8, 9]) {
    const game = createPizza({ mode: 'party', size, rng: mulberry32(size * 17) });
    assert.equal(game.stage, 'dough');
    assert.equal(doughCount(game.dough), size % 2 === 0 ? 4 : 1);
    assert.equal(doughComplete(game.dough), false);
    let guard = 0;
    while (!doughComplete(game.dough) && guard++ < 200) {
      const sides = validRollSides(game.dough, game.size);
      assert.ok(sides.length > 0, `size ${size} should still have a roll available`);
      const res = rollDough(game, { side: sides[0], playerId: 'p1' });
      assert.equal(res.ok, true);
    }
    assert.equal(doughComplete(game.dough), true, `size ${size} should be fully rolled out`);
    assert.equal(game.rolls, guard);
    assert.equal(rollDough(game, { side: 'L', playerId: 'p1' }).ok, false);
  }
});

test('dough must be rolled out before toppings can be pushed', () => {
  const game = createPizza({ mode: 'party', size: 4, rng: mulberry32(4) });
  game.hand = makeHand('party', game.palette, mulberry32(1));
  const res = push(game, { ingredient: 'cheese', side: 'L', lane: 0, playerId: 'p1' });
  assert.equal(res.ok, false);
  assert.match(res.error, /dough/i);
  resetGameBoard(game);
  assert.equal(game.stage, 'dough');
  assert.equal(game.rolls, 0);
  assert.equal(doughCount(game.dough), 4);
});

test('rolling one side only grows the dough on that side', () => {
  const size = 6;
  const dough = createDough(size);
  const before = doughCount(dough);
  const game = { size, dough, stage: 'dough', rolls: 0 };
  const res = rollDough(game, { side: 'L', playerId: 'p1' });
  assert.equal(res.ok, true);
  assert.ok(res.added > 0);
  assert.equal(doughCount(game.dough), before + res.added);
  // The new cells are all on the left edge of the existing dough.
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (game.dough[r * size + c] && !dough[r * size + c]) {
        assert.ok(game.dough[r * size + c + 1], 'new dough should touch the old dough');
      }
    }
  }
});
