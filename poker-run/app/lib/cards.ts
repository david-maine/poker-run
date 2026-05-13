const SUITS = ["S", "H", "D", "C"];
const RANKS = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];

export const DECK = RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}`));

type ParsedCard = {
  card: string;
  rank: number;
  suit: string;
};

export type HandScore = {
  name: string;
  rank: number;
  tiebreaker: number[];
  cards: string[];
};

export function drawCard(excludedCards: string[]) {
  const excluded = new Set(excludedCards);
  const availableCards = DECK.filter((card) => !excluded.has(card));

  if (availableCards.length === 0) {
    throw new Error("No cards remain in the deck.");
  }

  return availableCards[Math.floor(Math.random() * availableCards.length)];
}

export function isValidCard(card: string) {
  return /^(10|[2-9JQKA])[SHDC]$/.test(card);
}

export function evaluateBestHand(cards: string[]): HandScore {
  if (cards.length === 0) {
    return {
      name: "Unranked",
      rank: 0,
      tiebreaker: [],
      cards: [],
    };
  }

  if (cards.length < 5) {
    return evaluatePartialHand(cards);
  }

  const combinations = chooseFive(cards);
  let best: HandScore | null = null;

  for (const combination of combinations) {
    const score = evaluateFiveCardHand(combination);

    if (!best || compareScores(score, best) > 0) {
      best = score;
    }
  }

  return best!;
}

function evaluatePartialHand(cards: string[]): HandScore {
  const parsed = cards.map(parseCard).sort((left, right) => right.rank - left.rank);
  const rankGroups = getRankGroups(parsed);
  const counts = rankGroups.map((group) => group.length).sort((left, right) => right - left);

  if (counts[0] === 4) {
    const quad = rankGroups.find((group) => group.length === 4)!;
    const kicker = rankGroups.find((group) => group.length === 1)?.[0];
    return {
      name: "Four of a Kind",
      rank: 8,
      tiebreaker: [quad[0].rank, kicker?.rank ?? 0],
      cards: sortCards(parsed).map((card) => card.card),
    };
  }

  if (counts[0] === 3) {
    const trips = rankGroups.find((group) => group.length === 3)!;
    const kickers = rankGroups
      .filter((group) => group.length === 1)
      .flat()
      .sort((left, right) => right.rank - left.rank)
      .map((card) => card.rank);

    return {
      name: "Three of a Kind",
      rank: 4,
      tiebreaker: [trips[0].rank, ...kickers],
      cards: sortCards(parsed).map((card) => card.card),
    };
  }

  const pairs = rankGroups
    .filter((group) => group.length === 2)
    .sort((left, right) => right[0].rank - left[0].rank);

  if (pairs.length >= 2) {
    const kicker = rankGroups.find((group) => group.length === 1)?.[0];
    return {
      name: "Two Pair",
      rank: 3,
      tiebreaker: [pairs[0][0].rank, pairs[1][0].rank, kicker?.rank ?? 0],
      cards: sortCards(parsed).map((card) => card.card),
    };
  }

  if (pairs.length === 1) {
    const kickers = rankGroups
      .filter((group) => group.length === 1)
      .flat()
      .sort((left, right) => right.rank - left.rank)
      .map((card) => card.rank);

    return {
      name: "Pair",
      rank: 2,
      tiebreaker: [pairs[0][0].rank, ...kickers],
      cards: sortCards(parsed).map((card) => card.card),
    };
  }

  return {
    name: "High Card",
    rank: 1,
    tiebreaker: parsed.map((card) => card.rank),
    cards: sortCards(parsed).map((card) => card.card),
  };
}

function evaluateFiveCardHand(cards: string[]): HandScore {
  const parsed = cards.map(parseCard);
  const sortedCards = sortCards(parsed);
  const rankGroups = getRankGroups(parsed);
  const isFlush = new Set(parsed.map((card) => card.suit)).size === 1;
  const straightHigh = getStraightHigh(parsed);

  if (isFlush && straightHigh === 14) {
    const royalRanks = new Set(sortedCards.map((card) => card.rank));
    if ([14, 13, 12, 11, 10].every((rank) => royalRanks.has(rank))) {
      return {
        name: "Royal Flush",
        rank: 10,
        tiebreaker: [14],
        cards: sortedCards.map((card) => card.card),
      };
    }
  }

  if (isFlush && straightHigh) {
    return {
      name: "Straight Flush",
      rank: 9,
      tiebreaker: [straightHigh],
      cards: sortStraightCards(parsed, straightHigh).map((card) => card.card),
    };
  }

  const fourGroup = rankGroups.find((group) => group.length === 4);
  if (fourGroup) {
    const kicker = rankGroups.find((group) => group.length === 1)![0];
    return {
      name: "Four of a Kind",
      rank: 8,
      tiebreaker: [fourGroup[0].rank, kicker.rank],
      cards: [...fourGroup, kicker].map((card) => card.card),
    };
  }

  const threeGroup = rankGroups.find((group) => group.length === 3);
  const pairGroup = rankGroups.find((group) => group.length === 2);
  if (threeGroup && pairGroup) {
    return {
      name: "Full House",
      rank: 7,
      tiebreaker: [threeGroup[0].rank, pairGroup[0].rank],
      cards: [...threeGroup, ...pairGroup].map((card) => card.card),
    };
  }

  if (isFlush) {
    return {
      name: "Flush",
      rank: 6,
      tiebreaker: sortedCards.map((card) => card.rank),
      cards: sortedCards.map((card) => card.card),
    };
  }

  if (straightHigh) {
    return {
      name: "Straight",
      rank: 5,
      tiebreaker: [straightHigh],
      cards: sortStraightCards(parsed, straightHigh).map((card) => card.card),
    };
  }

  if (threeGroup) {
    const kickers = rankGroups
      .filter((group) => group.length === 1)
      .flat()
      .sort((left, right) => right.rank - left.rank);

    return {
      name: "Three of a Kind",
      rank: 4,
      tiebreaker: [threeGroup[0].rank, ...kickers.map((card) => card.rank)],
      cards: [...threeGroup, ...kickers].map((card) => card.card),
    };
  }

  const pairGroups = rankGroups
    .filter((group) => group.length === 2)
    .sort((left, right) => right[0].rank - left[0].rank);

  if (pairGroups.length === 2) {
    const kicker = rankGroups.find((group) => group.length === 1)![0];
    return {
      name: "Two Pair",
      rank: 3,
      tiebreaker: [pairGroups[0][0].rank, pairGroups[1][0].rank, kicker.rank],
      cards: [...pairGroups[0], ...pairGroups[1], kicker].map((card) => card.card),
    };
  }

  if (pairGroups.length === 1) {
    const kickers = rankGroups
      .filter((group) => group.length === 1)
      .flat()
      .sort((left, right) => right.rank - left.rank);

    return {
      name: "Pair",
      rank: 2,
      tiebreaker: [pairGroups[0][0].rank, ...kickers.map((card) => card.rank)],
      cards: [...pairGroups[0], ...kickers].map((card) => card.card),
    };
  }

  return {
    name: "High Card",
    rank: 1,
    tiebreaker: sortedCards.map((card) => card.rank),
    cards: sortedCards.map((card) => card.card),
  };
}

function compareScores(left: HandScore, right: HandScore) {
  if (left.rank !== right.rank) {
    return left.rank > right.rank ? 1 : -1;
  }

  const length = Math.max(left.tiebreaker.length, right.tiebreaker.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left.tiebreaker[index] ?? 0;
    const rightValue = right.tiebreaker[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue > rightValue ? 1 : -1;
    }
  }

  return 0;
}

function chooseFive(cards: string[]) {
  const combinations: string[][] = [];

  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            combinations.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          }
        }
      }
    }
  }

  return combinations;
}

function parseCard(card: string): ParsedCard {
  const match = card.match(/^(10|[2-9JQKA])([SHDC])$/);
  if (!match) {
    throw new Error(`Invalid card format: ${card}`);
  }

  return {
    card,
    rank: rankValue(match[1]),
    suit: match[2],
  };
}

function rankValue(rank: string) {
  switch (rank) {
    case "A":
      return 14;
    case "K":
      return 13;
    case "Q":
      return 12;
    case "J":
      return 11;
    default:
      return Number(rank);
  }
}

function getRankGroups(cards: ParsedCard[]) {
  const grouped = new Map<number, ParsedCard[]>();

  for (const card of cards) {
    const existing = grouped.get(card.rank) ?? [];
    existing.push(card);
    grouped.set(card.rank, existing);
  }

  return [...grouped.values()].sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }

    return right[0].rank - left[0].rank;
  });
}

function getStraightHigh(cards: ParsedCard[]) {
  const uniqueRanks = [...new Set(cards.map((card) => card.rank))].sort((left, right) => right - left);

  if (uniqueRanks.length !== 5) {
    return null;
  }

  const regularStraight = uniqueRanks.every((rank, index) =>
    index === 0 ? true : uniqueRanks[index - 1] - rank === 1
  );

  if (regularStraight) {
    return uniqueRanks[0];
  }

  const wheel = [14, 5, 4, 3, 2];
  return wheel.every((rank, index) => uniqueRanks[index] === rank) ? 5 : null;
}

function sortCards(cards: ParsedCard[]) {
  return [...cards].sort((left, right) => {
    if (right.rank !== left.rank) {
      return right.rank - left.rank;
    }

    return right.suit.localeCompare(left.suit);
  });
}

function sortStraightCards(cards: ParsedCard[], straightHigh: number) {
  if (straightHigh === 5) {
    const wheelOrder = new Map([
      [5, 5],
      [4, 4],
      [3, 3],
      [2, 2],
      [14, 1],
    ]);

    return [...cards].sort(
      (left, right) => (wheelOrder.get(right.rank) ?? 0) - (wheelOrder.get(left.rank) ?? 0)
    );
  }

  return sortCards(cards);
}
