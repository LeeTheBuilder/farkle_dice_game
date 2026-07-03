const test = require("node:test");
const assert = require("node:assert/strict");
const Rules = require("../src/rules.js");

function assertScore(values, expectedScore, expectedLabels) {
  const result = Rules.scoreDice(values);
  assert.equal(result.valid, true, result.reason);
  assert.equal(result.score, expectedScore);

  if (expectedLabels) {
    assert.deepEqual(
      result.combinations.map((combo) => combo.label),
      expectedLabels,
    );
  }
}

test("scores single ones and fives", () => {
  assertScore([1], 100);
  assertScore([5], 50);
  assertScore([1, 5], 150);
  assertScore([1, 1], 200);
  assertScore([5, 5], 100);
});

test("scores triples", () => {
  assertScore([1, 1, 1], 1000);
  assertScore([2, 2, 2], 200);
  assertScore([3, 3, 3], 300);
  assertScore([4, 4, 4], 400);
  assertScore([5, 5, 5], 500);
  assertScore([6, 6, 6], 600);
});

test("doubles kind scores past triples", () => {
  assertScore([2, 2, 2, 2], 400);
  assertScore([2, 2, 2, 2, 2], 800);
  assertScore([2, 2, 2, 2, 2, 2], 1600);
  assertScore([1, 1, 1, 1], 2000);
  assertScore([1, 1, 1, 1, 1, 1], 8000);
  assertScore([6, 6, 6, 6], 1200);
});

test("scores short and full straights", () => {
  assertScore([1, 2, 3, 4, 5], 500, ["Straight 1-5"]);
  assertScore([2, 3, 4, 5, 6], 750, ["Straight 2-6"]);
  assertScore([1, 2, 3, 4, 5, 6], 1500, ["Full straight"]);
});

test("scores mixed legal sets from one roll", () => {
  assertScore([3, 3, 3, 1, 5], 450);
  assertScore([1, 2, 3, 4, 5, 5], 550);
  assertScore([1, 1, 2, 3, 4, 5], 600);
  assertScore([2, 2, 2, 3, 3, 3], 500);
});

test("rejects selected dice that cannot be fully scored", () => {
  assert.equal(Rules.scoreDice([2]).valid, false);
  assert.equal(Rules.scoreDice([2, 2]).valid, false);
  assert.equal(Rules.scoreDice([2, 3, 4, 6]).valid, false);
  assert.equal(Rules.scoreDice([1, 2, 3, 4]).valid, false);
});

test("detects bust rolls", () => {
  assert.equal(Rules.isBust([2, 2, 3, 3, 4, 6]), true);
  assert.equal(Rules.isBust([2, 2, 2, 3, 4, 6]), false);
  assert.equal(Rules.isBust([1, 2, 3, 4, 6, 6]), false);
  assert.equal(Rules.isBust([1, 2, 3, 4, 5]), false);
});

test("validates selections against the current roll only", () => {
  const roll = [3, 3, 3, 4, 4, 5];
  const triple = Rules.validateSelection(roll, [0, 1, 2]);
  const pair = Rules.validateSelection(roll, [3, 4]);
  const duplicate = Rules.validateSelection(roll, [0, 0]);

  assert.equal(triple.valid, true);
  assert.equal(triple.score, 300);
  assert.equal(pair.valid, false);
  assert.equal(duplicate.valid, false);
});
