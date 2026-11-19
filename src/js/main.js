import { I18N, SUITS, SUIT_INFO, AVATARS } from './constants.js';
import {
  createMatchState,
  startNextRound,
  sortHand,
  placeBid,
  playCard,
  resolveDispute,
  mustPlaceBidNow
} from './engine.js';
import { decideAiTurn } from './ai.js';
import { sound } from './audio.js';
import {
  escapeHtml,
  applyTranslations,
  renderAvatarPicker,
  renderThemePicker,
  renderRulesContent,
  renderGameTable,
  showComicCallout,
  hideComicCallout,
  renderRoundSummaryModal,
  renderGameOverModal,
  renderPauseScoreboard,
  launchConfetti,
  preloadCardImages,
  refreshVisibleImages,
  updateHandOverlap
} from './ui.js';
import { OnlineManager } from './online.js';

const STORAGE_KEY = 'zero_two_five_prefs_v1';

const prefs = loadPrefs();
let gameState = null;
let matchSessionId = 0;
let isDesktopApp = false;
let onlineMode = null; // null | 'host' | 'guest'
let pendingOnlineAction = false;
let pendingPwdRoomCode = null;
let lastCustomPlayers = null;
let onlineJokenpoPicks = new Map();

const uiState = {
  lang: prefs.lang || 'pt',
  theme: prefs.theme || 'crimson',
  speed: prefs.speed || 'normal',
  sortBy: 'suit',
  bidSelectionMode: false,
  speechBubbles: {},
  localSeatIndex: 0
};

const setupConfig = {
  playerCount: prefs.playerCount || 4,
  mode: prefs.mode || 'basic',
  difficulty: prefs.difficulty || 'tactical',
  humanName: prefs.humanName || 'Você',
  humanAvatar: prefs.humanAvatar || 'defy'
};

const onlineCreateConfig = {
  playerCount: prefs.playerCount || 4,
  mode: prefs.mode || 'basic',
  difficulty: prefs.difficulty || 'tactical',
  visibility: 'open'
};

let onlineManager = null;

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function savePrefs() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...setupConfig,
        lang: uiState.lang,
        theme: uiState.theme,
        speed: uiState.speed,
        sfxEnabled: sound.sfxEnabled,
        musicEnabled: sound.musicEnabled
      })
    );
  } catch {
    // ignore storage errors
  }
}

function delayMs(ms) {
  const factor = uiState.speed === 'fast' ? 0.45 : 1;
  return new Promise((resolve) => setTimeout(resolve, Math.round(ms * factor)));
}

function getDict() {
  return I18N[uiState.lang] || I18N.pt;
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
}

function setTheme(themeId) {
  uiState.theme = themeId;
  document.body.className = `theme-${themeId}`;
  savePrefs();
}

function setLanguage(lang) {
  uiState.lang = lang;
  applyTranslations(lang);
  renderRulesContent(document.getElementById('rules-content'), lang);
  renderThemePicker(document.getElementById('theme-picker'), uiState.theme, lang, (t) => {
    sound.playUiClick();
    setTheme(t);
    renderThemePicker(document.getElementById('theme-picker'), uiState.theme, uiState.lang, () => {});
    refreshSettingsButtons();
  });
  updateConnectionBadge(onlineManager?.client?.status || 'disconnected', onlineManager?.client?.broker || null);
  if (onlineManager) {
    renderPublicRoomsList(onlineManager.getPublicRooms());
    renderWaitingRoom(onlineManager.currentRoom);
  }
  if (gameState) {
    renderGame();
  }
  savePrefs();
}

function openModal(modalId) {
  const backdrop = document.getElementById('modal-backdrop');
  backdrop.classList.remove('hidden');
  document.querySelectorAll('.comic-modal').forEach((m) => m.classList.add('hidden'));
  document.getElementById(modalId).classList.remove('hidden');
}

function closeModals() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.querySelectorAll('.comic-modal').forEach((m) => m.classList.add('hidden'));
}

function refreshSettingsButtons() {
  document.querySelectorAll('#lang-picker .seg-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.lang === uiState.lang);
  });
  document.querySelectorAll('#speed-picker .seg-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.speed === uiState.speed);
  });
  document.querySelectorAll('#sfx-picker .seg-btn').forEach((b) => {
    b.classList.toggle('active', (b.dataset.sfx === 'on') === sound.sfxEnabled);
  });
  document.querySelectorAll('#music-picker .seg-btn').forEach((b) => {
    b.classList.toggle('active', (b.dataset.music === 'on') === sound.musicEnabled);
  });

  renderThemePicker(document.getElementById('theme-picker'), uiState.theme, uiState.lang, (themeId) => {
    sound.playUiClick();
    setTheme(themeId);
    refreshSettingsButtons();
  });

  const speedBtn = document.getElementById('hud-speed-btn');
  speedBtn.textContent = uiState.speed === 'fast' ? '2×' : '1×';

  const sfxBtn = document.getElementById('hud-sfx-btn');
  sfxBtn.textContent = sound.sfxEnabled ? '🔊' : '🔇';
  sfxBtn.classList.toggle('muted', !sound.sfxEnabled);

  const musicBtn = document.getElementById('hud-music-btn');
  musicBtn.classList.toggle('muted', !sound.musicEnabled);
}

function renderGame() {
  if (!gameState) return;
  uiState.isOnline = Boolean(onlineMode);
  const onlinePill = document.getElementById('hud-online-pill');
  if (onlinePill) {
    if (onlineMode && onlineManager?.currentRoom) {
      onlinePill.textContent = `🌐 ${onlineManager.currentRoom.code}`;
      onlinePill.classList.remove('hidden');
    } else {
      onlinePill.classList.add('hidden');
    }
  }
  renderGameTable(gameState, uiState, {
    onPlayCardClick: handleHumanPlayCard,
    onBidCardClick: handleHumanPlaceBid
  });
}

function addSpeechBubble(playerIndex, text, durationMs = 1500) {
  uiState.speechBubbles[playerIndex] = {
    text,
    until: Date.now() + durationMs
  };
}

function startNewMatch(customPlayers = null, broadcastKind = 'deal') {
  matchSessionId += 1;
  const session = matchSessionId;
  hideComicCallout();
  closeModals();

  setupConfig.humanName = document.getElementById('player-name-input').value.trim() || 'Você';
  savePrefs();

  uiState.bidSelectionMode = false;
  uiState.speechBubbles = {};
  pendingOnlineAction = false;

  if (onlineMode === 'host' && onlineManager?.currentRoom && Array.isArray(customPlayers)) {
    lastCustomPlayers = customPlayers;
    uiState.localSeatIndex = 0;
    const room = onlineManager.currentRoom;
    gameState = createMatchState({
      playerCount: room.playerCount,
      mode: room.mode,
      difficulty: room.difficulty,
      customPlayers
    });
  } else {
    onlineMode = null;
    lastCustomPlayers = null;
    uiState.localSeatIndex = 0;
    gameState = createMatchState(setupConfig);
  }

  if (gameState.players[uiState.localSeatIndex]) {
    gameState.players[uiState.localSeatIndex].hand = sortHand(
      gameState.players[uiState.localSeatIndex].hand,
      uiState.sortBy
    );
  }

  showScreen('game-screen');
  sound.playCardDeal();
  renderGame();

  if (onlineMode === 'host') {
    onlineManager.broadcastMatchState(gameState, { kind: broadcastKind });
  }

  processTurnLoop(session);
}

async function processTurnLoop(session) {
  if (session !== matchSessionId || !gameState) return;
  if (onlineMode === 'guest') return;

  if (gameState.phase === 'playing') {
    const turnIdx = gameState.turnIndex;
    const current = gameState.players[turnIdx];

    if (current.isHuman) {
      if (turnIdx === uiState.localSeatIndex) {
        sound.playYourTurn();
      }
      renderGame();
      return;
    }

    await delayMs(1300);
    if (session !== matchSessionId || !gameState) return;

    const decision = decideAiTurn(gameState, turnIdx);
    const dict = getDict();

    if (decision.bidCard) {
      placeBid(gameState, turnIdx, decision.bidCard.id);
      sound.playBidPlace();
      const bubbleText = `${dict.bidPlacedCallout} (${SUIT_INFO[decision.bidCard.suit].value})`;
      addSpeechBubble(turnIdx, bubbleText);
      if (onlineMode === 'host') {
        onlineManager.broadcastEvent({
          type: 'speech_bubble',
          playerIndex: turnIdx,
          text: bubbleText,
          durationMs: 1500
        });
        onlineManager.broadcastMatchState(gameState, { kind: 'bid' });
      }
      renderGame();
      await delayMs(900);
      if (session !== matchSessionId || !gameState) return;
    }

    playCard(gameState, turnIdx, decision.playCard.id);
    sound.playCardSnap();
    if (onlineMode === 'host') {
      onlineManager.broadcastMatchState(gameState, { kind: 'card' });
    }
    renderGame();

    await processTurnLoop(session);
    return;
  }

  if (gameState.phase === 'resolving') {
    await delayMs(1000);
    if (session !== matchSessionId || !gameState) return;

    const result = resolveDispute(gameState);
    const dict = getDict();

    let calloutTitle;
    let calloutSub;
    if (result.isTie) {
      sound.playDisputeTie();
      const causer = gameState.players[result.nextLead];
      calloutTitle = dict.threeSuitsTie;
      calloutSub = `${causer.name} ${dict.tieNextLead}`;
      showComicCallout(calloutTitle, calloutSub, true);
      if (!causer.isHuman) {
        addSpeechBubble(causer.index, '⚡ EMPATE!');
      }
    } else {
      sound.playDisputeWin();
      const winner = gameState.players[result.winningPlay.playerIndex];
      calloutTitle = dict.sameSuitWin;
      if (result.reason === 'suit_beat') {
        if (result.winningSuit === 'rock') calloutTitle = dict.rockBeatsScissors;
        else if (result.winningSuit === 'scissors') calloutTitle = dict.scissorsBeatsPaper;
        else calloutTitle = dict.paperBeatsRock;
      }
      calloutSub = `👑 ${winner.name} ${dict.winnerCallout}`;
      showComicCallout(calloutTitle, calloutSub, false);
    }

    if (onlineMode === 'host') {
      onlineManager.broadcastEvent({
        type: 'callout',
        title: calloutTitle,
        sub: calloutSub,
        isTie: result.isTie
      });
    }

    await delayMs(2375);
    if (session !== matchSessionId || !gameState) return;

    hideComicCallout();
    if (onlineMode === 'host') {
      onlineManager.broadcastEvent({ type: 'hide_callout' });
    }

    if (gameState.phase === 'roundEnd') {
      sound.playTokenEarn();
      if (onlineMode === 'host') {
        onlineManager.broadcastMatchState(gameState, { kind: 'roundEnd' });
      }
      renderGame();
      openRoundEndModalForLocalRole();
      return;
    }

    if (gameState.phase === 'gameOver') {
      sound.playGameWin();
      if (onlineMode === 'host') {
        onlineManager.broadcastMatchState(gameState, { kind: 'gameOver' });
      }
      renderGame();
      openGameOverModalForLocalRole();
      launchConfetti();
      return;
    }

    if (onlineMode === 'host') {
      onlineManager.broadcastMatchState(gameState, { kind: 'nextDispute' });
    }
    renderGame();
    await processTurnLoop(session);
  }
}

function openRoundEndModalForLocalRole() {
  const dict = getDict();
  renderRoundSummaryModal(gameState.lastRoundSummary, gameState, uiState.lang);
  const nextBtn = document.getElementById('round-next-btn');
  if (onlineMode === 'guest') {
    nextBtn.disabled = true;
    nextBtn.textContent = dict.onlineHostWaitingRound;
  } else {
    nextBtn.disabled = false;
    nextBtn.textContent =
      gameState.roundNumber >= gameState.maxRounds ? dict.seeFinalBtn : dict.nextRoundBtn;
  }
  openModal('round-modal');
}

function openGameOverModalForLocalRole() {
  const dict = getDict();
  renderGameOverModal(gameState.gameResult, uiState.lang, uiState.localSeatIndex);
  const playAgainBtn = document.getElementById('play-again-btn');
  if (onlineMode === 'guest') {
    playAgainBtn.disabled = true;
    playAgainBtn.textContent = dict.onlineHostWaitingRematch;
  } else {
    playAgainBtn.disabled = false;
    playAgainBtn.textContent = dict.playAgainBtn;
  }
  openModal('gameover-modal');
}

function handleHumanPlaceBid(cardId) {
  const myIdx = uiState.localSeatIndex;
  if (!gameState || gameState.phase !== 'playing' || gameState.turnIndex !== myIdx) return;

  if (onlineMode === 'guest') {
    if (pendingOnlineAction) return;
    pendingOnlineAction = true;
    uiState.bidSelectionMode = false;
    sound.playBidPlace();
    onlineManager.sendAction('bid', cardId);
    return;
  }

  placeBid(gameState, myIdx, cardId);
  uiState.bidSelectionMode = false;
  sound.playBidPlace();
  if (onlineMode === 'host') {
    onlineManager.broadcastMatchState(gameState, { kind: 'bid' });
  }
  renderGame();
}

async function handleHumanPlayCard(cardId) {
  const myIdx = uiState.localSeatIndex;
  if (!gameState || gameState.phase !== 'playing' || gameState.turnIndex !== myIdx) return;

  if (mustPlaceBidNow(gameState, myIdx)) {
    uiState.bidSelectionMode = true;
    renderGame();
    return;
  }

  if (onlineMode === 'guest') {
    if (pendingOnlineAction) return;
    pendingOnlineAction = true;
    sound.playCardSnap();
    onlineManager.sendAction('play', cardId);
    return;
  }

  const session = matchSessionId;
  playCard(gameState, myIdx, cardId);
  sound.playCardSnap();
  if (onlineMode === 'host') {
    onlineManager.broadcastMatchState(gameState, { kind: 'card' });
  }
  renderGame();

  await processTurnLoop(session);
}

function handleHostRemoteAction(seatIndex, action, cardId) {
  if (onlineMode !== 'host' || !gameState || gameState.phase !== 'playing') return;
  if (gameState.turnIndex !== seatIndex) return;

  try {
    if (action === 'bid') {
      placeBid(gameState, seatIndex, cardId);
      const dict = getDict();
      const player = gameState.players[seatIndex];
      const text = `${dict.bidPlacedCallout} (${SUIT_INFO[player.bidCard.suit].value})`;
      addSpeechBubble(seatIndex, text);
      onlineManager.broadcastEvent({
        type: 'speech_bubble',
        playerIndex: seatIndex,
        text,
        durationMs: 1500
      });
      onlineManager.broadcastMatchState(gameState, { kind: 'bid' });
      renderGame();
    } else if (action === 'play') {
      if (mustPlaceBidNow(gameState, seatIndex)) return;
      playCard(gameState, seatIndex, cardId);
      onlineManager.broadcastMatchState(gameState, { kind: 'card' });
      renderGame();
      processTurnLoop(matchSessionId);
    }
  } catch {
    // ignore invalid remote action
  }
}

function startJokenpoTieBreaker() {
  const dict = getDict();
  const tiedHumans = gameState.gameResult.tiedWinners.filter((w) => w.isHuman);
  const rivals = gameState.gameResult.tiedWinners.filter((w) => w.playerIndex !== uiState.localSeatIndex);
  const rival = rivals[0] || { name: 'CPU' };
  const localWinner = gameState.gameResult.tiedWinners.find(
    (w) => w.playerIndex === uiState.localSeatIndex
  );
  if (!localWinner) return;

  if (onlineMode === 'host' && tiedHumans.length > 1) {
    onlineJokenpoPicks.clear();
  }

  const body = document.getElementById('jokenpo-modal-body');
  document.getElementById('jokenpo-modal-title').textContent = dict.jokenpoDuelTitle;

  const renderDuel = (message = dict.jokenpoPick, finished = false) => {
    const canRestart = onlineMode !== 'guest';
    body.innerHTML = `
      <div class="jokenpo-arena">
        <p><strong>${escapeHtml(localWinner.name)}</strong> VS <strong>${escapeHtml(rival.name)}</strong></p>
        <p>${escapeHtml(message)}</p>
        ${
          finished
            ? canRestart
              ? `<button id="jokenpo-done-btn" type="button" class="btn-comic btn-play">${escapeHtml(dict.playAgainBtn)}</button>`
              : `<p class="waiting-status-note">⏳ ${escapeHtml(dict.onlineHostWaitingRematch)}</p>`
            : `<div class="jokenpo-choices">
                 ${SUITS.map(
                   (s) => `
                   <button type="button" class="jokenpo-pick-btn" data-suit="${s}">
                     <span>${SUIT_INFO[s].emoji}</span>
                     <span>${escapeHtml(SUIT_INFO[s].name[uiState.lang])}</span>
                   </button>`
                 ).join('')}
               </div>`
        }
      </div>
    `;

    if (finished && canRestart) {
      document.getElementById('jokenpo-done-btn').addEventListener('click', () => {
        sound.playUiClick();
        if (onlineMode === 'host') {
          startNewMatch(lastCustomPlayers, 'rematch');
        } else {
          startNewMatch();
        }
      });
    } else if (!finished) {
      body.querySelectorAll('.jokenpo-pick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mySuit = btn.dataset.suit;
          if (onlineMode === 'guest' && tiedHumans.length > 1) {
            onlineManager.sendJokenpoPick(mySuit);
            renderDuel('⏳...', false);
            body.querySelectorAll('.jokenpo-pick-btn').forEach((b) => (b.disabled = true));
            return;
          }

          if (onlineMode === 'host' && tiedHumans.length > 1) {
            handleHostJokenpoPick(uiState.localSeatIndex, mySuit, body);
            return;
          }

          const aiSuit = SUITS[Math.floor(Math.random() * SUITS.length)];
          const myName = `${SUIT_INFO[mySuit].emoji} ${SUIT_INFO[mySuit].name[uiState.lang]}`;
          const aiName = `${SUIT_INFO[aiSuit].emoji} ${SUIT_INFO[aiSuit].name[uiState.lang]}`;

          if (mySuit === aiSuit) {
            sound.playDisputeTie();
            renderDuel(`${myName} vs ${aiName} — ${dict.jokenpoDraw}`, false);
          } else if (SUIT_INFO[mySuit].beats === aiSuit) {
            sound.playGameWin();
            launchConfetti();
            renderDuel(`👑 ${myName} vs ${aiName} — ${localWinner.name} ${dict.champion}`, true);
          } else {
            sound.playDisputeTie();
            renderDuel(`👑 ${myName} vs ${aiName} — ${rival.name} ${dict.champion}`, true);
          }
        });
      });
    }
  };

  renderDuel();
  openModal('jokenpo-modal');
}

function handleHostJokenpoPick(seatIndex, suit, modalBodyEl = null) {
  if (onlineMode !== 'host' || !gameState?.gameResult) return;
  const tiedHumans = gameState.gameResult.tiedWinners.filter((w) => w.isHuman);
  onlineJokenpoPicks.set(seatIndex, suit);

  if (seatIndex === uiState.localSeatIndex && modalBodyEl) {
    modalBodyEl.querySelectorAll('.jokenpo-pick-btn').forEach((b) => (b.disabled = true));
  }

  if (tiedHumans.some((h) => !onlineJokenpoPicks.has(h.playerIndex))) {
    return;
  }

  const p0 = tiedHumans[0];
  const p1 = tiedHumans[1];
  const s0 = onlineJokenpoPicks.get(p0.playerIndex);
  const s1 = onlineJokenpoPicks.get(p1.playerIndex);
  onlineJokenpoPicks.clear();

  const dict = getDict();
  const n0 = `${SUIT_INFO[s0].emoji} ${SUIT_INFO[s0].name[uiState.lang]}`;
  const n1 = `${SUIT_INFO[s1].emoji} ${SUIT_INFO[s1].name[uiState.lang]}`;

  if (s0 === s1) {
    const msg = `${n0} vs ${n1} — ${dict.jokenpoDraw}`;
    onlineManager.broadcastEvent({ type: 'jokenpo_state', message: msg, finished: false });
    sound.playDisputeTie();
    updateJokenpoBanner(msg, false);
  } else {
    const champ = SUIT_INFO[s0].beats === s1 ? p0 : p1;
    const msg = `👑 ${n0} vs ${n1} — ${champ.name} ${dict.champion}`;
    onlineManager.broadcastEvent({ type: 'jokenpo_state', message: msg, finished: true });
    sound.playGameWin();
    launchConfetti();
    updateJokenpoBanner(msg, true);
  }
}

function updateJokenpoBanner(message, finished) {
  const arena = document.querySelector('#jokenpo-modal-body .jokenpo-arena');
  if (!arena) return;
  const paragraphs = arena.querySelectorAll('p');
  if (paragraphs[1]) paragraphs[1].textContent = message;
  if (finished) {
    const choices = arena.querySelector('.jokenpo-choices');
    if (choices) {
      choices.outerHTML =
        onlineMode === 'guest'
          ? `<p class="waiting-status-note">⏳ ${escapeHtml(getDict().onlineHostWaitingRematch)}</p>`
          : `<button id="jokenpo-done-btn" type="button" class="btn-comic btn-play">${escapeHtml(getDict().playAgainBtn)}</button>`;
      const doneBtn = document.getElementById('jokenpo-done-btn');
      if (doneBtn) {
        doneBtn.addEventListener('click', () => {
          sound.playUiClick();
          startNewMatch(lastCustomPlayers, 'rematch');
        });
      }
    }
  } else {
    arena.querySelectorAll('.jokenpo-pick-btn').forEach((b) => (b.disabled = false));
  }
}

// ================= ONLINE LOBBY & ROOMS =================

function updateConnectionBadge(status, broker = null) {
  const pill = document.getElementById('online-conn-pill');
  const text = document.getElementById('online-conn-text');
  if (!pill || !text) return;
  const dict = getDict();
  pill.classList.remove('is-connected', 'is-connecting', 'is-error');
  if (status === 'connected') {
    pill.classList.add('is-connected');
    text.textContent = broker?.label ? `${dict.onlineConnected} · ${broker.label}` : dict.onlineConnected;
  } else if (status === 'connecting') {
    pill.classList.add('is-connecting');
    text.textContent = dict.onlineConnecting;
  } else if (status === 'error') {
    pill.classList.add('is-error');
    text.textContent = dict.onlineErrorConn;
  } else {
    text.textContent = dict.onlineDisconnected;
  }
}

function setOnlineTab(tabName) {
  document.querySelectorAll('#online-tabs .online-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.online-tab-panel').forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== `tab-online-${tabName}`);
  });
}

function translateOnlineError(codeOrMsg) {
  const dict = getDict();
  const map = {
    invalid_code: dict.onlineErrInvalidCode,
    not_found: dict.onlineErrNotFound,
    already_started: dict.onlineErrStarted,
    room_full: dict.onlineErrFull,
    wrong_password: dict.onlineErrWrongPwd,
    host_timeout: dict.onlineErrTimeout,
    need_players_or_ai: dict.onlineNeedMoreOrAi
  };
  return map[codeOrMsg] || String(codeOrMsg || dict.onlineErrorConn);
}

function showInlineError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
  } else {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function renderPublicRoomsList(rooms = []) {
  const listEl = document.getElementById('online-rooms-list');
  if (!listEl) return;
  const dict = getDict();

  if (!rooms || rooms.length === 0) {
    const isConnectingOrOffline = !onlineManager || !onlineManager.isConnected;
    const emptyText = isConnectingOrOffline ? `⏳ ${dict.onlineLoadingRooms}` : dict.onlineNoRooms;
    listEl.innerHTML = `<div class="online-empty-state">${escapeHtml(emptyText)}</div>`;
    return;
  }

  listEl.innerHTML = rooms
    .map((room) => {
      const humanCount = room.seats.filter((s) => s.type === 'human').length;
      const modeText = room.mode === 'advanced' ? dict.modeAdvanced : dict.modeBasic;
      const lockBadge =
        room.visibility === 'code_password'
          ? `<span class="room-badge locked">🔒 ${escapeHtml(dict.onlineVisCodePwd)}</span>`
          : `<span class="room-badge open">🔓 ${escapeHtml(dict.onlineVisOpen)}</span>`;
      const aiBadge = room.autoFillAi ? `<span class="room-badge ai">🤖 IA</span>` : '';

      return `
        <div class="room-list-item">
          <div class="room-list-info">
            <div class="room-list-title">${escapeHtml(room.name)}</div>
            <div class="room-list-meta">
              ${lockBadge}
              <span class="room-badge">${escapeHtml(modeText)}</span>
              <span class="room-badge">👥 ${humanCount}/${room.playerCount}</span>
              ${aiBadge}
            </div>
          </div>
          <button type="button" class="btn-comic btn-small btn-play room-join-btn" data-code="${escapeHtml(room.code)}" data-vis="${escapeHtml(room.visibility)}" data-name="${escapeHtml(room.name)}">
            ${room.visibility === 'code_password' ? '🔒 ' : ''}${escapeHtml(dict.onlineJoinBtn)}
          </button>
        </div>
      `;
    })
    .join('');

  listEl.querySelectorAll('.room-join-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sound.playUiClick();
      const code = btn.dataset.code;
      const vis = btn.dataset.vis;
      const name = btn.dataset.name;
      if (vis === 'code_password') {
        pendingPwdRoomCode = code;
        document.getElementById('pwd-modal-room-name').textContent = name;
        document.getElementById('pwd-modal-input').value = '';
        showInlineError('pwd-modal-error', '');
        openModal('room-password-modal');
        setTimeout(() => document.getElementById('pwd-modal-input').focus(), 50);
      } else {
        attemptGuestJoin(code, '', null);
      }
    });
  });
}

function renderWaitingRoom(room) {
  const hubView = document.getElementById('online-hub-view');
  const waitView = document.getElementById('online-waiting-view');
  if (!hubView || !waitView) return;

  if (!room) {
    waitView.classList.add('hidden');
    hubView.classList.remove('hidden');
    return;
  }

  hubView.classList.add('hidden');
  waitView.classList.remove('hidden');

  const dict = getDict();
  document.getElementById('waiting-room-title').textContent = room.name;
  document.getElementById('waiting-room-code').textContent = room.code;

  const visLabel =
    room.visibility === 'code_password'
      ? `🔒 ${dict.onlineVisCodePwd}`
      : room.visibility === 'code'
        ? `🔑 ${dict.onlineVisCode}`
        : `🔓 ${dict.onlineVisOpen}`;
  const modeLabel = room.mode === 'advanced' ? dict.modeAdvanced : dict.modeBasic;

  document.getElementById('waiting-room-pills').innerHTML = `
    <span class="room-badge">${escapeHtml(visLabel)}</span>
    <span class="room-badge">${escapeHtml(modeLabel)}</span>
    <span class="room-badge">👥 ${room.playerCount} ${escapeHtml(dict.playersLabel)}</span>
  `;

  document.getElementById('waiting-seats-list').innerHTML = room.seats
    .map((seat) => {
      if (seat.type === 'empty') {
        return `
          <div class="seat-slot-card empty">
            <div class="seat-slot-num">#${seat.seatIndex + 1}</div>
            <div class="seat-slot-text">
              <strong>${escapeHtml(dict.onlineSeatEmpty)}</strong>
              ${room.autoFillAi ? `<span>🤖 ${escapeHtml(dict.onlineSeatAiHint)}</span>` : ''}
            </div>
          </div>
        `;
      }
      const isHostSeat = seat.seatIndex === 0;
      const avObj = AVATARS.find((a) => a.id === seat.avatar);
      const badge = isHostSeat
        ? `👑 ${escapeHtml(dict.onlineWaitingHostBadge)}`
        : seat.type === 'ai'
          ? '🤖 IA'
          : '🧑 Online';
      return `
        <div class="seat-slot-card filled">
          <div class="seat-slot-num">${avObj ? '🎮' : '🧑'}</div>
          <div class="seat-slot-text">
            <strong>${escapeHtml(seat.name)}</strong>
            <span>${badge}</span>
          </div>
        </div>
      `;
    })
    .join('');

  const isHost = onlineManager?.role === 'host';
  document.getElementById('waiting-host-controls').classList.toggle('hidden', !isHost);
  document.getElementById('waiting-guest-controls').classList.toggle('hidden', isHost);

  const toggle = document.getElementById('waiting-autofill-toggle');
  if (toggle) toggle.checked = Boolean(room.autoFillAi);
}

async function attemptGuestJoin(code, password = '', errorBoxId = 'join-room-error', preferredBroker = null) {
  if (errorBoxId) showInlineError(errorBoxId, '');
  setupConfig.humanName = document.getElementById('player-name-input').value.trim() || 'Você';
  savePrefs();

  try {
    await onlineManager.joinRoom({
      code,
      password,
      name: setupConfig.humanName,
      avatar: setupConfig.humanAvatar,
      preferredBrokerIndex: preferredBroker
    });
    onlineMode = 'guest';
    uiState.localSeatIndex = onlineManager.localSeatIndex;
    closeModals();
    showScreen('online-screen');
    renderWaitingRoom(onlineManager.currentRoom);
  } catch (err) {
    const msg = translateOnlineError(err.message);
    if (errorBoxId) {
      showInlineError(errorBoxId, msg);
    } else {
      showInlineError('join-room-error', msg);
      setOnlineTab('join');
      document.getElementById('join-room-code').value = String(code || '').toUpperCase();
    }
  }
}

function initOnlineManager() {
  onlineManager = new OnlineManager({
    onConnectionStatus: (status, broker) => {
      updateConnectionBadge(status, broker);
      renderPublicRoomsList(onlineManager.getPublicRooms());
    },
    onRoomsChanged: (rooms) => {
      renderPublicRoomsList(rooms);
    },
    onRoomStateChanged: (room) => {
      renderWaitingRoom(room);
    },
    onHostRemoteAction: handleHostRemoteAction,
    onHostRemoteJokenpoPick: (seatIndex, suit) => {
      handleHostJokenpoPick(seatIndex, suit, document.getElementById('jokenpo-modal-body'));
    },
    onGuestConvertedToAi: (seatIndex, newName) => {
      if (onlineMode === 'host' && gameState && gameState.players[seatIndex]) {
        gameState.players[seatIndex].isHuman = false;
        gameState.players[seatIndex].peerId = null;
        if (newName) gameState.players[seatIndex].name = newName;
        if (Array.isArray(lastCustomPlayers) && lastCustomPlayers[seatIndex]) {
          lastCustomPlayers[seatIndex].isHuman = false;
          lastCustomPlayers[seatIndex].peerId = null;
          if (newName) lastCustomPlayers[seatIndex].name = newName;
        }
        onlineManager.broadcastMatchState(gameState, { kind: 'sync' });
        renderGame();
        processTurnLoop(matchSessionId);
      }
    },
    onMatchStateReceived: (view, event) => {
      if (onlineMode !== 'guest') return;
      const isFreshMatch = event?.kind === 'deal' || event?.kind === 'rematch' || !gameState;
      if (isFreshMatch) {
        matchSessionId += 1;
        hideComicCallout();
        closeModals();
        uiState.bidSelectionMode = false;
        uiState.speechBubbles = {};
      } else if (event?.kind === 'nextRound') {
        closeModals();
        hideComicCallout();
        uiState.bidSelectionMode = false;
      }

      pendingOnlineAction = false;
      uiState.localSeatIndex = onlineManager.localSeatIndex;
      gameState = view;
      showScreen('game-screen');

      if (event?.kind === 'deal' || event?.kind === 'nextRound' || event?.kind === 'rematch') {
        sound.playCardDeal();
      } else if (event?.kind === 'card') {
        sound.playCardSnap();
      } else if (event?.kind === 'bid') {
        sound.playBidPlace();
      }

      if (gameState.phase === 'playing' && gameState.turnIndex === uiState.localSeatIndex) {
        sound.playYourTurn();
      }

      renderGame();

      if (event?.kind === 'roundEnd') {
        sound.playTokenEarn();
        openRoundEndModalForLocalRole();
      } else if (event?.kind === 'gameOver') {
        sound.playGameWin();
        openGameOverModalForLocalRole();
        launchConfetti();
      }
    },
    onSpeechBubble: (playerIndex, text, durationMs) => {
      addSpeechBubble(playerIndex, text, durationMs);
      if (gameState) renderGame();
    },
    onCallout: ({ title, sub, isTie }) => {
      if (isTie) sound.playDisputeTie();
      else sound.playDisputeWin();
      showComicCallout(title, sub, Boolean(isTie));
    },
    onHideCallout: () => {
      hideComicCallout();
    },
    onJokenpoState: ({ message, finished }) => {
      if (finished) {
        sound.playGameWin();
        launchConfetti();
      } else {
        sound.playDisputeTie();
      }
      updateJokenpoBanner(message, finished);
    },
    onRoomClosed: () => {
      matchSessionId += 1;
      onlineMode = null;
      pendingOnlineAction = false;
      uiState.localSeatIndex = 0;
      gameState = null;
      hideComicCallout();
      closeModals();
      showScreen('online-screen');
      renderWaitingRoom(null);
      setOnlineTab('rooms');
      showInlineError('join-room-error', getDict().onlineHostClosed);
    }
  });
}

function initOnlineControls() {
  const safeRefreshDirectory = () => {
    renderPublicRoomsList(onlineManager.getPublicRooms());
    onlineManager.refreshDirectory().catch((err) => {
      if (err?.message !== 'Connection superseded' && onlineManager?.client?.status === 'error') {
        updateConnectionBadge('error', null);
      }
    });
  };

  document.getElementById('open-online-btn').addEventListener('click', () => {
    sound.playUiClick();
    setupConfig.humanName = document.getElementById('player-name-input').value.trim() || 'Você';
    savePrefs();
    showInlineError('create-room-error', '');
    showInlineError('join-room-error', '');
    showInlineError('waiting-room-error', '');
    showScreen('online-screen');
    renderWaitingRoom(onlineManager.currentRoom);
    safeRefreshDirectory();
  });

  document.getElementById('online-back-btn').addEventListener('click', async () => {
    sound.playUiClick();
    await onlineManager.leaveOrCloseSilently();
    onlineMode = null;
    uiState.localSeatIndex = 0;
    renderWaitingRoom(null);
    showScreen('menu-screen');
  });

  document.querySelectorAll('#online-tabs .online-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sound.playUiClick();
      setOnlineTab(btn.dataset.tab);
      if (btn.dataset.tab === 'rooms') {
        safeRefreshDirectory();
      }
    });
  });

  document.getElementById('online-refresh-btn').addEventListener('click', () => {
    sound.playUiClick();
    safeRefreshDirectory();
  });

  document.querySelectorAll('#create-players-picker .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.players) === onlineCreateConfig.playerCount);
    btn.addEventListener('click', () => {
      sound.playUiClick();
      onlineCreateConfig.playerCount = Number(btn.dataset.players);
      document
        .querySelectorAll('#create-players-picker .seg-btn')
        .forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  document.querySelectorAll('#create-mode-picker .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === onlineCreateConfig.mode);
    btn.addEventListener('click', () => {
      sound.playUiClick();
      onlineCreateConfig.mode = btn.dataset.mode;
      document
        .querySelectorAll('#create-mode-picker .seg-btn')
        .forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  document.querySelectorAll('#create-ai-diff-picker .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.diff === onlineCreateConfig.difficulty);
    btn.addEventListener('click', () => {
      sound.playUiClick();
      onlineCreateConfig.difficulty = btn.dataset.diff;
      document
        .querySelectorAll('#create-ai-diff-picker .seg-btn')
        .forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  document.querySelectorAll('#create-visibility-picker .vis-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      sound.playUiClick();
      onlineCreateConfig.visibility = btn.dataset.vis;
      document
        .querySelectorAll('#create-visibility-picker .vis-card')
        .forEach((b) => b.classList.toggle('active', b === btn));
      document
        .getElementById('create-password-group')
        .classList.toggle('hidden', onlineCreateConfig.visibility !== 'code_password');
    });
  });

  document.getElementById('create-room-submit-btn').addEventListener('click', async () => {
    sound.playUiClick();
    showInlineError('create-room-error', '');
    const dict = getDict();
    const pwd = document.getElementById('create-room-password').value;
    if (onlineCreateConfig.visibility === 'code_password' && !pwd.trim()) {
      showInlineError('create-room-error', dict.onlinePwdRequired);
      return;
    }

    setupConfig.humanName = document.getElementById('player-name-input').value.trim() || 'Você';
    savePrefs();

    const btn = document.getElementById('create-room-submit-btn');
    btn.disabled = true;
    try {
      const room = await onlineManager.createRoom({
        roomName: document.getElementById('create-room-name').value.trim(),
        playerCount: onlineCreateConfig.playerCount,
        mode: onlineCreateConfig.mode,
        difficulty: onlineCreateConfig.difficulty,
        visibility: onlineCreateConfig.visibility,
        password: pwd,
        autoFillAi: document.getElementById('create-autofill-ai').checked,
        hostName: setupConfig.humanName,
        hostAvatar: setupConfig.humanAvatar
      });
      onlineMode = 'host';
      uiState.localSeatIndex = 0;
      renderWaitingRoom(room);
    } catch (err) {
      showInlineError('create-room-error', translateOnlineError(err.message));
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('join-room-submit-btn').addEventListener('click', async () => {
    sound.playUiClick();
    const code = document.getElementById('join-room-code').value.trim().toUpperCase();
    const pwd = document.getElementById('join-room-password').value;
    if (!code) {
      showInlineError('join-room-error', getDict().onlineErrInvalidCode);
      return;
    }
    const btn = document.getElementById('join-room-submit-btn');
    btn.disabled = true;
    try {
      await attemptGuestJoin(code, pwd, 'join-room-error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('pwd-modal-submit-btn').addEventListener('click', async () => {
    sound.playUiClick();
    const pwd = document.getElementById('pwd-modal-input').value;
    if (!pendingPwdRoomCode) return;
    await attemptGuestJoin(pendingPwdRoomCode, pwd, 'pwd-modal-error');
  });

  document.getElementById('waiting-autofill-toggle').addEventListener('change', (e) => {
    onlineManager.setAutoFillAi(e.target.checked);
  });

  document.getElementById('waiting-start-btn').addEventListener('click', () => {
    sound.playUiClick();
    showInlineError('waiting-room-error', '');
    const prep = onlineManager.prepareRoomMatchPlayers();
    if (!prep || !prep.ok) {
      showInlineError('waiting-room-error', translateOnlineError(prep?.reason || 'need_players_or_ai'));
      return;
    }
    onlineMode = 'host';
    startNewMatch(prep.customPlayers, 'deal');
  });

  document.getElementById('waiting-close-btn').addEventListener('click', async () => {
    sound.playUiClick();
    await onlineManager.leaveRoom();
    onlineMode = null;
    renderWaitingRoom(null);
    setOnlineTab('rooms');
  });

  document.getElementById('waiting-leave-btn').addEventListener('click', async () => {
    sound.playUiClick();
    await onlineManager.leaveRoom();
    onlineMode = null;
    renderWaitingRoom(null);
    setOnlineTab('rooms');
  });

  const flashCopied = (btn) => {
    const orig = btn.textContent;
    btn.textContent = getDict().onlineCopied;
    setTimeout(() => {
      btn.textContent = orig;
    }, 1400);
  };

  document.getElementById('copy-code-btn').addEventListener('click', async (e) => {
    sound.playUiClick();
    const code = onlineManager?.currentRoom?.code || '';
    try {
      await navigator.clipboard.writeText(code);
      flashCopied(e.currentTarget);
    } catch {
      // ignore clipboard errors
    }
  });

  document.getElementById('copy-link-btn').addEventListener('click', async (e) => {
    sound.playUiClick();
    const room = onlineManager?.currentRoom;
    if (!room) return;
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = `${base}?room=${room.code}&s=${room.brokerIndex ?? 0}`;
    try {
      await navigator.clipboard.writeText(url);
      flashCopied(e.currentTarget);
    } catch {
      // ignore clipboard errors
    }
  });
}

function initMenuControls() {
  document.getElementById('player-name-input').value = setupConfig.humanName;

  document.querySelectorAll('#player-count-picker .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.players) === setupConfig.playerCount);
    btn.addEventListener('click', () => {
      sound.playUiClick();
      setupConfig.playerCount = Number(btn.dataset.players);
      document
        .querySelectorAll('#player-count-picker .seg-btn')
        .forEach((b) => b.classList.toggle('active', b === btn));
      savePrefs();
    });
  });

  document.querySelectorAll('#mode-picker .mode-card').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === setupConfig.mode);
    btn.addEventListener('click', () => {
      sound.playUiClick();
      setupConfig.mode = btn.dataset.mode;
      document
        .querySelectorAll('#mode-picker .mode-card')
        .forEach((b) => b.classList.toggle('active', b === btn));
      savePrefs();
    });
  });

  document.querySelectorAll('#difficulty-picker .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.diff === setupConfig.difficulty);
    btn.addEventListener('click', () => {
      sound.playUiClick();
      setupConfig.difficulty = btn.dataset.diff;
      document
        .querySelectorAll('#difficulty-picker .seg-btn')
        .forEach((b) => b.classList.toggle('active', b === btn));
      savePrefs();
    });
  });

  const renderAvatars = () => {
    renderAvatarPicker(document.getElementById('avatar-picker'), setupConfig.humanAvatar, (id) => {
      sound.playUiClick();
      setupConfig.humanAvatar = id;
      renderAvatars();
      savePrefs();
    });
  };
  renderAvatars();

  document.getElementById('start-game-btn').addEventListener('click', async () => {
    sound.playUiClick();
    await onlineManager.leaveOrCloseSilently();
    onlineMode = null;
    startNewMatch();
  });

  document.getElementById('open-rules-menu-btn').addEventListener('click', () => {
    sound.playUiClick();
    openModal('rules-modal');
  });

  document.getElementById('open-settings-menu-btn').addEventListener('click', () => {
    sound.playUiClick();
    refreshSettingsButtons();
    openModal('settings-modal');
  });

  document.getElementById('quit-desktop-btn').addEventListener('click', async () => {
    try {
      await fetch('/api/quit', { method: 'POST' });
    } catch {
      // ignore
    }
    window.close();
  });
}

function initGameControls() {
  document.getElementById('sort-hand-btn').addEventListener('click', () => {
    if (!gameState) return;
    const myIdx = uiState.localSeatIndex;
    sound.playUiClick();
    uiState.sortBy = uiState.sortBy === 'suit' ? 'number' : 'suit';
    gameState.players[myIdx].hand = sortHand(gameState.players[myIdx].hand, uiState.sortBy);
    renderGame();
  });

  document.getElementById('place-bid-btn').addEventListener('click', () => {
    const myIdx = uiState.localSeatIndex;
    if (!gameState || gameState.turnIndex !== myIdx) return;
    if (mustPlaceBidNow(gameState, myIdx)) return;
    sound.playUiClick();
    uiState.bidSelectionMode = !uiState.bidSelectionMode;
    renderGame();
  });

  document.getElementById('hud-speed-btn').addEventListener('click', () => {
    sound.playUiClick();
    uiState.speed = uiState.speed === 'normal' ? 'fast' : 'normal';
    refreshSettingsButtons();
    savePrefs();
  });

  document.getElementById('hud-sfx-btn').addEventListener('click', () => {
    sound.sfxEnabled = !sound.sfxEnabled;
    if (sound.sfxEnabled) sound.playUiClick();
    refreshSettingsButtons();
    savePrefs();
  });

  document.getElementById('hud-music-btn').addEventListener('click', () => {
    sound.ensureContext();
    sound.setMusicEnabled(!sound.musicEnabled);
    sound.playUiClick();
    refreshSettingsButtons();
    savePrefs();
  });

  document.getElementById('hud-rules-btn').addEventListener('click', () => {
    sound.playUiClick();
    openModal('rules-modal');
  });

  document.getElementById('hud-settings-btn').addEventListener('click', () => {
    sound.playUiClick();
    refreshSettingsButtons();
    openModal('settings-modal');
  });

  document.getElementById('hud-menu-btn').addEventListener('click', () => {
    sound.playUiClick();
    if (gameState) {
      renderPauseScoreboard(gameState, uiState.lang);
    }
    document.getElementById('pause-restart-btn').classList.toggle('hidden', onlineMode === 'guest');
    document.getElementById('pause-quit-btn').classList.toggle('hidden', !isDesktopApp);
    openModal('pause-menu-modal');
  });

  document.getElementById('pause-resume-btn').addEventListener('click', () => {
    sound.playUiClick();
    closeModals();
  });

  document.getElementById('pause-restart-btn').addEventListener('click', () => {
    sound.playUiClick();
    if (onlineMode === 'host') {
      startNewMatch(lastCustomPlayers, 'rematch');
    } else if (!onlineMode) {
      startNewMatch();
    }
  });

  document.getElementById('pause-settings-btn').addEventListener('click', () => {
    sound.playUiClick();
    refreshSettingsButtons();
    openModal('settings-modal');
  });

  document.getElementById('pause-rules-btn').addEventListener('click', () => {
    sound.playUiClick();
    openModal('rules-modal');
  });

  document.getElementById('pause-leave-btn').addEventListener('click', async () => {
    sound.playUiClick();
    matchSessionId += 1;
    const wasOnline = Boolean(onlineMode);
    if (wasOnline) {
      await onlineManager.leaveRoom();
      onlineMode = null;
      renderWaitingRoom(null);
    }
    uiState.localSeatIndex = 0;
    gameState = null;
    hideComicCallout();
    closeModals();
    showScreen(wasOnline ? 'online-screen' : 'menu-screen');
  });

  document.getElementById('pause-quit-btn').addEventListener('click', async () => {
    await onlineManager.leaveOrCloseSilently();
    try {
      await fetch('/api/quit', { method: 'POST' });
    } catch {
      // ignore
    }
    window.close();
  });

  document.getElementById('round-next-btn').addEventListener('click', () => {
    if (!gameState || onlineMode === 'guest') return;
    sound.playCardDeal();
    const session = matchSessionId;
    closeModals();
    startNextRound(gameState);
    const myIdx = uiState.localSeatIndex;
    gameState.players[myIdx].hand = sortHand(gameState.players[myIdx].hand, uiState.sortBy);
    if (onlineMode === 'host') {
      onlineManager.broadcastMatchState(gameState, { kind: 'nextRound' });
    }
    renderGame();
    processTurnLoop(session);
  });

  document.getElementById('play-again-btn').addEventListener('click', () => {
    if (onlineMode === 'guest') return;
    sound.playUiClick();
    if (onlineMode === 'host') {
      startNewMatch(lastCustomPlayers, 'rematch');
    } else {
      startNewMatch();
    }
  });

  document.getElementById('back-menu-btn').addEventListener('click', async () => {
    sound.playUiClick();
    matchSessionId += 1;
    const wasOnline = Boolean(onlineMode);
    if (wasOnline) {
      await onlineManager.leaveRoom();
      onlineMode = null;
      renderWaitingRoom(null);
    }
    uiState.localSeatIndex = 0;
    gameState = null;
    closeModals();
    showScreen(wasOnline ? 'online-screen' : 'menu-screen');
  });

  document.getElementById('tie-jokenpo-btn').addEventListener('click', () => {
    sound.playUiClick();
    startJokenpoTieBreaker();
  });
}

function initModalsAndSettings() {
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sound.playUiClick();
      closeModals();
    });
  });

  document.querySelectorAll('#lang-picker .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sound.playUiClick();
      setLanguage(btn.dataset.lang);
      refreshSettingsButtons();
    });
  });

  document.querySelectorAll('#speed-picker .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sound.playUiClick();
      uiState.speed = btn.dataset.speed;
      refreshSettingsButtons();
      savePrefs();
    });
  });

  document.querySelectorAll('#sfx-picker .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sound.sfxEnabled = btn.dataset.sfx === 'on';
      if (sound.sfxEnabled) sound.playUiClick();
      refreshSettingsButtons();
      savePrefs();
    });
  });

  document.querySelectorAll('#music-picker .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sound.ensureContext();
      sound.setMusicEnabled(btn.dataset.music === 'on');
      sound.playUiClick();
      refreshSettingsButtons();
      savePrefs();
    });
  });
}

async function detectDesktopWrapper() {
  const isLocalLoopback =
    window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
  if (!isLocalLoopback) {
    isDesktopApp = false;
    return false;
  }

  try {
    const res = await fetch('/api/ping');
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        isDesktopApp = false;
        return false;
      }
      const data = await res.json();
      if (data && data.ok === true) {
        isDesktopApp = true;
        document.getElementById('quit-desktop-btn').classList.remove('hidden');
        try {
          const evtSource = new EventSource('/api/events');
          window.addEventListener('beforeunload', () => evtSource.close());
        } catch {
          // Ignore if EventSource unavailable
        }
        setInterval(() => {
          fetch('/api/ping').catch(() => {});
        }, 2000);
        return true;
      }
    }
  } catch {
    isDesktopApp = false;
  }
  isDesktopApp = false;
  return false;
}

function registerWebCapabilities() {
  const unlockAudio = () => {
    if (sound.musicEnabled || sound.sfxEnabled) {
      sound.ensureContext();
    }
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

  const isHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  if (!isDesktopApp && isHttp && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function handleWindowRestore() {
  if (document.hidden) return;
  if (isDesktopApp) {
    fetch('/api/ping').catch(() => {});
  }
  if (onlineManager) {
    onlineManager.handleTabVisible();
  }
  refreshVisibleImages();
  if (gameState && gameState.phase !== 'resolving') {
    renderGame();
    refreshVisibleImages();
  }
}

function boot() {
  preloadCardImages();
  if (typeof prefs.sfxEnabled === 'boolean') {
    sound.sfxEnabled = prefs.sfxEnabled;
  }
  initOnlineManager();
  setTheme(uiState.theme);
  setLanguage(uiState.lang);
  initMenuControls();
  initOnlineControls();
  initGameControls();
  initModalsAndSettings();
  refreshSettingsButtons();
  detectDesktopWrapper().then(() => {
    registerWebCapabilities();
  });
  document.addEventListener('visibilitychange', handleWindowRestore);
  window.addEventListener('focus', handleWindowRestore);
  window.addEventListener('beforeunload', () => {
    if (onlineManager) {
      onlineManager.leaveOrCloseSilently();
    }
  });
  window.addEventListener('pagehide', () => {
    if (onlineManager) {
      onlineManager.leaveOrCloseSilently();
    }
  });
  window.addEventListener('resize', () => {
    if (gameState) updateHandOverlap(gameState, uiState.localSeatIndex);
  });

  const params = new URLSearchParams(window.location.search);
  const paramPlayers = Number(params.get('players'));
  if ([3, 4, 5].includes(paramPlayers)) {
    setupConfig.playerCount = paramPlayers;
  }
  const inviteRoom = params.get('room');
  if (inviteRoom) {
    const cleanInvite = inviteRoom.trim().toUpperCase();
    const sParam = params.get('s');
    const brokerHint = sParam !== null ? Number(sParam) : null;
    showScreen('online-screen');
    setOnlineTab('join');
    document.getElementById('join-room-code').value = cleanInvite;
    onlineManager
      .ensureConnected(brokerHint ?? 0)
      .then(() => attemptGuestJoin(cleanInvite, '', null, brokerHint))
      .catch(() => updateConnectionBadge('error'));
    return;
  }
  if (params.get('autostart') === '1') {
    startNewMatch();
  }
}

boot();
