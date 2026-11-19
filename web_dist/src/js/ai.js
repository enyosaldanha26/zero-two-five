import { SUITS, SUIT_INFO } from './constants.js';
import {
  MAX_NUMBER_BY_PLAYERS,
  canPlaceBidNow,
  mustPlaceBidNow,
  getLegalCards,
  evaluateTable
} from './engine.js';

function estimateWinStrength(card, maxNumber) {
  return card.number / maxNumber;
}

function chooseTargetForHand(hand, currentWins, disputesLeft, maxNumber) {
  const highCards = hand.filter((c) => c.number >= maxNumber * 0.65).length;
  const midCards = hand.filter((c) => c.number >= maxNumber * 0.4).length;

  const expectedTotal = currentWins + Math.min(disputesLeft, Math.round(highCards * 0.85 + midCards * 0.25));

  const candidates = [0, 2, 5].filter((t) => t >= currentWins && t <= currentWins + disputesLeft);
  if (candidates.length === 0) return currentWins;

  let bestTarget = candidates[0];
  let bestDist = Infinity;
  for (const t of candidates) {
    const dist = Math.abs(t - expectedTotal);
    if (dist < bestDist) {
      bestDist = dist;
      bestTarget = t;
    }
  }
  return bestTarget;
}

function pickBestBidCard(hand, desiredTarget, maxNumber) {
  const targetSuit =
    desiredTarget === 0 ? 'rock' : desiredTarget === 2 ? 'scissors' : 'paper';

  const ofSuit = hand.filter((c) => c.suit === targetSuit);
  if (ofSuit.length > 0) {
    // Throw away a middle/low card of that suit, keep the extremes (1 or maxNumber) if useful
    const sorted = [...ofSuit].sort((a, b) => a.number - b.number);
    return sorted[0];
  }

  // If AI doesn't have the ideal suit, pick closest feasible target among suits it has
  const availableTargets = SUITS.map((s) => ({
    suit: s,
    val: SUIT_INFO[s].value,
    cards: hand.filter((c) => c.suit === s)
  })).filter((g) => g.cards.length > 0);

  availableTargets.sort(
    (a, b) => Math.abs(a.val - desiredTarget) - Math.abs(b.val - desiredTarget)
  );
  const chosenGroup = availableTargets[0];
  return [...chosenGroup.cards].sort((a, b) => a.number - b.number)[0];
}

function willCardCurrentlyWin(tableCards, candidateCard, playerIndex) {
  const simulated = [...tableCards, { playerIndex, card: candidateCard }];
  const res = evaluateTable(simulated);
  return {
    winsNow: !res.isTie && res.winningPlay && res.winningPlay.playerIndex === playerIndex,
    causesTie: res.isTie,
    evaluation: res
  };
}

export function decideAiTurn(state, playerIndex) {
  const player = state.players[playerIndex];
  const maxNumber = MAX_NUMBER_BY_PLAYERS[state.playerCount];
  const disputesLeft = state.maxDisputes - state.disputeNumber + 1;
  const difficulty = state.difficulty || 'tactical';

  let bidCard = null;

  // Decide whether to place Palpite in Advanced Mode
  if (canPlaceBidNow(state, playerIndex)) {
    const mustBid = mustPlaceBidNow(state, playerIndex);
    // In Tactical/Master, AI likes to place its bid around dispute 2-4 (or immediately if forced)
    const shouldBidEarly =
      mustBid ||
      (difficulty === 'casual' && Math.random() < 0.35) ||
      (difficulty !== 'casual' && state.disputeNumber >= 2 && state.disputeNumber <= 4) ||
      (difficulty === 'master' && state.disputeNumber === 1 && Math.random() < 0.45);

    if (shouldBidEarly) {
      const desiredTarget = chooseTargetForHand(player.hand, player.wins, disputesLeft, maxNumber);
      bidCard = pickBestBidCard(player.hand, desiredTarget, maxNumber);
    }
  }

  // Remaining hand after hypothetical bid
  const simulatedHand = bidCard
    ? player.hand.filter((c) => c.id !== bidCard.id)
    : [...player.hand];

  const tempState = {
    ...state,
    players: state.players.map((p, idx) =>
      idx === playerIndex ? { ...p, hand: simulatedHand } : p
    )
  };

  const legalCards = getLegalCards(tempState, playerIndex);

  if (difficulty === 'casual') {
    const randomCard = legalCards[Math.floor(Math.random() * legalCards.length)];
    return { bidCard, playCard: randomCard };
  }

  // Determine target win count
  let targetWins;
  if (state.mode === 'advanced' && (player.bidTarget !== null || bidCard !== null)) {
    targetWins = bidCard ? SUIT_INFO[bidCard.suit].value : player.bidTarget;
  } else {
    targetWins = chooseTargetForHand(simulatedHand, player.wins, disputesLeft, maxNumber);
  }

  const winsNeeded = targetWins - player.wins;
  const wantToWin = winsNeeded > 0;
  const avoidWinning = winsNeeded <= 0;
  const isLastToPlay = state.tableCards.length === state.playerCount - 1;
  const isLeading = state.tableCards.length === 0;

  let bestCard = legalCards[0];
  let bestScore = -Infinity;

  for (const card of legalCards) {
    let score = 0;
    const strength = estimateWinStrength(card, maxNumber);

    if (isLeading) {
      // Leading the trick
      if (wantToWin) {
        // Lead strong cards if we still need wins, or probe if lots of disputes left
        score += strength * 40;
        // Slight bonus for leading a suit where opponents might be void? Wait: if opponents are void, they could trump us!
        // Master AI checks knownVoids!
        if (difficulty === 'master') {
          let dangerVoids = 0;
          for (let i = 0; i < state.playerCount; i++) {
            if (i === playerIndex) continue;
            if (state.knownVoids[i].has(card.suit)) {
              dangerVoids += 1;
            }
          }
          score -= dangerVoids * 18;
        }
      } else {
        // Trying NOT to win (at 0, 2, or 5 already) -> lead lowest card!
        score += (1 - strength) * 55;
      }
    } else {
      const outcome = willCardCurrentlyWin(state.tableCards, card, playerIndex);

      if (outcome.causesTie) {
        // 3rd suit -> guarantees 0 wins this trick AND gives us lead next!
        if (avoidWinning) {
          score += 55 + strength * 10; // Dump high card safely in a tie!
        } else if (difficulty === 'master') {
          // Check if current table winner is a dangerous opponent about to hit 2 or 5
          const currentEval = evaluateTable(state.tableCards);
          const currentWinner = currentEval.winningPlay?.playerIndex;
          if (currentWinner !== undefined) {
            const oppWins = state.players[currentWinner].wins + 1;
            if (oppWins === 2 || oppWins === 5) {
              score += 22; // Sabotage opponent!
            }
          }
          score += 8;
        } else {
          score += 10;
        }
      } else if (outcome.winsNow) {
        if (wantToWin) {
          // Win as cheaply as possible if trailing or last to play!
          score += 65 + (isLastToPlay ? (1 - strength) * 28 : strength * 12);
        } else {
          // Avoid winning! Huge penalty
          score -= 80 + strength * 10;
        }
      } else {
        // Loses right now
        if (avoidWinning) {
          // Great! Dump our highest dangerous card safely!
          score += 60 + strength * 35;
        } else {
          // Can't win right now -> save high cards, dump lowest!
          score += (1 - strength) * 35;
        }
      }
    }

    // Small noise in tactical mode so it feels human
    if (difficulty === 'tactical') {
      score += (Math.random() - 0.5) * 6;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCard = card;
    }
  }

  return { bidCard, playCard: bestCard };
}
