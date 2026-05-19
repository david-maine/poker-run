import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

type Props = {
  card: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

const SUIT_SYMBOLS: Record<string, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

export default function PlayingCard({ card, compact = false, style }: Props) {
  const parsed = parseCard(card);
  const isRed = parsed.suit === "H" || parsed.suit === "D";
  const textStyle = isRed ? styles.redText : styles.blackText;

  return (
    <View style={[styles.card, compact ? styles.compactCard : null, style]}>
      <Text style={[styles.rank, compact ? styles.compactRank : null, textStyle]}>
        {parsed.rank}
      </Text>
      <Text style={[styles.suit, compact ? styles.compactSuit : null, textStyle]}>
        {parsed.symbol}
      </Text>
    </View>
  );
}

function parseCard(card: string) {
  const match = card.match(/^(10|[2-9JQKA])([SHDC])$/);

  if (!match) {
    return {
      rank: card,
      suit: "",
      symbol: "",
    };
  }

  return {
    rank: match[1],
    suit: match[2],
    symbol: SUIT_SYMBOLS[match[2]],
  };
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderColor: "#d7d7d7",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  compactCard: {
    width: 42,
    height: 60,
  },
  rank: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
  },
  compactRank: {
    fontSize: 15,
    lineHeight: 18,
  },
  suit: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "800",
    marginTop: 2,
  },
  compactSuit: {
    fontSize: 22,
    lineHeight: 24,
  },
  redText: {
    color: "#c1121f",
  },
  blackText: {
    color: "#111111",
  },
});
