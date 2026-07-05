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

test("sanitizes player names between two and six seats", () => {
  const twoPlayerMinimum = Rules.createGame({
    playerNames: ["Ada"],
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });
  const sixPlayerMaximum = Rules.createGame({
    playerNames: ["Ada", "", "Linus", "Margaret", "Tim", "Barbara", "Ignored"],
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });

  assert.deepEqual(twoPlayerMinimum.players.map((player) => player.name), ["Ada", "Theresa"]);
  assert.deepEqual(
    sixPlayerMaximum.players.map((player) => player.name),
    ["Ada", "Theresa", "Linus", "Margaret", "Tim", "Barbara"],
  );
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

test("score and pass advances through three players and wraps", () => {
  const game = Rules.createGame({
    playerNames: ["Ada", "Grace", "Linus"],
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });

  const secondTurn = Rules.scoreAndPass(game, [0], rngForDice([1, 2, 3, 4, 6, 6]));
  const thirdTurn = Rules.scoreAndPass(secondTurn, [0], rngForDice([1, 2, 3, 4, 6, 6]));
  const nextRound = Rules.scoreAndPass(thirdTurn, [0], rngForDice([5, 2, 3, 4, 6, 6]));

  assert.equal(secondTurn.activePlayerIndex, 1);
  assert.equal(thirdTurn.activePlayerIndex, 2);
  assert.equal(nextRound.activePlayerIndex, 0);
  assert.deepEqual(nextRound.players.map((player) => player.score), [100, 100, 100]);
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

test("bust acknowledgement wraps from the last player to the first", () => {
  const game = Rules.createGame({
    playerNames: ["Ada", "Grace", "Linus"],
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });
  game.activePlayerIndex = 2;

  const bust = Rules.scoreAndContinue(game, [0], rngForDice([2, 2, 3, 3, 4]));
  const next = Rules.acknowledgeBust(bust, rngForDice([5, 2, 3, 4, 6, 6]));

  assert.equal(next.activePlayerIndex, 0);
  assert.equal(next.phase, Rules.PHASES.SELECTING);
});

test("first player reaching target gives second player a response turn", () => {
  const game = Rules.createGame({
    playerNames: ["Ada", "Grace"],
    targetScore: 500,
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });
  game.players[0].score = 400;

  const response = Rules.scoreAndPass(game, [0], rngForDice([1, 2, 3, 4, 5, 6]));

  assert.equal(response.phase, Rules.PHASES.SELECTING);
  assert.equal(response.activePlayerIndex, 1);
  assert.equal(response.players[0].score, 500);
  assert.equal(response.winnerIndex, null);
  assert.match(response.message, /Final round continues/);
});

test("final round waits through all four players and allows an overtake", () => {
  const game = Rules.createGame({
    playerNames: ["Ada", "Grace", "Linus", "Margaret"],
    targetScore: 500,
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });
  game.players[0].score = 400;

  const secondTurn = Rules.scoreAndPass(game, [0], rngForDice([1, 2, 3, 4, 6, 6]));
  const thirdTurn = Rules.scoreAndPass(secondTurn, [0], rngForDice([1, 2, 3, 4, 6, 6]));
  const fourthTurn = Rules.scoreAndPass(thirdTurn, [0], rngForDice([1, 2, 3, 4, 5, 6]));
  const final = Rules.scoreAndPass(fourthTurn, [0, 1, 2, 3, 4, 5]);

  assert.equal(secondTurn.phase, Rules.PHASES.SELECTING);
  assert.equal(thirdTurn.phase, Rules.PHASES.SELECTING);
  assert.equal(fourthTurn.phase, Rules.PHASES.SELECTING);
  assert.equal(final.phase, Rules.PHASES.GAME_OVER);
  assert.equal(final.winnerIndex, 3);
  assert.deepEqual(final.players.map((player) => player.score), [500, 100, 100, 1500]);
});

test("a tied multiplayer table after the last response starts another round", () => {
  const game = Rules.createGame({
    playerNames: ["Ada", "Grace", "Linus"],
    targetScore: 500,
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });
  game.players[0].score = 400;
  game.players[1].score = 400;
  game.players[2].score = 400;

  const secondTurn = Rules.scoreAndPass(game, [0], rngForDice([1, 2, 3, 4, 6, 6]));
  const thirdTurn = Rules.scoreAndPass(secondTurn, [0], rngForDice([1, 2, 3, 4, 6, 6]));
  const nextRound = Rules.scoreAndPass(thirdTurn, [0], rngForDice([5, 2, 3, 4, 6, 6]));

  assert.equal(nextRound.phase, Rules.PHASES.SELECTING);
  assert.equal(nextRound.activePlayerIndex, 0);
  assert.equal(nextRound.winnerIndex, null);
  assert.deepEqual(nextRound.players.map((player) => player.score), [500, 500, 500]);
});

test("second player can overtake on the response turn and win", () => {
  const game = Rules.createGame({
    playerNames: ["Ada", "Grace"],
    targetScore: 500,
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });
  game.players[0].score = 400;

  const response = Rules.scoreAndPass(game, [0], rngForDice([1, 2, 3, 4, 5, 6]));
  const final = Rules.scoreAndPass(response, [0, 1, 2, 3, 4, 5]);

  assert.equal(final.phase, Rules.PHASES.GAME_OVER);
  assert.equal(final.winnerIndex, 1);
  assert.equal(final.players[0].score, 500);
  assert.equal(final.players[1].score, 1500);
  assert.match(final.message, /Grace wins/);
});

test("second player busting on the response turn ends the match", () => {
  const game = Rules.createGame({
    playerNames: ["Ada", "Grace"],
    targetScore: 500,
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });
  game.players[0].score = 400;

  const bust = Rules.scoreAndPass(game, [0], rngForDice([2, 2, 3, 3, 4, 6]));
  const final = Rules.acknowledgeBust(bust);

  assert.equal(bust.phase, Rules.PHASES.BUST);
  assert.equal(final.phase, Rules.PHASES.GAME_OVER);
  assert.equal(final.winnerIndex, 0);
});

test("a tied table after the response turn starts another round", () => {
  const game = Rules.createGame({
    playerNames: ["Ada", "Grace"],
    targetScore: 500,
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });
  game.players[0].score = 400;
  game.players[1].score = 400;

  const response = Rules.scoreAndPass(game, [0], rngForDice([1, 2, 3, 4, 6, 6]));
  const nextRound = Rules.scoreAndPass(response, [0], rngForDice([5, 2, 3, 4, 6, 6]));

  assert.equal(nextRound.phase, Rules.PHASES.SELECTING);
  assert.equal(nextRound.activePlayerIndex, 0);
  assert.equal(nextRound.winnerIndex, null);
  assert.deepEqual(nextRound.players.map((player) => player.score), [500, 500]);
  assert.match(nextRound.message, /tied/);
});

test("second player reaching target at round end completes the match", () => {
  const game = Rules.createGame({
    playerNames: ["Ada", "Grace"],
    targetScore: 500,
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });
  const playerTwoTurn = Rules.scoreAndPass(game, [0], rngForDice([1, 2, 3, 4, 6, 6]));
  playerTwoTurn.players[1].score = 400;

  const final = Rules.scoreAndPass(playerTwoTurn, [0]);

  assert.equal(final.phase, Rules.PHASES.GAME_OVER);
  assert.equal(final.winnerIndex, 1);
  assert.deepEqual(final.players.map((player) => player.score), [100, 500]);
});

test("invalid selections cannot advance the turn", () => {
  const game = Rules.createGame({
    rng: rngForDice([2, 2, 3, 3, 4, 5]),
  });

  assert.throws(() => Rules.scoreAndContinue(game, [0, 1]), /scoring set/);
  assert.throws(() => Rules.scoreAndPass(game, [0, 1]), /scoring set/);
});
