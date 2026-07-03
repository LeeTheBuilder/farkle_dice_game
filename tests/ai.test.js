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

test("lists only legal scoring selections", () => {
  const selections = Rules.listScoringSelections([1, 2, 3, 4, 6, 6]);

  assert.equal(selections.length, 1);
  assert.equal(selections[0].score, 100);
  assert.deepEqual(selections[0].selectedIndexes, [0]);
});

test("AI keeps rolling on a low-value safe turn", () => {
  const game = Rules.createGame({
    playerNames: ["Human", "Tavern AI"],
    rng: rngForDice([1, 2, 3, 4, 6, 6]),
  });

  const move = Rules.chooseAiMove(game);

  assert.equal(move.action, "continue");
  assert.equal(move.selection.score, 100);
  assert.deepEqual(move.selectedIndexes, [0]);
});

test("AI banks a strong selection", () => {
  const game = Rules.createGame({
    playerNames: ["Human", "Tavern AI"],
    rng: rngForDice([1, 1, 1, 2, 3, 4]),
  });

  const move = Rules.chooseAiMove(game);

  assert.equal(move.action, "pass");
  assert.equal(move.selection.score, 1000);
  assert.deepEqual(move.selectedIndexes, [0, 1, 2]);
});

test("AI banks immediately when the selection wins", () => {
  const game = Rules.createGame({
    playerNames: ["Human", "Tavern AI"],
    targetScore: 500,
    rng: rngForDice([1, 2, 3, 4, 5, 6]),
  });

  const move = Rules.chooseAiMove(game);

  assert.equal(move.action, "pass");
  assert.equal(move.selection.score, 1500);
  assert.deepEqual(move.selectedIndexes, [0, 1, 2, 3, 4, 5]);
  assert.equal(move.totalIfPassed, 1500);
});

test("AI acknowledges a bust state", () => {
  const game = Rules.createGame({
    playerNames: ["Human", "Tavern AI"],
    rng: rngForDice([2, 2, 3, 3, 4, 6]),
  });

  const move = Rules.chooseAiMove(game);

  assert.equal(game.phase, Rules.PHASES.BUST);
  assert.equal(move.action, "acknowledge-bust");
});
