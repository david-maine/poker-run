import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  GameEvent,
  LeaderboardEntry,
  loadLeaderboardSnapshot,
} from "../lib/game";

export default function LeaderboardScreen() {
  const [event, setEvent] = useState<GameEvent | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void refreshLeaderboard(true);
  }, []);

  async function refreshLeaderboard(showSpinner: boolean) {
    if (showSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setErrorMessage(null);

    try {
      const snapshot = await loadLeaderboardSnapshot();
      setEvent(snapshot.event);
      setEntries(snapshot.entries);
      setCurrentUserId(snapshot.currentUserId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to load the leaderboard."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading leaderboard...</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {errorMessage ?? "No active event is available for the leaderboard."}
        </Text>
        <Pressable
          onPress={() => {
            void refreshLeaderboard(false);
          }}
          style={styles.refreshButton}
        >
          <Text style={styles.refreshButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Leaderboard</Text>
        <Text style={styles.subtitle}>{event.name}</Text>
        {errorMessage ? <Text style={styles.errorTextSmall}>{errorMessage}</Text> : null}
        <Pressable
          onPress={() => {
            void refreshLeaderboard(false);
          }}
          style={styles.refreshButton}
        >
          <Text style={styles.refreshButtonText}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </Text>
        </Pressable>
      </View>

      {entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No hands submitted yet</Text>
          <Text style={styles.emptyText}>
            Visit a waypoint to create the first leaderboard entry.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          style={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {entries.map((entry) => {
            const isCurrentUser = currentUserId === entry.userId;

            return (
              <View
                key={entry.runId}
                style={[styles.card, isCurrentUser ? styles.cardCurrentUser : null]}
              >
                <View style={styles.rowTop}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{entry.leaderboardRank}</Text>
                  </View>
                  <View style={styles.playerBlock}>
                    <Text style={styles.playerName}>
                      {entry.playerLabel}
                      {isCurrentUser ? " (You)" : ""}
                    </Text>
                    <Text style={styles.metaText}>
                      {entry.runStatus} | {entry.visitCount} waypoint
                      {entry.visitCount === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.handName}>{entry.bestHandName}</Text>
                <Text style={styles.cardsText}>
                  {entry.bestHandCards.length > 0
                    ? entry.bestHandCards.join(" ")
                    : "No scored cards yet"}
                </Text>

                <Text style={styles.metaText}>
                  {entry.finishedAt
                    ? `Finished ${formatDateTime(entry.finishedAt)}`
                    : `Started ${formatDateTime(entry.startedAt)}`}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#25292e",
  },
  centered: {
    flex: 1,
    backgroundColor: "#25292e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#3f444c",
    backgroundColor: "#2e333b",
  },
  title: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: "#cfd8dc",
    fontSize: 14,
    marginTop: 4,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: "#30363d",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#454b54",
  },
  cardCurrentUser: {
    borderColor: "#81c784",
    backgroundColor: "#33453a",
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  rankBadge: {
    minWidth: 52,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#1f252b",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  rankText: {
    color: "#ffffff",
    fontWeight: "800",
  },
  playerBlock: {
    flex: 1,
  },
  playerName: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  handName: {
    color: "#ffcc80",
    fontSize: 18,
    fontWeight: "800",
  },
  cardsText: {
    color: "#ffffff",
    fontSize: 16,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  metaText: {
    color: "#b0bec5",
    fontSize: 13,
    marginTop: 6,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    color: "#b0bec5",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  loadingText: {
    color: "#b0bec5",
    fontSize: 16,
  },
  errorText: {
    color: "#ff8a80",
    fontSize: 16,
    textAlign: "center",
  },
  errorTextSmall: {
    color: "#ff8a80",
    fontSize: 13,
    marginTop: 6,
  },
  refreshButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#1b5e20",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
