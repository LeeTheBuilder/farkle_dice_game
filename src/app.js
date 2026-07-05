(function () {
  "use strict";

  const Rules = window.FarkleRules;
  const Music = window.TavernMusic;
  const tavernMusic = Music ? Music.createTavernMusic() : null;
  const selectedIndexes = new Set();
  const AI_PLAYER_INDEX = 1;
  const AI_PREVIEW_DELAY = 650;
  const AI_ACTION_DELAY = 850;
  const ROLL_TUMBLE_MS = 560;
  const ROLL_STAGGER_MS = 90;
  const ROLL_SETTLE_MS = 160;
  let game = null;
  let matchMode = "human";
  let localPlayerCount = Rules.MIN_PLAYERS;
  let localPlayerNames = Rules.DEFAULT_PLAYER_NAMES.slice();
  let aiTimerId = null;
  let aiActionInFlight = false;
  let activeRollKey = "";
  let isRollAnimating = false;
  let rollAnimationTimerId = null;

  const setupPanel = document.querySelector("#setupPanel");
  const gamePanel = document.querySelector("#gamePanel");
  const setupForm = document.querySelector("#setupForm");
  const modeInputs = Array.from(document.querySelectorAll("input[name='opponentMode']"));
  const playerCountSet = document.querySelector("#playerCountSet");
  const playerCountButtons = Array.from(document.querySelectorAll("[data-player-count]"));
  const playerRoster = document.querySelector("#playerRoster");
  const aiRoster = document.querySelector("#aiRoster");
  const aiHumanNameInput = document.querySelector("#aiHumanName");
  const aiNameInput = document.querySelector("#aiName");
  const targetInput = document.querySelector("#targetScore");
  const targetButtons = Array.from(document.querySelectorAll("[data-target-choice]"));
  const musicButton = document.querySelector("#musicButton");
  const newMatchButton = document.querySelector("#newMatchButton");
  const scoreboard = document.querySelector("#scoreboard");
  const matchTarget = document.querySelector("#matchTarget");
  const currentPlayer = document.querySelector("#currentPlayer");
  const turnScore = document.querySelector("#turnScore");
  const selectedScore = document.querySelector("#selectedScore");
  const passTotal = document.querySelector("#passTotal");
  const diceCount = document.querySelector("#diceCount");
  const rollNumber = document.querySelector("#rollNumber");
  const messageBanner = document.querySelector("#messageBanner");
  const ledgerPanel = document.querySelector(".ledger-panel");
  const diceTray = document.querySelector("#diceTray");
  const selectionNote = document.querySelector("#selectionNote");
  const continueButton = document.querySelector("#continueButton");
  const passButton = document.querySelector("#passButton");
  const nextPlayerButton = document.querySelector("#nextPlayerButton");
  const winnerPanel = document.querySelector("#winnerPanel");
  const winnerText = document.querySelector("#winnerText");
  const reducedMotionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  const pipLayouts = {
    1: ["center"],
    2: ["top-left", "bottom-right"],
    3: ["top-left", "center", "bottom-right"],
    4: ["top-left", "top-right", "bottom-left", "bottom-right"],
    5: ["top-left", "top-right", "center", "bottom-left", "bottom-right"],
    6: ["top-left", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-right"],
  };

  const playerColors = [
    { accent: "#f1cf78", deep: "#8f6b2a", soft: "rgba(241, 207, 120, 0.26)" },
    { accent: "#8cc7a1", deep: "#246a4a", soft: "rgba(140, 199, 161, 0.24)" },
    { accent: "#d9796f", deep: "#82313a", soft: "rgba(217, 121, 111, 0.24)" },
    { accent: "#91a8e8", deep: "#405382", soft: "rgba(145, 168, 232, 0.24)" },
    { accent: "#d7a3d8", deep: "#704478", soft: "rgba(215, 163, 216, 0.24)" },
    { accent: "#e0a35c", deep: "#8b5627", soft: "rgba(224, 163, 92, 0.24)" },
  ];

  function formatScore(value) {
    return Number(value).toLocaleString("en-AU");
  }

  function getPlayerColor(index) {
    return playerColors[index % playerColors.length];
  }

  function applyPlayerColor(element, index) {
    const color = getPlayerColor(index);
    element.style.setProperty("--player-color", color.accent);
    element.style.setProperty("--player-color-deep", color.deep);
    element.style.setProperty("--player-color-soft", color.soft);
  }

  function clampPlayerCount(value) {
    const numeric = Number(value);
    if (!Number.isInteger(numeric)) {
      return Rules.MIN_PLAYERS;
    }

    return Math.max(Rules.MIN_PLAYERS, Math.min(Rules.MAX_PLAYERS, numeric));
  }

  function readLocalPlayerNames() {
    playerRoster.querySelectorAll("[data-player-name-input]").forEach((input) => {
      const index = Number(input.dataset.playerNameInput);
      localPlayerNames[index] = input.value;
    });
  }

  function getLocalPlayerNames() {
    readLocalPlayerNames();
    return localPlayerNames.slice(0, localPlayerCount);
  }

  function getSelectedMode() {
    const selectedMode = modeInputs.find((input) => input.checked);
    return selectedMode ? selectedMode.value : "human";
  }

  function renderPlayerRoster() {
    playerRoster.innerHTML = "";

    for (let index = 0; index < localPlayerCount; index += 1) {
      const label = document.createElement("label");
      const labelText = document.createElement("span");
      const swatch = document.createElement("span");
      const input = document.createElement("input");

      label.className = "field-label player-name-field";
      applyPlayerColor(label, index);

      labelText.className = "player-name-label";
      swatch.className = "player-swatch";
      swatch.setAttribute("aria-hidden", "true");
      labelText.append(swatch, `Player ${index + 1}`);

      input.type = "text";
      input.name = `player${index + 1}`;
      input.value = localPlayerNames[index] || Rules.DEFAULT_PLAYER_NAMES[index] || `Player ${index + 1}`;
      input.maxLength = 24;
      input.autocomplete = "off";
      input.dataset.playerNameInput = String(index);

      label.append(labelText, input);
      playerRoster.append(label);
    }
  }

  function isAiMatch() {
    return matchMode === "ai";
  }

  function isAiTurn() {
    return (
      isAiMatch() &&
      game &&
      game.activePlayerIndex === AI_PLAYER_INDEX &&
      game.phase !== Rules.PHASES.GAME_OVER
    );
  }

  function isTargetReached() {
    return game && game.players.some((player) => player.score >= game.targetScore);
  }

  function clearAiTimer() {
    if (aiTimerId) {
      clearTimeout(aiTimerId);
      aiTimerId = null;
    }
    aiActionInFlight = false;
  }

  function getRollKey() {
    if (!game || !game.dice.length) {
      return "";
    }

    return `${game.activePlayerIndex}:${game.rollNumber}:${game.dice.map((die) => die.id).join("|")}`;
  }

  function clearRollAnimation(resetKey) {
    if (rollAnimationTimerId) {
      clearTimeout(rollAnimationTimerId);
      rollAnimationTimerId = null;
    }

    isRollAnimating = false;

    if (resetKey) {
      activeRollKey = "";
    }
  }

  function syncRollAnimation() {
    const rollKey = getRollKey();

    if (!rollKey) {
      clearRollAnimation(true);
      return;
    }

    if (rollKey === activeRollKey) {
      return;
    }

    clearRollAnimation(false);
    activeRollKey = rollKey;

    if (reducedMotionQuery.matches || game.phase === Rules.PHASES.GAME_OVER) {
      return;
    }

    isRollAnimating = true;
    rollAnimationTimerId = setTimeout(() => {
      rollAnimationTimerId = null;

      if (getRollKey() === rollKey) {
        isRollAnimating = false;
        render();
      }
    }, ROLL_TUMBLE_MS + Math.max(0, game.dice.length - 1) * ROLL_STAGGER_MS + ROLL_SETTLE_MS);
  }

  function updateMusicButton() {
    if (!musicButton) {
      return;
    }

    if (!tavernMusic || !tavernMusic.isSupported()) {
      musicButton.disabled = true;
      musicButton.textContent = "No Audio";
      musicButton.setAttribute("aria-pressed", "false");
      musicButton.dataset.active = "false";
      return;
    }

    const playing = tavernMusic.isPlaying();
    musicButton.disabled = false;
    musicButton.textContent = playing ? "Music On" : "Music Off";
    musicButton.setAttribute("aria-pressed", String(playing));
    musicButton.dataset.active = String(playing);

  }

  function setPanelVisibility() {
    setupPanel.hidden = Boolean(game);
    gamePanel.hidden = !game;
  }

  function getRollValues() {
    return game.dice.map((die) => die.value);
  }

  function getSelection() {
    if (!game || game.phase !== Rules.PHASES.SELECTING) {
      return {
        valid: false,
        score: 0,
        combinations: [],
        reason: "",
      };
    }

    return Rules.validateSelection(getRollValues(), selectedIndexes);
  }

  function clearSelection() {
    selectedIndexes.clear();
  }

  function scrollToAppTop() {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }

  function setSelection(indexes) {
    selectedIndexes.clear();
    indexes.forEach((index) => selectedIndexes.add(index));
  }

  function renderScoreboard() {
    scoreboard.innerHTML = "";

    game.players.forEach((player, index) => {
      const item = document.createElement("article");
      item.className = "score-tile";
      item.dataset.active = String(index === game.activePlayerIndex && game.phase !== Rules.PHASES.GAME_OVER);
      item.dataset.winner = String(index === game.winnerIndex);
      item.dataset.ai = String(isAiMatch() && index === AI_PLAYER_INDEX);
      applyPlayerColor(item, index);

      const name = document.createElement("span");
      name.className = "score-name";

      const swatch = document.createElement("span");
      swatch.className = "player-swatch";
      swatch.setAttribute("aria-hidden", "true");
      name.append(swatch, player.name);

      if (isAiMatch() && index === AI_PLAYER_INDEX) {
        const badge = document.createElement("em");
        badge.className = "ai-badge";
        badge.textContent = "AI";
        name.append(" ", badge);
      }

      const score = document.createElement("strong");
      score.className = "score-value";
      score.textContent = formatScore(player.score);

      item.append(name, score);
      scoreboard.append(item);
    });
  }

  function createPips(value) {
    const face = document.createElement("span");
    face.className = "die-face";

    pipLayouts[value].forEach((position) => {
      const pip = document.createElement("span");
      pip.className = `pip pip-${position}`;
      face.append(pip);
    });

    return face;
  }

  function renderDice() {
    diceTray.innerHTML = "";
    diceTray.dataset.rolling = "false";

    if (!game) {
      return;
    }

    diceTray.dataset.rolling = String(isRollAnimating);
    const rollValues = getRollValues();
    const potentialIndexes = new Set(Rules.getPotentialScoringIndexes(rollValues));
    const aiTurn = isAiTurn();

    game.dice.forEach((die, index) => {
      const dieButton = document.createElement("button");
      const selected = selectedIndexes.has(index);
      const playable =
        !isRollAnimating && potentialIndexes.has(index) && game.phase === Rules.PHASES.SELECTING && !aiTurn;

      dieButton.type = "button";
      dieButton.className = "die";
      dieButton.dataset.dieIndex = String(index);
      dieButton.dataset.value = String(die.value);
      dieButton.dataset.selected = String(selected);
      dieButton.dataset.playable = String(playable);
      dieButton.dataset.rolling = String(isRollAnimating);
      dieButton.disabled = !playable;
      dieButton.style.setProperty("--roll-delay", `${index * ROLL_STAGGER_MS}ms`);
      dieButton.setAttribute("aria-pressed", String(selected));
      dieButton.setAttribute(
        "aria-label",
        isRollAnimating ? `Die ${index + 1} rolling` : `Die ${index + 1}, showing ${die.value}`,
      );
      dieButton.append(createPips(die.value));

      diceTray.append(dieButton);
    });
  }

  function renderTurnLedger(selection) {
    const player = game.players[game.activePlayerIndex];
    const passScore = player.score + game.turnScore + (selection.valid ? selection.score : 0);
    applyPlayerColor(ledgerPanel, game.activePlayerIndex);

    if (game.phase === Rules.PHASES.GAME_OVER) {
      matchTarget.textContent = "Match complete";
    } else if (isTargetReached()) {
      matchTarget.textContent = isAiMatch()
        ? `Final round vs AI`
        : "Final round";
    } else {
      matchTarget.textContent = isAiMatch()
        ? `First to ${formatScore(game.targetScore)} vs AI`
        : `First to ${formatScore(game.targetScore)}`;
    }
    currentPlayer.textContent = player.name;
    turnScore.textContent = formatScore(game.turnScore);
    selectedScore.textContent = selection.valid ? formatScore(selection.score) : "0";
    passTotal.textContent = formatScore(passScore);
    diceCount.textContent = String(game.dice.length);
    rollNumber.textContent = String(game.rollNumber);
    messageBanner.textContent = game.message;

    if (isRollAnimating) {
      selectionNote.textContent = "Dice are rolling...";
    } else if (game.phase === Rules.PHASES.BUST) {
      selectionNote.textContent = `Lost turn points: ${formatScore(game.lostTurnScore)}.`;
    } else if (game.phase === Rules.PHASES.GAME_OVER) {
      selectionNote.textContent = "Match complete.";
    } else if (isAiTurn() && selectedIndexes.size === 0) {
      selectionNote.textContent = `${player.name} is weighing the dice.`;
    } else if (isAiTurn() && selection.valid) {
      selectionNote.textContent = `${player.name} chooses ${selection.label}.`;
    } else if (selectedIndexes.size === 0) {
      selectionNote.textContent = "Select scoring dice from this roll.";
    } else if (selection.valid) {
      selectionNote.textContent = selection.label;
    } else {
      selectionNote.textContent = selection.reason;
    }
  }

  function renderActions(selection) {
    const aiTurn = isAiTurn();
    const canScore = !isRollAnimating && game.phase === Rules.PHASES.SELECTING && selection.valid && !aiTurn;
    continueButton.disabled = !canScore;
    passButton.disabled = !canScore;
    nextPlayerButton.hidden = isRollAnimating || game.phase !== Rules.PHASES.BUST || aiTurn;
    nextPlayerButton.disabled = isRollAnimating || game.phase !== Rules.PHASES.BUST || aiTurn;

    winnerPanel.hidden = game.phase !== Rules.PHASES.GAME_OVER;
    if (game.phase === Rules.PHASES.GAME_OVER) {
      applyPlayerColor(winnerPanel, game.winnerIndex);
      winnerText.textContent = `${game.players[game.winnerIndex].name} wins the table.`;
    }
  }

  function render() {
    setPanelVisibility();
    updateMusicButton();

    if (!game) {
      return;
    }

    syncRollAnimation();
    const selection = getSelection();
    renderScoreboard();
    renderDice();
    renderTurnLedger(selection);
    renderActions(selection);
    scheduleAiTurn();
    updateMusicButton();
  }

  function startMatch(event) {
    event.preventDefault();
    clearAiTimer();
    clearRollAnimation(true);
    clearSelection();
    matchMode = getSelectedMode();

    game = Rules.createGame({
      playerNames: isAiMatch()
        ? [aiHumanNameInput.value, aiNameInput.value || "Tavern AI"]
        : getLocalPlayerNames(),
      targetScore: targetInput.value,
    });

    render();
    scrollToAppTop();
  }

  function resetMatch() {
    clearAiTimer();
    clearRollAnimation(true);
    game = null;
    clearSelection();
    render();
    scrollToAppTop();
  }

  function scoreContinue() {
    if (!game || isAiTurn()) return;

    game = Rules.scoreAndContinue(game, selectedIndexes);
    clearSelection();
    render();
  }

  function scorePass() {
    if (!game || isAiTurn()) return;

    game = Rules.scoreAndPass(game, selectedIndexes);
    clearSelection();
    render();
  }

  function nextPlayer() {
    if (!game || isAiTurn()) return;

    game = Rules.acknowledgeBust(game);
    clearSelection();
    render();
  }

  function runAiMove() {
    aiTimerId = null;

    if (!isAiTurn()) {
      aiActionInFlight = false;
      return;
    }

    if (game.phase === Rules.PHASES.BUST) {
      aiActionInFlight = true;
      aiTimerId = setTimeout(() => {
        aiTimerId = null;
        if (isAiTurn()) {
          game = Rules.acknowledgeBust(game);
          clearSelection();
        }
        aiActionInFlight = false;
        render();
      }, AI_PREVIEW_DELAY);
      return;
    }

    const move = Rules.chooseAiMove(game);
    if (move.action === "wait") {
      aiActionInFlight = false;
      return;
    }

    if (move.action === "acknowledge-bust") {
      game = Rules.acknowledgeBust(game);
      clearSelection();
      render();
      return;
    }

    setSelection(move.selectedIndexes);
    aiActionInFlight = true;
    render();

    aiTimerId = setTimeout(() => {
      aiTimerId = null;
      if (isAiTurn()) {
        game =
          move.action === "pass"
            ? Rules.scoreAndPass(game, move.selectedIndexes)
            : Rules.scoreAndContinue(game, move.selectedIndexes);
        clearSelection();
      }
      aiActionInFlight = false;
      render();
    }, AI_ACTION_DELAY);
  }

  function scheduleAiTurn() {
    if (isRollAnimating || !isAiTurn() || aiTimerId || aiActionInFlight) {
      return;
    }

    aiTimerId = setTimeout(runAiMove, AI_PREVIEW_DELAY);
  }

  function updateOpponentModeUi() {
    const mode = getSelectedMode();
    const aiMode = mode === "ai";
    readLocalPlayerNames();

    setupPanel.dataset.mode = mode;
    playerCountSet.hidden = aiMode;
    playerRoster.hidden = aiMode;
    aiRoster.hidden = !aiMode;

    if (aiMode && !aiHumanNameInput.value.trim()) {
      aiHumanNameInput.value = localPlayerNames[0] || Rules.DEFAULT_PLAYER_NAMES[0];
    } else if (!aiMode && aiHumanNameInput.value.trim()) {
      localPlayerNames[0] = aiHumanNameInput.value;
      renderPlayerRoster();
    }
  }

  async function toggleMusic() {
    if (!tavernMusic || !tavernMusic.isSupported()) {
      updateMusicButton();
      return;
    }

    try {
      await tavernMusic.toggle();
    } catch (error) {
      musicButton.textContent = "Audio Blocked";
    }

    updateMusicButton();
  }

  targetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      targetInput.value = button.dataset.targetChoice;
      targetButtons.forEach((targetButton) => {
        targetButton.dataset.active = String(targetButton === button);
      });
    });
  });

  playerCountButtons.forEach((button) => {
    button.addEventListener("click", () => {
      readLocalPlayerNames();
      localPlayerCount = clampPlayerCount(button.dataset.playerCount);
      playerCountButtons.forEach((countButton) => {
        countButton.dataset.active = String(countButton === button);
      });
      renderPlayerRoster();
    });
  });

  playerRoster.addEventListener("input", (event) => {
    if (!event.target.matches("[data-player-name-input]")) {
      return;
    }

    const index = Number(event.target.dataset.playerNameInput);
    localPlayerNames[index] = event.target.value;
  });

  modeInputs.forEach((input) => {
    input.addEventListener("change", updateOpponentModeUi);
  });

  diceTray.addEventListener("click", (event) => {
    const dieButton = event.target.closest("[data-die-index]");
    if (!dieButton || dieButton.disabled || !game || isAiTurn()) {
      return;
    }

    const index = Number(dieButton.dataset.dieIndex);
    if (selectedIndexes.has(index)) {
      selectedIndexes.delete(index);
    } else {
      selectedIndexes.add(index);
    }

    render();
  });

  setupForm.addEventListener("submit", startMatch);
  musicButton.addEventListener("click", toggleMusic);
  newMatchButton.addEventListener("click", resetMatch);
  continueButton.addEventListener("click", scoreContinue);
  passButton.addEventListener("click", scorePass);
  nextPlayerButton.addEventListener("click", nextPlayer);
  window.addEventListener("beforeunload", () => {
    clearRollAnimation(false);

    if (tavernMusic) {
      tavernMusic.stop();
    }
  });

  updateOpponentModeUi();
  renderPlayerRoster();
  updateMusicButton();
  render();
})();
