export const SUITS = ['rock', 'scissors', 'paper'];

export const SUIT_INFO = {
  rock: {
    id: 'rock',
    value: 0,
    color: '#6A93D2',
    darkColor: '#3B64A6',
    glow: 'rgba(106, 147, 210, 0.65)',
    beats: 'scissors',
    losesTo: 'paper',
    emoji: '✊',
    name: { pt: 'Pedra', en: 'Rock' }
  },
  scissors: {
    id: 'scissors',
    value: 2,
    color: '#DF4F52',
    darkColor: '#A92A2D',
    glow: 'rgba(223, 79, 82, 0.65)',
    beats: 'paper',
    losesTo: 'rock',
    emoji: '✌️',
    name: { pt: 'Tesoura', en: 'Scissors' }
  },
  paper: {
    id: 'paper',
    value: 5,
    color: '#7CB94C',
    darkColor: '#4F8426',
    glow: 'rgba(124, 185, 76, 0.65)',
    beats: 'rock',
    losesTo: 'scissors',
    emoji: '🖐️',
    name: { pt: 'Papel', en: 'Paper' }
  }
};

export const CARD_BACK_SRC = 'zero_two_five_cartas/jokenpo datamerged.png';

export function getCardImagePath(suit, number) {
  let fileIndex;
  if (suit === 'rock') {
    fileIndex = number + 1; // 2..21
  } else if (suit === 'paper') {
    fileIndex = number + 21; // 22..41
  } else {
    fileIndex = number + 41; // 42..61
  }
  return `zero_two_five_cartas/jokenpo datamerged${fileIndex}.png`;
}

export function getTokenImagePath(value, faceDown = false) {
  const suffix = faceDown ? 'verso' : 'token';
  return `assets/tokens/${value}_${suffix}.png`;
}

export function getFirstPlayerBadgePath(lang = 'pt') {
  return lang === 'en'
    ? 'assets/tokens/1st_player_en.png'
    : 'assets/tokens/1st_player_pt.png';
}

export const TABLE_THEMES = {
  crimson: {
    id: 'crimson',
    name: { pt: 'Arena Carmesim (Estilo UNO)', en: 'Crimson Arena (UNO Style)' },
    bgCenter: '#df1d24',
    bgMid: '#9d0c13',
    bgEdge: '#3e0408',
    accent: '#ffb703'
  },
  cobalt: {
    id: 'cobalt',
    name: { pt: 'Quadrinhos Azul', en: 'Comic Cobalt' },
    bgCenter: '#2563eb',
    bgMid: '#1e3a8a',
    bgEdge: '#0a1438',
    accent: '#fde047'
  },
  emerald: {
    id: 'emerald',
    name: { pt: 'Mesa Esmeralda', en: 'Emerald Table' },
    bgCenter: '#16a34a',
    bgMid: '#14532d',
    bgEdge: '#052212',
    accent: '#facc15'
  },
  midnight: {
    id: 'midnight',
    name: { pt: 'Noite Neon', en: 'Midnight Neon' },
    bgCenter: '#312e81',
    bgMid: '#1e1b4b',
    bgEdge: '#09071a',
    accent: '#38bdf8'
  }
};

export const AVATARS = [
  {
    id: 'defy',
    name: 'Defy',
    accent: '#f59e0b',
    bg: '#fef3c7',
    hair: '#1f2937',
    skin: '#8d5524',
    shirt: '#2563eb',
    style: 'mohawk',
    glasses: false
  },
  {
    id: 'vex',
    name: 'Vex',
    accent: '#ef4444',
    bg: '#fee2e2',
    hair: '#c2410c',
    skin: '#fde2c4',
    shirt: '#dc2626',
    style: 'long',
    glasses: false
  },
  {
    id: 'peril',
    name: 'Peril',
    accent: '#10b981',
    bg: '#d1fae5',
    hair: '#78350f',
    skin: '#f5cfa0',
    shirt: '#16a34a',
    style: 'spiky',
    glasses: false
  },
  {
    id: 'angst',
    name: 'Angst',
    accent: '#3b82f6',
    bg: '#dbeafe',
    hair: '#111827',
    skin: '#f6d5b0',
    shirt: '#4f46e5',
    style: 'slick',
    glasses: true
  },
  {
    id: 'kira',
    name: 'Kira',
    accent: '#ec4899',
    bg: '#fce7f3',
    hair: '#be185d',
    skin: '#f3c6a5',
    shirt: '#db2777',
    style: 'bob',
    glasses: false
  },
  {
    id: 'teo',
    name: 'Téo',
    accent: '#8b5cf6',
    bg: '#ede9fe',
    hair: '#0f172a',
    skin: '#c68642',
    shirt: '#7c3aed',
    style: 'curly',
    glasses: true
  }
];

export function renderAvatarSvg(avatarId) {
  const av = AVATARS.find((a) => a.id === avatarId) || AVATARS[0];
  let hairBack = '';
  let hairFront = '';

  if (av.style === 'long') {
    hairBack = `<path d="M18 42 Q14 82 22 96 L78 96 Q86 82 82 42 Q80 14 50 14 Q20 14 18 42Z" fill="${av.hair}" stroke="#111" stroke-width="3"/>`;
    hairFront = `<path d="M26 36 Q42 18 74 34 Q60 22 45 26 Q34 28 26 36Z" fill="${av.hair}" stroke="#111" stroke-width="2.5"/>`;
  } else if (av.style === 'mohawk') {
    hairFront = `<path d="M40 30 L36 10 L50 18 L64 8 L60 30 Z" fill="${av.hair}" stroke="#111" stroke-width="3" stroke-linejoin="round"/>`;
  } else if (av.style === 'spiky') {
    hairFront = `<path d="M24 42 L20 22 L36 28 L46 10 L58 26 L74 16 L76 42 Q64 28 50 30 Q36 28 24 42Z" fill="${av.hair}" stroke="#111" stroke-width="3" stroke-linejoin="round"/>`;
  } else if (av.style === 'slick') {
    hairFront = `<path d="M25 40 Q24 16 52 16 Q78 16 75 40 Q65 26 48 28 Q34 28 25 40Z" fill="${av.hair}" stroke="#111" stroke-width="3"/>`;
  } else if (av.style === 'bob') {
    hairBack = `<path d="M20 42 Q18 76 28 84 L72 84 Q82 76 80 42 Q76 14 50 14 Q24 14 20 42Z" fill="${av.hair}" stroke="#111" stroke-width="3"/>`;
    hairFront = `<path d="M26 38 Q50 22 74 38 L70 26 Q50 16 30 26 Z" fill="${av.hair}" stroke="#111" stroke-width="2.5"/>`;
  } else {
    hairBack = `<circle cx="30" cy="30" r="14" fill="${av.hair}" stroke="#111" stroke-width="3"/><circle cx="70" cy="30" r="14" fill="${av.hair}" stroke="#111" stroke-width="3"/><circle cx="50" cy="22" r="16" fill="${av.hair}" stroke="#111" stroke-width="3"/>`;
    hairFront = `<path d="M28 38 Q40 24 50 32 Q60 24 72 38" fill="none" stroke="#111" stroke-width="3"/>`;
  }

  const glassesSvg = av.glasses
    ? `<rect x="31" y="45" width="16" height="11" rx="3" fill="rgba(255,255,255,0.25)" stroke="#111" stroke-width="2.5"/>
       <rect x="53" y="45" width="16" height="11" rx="3" fill="rgba(255,255,255,0.25)" stroke="#111" stroke-width="2.5"/>
       <line x1="47" y1="50" x2="53" y2="50" stroke="#111" stroke-width="2.5"/>`
    : '';

  return `
  <svg viewBox="0 0 100 100" class="avatar-svg" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="dots-${av.id}" width="8" height="8" patternUnits="userSpaceOnUse">
        <circle cx="4" cy="4" r="1.7" fill="${av.accent}" opacity="0.28"/>
      </pattern>
    </defs>
    <rect width="100" height="100" fill="${av.bg}"/>
    <rect width="100" height="100" fill="url(#dots-${av.id})"/>
    ${hairBack}
    <path d="M24 100 Q26 76 50 76 Q74 76 76 100 Z" fill="${av.shirt}" stroke="#111" stroke-width="3"/>
    <rect x="43" y="66" width="14" height="14" rx="4" fill="${av.skin}" stroke="#111" stroke-width="2.5"/>
    <ellipse cx="50" cy="50" rx="23" ry="25" fill="${av.skin}" stroke="#111" stroke-width="3"/>
    ${hairFront}
    <circle cx="40" cy="50" r="3.4" fill="#111"/>
    <circle cx="60" cy="50" r="3.4" fill="#111"/>
    <circle cx="41" cy="49" r="1.1" fill="#fff"/>
    <circle cx="61" cy="49" r="1.1" fill="#fff"/>
    <path d="M34 42 Q40 39 45 42" fill="none" stroke="#111" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M55 42 Q60 39 66 42" fill="none" stroke="#111" stroke-width="2.6" stroke-linecap="round"/>
    ${glassesSvg}
    <path d="M43 62 Q50 67 57 62" fill="none" stroke="#111" stroke-width="2.8" stroke-linecap="round"/>
  </svg>`;
}

export const I18N = {
  pt: {
    gameCredits: 'Um jogo de Ênyo Saldanha e Eurico Cunha',
    subtitle: 'Pedra, Papel, Tesoura... na medida certa!',
    playNow: 'Jogar Partida',
    rulesBtn: 'Manual & Regras',
    settingsBtn: 'Configurações',
    quitDesktop: 'Sair para Desktop',
    playersLabel: 'Jogadores',
    modeLabel: 'Modo de Jogo',
    modeBasic: 'Básico',
    modeBasicDesc: '12 disputas. Ganhe 0, 2 ou 5 para pontuar!',
    modeAdvanced: 'Avançado',
    modeAdvancedDesc: '11 disputas + Palpite obrigatório na mesa!',
    difficultyLabel: 'Nível da IA',
    diffCasual: 'Casual',
    diffTactical: 'Tático',
    diffMaster: 'Mestre',
    yourName: 'Seu Nome',
    yourAvatar: 'Seu Avatar',
    tableTheme: 'Tema da Mesa',
    languageLabel: 'Idioma',
    round: 'Rodada',
    dispute: 'Disputa',
    reserve: 'Reserva',
    yourTurn: 'Sua Vez!',
    mustFollowSuit: 'Siga o naipe',
    anyCard: 'Qualquer carta',
    leadPlay: 'Você inicia a disputa! Jogue qualquer carta.',
    winsShort: 'Vitórias',
    cardsShort: 'Cartas',
    tokensShort: 'Fichas',
    bidLabel: 'Palpite',
    bidPlaceBtn: 'Colocar Palpite',
    bidCancelBtn: 'Cancelar Palpite',
    bidSelectHint: 'Clique em uma carta da mão para definir seu palpite: Pedra = 0, Tesoura = 2, Papel = 5.',
    bidMandatoryHint: 'Última chance! Você precisa baixar 1 carta de Palpite antes de jogar nesta disputa.',
    bidPlacedCallout: 'PALPITE!',
    suitLeadLabel: 'Naipe da Disputa',
    waitingLead: 'Aguardando carta inicial...',
    tieWarning: '3 NAIPES! EMPATE IMINENTE!',
    sameSuitWin: 'Mesmo naipe — Maior número vence!',
    rockBeatsScissors: 'Pedra quebra Tesoura!',
    scissorsBeatsPaper: 'Tesoura corta Papel!',
    paperBeatsRock: 'Papel embrulha Pedra!',
    threeSuitsTie: '3 Naipes na mesa — Empate!',
    winnerCallout: 'venceu a disputa!',
    tieNextLead: 'causou o empate e inicia a próxima!',
    roundEndTitle: 'Fim da Rodada',
    nextRoundBtn: 'Próxima Rodada',
    seeFinalBtn: 'Ver Resultado Final',
    gameOverTitle: 'Fim de Jogo!',
    champion: 'Campeão!',
    tiedVictory: 'Empate na Liderança!',
    tieJokenpoBtn: 'Decidir no Pedra, Papel, Tesoura!',
    playAgainBtn: 'Jogar Novamente',
    backMenuBtn: 'Menu Principal',
    sortSuit: 'Ordenar por Naipe',
    sortNum: 'Ordenar por Número',
    speedLabel: 'Velocidade',
    speedNormal: 'Normal',
    speedFast: 'Rápida',
    soundLabel: 'Efeitos Sonoros',
    musicLabel: 'Música de Fundo',
    on: 'Ligado',
    off: 'Desligado',
    manualTitle: 'Como Jogar Zero Two Five',
    close: 'Fechar',
    gotToken: 'Ganhou ficha',
    noToken: 'Sem ficha',
    bidMatched: 'Acertou o palpite!',
    bidMissed: 'Errou o palpite',
    pointsTotal: 'Pontos',
    jokenpoDuelTitle: 'Desempate: Pedra, Papel, Tesoura!',
    jokenpoPick: 'Escolha sua mão decisiva:',
    jokenpoDraw: 'Empatou! Jogue de novo!',
    confirmQuit: 'Deseja fechar o Zero Two Five?',
    pauseTitle: 'Menu da Partida',
    resumeBtn: '▶ Continuar Partida',
    restartBtn: '🔄 Reiniciar Partida',
    leaveMatchBtn: '🚪 Sair da Partida',
    pauseScoreTitle: 'Placar Atual'
  },
  en: {
    gameCredits: 'A game by Ênyo Saldanha & Eurico Cunha',
    subtitle: 'Rock, Paper, Scissors... in the exact right dose!',
    playNow: 'Play Match',
    rulesBtn: 'Manual & Rules',
    settingsBtn: 'Settings',
    quitDesktop: 'Exit to Desktop',
    playersLabel: 'Players',
    modeLabel: 'Game Mode',
    modeBasic: 'Basic',
    modeBasicDesc: '12 tricks. Win 0, 2, or 5 to score!',
    modeAdvanced: 'Advanced',
    modeAdvancedDesc: '11 tricks + Mandatory face-up Bid!',
    difficultyLabel: 'AI Difficulty',
    diffCasual: 'Casual',
    diffTactical: 'Tactical',
    diffMaster: 'Master',
    yourName: 'Your Name',
    yourAvatar: 'Your Avatar',
    tableTheme: 'Table Theme',
    languageLabel: 'Language',
    round: 'Round',
    dispute: 'Trick',
    reserve: 'Reserve',
    yourTurn: 'Your Turn!',
    mustFollowSuit: 'Follow suit',
    anyCard: 'Any card',
    leadPlay: 'You lead the trick! Play any card.',
    winsShort: 'Wins',
    cardsShort: 'Cards',
    tokensShort: 'Tokens',
    bidLabel: 'Bid',
    bidPlaceBtn: 'Place Bid',
    bidCancelBtn: 'Cancel Bid',
    bidSelectHint: 'Click a card from your hand to lock your bid: Rock = 0, Scissors = 2, Paper = 5.',
    bidMandatoryHint: 'Last chance! Place 1 Bid card face-up before playing in this trick.',
    bidPlacedCallout: 'BID LOCKED!',
    suitLeadLabel: 'Lead Suit',
    waitingLead: 'Waiting for lead card...',
    tieWarning: '3 SUITS! TIE INCOMING!',
    sameSuitWin: 'Same suit — Highest number wins!',
    rockBeatsScissors: 'Rock crushes Scissors!',
    scissorsBeatsPaper: 'Scissors cuts Paper!',
    paperBeatsRock: 'Paper wraps Rock!',
    threeSuitsTie: '3 Suits on table — Tie!',
    winnerCallout: 'wins the trick!',
    tieNextLead: 'caused the tie and leads next!',
    roundEndTitle: 'End of Round',
    nextRoundBtn: 'Next Round',
    seeFinalBtn: 'See Final Results',
    gameOverTitle: 'Game Over!',
    champion: 'Champion!',
    tiedVictory: 'Shared Lead!',
    tieJokenpoBtn: 'Settle with Rock, Paper, Scissors!',
    playAgainBtn: 'Play Again',
    backMenuBtn: 'Main Menu',
    sortSuit: 'Sort by Suit',
    sortNum: 'Sort by Number',
    speedLabel: 'Animation Speed',
    speedNormal: 'Normal',
    speedFast: 'Fast',
    soundLabel: 'Sound Effects',
    musicLabel: 'Background Music',
    on: 'On',
    off: 'Off',
    manualTitle: 'How to Play Zero Two Five',
    close: 'Close',
    gotToken: 'Earned token',
    noToken: 'No token',
    bidMatched: 'Bid matched!',
    bidMissed: 'Missed bid',
    pointsTotal: 'Points',
    jokenpoDuelTitle: 'Tie-Breaker: Rock, Paper, Scissors!',
    jokenpoPick: 'Pick your decisive hand:',
    jokenpoDraw: 'Draw! Shoot again!',
    confirmQuit: 'Close Zero Two Five?',
    pauseTitle: 'Match Menu',
    resumeBtn: '▶ Resume Match',
    restartBtn: '🔄 Restart Match',
    leaveMatchBtn: '🚪 Leave Match',
    pauseScoreTitle: 'Current Standings'
  }
};
