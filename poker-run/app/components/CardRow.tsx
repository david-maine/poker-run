import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Props = {
  visitOrder: string[];
  waypointCards: Record<string, string | null>;
  total: number;
};

export default function CardRow({ visitOrder, waypointCards, total }: Props) {
  return (
    <View style={styles.cardsRow}>
      {visitOrder.map((wpId) => {
        const card = waypointCards[wpId];
        return (
          <View key={wpId} style={styles.cardSlot}>
            {card ? <Text style={styles.cardText}>{card}</Text> : <View style={styles.cardBack} />}
          </View>
        );
      })}
      {Array.from({ length: Math.max(0, total - visitOrder.length) }).map((_, i) => (
        <View key={`empty-${i}`} style={styles.cardSlot}>
          <View style={styles.cardBack} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cardsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    paddingHorizontal: 12,
  },
  cardSlot: {
    width: 56,
    height: 80,
    borderRadius: 8,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  cardBack: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#444",
  },
  cardText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});
