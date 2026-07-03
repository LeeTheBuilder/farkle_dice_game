(function (root, factory) {
  const rules = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = rules;
  }

  root.FarkleRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_TARGET_SCORE = 4000;
  const PHASES = {
    SELECTING: "selecting",
    BUST: "bust",
    GAME_OVER: "game-over",
  };

  function normalizeDice(values) {
    if (!Array.isArray(values)) {
      throw new TypeError("Dice values must be an array.");
    }

    return values.map((value) => {
      const numeric = Number(value);
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > 6) {
        throw new RangeError("Dice values must be integers from 1 to 6.");
      }
      return numeric;
    });
  }

  function makeFaceCounts(values) {
    const counts = Array(7).fill(0);
    normalizeDice(values).forEach((value) => {
      counts[value] += 1;
    });
    return counts;
  }

  function emptyCounts() {
    return Array(7).fill(0);
  }

  function cloneCounts(counts) {
    return counts.slice();
  }

  function countsKey(counts) {
    return counts.slice(1).join(",");
  }

  function allCountsZero(counts) {
    return counts.slice(1).every((count) => count === 0);
  }

  function canApplyCombo(counts, combo) {
    for (let face = 1; face <= 6; face += 1) {
      if (combo.counts[face] > counts[face]) {
        return false;
      }
    }
    return true;
  }

  function subtractCombo(counts, combo) {
    const next = cloneCounts(counts);
    for (let face = 1; face <= 6; face += 1) {
      next[face] -= combo.counts[face];
    }
    return next;
  }

  function faceName(face) {
    return ["", "ones", "twos", "threes", "fours", "fives", "sixes"][face];
  }

  function kindScore(face, count) {
    const base = face === 1 ? 1000 : face * 100;
    return base * 2 ** (count - 3);
  }

  function makeCombo(label, faces, score) {
    const counts = emptyCounts();
    faces.forEach((face) => {
      counts[face] += 1;
    });
    return {
      label,
      counts,
      dice: faces.slice(),
      score,
    };
  }

  function buildScoringCombos(counts) {
    const combos = [];

    if (counts[1] > 0) {
      combos.push(makeCombo("Single one", [1], 100));
    }

    if (counts[5] > 0) {
      combos.push(makeCombo("Single five", [5], 50));
    }

    for (let face = 1; face <= 6; face += 1) {
      for (let count = 3; count <= counts[face]; count += 1) {
        combos.push(
          makeCombo(
            `${count} ${faceName(face)}`,
            Array(count).fill(face),
            kindScore(face, count),
          ),
        );
      }
    }

    if ([1, 2, 3, 4, 5].every((face) => counts[face] > 0)) {
      combos.push(makeCombo("Straight 1-5", [1, 2, 3, 4, 5], 500));
    }

    if ([2, 3, 4, 5, 6].every((face) => counts[face] > 0)) {
      combos.push(makeCombo("Straight 2-6", [2, 3, 4, 5, 6], 750));
    }

    if ([1, 2, 3, 4, 5, 6].every((face) => counts[face] > 0)) {
      combos.push(makeCombo("Full straight", [1, 2, 3, 4, 5, 6], 1500));
    }

    return combos.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.dice.length - a.dice.length;
    });
  }

  function findBestExactCover(counts, combos, memo) {
    if (allCountsZero(counts)) {
      return { score: 0, combinations: [] };
    }

    const key = countsKey(counts);
    if (memo.has(key)) {
      return memo.get(key);
    }

    const firstFace = counts.findIndex((count, face) => face > 0 && count > 0);
    let best = null;

    combos.forEach((combo) => {
      if (combo.counts[firstFace] === 0 || !canApplyCombo(counts, combo)) {
        return;
      }

      const remainder = findBestExactCover(subtractCombo(counts, combo), combos, memo);
      if (!remainder) {
        return;
      }

      const candidate = {
        score: combo.score + remainder.score,
        combinations: [combo].concat(remainder.combinations),
      };

      if (
        !best ||
        candidate.score > best.score ||
        (candidate.score === best.score &&
          candidate.combinations.length < best.combinations.length)
      ) {
        best = candidate;
      }
    });

    memo.set(key, best);
    return best;
  }

  function scoreDice(values) {
    const dice = normalizeDice(values);

    if (dice.length === 0) {
      return {
        valid: false,
        score: 0,
        combinations: [],
        reason: "Select at least one die.",
      };
    }

    if (dice.length > 6) {
      return {
        valid: false,
        score: 0,
        combinations: [],
        reason: "A selection cannot contain more than six dice.",
      };
    }

    const counts = makeFaceCounts(dice);
    const best = findBestExactCover(counts, buildScoringCombos(counts), new Map());

    if (!best) {
      return {
        valid: false,
        score: 0,
        combinations: [],
        reason: "Those dice do not form a scoring set.",
      };
    }

    return {
      valid: true,
      score: best.score,
      combinations: best.combinations,
      diceUsed: dice.length,
      label: best.combinations.map((combo) => combo.label).join(", "),
    };
  }

  function hasStraight(values, faces) {
    const counts = makeFaceCounts(values);
    return faces.every((face) => counts[face] > 0);
  }

  function getPotentialScoringIndexes(values) {
    const dice = normalizeDice(values);
    const counts = makeFaceCounts(dice);
    const hasStraightOneToFive = [1, 2, 3, 4, 5].every((face) => counts[face] > 0);
    const hasStraightTwoToSix = [2, 3, 4, 5, 6].every((face) => counts[face] > 0);

    return dice.reduce((indexes, value, index) => {
      const isPotential =
        value === 1 ||
        value === 5 ||
        counts[value] >= 3 ||
        (hasStraightOneToFive && value >= 1 && value <= 5) ||
        (hasStraightTwoToSix && value >= 2 && value <= 6);

      if (isPotential) {
        indexes.push(index);
      }

      return indexes;
    }, []);
  }

  function isBust(values) {
    return getPotentialScoringIndexes(values).length === 0;
  }

  function normalizeSelectedIndexes(selectedIndexes) {
    if (selectedIndexes instanceof Set) {
      return Array.from(selectedIndexes);
    }

    if (!Array.isArray(selectedIndexes)) {
      throw new TypeError("Selected indexes must be an array or Set.");
    }

    return selectedIndexes.slice();
  }

  function validateSelection(rollValues, selectedIndexes) {
    const values = normalizeDice(rollValues);
    const indexes = normalizeSelectedIndexes(selectedIndexes);
    const seen = new Set();

    if (indexes.length === 0) {
      return {
        valid: false,
        score: 0,
        selectedIndexes: [],
        selectedValues: [],
        combinations: [],
        reason: "Select scoring dice first.",
      };
    }

    for (const index of indexes) {
      if (!Number.isInteger(index) || index < 0 || index >= values.length) {
        return {
          valid: false,
          score: 0,
          selectedIndexes: indexes,
          selectedValues: [],
          combinations: [],
          reason: "Selected dice must belong to the current roll.",
        };
      }

      if (seen.has(index)) {
        return {
          valid: false,
          score: 0,
          selectedIndexes: indexes,
          selectedValues: [],
          combinations: [],
          reason: "The same die cannot be selected twice.",
        };
      }

      seen.add(index);
    }

    const selectedValues = indexes.map((index) => values[index]);
    return Object.assign(scoreDice(selectedValues), {
      selectedIndexes: indexes,
      selectedValues,
    });
  }

  function listScoringSelections(rollValues) {
    const values = normalizeDice(rollValues);
    const selections = [];
    const seenValueSets = new Set();
    const maskLimit = 1 << values.length;

    for (let mask = 1; mask < maskLimit; mask += 1) {
      const indexes = [];
      for (let index = 0; index < values.length; index += 1) {
        if (mask & (1 << index)) {
          indexes.push(index);
        }
      }

      const selection = validateSelection(values, indexes);
      if (!selection.valid) {
        continue;
      }

      const valueKey = selection.selectedValues.slice().sort().join(",");
      const key = `${selection.score}|${valueKey}`;
      if (seenValueSets.has(key)) {
        continue;
      }

      seenValueSets.add(key);
      selections.push(selection);
    }

    return selections.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.selectedIndexes.length !== a.selectedIndexes.length) {
        return b.selectedIndexes.length - a.selectedIndexes.length;
      }
      return a.selectedIndexes.join(",").localeCompare(b.selectedIndexes.join(","));
    });
  }

  function rollDice(count, rng) {
    const diceCount = Number(count);
    const random = rng || Math.random;

    if (!Number.isInteger(diceCount) || diceCount < 1 || diceCount > 6) {
      throw new RangeError("Can only roll between one and six dice.");
    }

    return Array.from({ length: diceCount }, () => {
      const raw = Number(random());
      if (!Number.isFinite(raw)) {
        throw new TypeError("Random generator must return a number.");
      }

      const bounded = Math.max(0, Math.min(raw, 0.999999999));
      return Math.floor(bounded * 6) + 1;
    });
  }

  function sanitizePlayerNames(playerNames) {
    const names = Array.isArray(playerNames) ? playerNames : [];
    return [0, 1].map((index) => {
      const fallback = `Player ${index + 1}`;
      const value = String(names[index] || fallback).trim();
      return value || fallback;
    });
  }

  function sanitizeTargetScore(targetScore) {
    const numeric = Number(targetScore);
    if (!Number.isFinite(numeric)) {
      return DEFAULT_TARGET_SCORE;
    }
    return Math.max(500, Math.min(50000, Math.round(numeric)));
  }

  function makeDiceObjects(values, rollNumber) {
    return values.map((value, index) => ({
      id: `r${rollNumber}d${index}`,
      value,
    }));
  }

  function getRollValues(state) {
    return state.dice.map((die) => die.value);
  }

  function activePlayer(state) {
    return state.players[state.activePlayerIndex];
  }

  function switchPlayerIndex(index) {
    return index === 0 ? 1 : 0;
  }

  function rollIntoState(state, count, rng, options) {
    const values = rollDice(count, rng);
    const rollNumber = state.rollNumber + 1;
    const busted = isBust(values);
    const lostTurnScore = busted ? state.turnScore : 0;
    const player = activePlayer(state);
    const message =
      options && options.message
        ? options.message
        : `${player.name} rolls ${count} dice.`;

    return Object.assign({}, state, {
      dice: makeDiceObjects(values, rollNumber),
      rollNumber,
      diceToRoll: count,
      phase: busted ? PHASES.BUST : PHASES.SELECTING,
      turnScore: busted ? 0 : state.turnScore,
      lostTurnScore,
      lastRollWasHotDice: Boolean(options && options.hotDice),
      message: busted
        ? `${player.name} busts and loses ${lostTurnScore} turn points.`
        : message,
    });
  }

  function createGame(options) {
    const config = options || {};
    const names = sanitizePlayerNames(config.playerNames);
    const players = names.map((name) => ({ name, score: 0 }));
    const state = {
      players,
      targetScore: sanitizeTargetScore(config.targetScore),
      activePlayerIndex: 0,
      turnScore: 0,
      dice: [],
      diceToRoll: 6,
      phase: PHASES.SELECTING,
      rollNumber: 0,
      winnerIndex: null,
      lostTurnScore: 0,
      lastBanked: 0,
      lastRollWasHotDice: false,
      message: "",
    };

    return rollIntoState(state, 6, config.rng || Math.random, {
      message: `${players[0].name} opens the match.`,
    });
  }

  function assertSelectableState(state) {
    if (!state || state.phase !== PHASES.SELECTING) {
      throw new Error("Dice can only be scored while a roll is active.");
    }
  }

  function scoreAndContinue(state, selectedIndexes, rng) {
    assertSelectableState(state);

    const selection = validateSelection(getRollValues(state), selectedIndexes);
    if (!selection.valid) {
      throw new Error(selection.reason);
    }

    const usedAllDice = selection.selectedIndexes.length === state.dice.length;
    const nextDiceCount = usedAllDice ? 6 : state.dice.length - selection.selectedIndexes.length;
    const nextState = Object.assign({}, state, {
      turnScore: state.turnScore + selection.score,
      lostTurnScore: 0,
      lastBanked: 0,
    });

    return rollIntoState(nextState, nextDiceCount, rng || Math.random, {
      hotDice: usedAllDice,
      message: usedAllDice
        ? `${activePlayer(state).name} scores all dice and rolls six again.`
        : `${activePlayer(state).name} keeps ${selection.score} and rolls ${nextDiceCount}.`,
    });
  }

  function scoreAndPass(state, selectedIndexes, rng) {
    assertSelectableState(state);

    const selection = validateSelection(getRollValues(state), selectedIndexes);
    if (!selection.valid) {
      throw new Error(selection.reason);
    }

    const banked = state.turnScore + selection.score;
    const players = state.players.map((player) => Object.assign({}, player));
    players[state.activePlayerIndex].score += banked;

    if (players[state.activePlayerIndex].score >= state.targetScore) {
      return Object.assign({}, state, {
        players,
        phase: PHASES.GAME_OVER,
        turnScore: 0,
        winnerIndex: state.activePlayerIndex,
        lastBanked: banked,
        lostTurnScore: 0,
        message: `${players[state.activePlayerIndex].name} wins with ${players[state.activePlayerIndex].score} points.`,
      });
    }

    const nextActivePlayerIndex = switchPlayerIndex(state.activePlayerIndex);
    const nextState = Object.assign({}, state, {
      players,
      activePlayerIndex: nextActivePlayerIndex,
      turnScore: 0,
      lostTurnScore: 0,
      lastBanked: banked,
      lastRollWasHotDice: false,
    });

    return rollIntoState(nextState, 6, rng || Math.random, {
      message: `${players[switchPlayerIndex(nextActivePlayerIndex)].name} banks ${banked}. ${players[nextActivePlayerIndex].name} rolls.`,
    });
  }

  function acknowledgeBust(state, rng) {
    if (!state || state.phase !== PHASES.BUST) {
      throw new Error("There is no bust to acknowledge.");
    }

    const nextActivePlayerIndex = switchPlayerIndex(state.activePlayerIndex);
    const nextState = Object.assign({}, state, {
      activePlayerIndex: nextActivePlayerIndex,
      turnScore: 0,
      lostTurnScore: 0,
      lastRollWasHotDice: false,
    });

    return rollIntoState(nextState, 6, rng || Math.random, {
      message: `${state.players[nextActivePlayerIndex].name} rolls.`,
    });
  }

  function chooseAiMove(state, options) {
    const config = Object.assign(
      {
        passThreshold: 500,
        lowDicePassThreshold: 300,
        trailingBoostAt: 750,
        trailingExtraRisk: 200,
        leadingLockAt: 750,
        leadingLowerRisk: 100,
      },
      options || {},
    );

    if (!state || state.phase === PHASES.GAME_OVER) {
      return {
        action: "wait",
        selectedIndexes: [],
        selection: null,
        reason: "No active AI move.",
      };
    }

    if (state.phase === PHASES.BUST) {
      return {
        action: "acknowledge-bust",
        selectedIndexes: [],
        selection: null,
        reason: "Bust must pass to the next player.",
      };
    }

    assertSelectableState(state);

    const selections = listScoringSelections(getRollValues(state));
    if (selections.length === 0) {
      return {
        action: "acknowledge-bust",
        selectedIndexes: [],
        selection: null,
        reason: "No scoring dice are available.",
      };
    }

    const selection = selections[0];
    const player = activePlayer(state);
    const opponent = state.players[switchPlayerIndex(state.activePlayerIndex)];
    const turnTotal = state.turnScore + selection.score;
    const totalIfPassed = player.score + turnTotal;
    const usedAllDice = selection.selectedIndexes.length === state.dice.length;
    const nextDiceCount = usedAllDice ? 6 : state.dice.length - selection.selectedIndexes.length;
    let passThreshold = config.passThreshold;

    if (opponent.score - player.score >= config.trailingBoostAt) {
      passThreshold += config.trailingExtraRisk;
    }

    if (player.score - opponent.score >= config.leadingLockAt) {
      passThreshold -= config.leadingLowerRisk;
    }

    let action = "continue";
    let reason = `Keeps ${selection.score} and presses the turn.`;

    if (totalIfPassed >= state.targetScore) {
      action = "pass";
      reason = "Banks enough to win.";
    } else if (!usedAllDice && nextDiceCount <= 2 && turnTotal >= config.lowDicePassThreshold) {
      action = "pass";
      reason = "Banks before rolling too few dice.";
    } else if (turnTotal >= passThreshold) {
      action = "pass";
      reason = `Banks ${turnTotal} turn points.`;
    }

    return {
      action,
      selectedIndexes: selection.selectedIndexes.slice(),
      selection,
      reason,
      nextDiceCount,
      turnTotal,
      totalIfPassed,
    };
  }

  return {
    DEFAULT_TARGET_SCORE,
    PHASES,
    acknowledgeBust,
    chooseAiMove,
    createGame,
    getPotentialScoringIndexes,
    hasStraight,
    isBust,
    listScoringSelections,
    rollDice,
    scoreAndContinue,
    scoreAndPass,
    scoreDice,
    validateSelection,
  };
});
