(function () {
  "use strict";

  const Rules = window.FarkleRules;
  const Music = window.TavernMusic;
  const tavernMusic = Music ? Music.createTavernMusic() : null;
  const selectedIndexes = new Set();
  const AI_PLAYER_INDEX = 1;
  const AI_PREVIEW_DELAY = 650;
  const AI_ACTION_DELAY = 850;
  let game = null;
  let matchMode = "human";
  let aiTimerId = null;
  let aiActionInFlight = false;

  const setupPanel = document.querySelector("#setupPanel");
  const gamePanel = document.querySelector("#gamePanel");
  const setupForm = document.querySelector("#setupForm");
  const playerOneInput = document.querySelector("#playerOne");
  const playerTwoLabelText = document.querySelector("#playerTwoLabelText");
  const playerTwoInput = document.querySelector("#playerTwo");
  const modeInputs = Array.from(document.querySelectorAll("input[name='opponentMode']"));
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
  const diceTray = document.querySelector("#diceTray");
  const selectionNote = document.querySelector("#selectionNote");
  const continueButton = document.querySelector("#continueButton");
  const passButton = document.querySelector("#passButton");
  const nextPlayerButton = document.querySelector("#nextPlayerButton");
  const winnerPanel = document.querySelector("#winnerPanel");
  const winnerText = document.querySelector("#winnerText");

  const pipLayouts = {
    1: ["center"],
    2: ["top-left", "bottom-right"],
    3: ["top-left", "center", "bottom-right"],
    4: ["top-left", "top-right", "bottom-left", "bottom-right"],
    5: ["top-left", "top-right", "center", "bottom-left", "bottom-right"],
    6: ["top-left", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-right"],
  };

  function formatScore(value) {
    return Number(value).toLocaleString("en-AU");
  }

  function getSelectedMode() {
    const selectedMode = modeInputs.find((input) => input.checked);
    return selectedMode ? selectedMode.value : "human";
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

  function clearAiTimer() {
    if (aiTimerId) {
      clearTimeout(aiTimerId);
      aiTimerId = null;
    }
    aiActionInFlight = false;
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

      const name = document.createElement("span");
      name.className = "score-name";
      name.textContent = player.name;

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

    if (!game) {
      return;
    }

    const rollValues = getRollValues();
    const potentialIndexes = new Set(Rules.getPotentialScoringIndexes(rollValues));
    const aiTurn = isAiTurn();

    game.dice.forEach((die, index) => {
      const dieButton = document.createElement("button");
      const selected = selectedIndexes.has(index);
      const playable = potentialIndexes.has(index) && game.phase === Rules.PHASES.SELECTING && !aiTurn;

      dieButton.type = "button";
      dieButton.className = "die";
      dieButton.dataset.dieIndex = String(index);
      dieButton.dataset.value = String(die.value);
      dieButton.dataset.selected = String(selected);
      dieButton.dataset.playable = String(playable);
      dieButton.disabled = !playable;
      dieButton.setAttribute("aria-pressed", String(selected));
      dieButton.setAttribute("aria-label", `Die ${index + 1}, showing ${die.value}`);
      dieButton.append(createPips(die.value));

      diceTray.append(dieButton);
    });
  }

  function renderTurnLedger(selection) {
    const player = game.players[game.activePlayerIndex];
    const passScore = player.score + game.turnScore + (selection.valid ? selection.score : 0);

    matchTarget.textContent = isAiMatch()
      ? `First to ${formatScore(game.targetScore)} vs AI`
      : `First to ${formatScore(game.targetScore)}`;
    currentPlayer.textContent = player.name;
    turnScore.textContent = formatScore(game.turnScore);
    selectedScore.textContent = selection.valid ? formatScore(selection.score) : "0";
    passTotal.textContent = formatScore(passScore);
    diceCount.textContent = String(game.dice.length);
    rollNumber.textContent = String(game.rollNumber);
    messageBanner.textContent = game.message;

    if (game.phase === Rules.PHASES.BUST) {
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
    const canScore = game.phase === Rules.PHASES.SELECTING && selection.valid && !aiTurn;
    continueButton.disabled = !canScore;
    passButton.disabled = !canScore;
    nextPlayerButton.hidden = game.phase !== Rules.PHASES.BUST || aiTurn;
    nextPlayerButton.disabled = game.phase !== Rules.PHASES.BUST || aiTurn;

    winnerPanel.hidden = game.phase !== Rules.PHASES.GAME_OVER;
    if (game.phase === Rules.PHASES.GAME_OVER) {
      winnerText.textContent = `${game.players[game.winnerIndex].name} wins the table.`;
    }
  }

  function render() {
    setPanelVisibility();
    updateMusicButton();

    if (!game) {
      return;
    }

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
    clearSelection();
    matchMode = getSelectedMode();

    game = Rules.createGame({
      playerNames: [
        playerOneInput.value,
        isAiMatch() ? playerTwoInput.value || "Tavern AI" : playerTwoInput.value,
      ],
      targetScore: targetInput.value,
    });

    render();
  }

  function resetMatch() {
    clearAiTimer();
    game = null;
    clearSelection();
    render();
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
    if (!isAiTurn() || aiTimerId || aiActionInFlight) {
      return;
    }

    aiTimerId = setTimeout(runAiMove, AI_PREVIEW_DELAY);
  }

  function updateOpponentModeUi() {
    const mode = getSelectedMode();
    const aiMode = mode === "ai";
    const currentSecondName = playerTwoInput.value.trim();

    setupPanel.dataset.mode = mode;
    playerTwoLabelText.textContent = aiMode ? "AI name" : "Player two";

    if (aiMode && (!currentSecondName || currentSecondName === "Theresa")) {
      playerTwoInput.value = "Tavern AI";
    } else if (!aiMode && currentSecondName === "Tavern AI") {
      playerTwoInput.value = "Theresa";
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
    if (tavernMusic) {
      tavernMusic.stop();
    }
  });

  updateOpponentModeUi();
  updateMusicButton();
  render();
})();
