import React from "react";
import { View, Text, StyleSheet } from "react-native";

import PlayingCard from "./PlayingCard";

type Props = {
  visitOrder: string[];
  waypointCards: Record<string, string | null>;
  pendingWaypointIds?: Record<string, boolean>;
  total: number;
};

export default function CardRow({ visitOrder, waypointCards, pendingWaypointIds = {}, total }: Props) {
  return (
    <View style={styles.cardsRow}>
      {visitOrder.map((wpId) => {
        const card = waypointCards[wpId];
        const isPending = pendingWaypointIds[wpId];
        return (
          <View key={wpId} style={styles.cardSlot}>
            {card ? (
              <PlayingCard card={card} />
            ) : isPending ? (
              <View style={styles.pendingCard}>
                <Text style={styles.pendingText}>Sync</Text>
              </View>
            ) : (
              <View style={styles.cardBack} />
            )}
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
  pendingCard: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#35515e",
    borderColor: "#8ecae6",
    borderStyle: "dashed",
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  pendingText: {
    color: "#e7f7ff",
    fontSize: 13,
    fontWeight: "700",
  },
});
