const test = require("node:test");
const assert = require("node:assert/strict");
const Rules = require("../src/rules.js");

function rngForDice(values) {
  let index = 0;

  return () => {
    if (index >= values.length) {
      throw new Error("RNG fixture ran out of dice values.");
    }

    const value = values[index];
    index += 1;
    return (value - 1) / 6 + 0.001;
  };
}

function values(state) {
  return state.dice.map((die) => die.value);
}

test("starts a two-player game with a six-die roll", () => {
  const game = Rules.createGame({
    playerNames: ["Ada", "Grace"],
    targetScore: 4000,
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });

  assert.equal(game.phase, Rules.PHASES.SELECTING);
  assert.equal(game.activePlayerIndex, 0);
  assert.deepEqual(values(game), [1, 2, 3, 4, 6, 6]);
  assert.deepEqual(game.players.map((player) => player.name), ["Ada", "Grace"]);
});

test("score and pass banks points and switches players", () => {
  const game = Rules.createGame({
    playerNames: ["Ada", "Grace"],
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });

  const next = Rules.scoreAndPass(game, [0], rngForDice([5, 2, 3, 4, 6, 6]));

  assert.equal(next.players[0].score, 100);
  assert.equal(next.players[1].score, 0);
  assert.equal(next.activePlayerIndex, 1);
  assert.equal(next.turnScore, 0);
  assert.equal(next.phase, Rules.PHASES.SELECTING);
  assert.deepEqual(values(next), [5, 2, 3, 4, 6, 6]);
});

test("score and continue carries turn score and rolls remaining dice", () => {
  const game = Rules.createGame({
    rng: rngForDice([1, 5, 2, 3, 4, 6]),
  });

  const next = Rules.scoreAndContinue(game, [0], rngForDice([5, 2, 3, 4, 6]));

  assert.equal(next.turnScore, 100);
  assert.equal(next.dice.length, 5);
  assert.deepEqual(values(next), [5, 2, 3, 4, 6]);
});

test("hot dice reset the next roll to six dice", () => {
  const game = Rules.createGame({
    rng: rngForDice([1, 2, 3, 4, 5, 6]),
  });

  const next = Rules.scoreAndContinue(
    game,
    [0, 1, 2, 3, 4, 5],
    rngForDice([1, 1, 1, 2, 3, 4]),
  );

  assert.equal(next.turnScore, 1500);
  assert.equal(next.lastRollWasHotDice, true);
  assert.equal(next.dice.length, 6);
  assert.deepEqual(values(next), [1, 1, 1, 2, 3, 4]);
});

test("bust loses unbanked turn points and next player starts after acknowledgement", () => {
  const game = Rules.createGame({
    playerNames: ["Ada", "Grace"],
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });

  const bust = Rules.scoreAndContinue(game, [0], rngForDice([2, 2, 3, 3, 4]));

  assert.equal(bust.phase, Rules.PHASES.BUST);
  assert.equal(bust.players[0].score, 0);
  assert.equal(bust.turnScore, 0);
  assert.equal(bust.lostTurnScore, 100);
  assert.equal(bust.activePlayerIndex, 0);

  const next = Rules.acknowledgeBust(bust, rngForDice([5, 2, 3, 4, 6, 6]));

  assert.equal(next.activePlayerIndex, 1);
  assert.equal(next.phase, Rules.PHASES.SELECTING);
  assert.deepEqual(values(next), [5, 2, 3, 4, 6, 6]);
});

test("banking enough points ends the game immediately", () => {
  const game = Rules.createGame({
    playerNames: ["Ada", "Grace"],
    targetScore: 500,
    rng: rngForDice([1, 2, 3, 4, 5, 6]),
  });

  const final = Rules.scoreAndPass(game, [0, 1, 2, 3, 4, 5]);

  assert.equal(final.phase, Rules.PHASES.GAME_OVER);
  assert.equal(final.winnerIndex, 0);
  assert.equal(final.players[0].score, 1500);
  assert.match(final.message, /wins/);
});

test("invalid selections cannot advance the turn", () => {
  const game = Rules.createGame({
    rng: rngForDice([2, 2, 3, 3, 4, 5]),
  });

  assert.throws(() => Rules.scoreAndContinue(game, [0, 1]), /scoring set/);
  assert.throws(() => Rules.scoreAndPass(game, [0, 1]), /scoring set/);
});
