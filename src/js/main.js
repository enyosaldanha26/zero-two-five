import { I18N, SUITS, SUIT_INFO } from './constants.js';
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

const STORAGE_KEY = 'zero_two_five_prefs_v1';

const prefs = loadPrefs();
let gameState = null;
let matchSessionId = 0;
let isDesktopApp = false;

const uiState = {
  lang: prefs.lang || 'pt',
  theme: prefs.theme || 'crimson',
  speed: prefs.speed || 'normal',
  sortBy: 'suit',
  bidSelectionMode: false,
  speechBubbles: {}
};

const setupConfig = {
  playerCount: prefs.playerCount || 4,
  mode: prefs.mode || 'basic',
  difficulty: prefs.difficulty || 'tactical',
  humanName: prefs.humanName || 'Você',
  humanAvatar: prefs.humanAvatar || 'defy'
};

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

function startNewMatch() {
  matchSessionId += 1;
  const session = matchSessionId;
  hideComicCallout();
  closeModals();

  setupConfig.humanName = document.getElementById('player-name-input').value.trim() || 'Você';
  savePrefs();

  uiState.bidSelectionMode = false;
  uiState.speechBubbles = {};
  gameState = createMatchState(setupConfig);
  gameState.players[0].hand = sortHand(gameState.players[0].hand, uiState.sortBy);

  document.getElementById('menu-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');

  sound.playCardDeal();
  renderGame();
  processTurnLoop(session);
}

async function processTurnLoop(session) {
  if (session !== matchSessionId || !gameState) return;

  if (gameState.phase === 'playing') {
    const turnIdx = gameState.turnIndex;
    const current = gameState.players[turnIdx];

    if (current.isHuman) {
      sound.playYourTurn();
      renderGame();
      return;
    }

    await delayMs(1300);
    if (session !== matchSessionId || !gameState) return;

    const decision = decideAiTurn(gameState, turnIdx);
    const dict = I18N[uiState.lang] || I18N.pt;

    if (decision.bidCard) {
      placeBid(gameState, turnIdx, decision.bidCard.id);
      sound.playBidPlace();
      addSpeechBubble(turnIdx, `${dict.bidPlacedCallout} (${SUIT_INFO[decision.bidCard.suit].value})`);
      renderGame();
      await delayMs(900);
      if (session !== matchSessionId || !gameState) return;
    }

    playCard(gameState, turnIdx, decision.playCard.id);
    sound.playCardSnap();
    renderGame();

    await processTurnLoop(session);
    return;
  }

  if (gameState.phase === 'resolving') {
    await delayMs(1000);
    if (session !== matchSessionId || !gameState) return;

    const result = resolveDispute(gameState);
    const dict = I18N[uiState.lang] || I18N.pt;

    if (result.isTie) {
      sound.playDisputeTie();
      const causer = gameState.players[result.nextLead];
      showComicCallout(dict.threeSuitsTie, `${causer.name} ${dict.tieNextLead}`, true);
      if (!causer.isHuman) {
        addSpeechBubble(causer.index, '⚡ EMPATE!');
      }
    } else {
      sound.playDisputeWin();
      const winner = gameState.players[result.winningPlay.playerIndex];
      let title = dict.sameSuitWin;
      if (result.reason === 'suit_beat') {
        if (result.winningSuit === 'rock') title = dict.rockBeatsScissors;
        else if (result.winningSuit === 'scissors') title = dict.scissorsBeatsPaper;
        else title = dict.paperBeatsRock;
      }
      showComicCallout(title, `👑 ${winner.name} ${dict.winnerCallout}`, false);
    }

    await delayMs(2375);
    if (session !== matchSessionId || !gameState) return;

    hideComicCallout();

    if (gameState.phase === 'roundEnd') {
      sound.playTokenEarn();
      renderGame();
      renderRoundSummaryModal(gameState.lastRoundSummary, gameState, uiState.lang);
      openModal('round-modal');
      return;
    }

    if (gameState.phase === 'gameOver') {
      sound.playGameWin();
      renderGame();
      renderGameOverModal(gameState.gameResult, uiState.lang);
      openModal('gameover-modal');
      launchConfetti();
      return;
    }

    renderGame();
    await processTurnLoop(session);
  }
}

function handleHumanPlaceBid(cardId) {
  if (!gameState || gameState.phase !== 'playing' || gameState.turnIndex !== 0) return;
  const session = matchSessionId;

  placeBid(gameState, 0, cardId);
  uiState.bidSelectionMode = false;
  sound.playBidPlace();
  renderGame();

  // Human still needs to play a card in this dispute!
  if (session === matchSessionId && gameState.turnIndex === 0) {
    // stay on human turn for card play
  }
}

async function handleHumanPlayCard(cardId) {
  if (!gameState || gameState.phase !== 'playing' || gameState.turnIndex !== 0) return;
  if (mustPlaceBidNow(gameState, 0)) {
    uiState.bidSelectionMode = true;
    renderGame();
    return;
  }

  const session = matchSessionId;
  playCard(gameState, 0, cardId);
  sound.playCardSnap();
  renderGame();

  await processTurnLoop(session);
}

function startJokenpoTieBreaker() {
  const dict = I18N[uiState.lang] || I18N.pt;
  const rivals = gameState.gameResult.tiedWinners.filter((w) => !w.isHuman);
  const rival = rivals[0] || { name: 'CPU' };

  const body = document.getElementById('jokenpo-modal-body');
  document.getElementById('jokenpo-modal-title').textContent = dict.jokenpoDuelTitle;

  const renderDuel = (message = dict.jokenpoPick, finished = false) => {
    body.innerHTML = `
      <div class="jokenpo-arena">
        <p><strong>${gameState.players[0].name}</strong> VS <strong>${rival.name}</strong></p>
        <p>${message}</p>
        ${
          finished
            ? `<button id="jokenpo-done-btn" type="button" class="btn-comic btn-play">${dict.playAgainBtn}</button>`
            : `<div class="jokenpo-choices">
                 ${SUITS.map(
                   (s) => `
                   <button type="button" class="jokenpo-pick-btn" data-suit="${s}">
                     <span>${SUIT_INFO[s].emoji}</span>
                     <span>${SUIT_INFO[s].name[uiState.lang]}</span>
                   </button>`
                 ).join('')}
               </div>`
        }
      </div>
    `;

    if (finished) {
      document.getElementById('jokenpo-done-btn').addEventListener('click', () => {
        sound.playUiClick();
        startNewMatch();
      });
    } else {
      body.querySelectorAll('.jokenpo-pick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mySuit = btn.dataset.suit;
          const aiSuit = SUITS[Math.floor(Math.random() * SUITS.length)];
          const myName = `${SUIT_INFO[mySuit].emoji} ${SUIT_INFO[mySuit].name[uiState.lang]}`;
          const aiName = `${SUIT_INFO[aiSuit].emoji} ${SUIT_INFO[aiSuit].name[uiState.lang]}`;

          if (mySuit === aiSuit) {
            sound.playDisputeTie();
            renderDuel(`${myName} vs ${aiName} — ${dict.jokenpoDraw}`, false);
          } else if (SUIT_INFO[mySuit].beats === aiSuit) {
            sound.playGameWin();
            launchConfetti();
            renderDuel(`👑 ${myName} vs ${aiName} — ${gameState.players[0].name} ${dict.champion}`, true);
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

  document.getElementById('start-game-btn').addEventListener('click', () => {
    sound.playUiClick();
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
    sound.playUiClick();
    uiState.sortBy = uiState.sortBy === 'suit' ? 'number' : 'suit';
    gameState.players[0].hand = sortHand(gameState.players[0].hand, uiState.sortBy);
    renderGame();
  });

  document.getElementById('place-bid-btn').addEventListener('click', () => {
    if (!gameState || gameState.turnIndex !== 0) return;
    if (mustPlaceBidNow(gameState, 0)) return;
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
    document.getElementById('pause-quit-btn').classList.toggle('hidden', !isDesktopApp);
    openModal('pause-menu-modal');
  });

  document.getElementById('pause-resume-btn').addEventListener('click', () => {
    sound.playUiClick();
    closeModals();
  });

  document.getElementById('pause-restart-btn').addEventListener('click', () => {
    sound.playUiClick();
    startNewMatch();
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

  document.getElementById('pause-leave-btn').addEventListener('click', () => {
    sound.playUiClick();
    matchSessionId += 1;
    gameState = null;
    hideComicCallout();
    closeModals();
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('menu-screen').classList.add('active');
  });

  document.getElementById('pause-quit-btn').addEventListener('click', async () => {
    try {
      await fetch('/api/quit', { method: 'POST' });
    } catch {
      // ignore
    }
    window.close();
  });

  document.getElementById('round-next-btn').addEventListener('click', () => {
    if (!gameState) return;
    sound.playCardDeal();
    const session = matchSessionId;
    closeModals();
    startNextRound(gameState);
    gameState.players[0].hand = sortHand(gameState.players[0].hand, uiState.sortBy);
    renderGame();
    processTurnLoop(session);
  });

  document.getElementById('play-again-btn').addEventListener('click', () => {
    sound.playUiClick();
    startNewMatch();
  });

  document.getElementById('back-menu-btn').addEventListener('click', () => {
    sound.playUiClick();
    matchSessionId += 1;
    gameState = null;
    closeModals();
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('menu-screen').classList.add('active');
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
          // Persistent SSE stream stays open when minimized, closing only when the window exits
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
  setTheme(uiState.theme);
  setLanguage(uiState.lang);
  initMenuControls();
  initGameControls();
  initModalsAndSettings();
  refreshSettingsButtons();
  detectDesktopWrapper().then(() => {
    registerWebCapabilities();
  });
  document.addEventListener('visibilitychange', handleWindowRestore);
  window.addEventListener('focus', handleWindowRestore);
  window.addEventListener('resize', () => {
    if (gameState) updateHandOverlap(gameState);
  });

  const params = new URLSearchParams(window.location.search);
  const paramPlayers = Number(params.get('players'));
  if ([3, 4, 5].includes(paramPlayers)) {
    setupConfig.playerCount = paramPlayers;
  }
  if (params.get('autostart') === '1') {
    startNewMatch();
  }
}

boot();
