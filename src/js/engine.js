import { SUITS, SUIT_INFO, AVATARS } from './constants.js';

export const MAX_NUMBER_BY_PLAYERS = {
  3: 12,
  4: 16,
  5: 20
};

export const VALID_WIN_COUNTS = [0, 2, 5];

export function createDeck(playerCount) {
  const maxNumber = MAX_NUMBER_BY_PLAYERS[playerCount];
  if (!maxNumber) {
    throw new Error(`Invalid playerCount: ${playerCount}. Must be 3, 4, or 5.`);
  }
  const deck = [];
  for (const suit of SUITS) {
    for (let number = 1; number <= maxNumber; number++) {
      deck.push({
        id: `${suit}-${number}`,
        suit,
        number
      });
    }
  }
  return deck;
}

export function shuffle(array, rng = Math.random) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sortHand(hand, sortBy = 'suit') {
  const suitOrder = { rock: 0, scissors: 1, paper: 2 };
  return [...hand].sort((a, b) => {
    if (sortBy === 'number') {
      if (a.number !== b.number) return a.number - b.number;
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return a.number - b.number;
  });
}

export function createMatchState(config = {}) {
  const playerCount = [3, 4, 5].includes(config.playerCount) ? config.playerCount : 4;
  const mode = config.mode === 'advanced' ? 'advanced' : 'basic';
  const difficulty = ['casual', 'tactical', 'master'].includes(config.difficulty)
    ? config.difficulty
    : 'tactical';
  const humanName = (config.humanName || 'Você').trim().slice(0, 14) || 'Você';
  const humanAvatar = config.humanAvatar || 'defy';

  const aiPool = AVATARS.filter((a) => a.id !== humanAvatar);
  const players = [
    {
      index: 0,
      name: humanName,
      avatar: humanAvatar,
      isHuman: true,
      hand: [],
      wins: 0,
      tokens: [],
      bidCard: null,
      bidTarget: null,
      totalWinsAllRounds: 0,
      tiesCaused: 0
    }
  ];

  for (let i = 1; i < playerCount; i++) {
    const av = aiPool[(i - 1) % aiPool.length];
    players.push({
      index: i,
      name: av.name,
      avatar: av.id,
      isHuman: false,
      hand: [],
      wins: 0,
      tokens: [],
      bidCard: null,
      bidTarget: null,
      totalWinsAllRounds: 0,
      tiesCaused: 0
    });
  }

  const state = {
    playerCount,
    mode,
    difficulty,
    roundNumber: 0,
    maxRounds: 5,
    disputeNumber: 0,
    maxDisputes: mode === 'advanced' ? 11 : 12,
    players,
    tokenReserve: { 0: 10, 2: 10, 5: 10 },
    leadPlayerIndex: 0,
    turnIndex: 0,
    tableCards: [],
    playedHistory: [],
    knownVoids: Array.from({ length: playerCount }, () => new Set()),
    phase: 'setup', // 'playing' | 'resolving' | 'roundEnd' | 'gameOver'
    lastDisputeResult: null,
    lastRoundSummary: null,
    gameResult: null
  };

  startNextRound(state);
  return state;
}

export function startNextRound(state, rng = Math.random) {
  state.roundNumber += 1;
  state.disputeNumber = 1;
  state.maxDisputes = state.mode === 'advanced' ? 11 : 12;
  state.tableCards = [];
  state.playedHistory = [];
  state.knownVoids = Array.from({ length: state.playerCount }, () => new Set());
  state.lastDisputeResult = null;
  state.lastRoundSummary = null;

  const deck = shuffle(createDeck(state.playerCount), rng);
  let rockOneHolder = 0;

  for (let p = 0; p < state.playerCount; p++) {
    const hand = deck.slice(p * 12, (p + 1) * 12);
    state.players[p].hand = state.players[p].isHuman ? sortHand(hand, 'suit') : hand;
    state.players[p].wins = 0;
    state.players[p].bidCard = null;
    state.players[p].bidTarget = null;
    if (hand.some((c) => c.suit === 'rock' && c.number === 1)) {
      rockOneHolder = p;
    }
  }

  state.leadPlayerIndex = rockOneHolder;
  state.turnIndex = rockOneHolder;
  state.phase = 'playing';
  return state;
}

export function mustPlaceBidNow(state, playerIndex) {
  if (state.mode !== 'advanced') return false;
  const player = state.players[playerIndex];
  return !player.bidCard && player.hand.length <= 2;
}

export function canPlaceBidNow(state, playerIndex) {
  if (state.mode !== 'advanced') return false;
  if (state.phase !== 'playing') return false;
  if (state.turnIndex !== playerIndex) return false;
  const player = state.players[playerIndex];
  if (player.bidCard) return false;
  return player.hand.length >= 2;
}

export function getLegalCards(state, playerIndex) {
  const player = state.players[playerIndex];
  if (!player) return [];
  if (state.tableCards.length === 0) {
    return [...player.hand];
  }
  const leadSuit = state.tableCards[0].card.suit;
  const matching = player.hand.filter((c) => c.suit === leadSuit);
  return matching.length > 0 ? matching : [...player.hand];
}

export function placeBid(state, playerIndex, cardId) {
  if (!canPlaceBidNow(state, playerIndex)) {
    throw new Error(`Player ${playerIndex} cannot place a bid right now.`);
  }
  const player = state.players[playerIndex];
  const idx = player.hand.findIndex((c) => c.id === cardId);
  if (idx === -1) {
    throw new Error(`Card ${cardId} not in player ${playerIndex} hand.`);
  }
  const [card] = player.hand.splice(idx, 1);
  player.bidCard = card;
  player.bidTarget = SUIT_INFO[card.suit].value;
  return card;
}

export function playCard(state, playerIndex, cardId) {
  if (state.phase !== 'playing') {
    throw new Error('Cannot play card when phase is not playing.');
  }
  if (state.turnIndex !== playerIndex) {
    throw new Error(`Not player ${playerIndex}'s turn (turn is ${state.turnIndex}).`);
  }
  if (mustPlaceBidNow(state, playerIndex)) {
    throw new Error(`Player ${playerIndex} must place their Palpite before playing.`);
  }

  const legal = getLegalCards(state, playerIndex);
  if (!legal.some((c) => c.id === cardId)) {
    throw new Error(`Card ${cardId} is not a legal play.`);
  }

  const player = state.players[playerIndex];
  const idx = player.hand.findIndex((c) => c.id === cardId);
  const [card] = player.hand.splice(idx, 1);

  if (state.tableCards.length > 0) {
    const leadSuit = state.tableCards[0].card.suit;
    if (card.suit !== leadSuit) {
      state.knownVoids[playerIndex].add(leadSuit);
    }
  }

  state.tableCards.push({ playerIndex, card });
  state.playedHistory.push({ playerIndex, card, dispute: state.disputeNumber });

  if (state.tableCards.length < state.playerCount) {
    state.turnIndex = (state.turnIndex + 1) % state.playerCount;
  } else {
    state.phase = 'resolving';
  }

  return card;
}

export function evaluateTable(tableCards) {
  if (!tableCards || tableCards.length === 0) {
    return {
      suitsPresent: [],
      winningPlay: null,
      reason: null,
      isTie: false,
      nextLead: null
    };
  }

  const suitsOrder = [];
  for (const play of tableCards) {
    if (!suitsOrder.includes(play.card.suit)) {
      suitsOrder.push(play.card.suit);
    }
  }

  if (suitsOrder.length === 1) {
    let best = tableCards[0];
    for (const play of tableCards) {
      if (play.card.number > best.card.number) {
        best = play;
      }
    }
    return {
      suitsPresent: suitsOrder,
      winningPlay: best,
      winningSuit: best.card.suit,
      losingSuit: null,
      reason: 'same_suit',
      isTie: false,
      nextLead: best.playerIndex
    };
  }

  if (suitsOrder.length === 2) {
    const [s1, s2] = suitsOrder;
    const strongSuit = SUIT_INFO[s1].beats === s2 ? s1 : s2;
    const weakSuit = strongSuit === s1 ? s2 : s1;
    const candidates = tableCards.filter((p) => p.card.suit === strongSuit);
    let best = candidates[0];
    for (const play of candidates) {
      if (play.card.number > best.card.number) {
        best = play;
      }
    }
    return {
      suitsPresent: suitsOrder,
      winningPlay: best,
      winningSuit: strongSuit,
      losingSuit: weakSuit,
      reason: 'suit_beat',
      isTie: false,
      nextLead: best.playerIndex
    };
  }

  // All 3 suits present -> tie! First player to play the 3rd distinct suit leads next.
  const thirdSuit = suitsOrder[2];
  const tieCauserPlay = tableCards.find((p) => p.card.suit === thirdSuit);
  return {
    suitsPresent: suitsOrder,
    winningPlay: null,
    winningSuit: null,
    losingSuit: null,
    reason: 'three_suits_tie',
    isTie: true,
    tieCauserPlay,
    nextLead: tieCauserPlay.playerIndex
  };
}

export function resolveDispute(state) {
  if (state.tableCards.length !== state.playerCount) {
    throw new Error('Cannot resolve dispute until all players have played.');
  }
  const evaluation = evaluateTable(state.tableCards);

  if (!evaluation.isTie) {
    const winnerIdx = evaluation.winningPlay.playerIndex;
    state.players[winnerIdx].wins += 1;
    state.players[winnerIdx].totalWinsAllRounds += 1;
  } else {
    state.players[evaluation.nextLead].tiesCaused += 1;
  }

  state.lastDisputeResult = {
    disputeNumber: state.disputeNumber,
    tableCards: [...state.tableCards],
    ...evaluation
  };

  state.leadPlayerIndex = evaluation.nextLead;
  state.turnIndex = evaluation.nextLead;
  state.tableCards = [];

  if (state.disputeNumber >= state.maxDisputes) {
    finishRound(state);
  } else {
    state.disputeNumber += 1;
    state.phase = 'playing';
  }

  return state.lastDisputeResult;
}

export function finishRound(state) {
  const playerResults = [];

  for (const player of state.players) {
    let earnedToken = null;
    let bidMatched = null;

    if (state.mode === 'basic') {
      if (VALID_WIN_COUNTS.includes(player.wins) && state.tokenReserve[player.wins] > 0) {
        earnedToken = player.wins;
        state.tokenReserve[earnedToken] -= 1;
        player.tokens.push(earnedToken);
      }
    } else {
      bidMatched = player.bidTarget === player.wins;
      if (bidMatched && state.tokenReserve[player.wins] > 0) {
        earnedToken = player.wins;
        state.tokenReserve[earnedToken] -= 1;
        player.tokens.push(earnedToken);
      }
    }

    playerResults.push({
      playerIndex: player.index,
      name: player.name,
      avatar: player.avatar,
      wins: player.wins,
      bidCard: player.bidCard,
      bidTarget: player.bidTarget,
      bidMatched,
      earnedToken,
      tokens: [...player.tokens],
      pointsSum: player.tokens.reduce((acc, v) => acc + v, 0)
    });
  }

  state.lastRoundSummary = {
    roundNumber: state.roundNumber,
    mode: state.mode,
    playerResults
  };

  const someoneHasThree = state.players.some((p) => p.tokens.length >= 3);
  const reachedMaxRounds = state.roundNumber >= state.maxRounds;

  if (someoneHasThree || reachedMaxRounds) {
    state.phase = 'gameOver';
    state.gameResult = computeGameResult(state);
  } else {
    state.phase = 'roundEnd';
  }

  return state.lastRoundSummary;
}

export function computeGameResult(state) {
  const standings = state.players.map((p) => ({
    playerIndex: p.index,
    name: p.name,
    avatar: p.avatar,
    isHuman: p.isHuman,
    tokenCount: p.tokens.length,
    tokens: [...p.tokens],
    pointsSum: p.tokens.reduce((a, b) => a + b, 0),
    totalWinsAllRounds: p.totalWinsAllRounds,
    tiesCaused: p.tiesCaused
  }));

  standings.sort((a, b) => {
    if (b.tokenCount !== a.tokenCount) return b.tokenCount - a.tokenCount;
    return b.pointsSum - a.pointsSum;
  });

  const top = standings[0];
  const tiedWinners = standings.filter(
    (s) => s.tokenCount === top.tokenCount && s.pointsSum === top.pointsSum
  );

  return {
    standings,
    tiedWinners,
    isTie: tiedWinners.length > 1,
    reason: state.players.some((p) => p.tokens.length >= 3) ? 'three_tokens' : 'five_rounds'
  };
}
