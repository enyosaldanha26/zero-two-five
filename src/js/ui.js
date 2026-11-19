import {
  I18N,
  SUITS,
  SUIT_INFO,
  CARD_BACK_SRC,
  TABLE_THEMES,
  AVATARS,
  getCardImagePath,
  getTokenImagePath,
  renderAvatarSvg
} from './constants.js';
import { getLegalCards, evaluateTable, mustPlaceBidNow, canPlaceBidNow } from './engine.js';

const preloadedImageCache = new Map();

function ensureCachedImage(src) {
  if (!src) return;
  if (preloadedImageCache.has(src)) return preloadedImageCache.get(src);
  const img = new Image();
  img.decoding = 'sync';
  img.src = src;
  if (typeof img.decode === 'function') {
    img.decode().catch(() => {});
  }
  preloadedImageCache.set(src, img);
  return img;
}

export function preloadCardImages() {
  ensureCachedImage(CARD_BACK_SRC);
  for (const suit of SUITS) {
    for (let num = 1; num <= 20; num += 1) {
      ensureCachedImage(getCardImagePath(suit, num));
    }
  }
  for (const val of [0, 2, 5]) {
    ensureCachedImage(getTokenImagePath(val, false));
    ensureCachedImage(getTokenImagePath(val, true));
  }
}

export function refreshVisibleImages() {
  document.querySelectorAll('#played-cards-stage img, #human-hand img').forEach((img) => {
    const src = img.getAttribute('src');
    if (!src) return;
    ensureCachedImage(src);
    if (!img.complete || img.naturalWidth === 0) {
      img.src = '';
      img.src = src;
    }
    if (typeof img.decode === 'function') {
      img.decode().catch(() => {});
    }
  });
}

export function getSeatLayout(playerCount) {
  const isMobilePortrait = typeof window !== 'undefined' && window.innerWidth <= 768;

  if (isMobilePortrait) {
    if (playerCount === 3) {
      return [
        { seatClass: 'pos-bottom', stagePos: { x: 50, y: 78, rot: 0 } },
        { seatClass: 'pos-top-left', stagePos: { x: 24, y: 34, rot: -3 } },
        { seatClass: 'pos-top-right', stagePos: { x: 76, y: 34, rot: 3 } }
      ];
    }
    if (playerCount === 4) {
      return [
        { seatClass: 'pos-bottom', stagePos: { x: 50, y: 78, rot: 0 } },
        { seatClass: 'pos-left', stagePos: { x: 16, y: 53, rot: 0 } },
        { seatClass: 'pos-top-center', stagePos: { x: 50, y: 28, rot: 0 } },
        { seatClass: 'pos-right', stagePos: { x: 84, y: 53, rot: 0 } }
      ];
    }
    return [
      { seatClass: 'pos-bottom', stagePos: { x: 50, y: 78, rot: 0 } },
      { seatClass: 'pos-mid-left', stagePos: { x: 14, y: 58, rot: -4 } },
      { seatClass: 'pos-top-left', stagePos: { x: 35, y: 29, rot: -2 } },
      { seatClass: 'pos-top-right', stagePos: { x: 65, y: 29, rot: 2 } },
      { seatClass: 'pos-mid-right', stagePos: { x: 86, y: 58, rot: 4 } }
    ];
  }

  if (playerCount === 3) {
    return [
      { seatClass: 'pos-bottom', stagePos: { x: 50, y: 80, rot: 0 } },
      { seatClass: 'pos-top-left', stagePos: { x: 25, y: 24, rot: -5 } },
      { seatClass: 'pos-top-right', stagePos: { x: 75, y: 24, rot: 5 } }
    ];
  }
  if (playerCount === 4) {
    return [
      { seatClass: 'pos-bottom', stagePos: { x: 50, y: 80, rot: 0 } },
      { seatClass: 'pos-left', stagePos: { x: 14, y: 50, rot: -6 } },
      { seatClass: 'pos-top-center', stagePos: { x: 50, y: 13, rot: 1 } },
      { seatClass: 'pos-right', stagePos: { x: 86, y: 50, rot: 6 } }
    ];
  }
  return [
    { seatClass: 'pos-bottom', stagePos: { x: 50, y: 82, rot: 0 } },
    { seatClass: 'pos-mid-left', stagePos: { x: 13, y: 50, rot: -6 } },
    { seatClass: 'pos-top-left', stagePos: { x: 31, y: 17, rot: -3 } },
    { seatClass: 'pos-top-right', stagePos: { x: 69, y: 17, rot: 3 } },
    { seatClass: 'pos-mid-right', stagePos: { x: 87, y: 50, rot: 6 } }
  ];
}

export function applyTranslations(lang) {
  const dict = I18N[lang] || I18N.pt;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });
}

export function renderAvatarPicker(container, selectedId, onSelect) {
  container.innerHTML = '';
  for (const av of AVATARS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `avatar-choice ${av.id === selectedId ? 'active' : ''}`;
    btn.innerHTML = `<div class="mini-av">${renderAvatarSvg(av.id)}</div><span>${av.name}</span>`;
    btn.addEventListener('click', () => onSelect(av.id));
    container.appendChild(btn);
  }
}

export function renderThemePicker(container, selectedTheme, lang, onSelect) {
  container.innerHTML = '';
  for (const theme of Object.values(TABLE_THEMES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `theme-btn ${theme.id === selectedTheme ? 'active' : ''}`;
    btn.innerHTML = `
      <span class="theme-swatch" style="background: radial-gradient(circle, ${theme.bgCenter}, ${theme.bgEdge});"></span>
      <span>${theme.name[lang] || theme.name.pt}</span>
    `;
    btn.addEventListener('click', () => onSelect(theme.id));
    container.appendChild(btn);
  }
}

export function renderRulesContent(container, lang) {
  if (lang === 'en') {
    container.innerHTML = `
      <div class="rules-section">
        <h3>Goal of the Game</h3>
        <p>Win <strong>0</strong>, <strong>2</strong>, or <strong>5</strong> tricks in a round to earn the matching scoring token! The first player to collect <strong>3 tokens</strong> (or the player with the most tokens after <strong>5 rounds</strong>) wins!</p>
      </div>
      <div class="rules-section">
        <h3>Setup &amp; Card Counts</h3>
        <ul>
          <li><strong>3 Players:</strong> Cards 1–12 of each suit (36 cards).</li>
          <li><strong>4 Players:</strong> Cards 1–16 of each suit (48 cards).</li>
          <li><strong>5 Players:</strong> Cards 1–20 of each suit (60 cards).</li>
          <li>Every player is dealt 12 cards. Whoever holds <strong>Rock 1</strong> leads the first trick!</li>
        </ul>
      </div>
      <div class="rules-section">
        <h3>Playing a Trick (Dispute)</h3>
        <ul>
          <li>Going clockwise, each player plays 1 card.</li>
          <li>You <strong>must follow the suit</strong> of the lead card if you have it. Only if you have none of that suit may you play any card.</li>
        </ul>
        <div class="rules-triangle">
          <span class="suit-tag rock">✊ Rock (0)</span> <span>beats</span>
          <span class="suit-tag scissors">✌️ Scissors (2)</span> <span>beats</span>
          <span class="suit-tag paper">🖐️ Paper (5)</span> <span>beats</span>
          <span class="suit-tag rock">✊ Rock (0)</span>
        </div>
        <ul>
          <li><strong>1 suit on table:</strong> Highest number wins.</li>
          <li><strong>2 suits on table:</strong> Highest number of the stronger suit wins!</li>
          <li><strong>All 3 suits on table:</strong> <strong>TIE!</strong> Nobody wins, cards are discarded, and the <em>first player to play the 3rd suit</em> leads the next trick.</li>
        </ul>
      </div>
      <div class="rules-section">
        <h3>Advanced Mode (Bids / Palpites)</h3>
        <p>Before playing a card in any trick, you must place 1 card face-up in front of you as your <strong>Bid</strong> (Rock = 0, Scissors = 2, Paper = 5). A round has <strong>11 tricks</strong>, and you only score a token if your final wins match your Bid!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="rules-section">
      <h3>Objetivo do Jogo</h3>
      <p>Vença exatamente <strong>0</strong>, <strong>2</strong> ou <strong>5</strong> disputas em uma rodada para ganhar a ficha de pontuação correspondente! O primeiro jogador a conquistar <strong>3 fichas</strong> (ou quem tiver mais fichas após <strong>5 rodadas</strong>) vence o jogo!</p>
    </div>
    <div class="rules-section">
      <h3>Preparação</h3>
      <ul>
        <li><strong>3 Jogadores:</strong> Cartas 1–12 de cada naipe (36 cartas).</li>
        <li><strong>4 Jogadores:</strong> Cartas 1–16 de cada naipe (48 cartas).</li>
        <li><strong>5 Jogadores:</strong> Cartas 1–20 de cada naipe (60 cartas).</li>
        <li>Todos recebem 12 cartas. Quem estiver com a carta <strong>Pedra 1</strong> inicia a 1ª disputa!</li>
      </ul>
    </div>
    <div class="rules-section">
      <h3>A Disputa</h3>
      <ul>
        <li>Em sentido horário, cada jogador joga 1 carta na mesa.</li>
        <li>Você <strong>deve seguir o naipe</strong> da carta inicial se tiver. Caso não tenha nenhuma carta daquele naipe, pode jogar qualquer carta.</li>
      </ul>
      <div class="rules-triangle">
        <span class="suit-tag rock">✊ Pedra (0)</span> <span>quebra</span>
        <span class="suit-tag scissors">✌️ Tesoura (2)</span> <span>corta</span>
        <span class="suit-tag paper">🖐️ Papel (5)</span> <span>embrulha</span>
        <span class="suit-tag rock">✊ Pedra (0)</span>
      </div>
      <ul>
        <li><strong>Todas do mesmo naipe:</strong> Maior número vence.</li>
        <li><strong>Dois naipes na mesa:</strong> Maior número do naipe mais forte vence!</li>
        <li><strong>Três naipes na mesa:</strong> <strong>EMPATE!</strong> Ninguém vence a disputa, as cartas são descartadas e quem jogou o <em>3º naipe pela primeira vez</em> inicia a próxima!</li>
      </ul>
    </div>
    <div class="rules-section">
      <h3>Modo Avançado (Palpites)</h3>
      <p>Em algum momento da rodada, antes de jogar sua carta na disputa, você deve baixar 1 carta virada para cima como seu <strong>Palpite</strong> (Pedra = 0, Tesoura = 2, Papel = 5). A rodada passa a ter <strong>11 disputas</strong> e você só ganha a ficha se acertar exatamente a quantidade do seu palpite!</p>
    </div>
  `;
}

export function updateHandOverlap(state) {
  const handEl = document.getElementById('human-hand');
  if (!handEl || !state || !state.players || !state.players[0]) return;
  const totalCards = state.players[0].hand.length;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobilePortrait = vw <= 768;
  const isMobileLandscape = !isMobilePortrait && vw <= 960 && vh <= 520;

  let overlapPx;
  if (isMobilePortrait && totalCards > 1) {
    const cardW = Math.min(75, Math.max(57, Math.round(vw * 0.16)));
    const avail = Math.max(180, vw - 22);
    const maxStep = (avail - cardW) / (totalCards - 1);
    overlapPx = Math.min(-10, Math.floor(maxStep - cardW));
  } else if (isMobileLandscape && totalCards > 1) {
    const cardW = 54;
    const avail = Math.max(240, vw - 260);
    const maxStep = (avail - cardW) / (totalCards - 1);
    overlapPx = Math.min(-14, Math.floor(maxStep - cardW));
  } else {
    overlapPx = totalCards >= 11 ? -54 : totalCards >= 9 ? -42 : totalCards >= 7 ? -30 : -16;
  }
  handEl.style.setProperty('--hand-overlap', `${overlapPx}px`);
}

export function renderGameTable(state, uiState, callbacks) {
  const dict = I18N[uiState.lang] || I18N.pt;
  const layout = getSeatLayout(state.playerCount);
  document.getElementById('game-screen').dataset.players = String(state.playerCount);

  // Top HUD
  document.getElementById('hud-round-pill').textContent = `${dict.round} ${state.roundNumber}/${state.maxRounds}`;
  document.getElementById('hud-dispute-pill').textContent = `${dict.dispute} ${state.disputeNumber}/${state.maxDisputes}`;
  document.getElementById('hud-mode-pill').textContent =
    state.mode === 'advanced' ? dict.modeAdvanced : dict.modeBasic;

  document.getElementById('res-0').textContent = state.tokenReserve[0];
  document.getElementById('res-2').textContent = state.tokenReserve[2];
  document.getElementById('res-5').textContent = state.tokenReserve[5];

  // Opponents
  const oppLayer = document.getElementById('opponents-layer');
  oppLayer.innerHTML = '';

  for (let i = 1; i < state.playerCount; i++) {
    const p = state.players[i];
    const seatMeta = layout[i];
    const isTurn = state.phase === 'playing' && state.turnIndex === i;
    const isLead = state.leadPlayerIndex === i;
    const validScore =
      state.mode === 'basic'
        ? [0, 2, 5].includes(p.wins)
        : p.bidTarget !== null && p.wins === p.bidTarget;

    const seatEl = document.createElement('div');
    seatEl.className = `opp-seat ${seatMeta.seatClass} ${isTurn ? 'active-turn' : ''}`;
    seatEl.dataset.playerIndex = i;

    const tokensHtml = p.tokens
      .map((val) => `<img src="${getTokenImagePath(val)}" class="token-chip" alt="${val}" title="${val}" />`)
      .join('');

    const bidHtml = p.bidCard
      ? `<div class="bid-mini-slot" title="${dict.bidLabel}: ${p.bidTarget}">
           <img src="${getCardImagePath(p.bidCard.suit, p.bidCard.number)}" alt="" />
           <span>${dict.bidLabel}: ${p.bidTarget}</span>
         </div>`
      : '';

    const bubbleHtml =
      uiState.speechBubbles[i] && Date.now() < uiState.speechBubbles[i].until
        ? `<div class="speech-bubble">${uiState.speechBubbles[i].text}</div>`
        : '';

    seatEl.innerHTML = `
      <div class="opp-card-box">
        ${bubbleHtml}
        <div class="seat-avatar-wrap">
          <div class="avatar-frame">${renderAvatarSvg(p.avatar)}</div>
          <div class="card-count-badge">${p.hand.length}</div>
        </div>
        <div class="opp-info">
          <div class="opp-name-line">
            <span class="seat-name">${p.name}</span>
          </div>
          <div class="opp-stats-line">
            <div class="wins-pill ${validScore ? 'valid-score' : ''}" title="${dict.winsShort}">
              <span class="trophy-icon">🏆</span><span>${p.wins}</span>
            </div>
            <div class="tokens-row">${tokensHtml}</div>
          </div>
          ${bidHtml}
        </div>
      </div>
    `;

    oppLayer.appendChild(seatEl);
  }

  // Center Status & Played Cards
  const statusBanner = document.getElementById('center-status-banner');
  const statusText = document.getElementById('center-status-text');
  const evalNow = evaluateTable(state.tableCards);

  statusBanner.classList.remove('tie-warning');
  if (state.tableCards.length === 0) {
    const leadName = state.players[state.leadPlayerIndex].name;
    statusText.textContent = `${leadName}: ${dict.waitingLead}`;
  } else if (evalNow.isTie) {
    statusBanner.classList.add('tie-warning');
    statusText.textContent = `⚠️ ${dict.tieWarning}`;
  } else {
    const leadSuit = state.tableCards[0].card.suit;
    const leadInfo = SUIT_INFO[leadSuit];
    statusText.textContent = `${dict.suitLeadLabel}: ${leadInfo.emoji} ${leadInfo.name[uiState.lang]}`;
  }

  const stage = document.getElementById('played-cards-stage');
  const expectedKeys = state.tableCards.map((play) => `${play.playerIndex}:${play.card.id}`);
  const existingSlots = new Map();
  stage.querySelectorAll('.table-play-slot').forEach((el) => {
    if (expectedKeys.includes(el.dataset.playKey)) {
      existingSlots.set(el.dataset.playKey, el);
    } else {
      el.remove();
    }
  });

  for (const play of state.tableCards) {
    const p = state.players[play.playerIndex];
    const pos = layout[play.playerIndex].stagePos;
    const isCurrentWinner =
      !evalNow.isTie && evalNow.winningPlay && evalNow.winningPlay.playerIndex === play.playerIndex;
    const playKey = `${play.playerIndex}:${play.card.id}`;
    const cardSrc = getCardImagePath(play.card.suit, play.card.number);
    ensureCachedImage(cardSrc);

    let slot = existingSlots.get(playKey);
    if (!slot) {
      slot = document.createElement('div');
      slot.dataset.playKey = playKey;
      slot.className = `table-play-slot ${isCurrentWinner ? 'is-winning' : ''}`;
      slot.style.left = `${pos.x}%`;
      slot.style.top = `${pos.y}%`;
      slot.innerHTML = `
        <div class="table-card-frame" style="transform: rotate(${pos.rot}deg)">
          <img src="${cardSrc}" alt="${play.card.id}" decoding="sync" loading="eager" />
        </div>
        <div class="table-play-owner">${p.name}</div>
      `;
      stage.appendChild(slot);
    } else {
      slot.classList.toggle('is-winning', Boolean(isCurrentWinner));
      slot.style.left = `${pos.x}%`;
      slot.style.top = `${pos.y}%`;
      const ownerEl = slot.querySelector('.table-play-owner');
      if (ownerEl) ownerEl.textContent = p.name;
    }

    const frame = slot.querySelector('.table-card-frame');
    const existingCrown = frame.querySelector('.table-play-crown');
    if (isCurrentWinner && !existingCrown) {
      const crown = document.createElement('div');
      crown.className = 'table-play-crown';
      crown.textContent = '👑';
      frame.prepend(crown);
    } else if (!isCurrentWinner && existingCrown) {
      existingCrown.remove();
    }
  }

  // Human Dock
  const human = state.players[0];
  const isHumanTurn = state.phase === 'playing' && state.turnIndex === 0;
  const humanPanel = document.getElementById('human-profile-panel');
  humanPanel.classList.toggle('active-turn', isHumanTurn);

  document.getElementById('human-avatar-frame').innerHTML = renderAvatarSvg(human.avatar);
  document.getElementById('human-name-label').textContent = human.name;
  document.getElementById('human-card-count').textContent = human.hand.length;

  const humanWinsPill = document.getElementById('human-wins-pill');
  const humanValidScore =
    state.mode === 'basic'
      ? [0, 2, 5].includes(human.wins)
      : human.bidTarget !== null && human.wins === human.bidTarget;
  humanWinsPill.classList.toggle('valid-score', humanValidScore);
  document.getElementById('human-wins-count').textContent = human.wins;

  document.getElementById('human-tokens-row').innerHTML = human.tokens
    .map((val) => `<img src="${getTokenImagePath(val)}" class="token-chip" alt="${val}" />`)
    .join('');

  const humanBidSlot = document.getElementById('human-bid-slot');
  if (human.bidCard) {
    humanBidSlot.classList.remove('hidden');
    humanBidSlot.innerHTML = `
      <img src="${getCardImagePath(human.bidCard.suit, human.bidCard.number)}" alt="" />
      <span>${dict.bidLabel}: ${human.bidTarget}</span>
    `;
  } else {
    humanBidSlot.classList.add('hidden');
    humanBidSlot.innerHTML = '';
  }

  // Controls
  const sortLabel = document.getElementById('sort-hand-label');
  sortLabel.textContent = uiState.sortBy === 'suit' ? dict.sortNum : dict.sortSuit;

  const placeBidBtn = document.getElementById('place-bid-btn');
  const placeBidLabel = document.getElementById('place-bid-label');
  const canBid = canPlaceBidNow(state, 0);
  const mandatoryBid = isHumanTurn && mustPlaceBidNow(state, 0);

  if (mandatoryBid) {
    uiState.bidSelectionMode = true;
  }

  if (state.mode === 'advanced' && !human.bidCard) {
    placeBidBtn.classList.remove('hidden');
    placeBidBtn.disabled = !canBid;
    placeBidBtn.classList.toggle('active-bid-mode', uiState.bidSelectionMode);
    placeBidLabel.textContent = uiState.bidSelectionMode && !mandatoryBid ? dict.bidCancelBtn : dict.bidPlaceBtn;
  } else {
    placeBidBtn.classList.add('hidden');
    uiState.bidSelectionMode = false;
  }

  // Turn Instruction Bar
  const instBar = document.getElementById('turn-instruction-bar');
  const instText = document.getElementById('turn-instruction-text');
  instBar.classList.remove('your-turn', 'bid-mode');

  if (uiState.bidSelectionMode && isHumanTurn) {
    instBar.classList.add('bid-mode');
    instText.textContent = mandatoryBid ? dict.bidMandatoryHint : dict.bidSelectHint;
  } else if (isHumanTurn) {
    instBar.classList.add('your-turn');
    if (state.tableCards.length === 0) {
      instText.textContent = `${dict.yourTurn} ${dict.leadPlay}`;
    } else {
      const leadSuit = state.tableCards[0].card.suit;
      const hasLead = human.hand.some((c) => c.suit === leadSuit);
      const info = SUIT_INFO[leadSuit];
      instText.textContent = hasLead
        ? `${dict.yourTurn} ${dict.mustFollowSuit}: ${info.emoji} ${info.name[uiState.lang]}!`
        : `${dict.yourTurn} ${dict.anyCard}!`;
    }
  } else if (state.phase === 'playing') {
    const activePlayer = state.players[state.turnIndex];
    instText.textContent = `${activePlayer.name}...`;
  } else {
    instText.textContent = '...';
  }
  instBar.style.visibility = state.phase === 'playing' ? 'visible' : 'hidden';

  // Human Hand
  const handEl = document.getElementById('human-hand');
  handEl.innerHTML = '';
  const legalIds = new Set(isHumanTurn ? getLegalCards(state, 0).map((c) => c.id) : []);
  const totalCards = human.hand.length;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobilePortrait = vw <= 768;
  const isMobileLandscape = !isMobilePortrait && vw <= 960 && vh <= 520;
  updateHandOverlap(state);

  human.hand.forEach((card, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';

    const rawSpread = totalCards > 1 ? (idx - (totalCards - 1) / 2) * 1.4 : 0;
    const rawArchY = totalCards > 1 ? Math.abs(idx - (totalCards - 1) / 2) * 1.6 : 0;
    const spread = isMobilePortrait ? rawSpread * 0.45 : isMobileLandscape ? rawSpread * 0.5 : rawSpread;
    const archY = isMobilePortrait ? rawArchY * 0.4 : isMobileLandscape ? rawArchY * 0.4 : rawArchY;

    if (uiState.bidSelectionMode && isHumanTurn) {
      btn.className = 'hand-card-btn bid-selectable';
      const bidVal = SUIT_INFO[card.suit].value;
      btn.innerHTML = `
        <span class="bid-tag-overlay">${dict.bidLabel}: ${bidVal}</span>
        <img src="${getCardImagePath(card.suit, card.number)}" alt="${card.id}" decoding="sync" loading="eager" />
      `;
      btn.addEventListener('click', () => callbacks.onBidCardClick(card.id));
    } else {
      const isLegal = isHumanTurn && legalIds.has(card.id);
      btn.className = `hand-card-btn ${isHumanTurn ? (isLegal ? 'legal' : 'illegal') : ''}`;
      btn.innerHTML = `<img src="${getCardImagePath(card.suit, card.number)}" alt="${card.id}" decoding="sync" loading="eager" />`;
      if (isLegal) {
        btn.addEventListener('click', () => callbacks.onPlayCardClick(card.id));
      }
    }

    btn.style.transform = `translateY(${archY}px) rotate(${spread}deg)`;
    btn.style.zIndex = idx + 1;
    handEl.appendChild(btn);
  });
}

export function showComicCallout(title, sub, isTie = false) {
  const el = document.getElementById('comic-callout');
  document.getElementById('callout-title').textContent = title;
  document.getElementById('callout-sub').textContent = sub;
  el.classList.toggle('is-tie', isTie);
  el.classList.remove('hidden');
}

export function hideComicCallout() {
  document.getElementById('comic-callout').classList.add('hidden');
}

export function renderRoundSummaryModal(summary, state, lang) {
  const dict = I18N[lang] || I18N.pt;
  document.getElementById('round-modal-title').textContent = `${dict.roundEndTitle} ${summary.roundNumber}/${state.maxRounds}`;

  const rowsHtml = summary.playerResults
    .map((r) => {
      const earnedHtml =
        r.earnedToken !== null
          ? `<div class="summary-token-earned">
               <img src="${getTokenImagePath(r.earnedToken)}" alt="${r.earnedToken}" />
               <span>+${dict.gotToken} ${r.earnedToken}</span>
             </div>`
          : `<div class="summary-token-earned"><span>${dict.noToken}</span></div>`;

      const bidInfo =
        summary.mode === 'advanced'
          ? ` • ${dict.bidLabel}: ${r.bidTarget} (${r.bidMatched ? `✅ ${dict.bidMatched}` : `❌ ${dict.bidMissed}`})`
          : '';

      const allTokens = r.tokens
        .map((t) => `<img src="${getTokenImagePath(t)}" class="token-chip" alt="${t}" />`)
        .join('');

      return `
        <div class="summary-row ${r.earnedToken !== null ? 'winner-row' : ''}">
          <div class="summary-av">${renderAvatarSvg(r.avatar)}</div>
          <div class="summary-meta">
            <strong>${r.name}</strong>
            <span>${dict.winsShort}: ${r.wins}${bidInfo}</span>
          </div>
          ${earnedHtml}
          <div class="tokens-row" title="${dict.tokensShort}: ${r.tokens.length}/3">${allTokens || '—'}</div>
        </div>
      `;
    })
    .join('');

  document.getElementById('round-modal-body').innerHTML = `<div class="summary-list">${rowsHtml}</div>`;
  document.getElementById('round-next-btn').textContent = dict.nextRoundBtn;
}

export function renderGameOverModal(gameResult, lang) {
  const dict = I18N[lang] || I18N.pt;
  document.getElementById('gameover-modal-title').textContent = dict.gameOverTitle;

  const winnersNames = gameResult.tiedWinners.map((w) => w.name).join(' & ');
  const headline = gameResult.isTie
    ? `🤝 ${dict.tiedVictory} (${winnersNames})`
    : `👑 ${winnersNames} — ${dict.champion}`;

  const rowsHtml = gameResult.standings
    .map((s, idx) => {
      const isWinner = gameResult.tiedWinners.some((w) => w.playerIndex === s.playerIndex);
      const tokensHtml = s.tokens
        .map((t) => `<img src="${getTokenImagePath(t)}" class="token-chip" alt="${t}" />`)
        .join('');

      return `
        <div class="summary-row ${isWinner ? 'winner-row' : ''}">
          <div class="summary-av">${renderAvatarSvg(s.avatar)}</div>
          <div class="summary-meta">
            <strong>#${idx + 1} ${s.name}</strong>
            <span>${dict.tokensShort}: ${s.tokenCount} • ${dict.pointsTotal}: ${s.pointsSum} • ${dict.winsShort}: ${s.totalWinsAllRounds}</span>
          </div>
          <div class="tokens-row">${tokensHtml || '—'}</div>
          <div>${isWinner ? '🏆' : ''}</div>
        </div>
      `;
    })
    .join('');

  document.getElementById('gameover-modal-body').innerHTML = `
    <div class="podium-banner"><h3>${headline}</h3></div>
    <div class="summary-list">${rowsHtml}</div>
  `;

  const jokenpoBtn = document.getElementById('tie-jokenpo-btn');
  const humanInTie = gameResult.tiedWinners.some((w) => w.isHuman);
  jokenpoBtn.classList.toggle('hidden', !(gameResult.isTie && humanInTie));
  jokenpoBtn.textContent = dict.tieJokenpoBtn;
  document.getElementById('play-again-btn').textContent = dict.playAgainBtn;
  document.getElementById('back-menu-btn').textContent = dict.backMenuBtn;
}

export function renderPauseScoreboard(state, lang) {
  const box = document.getElementById('pause-scoreboard');
  if (!box || !state) return;
  const dict = I18N[lang] || I18N.pt;
  const modeText = state.mode === 'advanced' ? dict.modeAdvanced : dict.modeBasic;

  const rowsHtml = state.players
    .map((p) => {
      const pts = p.tokens.reduce((acc, v) => acc + v, 0);
      const bidInfo =
        state.mode === 'advanced'
          ? ` • ${dict.bidLabel}: ${p.bidTarget !== null ? p.bidTarget : '?'}`
          : '';
      return `
        <div class="pause-score-row">
          <span class="pause-score-name">${p.name}</span>
          <span class="pause-score-meta">🏆 ${p.wins}${bidInfo}</span>
          <strong class="pause-score-pts">${pts} pts</strong>
        </div>
      `;
    })
    .join('');

  box.innerHTML = `
    <div class="pause-score-header">
      <span>${dict.pauseScoreTitle}</span>
      <span>${dict.round} ${state.roundNumber}/${state.maxRounds} • ${dict.dispute} ${state.disputeNumber}/${state.maxDisputes} • ${modeText}</span>
    </div>
    <div class="pause-score-list">${rowsHtml}</div>
  `;
}

export function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  canvas.classList.remove('hidden');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');

  const colors = ['#6a93d2', '#df4f52', '#7cb94c', '#fde047', '#ffffff'];
  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    w: 8 + Math.random() * 8,
    h: 6 + Math.random() * 8,
    vx: (Math.random() - 0.5) * 4,
    vy: 3 + Math.random() * 5,
    rot: Math.random() * Math.PI * 2,
    vRot: (Math.random() - 0.5) * 0.2,
    color: colors[Math.floor(Math.random() * colors.length)]
  }));

  let frames = 0;
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vRot;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    frames += 1;
    if (frames < 180) {
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.classList.add('hidden');
    }
  }
  requestAnimationFrame(tick);
}
