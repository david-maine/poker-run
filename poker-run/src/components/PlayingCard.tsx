import React from "react";
import {
  Image,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

type Props = {
  card: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

const RANK_NAMES: Record<string, string> = {
  A: "ace",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "10": "ten",
  J: "jack",
  Q: "queen",
  K: "king",
};

const SUIT_NAMES: Record<string, string> = {
  H: "hearts",
  S: "spades",
  D: "diamonds",
  C: "clubs",
};

const CARD_IMAGES: Record<string, ImageSourcePropType> = {
  "ace-of-hearts": require("../../assets/images/cards/ace-of-hearts.png"),
  "two-of-hearts": require("../../assets/images/cards/two-of-hearts.png"),
  "three-of-hearts": require("../../assets/images/cards/three-of-hearts.png"),
  "four-of-hearts": require("../../assets/images/cards/four-of-hearts.png"),
  "five-of-hearts": require("../../assets/images/cards/five-of-hearts.png"),
  "six-of-hearts": require("../../assets/images/cards/six-of-hearts.png"),
  "seven-of-hearts": require("../../assets/images/cards/seven-of-hearts.png"),
  "eight-of-hearts": require("../../assets/images/cards/eight-of-hearts.png"),
  "nine-of-hearts": require("../../assets/images/cards/nine-of-hearts.png"),
  "ten-of-hearts": require("../../assets/images/cards/ten-of-hearts.png"),
  "jack-of-hearts": require("../../assets/images/cards/jack-of-hearts.png"),
  "queen-of-hearts": require("../../assets/images/cards/queen-of-hearts.png"),
  "king-of-hearts": require("../../assets/images/cards/king-of-hearts.png"),
  "ace-of-spades": require("../../assets/images/cards/ace-of-spades.png"),
  "two-of-spades": require("../../assets/images/cards/two-of-spades.png"),
  "three-of-spades": require("../../assets/images/cards/three-of-spades.png"),
  "four-of-spades": require("../../assets/images/cards/four-of-spades.png"),
  "five-of-spades": require("../../assets/images/cards/five-of-spades.png"),
  "six-of-spades": require("../../assets/images/cards/six-of-spades.png"),
  "seven-of-spades": require("../../assets/images/cards/seven-of-spades.png"),
  "eight-of-spades": require("../../assets/images/cards/eight-of-spades.png"),
  "nine-of-spades": require("../../assets/images/cards/nine-of-spades.png"),
  "ten-of-spades": require("../../assets/images/cards/ten-of-spades.png"),
  "jack-of-spades": require("../../assets/images/cards/jack-of-spades.png"),
  "queen-of-spades": require("../../assets/images/cards/queen-of-spades.png"),
  "king-of-spades": require("../../assets/images/cards/king-of-spades.png"),
  "ace-of-diamonds": require("../../assets/images/cards/ace-of-diamonds.png"),
  "two-of-diamonds": require("../../assets/images/cards/two-of-diamonds.png"),
  "three-of-diamonds": require("../../assets/images/cards/three-of-diamonds.png"),
  "four-of-diamonds": require("../../assets/images/cards/four-of-diamonds.png"),
  "five-of-diamonds": require("../../assets/images/cards/five-of-diamonds.png"),
  "six-of-diamonds": require("../../assets/images/cards/six-of-diamonds.png"),
  "seven-of-diamonds": require("../../assets/images/cards/seven-of-diamonds.png"),
  "eight-of-diamonds": require("../../assets/images/cards/eight-of-diamonds.png"),
  "nine-of-diamonds": require("../../assets/images/cards/nine-of-diamonds.png"),
  "ten-of-diamonds": require("../../assets/images/cards/ten-of-diamonds.png"),
  "jack-of-diamonds": require("../../assets/images/cards/jack-of-diamonds.png"),
  "queen-of-diamonds": require("../../assets/images/cards/queen-of-diamonds.png"),
  "king-of-diamonds": require("../../assets/images/cards/king-of-diamonds.png"),
  "ace-of-clubs": require("../../assets/images/cards/ace-of-clubs.png"),
  "two-of-clubs": require("../../assets/images/cards/two-of-clubs.png"),
  "three-of-clubs": require("../../assets/images/cards/three-of-clubs.png"),
  "four-of-clubs": require("../../assets/images/cards/four-of-clubs.png"),
  "five-of-clubs": require("../../assets/images/cards/five-of-clubs.png"),
  "six-of-clubs": require("../../assets/images/cards/six-of-clubs.png"),
  "seven-of-clubs": require("../../assets/images/cards/seven-of-clubs.png"),
  "eight-of-clubs": require("../../assets/images/cards/eight-of-clubs.png"),
  "nine-of-clubs": require("../../assets/images/cards/nine-of-clubs.png"),
  "ten-of-clubs": require("../../assets/images/cards/ten-of-clubs.png"),
  "jack-of-clubs": require("../../assets/images/cards/jack-of-clubs.png"),
  "queen-of-clubs": require("../../assets/images/cards/queen-of-clubs.png"),
  "king-of-clubs": require("../../assets/images/cards/king-of-clubs.png"),
};

export default function PlayingCard({ card, compact = false, style }: Props) {
  const cardImage = getCardImage(card);

  if (!cardImage) {
    return (
      <View style={[styles.card, compact ? styles.compactCard : null, style]}>
        <Text style={styles.fallbackText}>{card}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, compact ? styles.compactCard : null, style]}>
      <Image source={cardImage} style={styles.cardImage} resizeMode="contain" />
    </View>
  );
}

function getCardImage(card: string) {
  const match = card.match(/^(10|[2-9JQKA])([SHDC])$/);
  if (!match) {
    return null;
  }

  const rank = RANK_NAMES[match[1]];
  const suit = SUIT_NAMES[match[2]];

  return CARD_IMAGES[`${rank}-of-${suit}`] ?? null;
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    borderRadius: 8,
    elevation: 3,
    height: "100%",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    width: "100%",
  },
  compactCard: {
    height: 60,
    width: 42,
  },
  cardImage: {
    height: "100%",
    width: "100%",
  },
  fallbackText: {
    color: "#1d223e",
    fontSize: 12,
    fontWeight: "700",
  },
});
