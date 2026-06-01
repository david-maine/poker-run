import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import LoadingScreen from "../../src/components/LoadingScreen";
import PlayingCard from "../../src/components/PlayingCard";
import { useEventSession } from "../../src/lib/eventSession";
import {
  GameEvent,
  LeaderboardEntry,
  loadLeaderboardSnapshotForEvent,
} from "../../src/lib/game";
import { getLocalHand, subscribeToLocalHandChanges } from "../../src/lib/localHand";

export default function LeaderboardScreen() {
  const { registrationState } = useEventSession();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [leaderboardUnlocked, setLeaderboardUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isRequestInFlightRef = useRef(false);
  const leaderboardUnlockedRef = useRef(false);
  const eventRef = useRef<GameEvent | null>(registrationState.event);
  const event = registrationState.event;

  function setLeaderboardAccess(unlocked: boolean) {
    leaderboardUnlockedRef.current = unlocked;
    setLeaderboardUnlocked(unlocked);
  }

  useEffect(() => {
    eventRef.current = event;
  }, [event]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribeFromLocalHandChanges: (() => void) | null = null;

    async function checkLeaderboardAccess() {
      setCheckingAccess(true);
      setErrorMessage(null);

      try {
        if (!isMounted) {
          return;
        }

        if (!event) {
          setLeaderboardAccess(true);
          setCheckingAccess(false);
          void refreshLeaderboard(true);
          return;
        }

        const eventId = event.id;
        const localHand = await getLocalHand(eventId);

        if (!isMounted) {
          return;
        }

        const isSubmitted = localHand.status === "submitted";
        setLeaderboardAccess(isSubmitted);
        setCheckingAccess(false);

        if (isSubmitted) {
          void refreshLeaderboard(true);
        } else {
          setLoading(false);
        }

        unsubscribeFromLocalHandChanges = subscribeToLocalHandChanges((nextHand) => {
          if (nextHand.eventId !== eventId) {
            return;
          }

          const isNextSubmitted = nextHand.status === "submitted";
          setLeaderboardAccess(isNextSubmitted);

          if (isNextSubmitted) {
            void refreshLeaderboard(true);
          } else {
            setEntries([]);
            setCurrentUserId(null);
          }
        });
      } catch (error) {
        if (isMounted) {
          setErrorMessage(getErrorMessage(error, "Unable to confirm your hand status."));
          setCheckingAccess(false);
          setLoading(false);
        }
      }
    }

    void checkLeaderboardAccess();

    return () => {
      isMounted = false;
      unsubscribeFromLocalHandChanges?.();
    };
  }, [event]);

  useFocusEffect(
    useCallback(() => {
      if (!leaderboardUnlockedRef.current) {
        return;
      }

      void refreshLeaderboard(false);

      const intervalId = setInterval(() => {
        void refreshLeaderboard(false);
      }, 10000);

      return () => {
        clearInterval(intervalId);
      };
    }, [])
  );

  async function refreshLeaderboard(showSpinner: boolean) {
    if (!leaderboardUnlockedRef.current) {
      return;
    }

    if (isRequestInFlightRef.current) {
      return;
    }

    isRequestInFlightRef.current = true;

    if (showSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setErrorMessage(null);

    try {
      const snapshot = await loadLeaderboardSnapshotForEvent(eventRef.current);
      setEntries(snapshot.entries);
      setCurrentUserId(snapshot.currentUserId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to load the leaderboard."));
    } finally {
      isRequestInFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }

  const visibleEntries = [...testLeaderboardEntries, ...entries];
  const visibleCurrentUserId = currentUserId ?? testLeaderboardCurrentUserId;

  if (checkingAccess) {
    return <LoadingScreen accessibilityLabel="Checking hand status" />;
  }

  if (!leaderboardUnlocked) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Submit your hand to unlock the leaderboard</Text>
        <Text style={styles.emptyText}>
          The leaderboard will appear after your hand has been accepted.
        </Text>
        <Pressable
          onPress={() => {
            router.replace("/");
          }}
          style={styles.lockedButton}
        >
          <Text style={styles.refreshButtonText}>Return Home</Text>
        </Pressable>
      </View>
    );
  }

  if (loading && visibleEntries.length === 0) {
    return <LoadingScreen accessibilityLabel="Loading leaderboard" />;
  }

  if (!event && visibleEntries.length === 0) {
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
      <ImageBackground
        source={require("../../assets/images/leaderboard-background.png")}
        style={styles.background}
        resizeMode="stretch"
      >
        <View style={styles.boardContent}>
          <Text style={styles.rankingLabel}>RANKING</Text>
          <Image
            source={require("../../assets/images/leaderboard-line.png")}
            style={styles.headerLine}
            resizeMode="stretch"
          />

          {visibleEntries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No hands submitted yet</Text>
              <Text style={styles.emptyText}>
                Complete a hand and submit it to create the first leaderboard entry.
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.listContent}
              style={styles.list}
              showsVerticalScrollIndicator={false}
            >
              {visibleEntries.map((entry) => {
                const isCurrentUser = visibleCurrentUserId === entry.userId;
                const timeLabel = entry.finishedAt
                  ? formatDateTime(entry.finishedAt)
                  : formatDateTime(entry.startedAt);

                return (
                  <View key={entry.runId} style={styles.entry}>
                    <View style={styles.entryHeader}>
                      <Text style={styles.rankText}>{entry.leaderboardRank}.</Text>
                      <Text numberOfLines={1} style={styles.playerName}>
                        {entry.playerLabel}
                        {isCurrentUser ? " (You)" : ""}
                      </Text>
                    </View>

                    <View style={styles.cardsRow}>
                      {Array.from({ length: 5 }).map((_, index) => {
                        const card = entry.bestHandCards[index];

                        return (
                          <View key={`${entry.runId}-${index}`} style={styles.cardSlot}>
                            {card ? (
                              <PlayingCard
                                card={card}
                                compact
                                style={styles.leaderboardCard}
                              />
                            ) : (
                              <View style={styles.cardBack} />
                            )}
                          </View>
                        );
                      })}
                    </View>

                    <View style={styles.metaRow}>
                      <Text numberOfLines={1} style={styles.handNameText}>
                        {entry.bestHandName}
                      </Text>
                      <Text style={styles.metaText}>{timeLabel}</Text>
                    </View>

                    <Image
                      source={require("../../assets/images/leaderboard-line.png")}
                      style={styles.entryLine}
                      resizeMode="stretch"
                    />
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.footer}>
            {errorMessage ? <Text style={styles.errorTextSmall}>{errorMessage}</Text> : null}
            <Pressable
              onPress={() => {
                void refreshLeaderboard(false);
              }}
              style={styles.refreshButton}
            >
              <Text style={styles.refreshButtonText}>
                {refreshing ? "REFRESHING..." : "REFRESH"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ImageBackground>
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

const testLeaderboardCurrentUserId = "test-user-04";

const testLeaderboardEntries: LeaderboardEntry[] = [
  // {
  //   eventId: "test-event",
  //   eventSlug: "preview",
  //   eventName: "Preview Event",
  //   runId: "test-run-01",
  //   userId: "test-user-01",
  //   playerLabel: "River Queen",
  //   runStatus: "completed",
  //   startedAt: "2026-05-18T08:02:00+10:00",
  //   finishedAt: "2026-05-18T09:14:00+10:00",
  //   visitCount: 5,
  //   bestHandName: "Straight Flush",
  //   bestHandRank: 8,
  //   bestHandCards: ["9H", "10H", "JH", "QH", "KH"],
  //   tiebreaker: [13],
  //   leaderboardRank: 1,
  // },
  // {
  //   eventId: "test-event",
  //   eventSlug: "preview",
  //   eventName: "Preview Event",
  //   runId: "test-run-02",
  //   userId: "test-user-02",
  //   playerLabel: "The Long Way Home",
  //   runStatus: "completed",
  //   startedAt: "2026-05-18T08:07:00+10:00",
  //   finishedAt: "2026-05-18T09:19:00+10:00",
  //   visitCount: 5,
  //   bestHandName: "Four of a Kind",
  //   bestHandRank: 7,
  //   bestHandCards: ["AS", "AH", "AD", "AC", "7D"],
  //   tiebreaker: [14, 7],
  //   leaderboardRank: 2,
  // },
  // {
  //   eventId: "test-event",
  //   eventSlug: "preview",
  //   eventName: "Preview Event",
  //   runId: "test-run-03",
  //   userId: "test-user-03",
  //   playerLabel: "Saltwater Social Club",
  //   runStatus: "completed",
  //   startedAt: "2026-05-18T08:11:00+10:00",
  //   finishedAt: "2026-05-18T09:27:00+10:00",
  //   visitCount: 5,
  //   bestHandName: "Full House",
  //   bestHandRank: 6,
  //   bestHandCards: ["KS", "KH", "KC", "9S", "9C"],
  //   tiebreaker: [13, 9],
  //   leaderboardRank: 3,
  // },
  // {
  //   eventId: "test-event",
  //   eventSlug: "preview",
  //   eventName: "Preview Event",
  //   runId: "test-run-04",
  //   userId: "test-user-04",
  //   playerLabel: "Current Crew With A Very Long Name",
  //   runStatus: "completed",
  //   startedAt: "2026-05-18T08:15:00+10:00",
  //   finishedAt: "2026-05-18T09:32:00+10:00",
  //   visitCount: 5,
  //   bestHandName: "Flush",
  //   bestHandRank: 5,
  //   bestHandCards: ["2D", "6D", "8D", "JD", "QD"],
  //   tiebreaker: [12, 11, 8, 6, 2],
  //   leaderboardRank: 4,
  // },
  // {
  //   eventId: "test-event",
  //   eventSlug: "preview",
  //   eventName: "Preview Event",
  //   runId: "test-run-05",
  //   userId: "test-user-05",
  //   playerLabel: "Waypoint Wanderers",
  //   runStatus: "completed",
  //   startedAt: "2026-05-18T08:19:00+10:00",
  //   finishedAt: "2026-05-18T09:41:00+10:00",
  //   visitCount: 5,
  //   bestHandName: "Straight",
  //   bestHandRank: 4,
  //   bestHandCards: ["5S", "6C", "7H", "8S", "9D"],
  //   tiebreaker: [9],
  //   leaderboardRank: 5,
  // },
  // {
  //   eventId: "test-event",
  //   eventSlug: "preview",
  //   eventName: "Preview Event",
  //   runId: "test-run-06",
  //   userId: "test-user-06",
  //   playerLabel: "Portside Pair",
  //   runStatus: "completed",
  //   startedAt: "2026-05-18T08:23:00+10:00",
  //   finishedAt: "2026-05-18T09:48:00+10:00",
  //   visitCount: 5,
  //   bestHandName: "Three of a Kind",
  //   bestHandRank: 3,
  //   bestHandCards: ["QS", "QH", "QC", "4C", "2S"],
  //   tiebreaker: [12, 4, 2],
  //   leaderboardRank: 6,
  // },
  // {
  //   eventId: "test-event",
  //   eventSlug: "preview",
  //   eventName: "Preview Event",
  //   runId: "test-run-07",
  //   userId: "test-user-07",
  //   playerLabel: "Marina Mates",
  //   runStatus: "completed",
  //   startedAt: "2026-05-18T08:28:00+10:00",
  //   finishedAt: "2026-05-18T09:52:00+10:00",
  //   visitCount: 5,
  //   bestHandName: "Two Pair",
  //   bestHandRank: 2,
  //   bestHandCards: ["JS", "JH", "8C", "8H", "3D"],
  //   tiebreaker: [11, 8, 3],
  //   leaderboardRank: 7,
  // },
  // {
  //   eventId: "test-event",
  //   eventSlug: "preview",
  //   eventName: "Preview Event",
  //   runId: "test-run-08",
  //   userId: "test-user-08",
  //   playerLabel: "Buoy Bandits",
  //   runStatus: "completed",
  //   startedAt: "2026-05-18T08:31:00+10:00",
  //   finishedAt: "2026-05-18T09:58:00+10:00",
  //   visitCount: 5,
  //   bestHandName: "One Pair",
  //   bestHandRank: 1,
  //   bestHandCards: ["10S", "10C", "AH", "7C", "5D"],
  //   tiebreaker: [10, 14, 7, 5],
  //   leaderboardRank: 8,
  // },
  // {
  //   eventId: "test-event",
  //   eventSlug: "preview",
  //   eventName: "Preview Event",
  //   runId: "test-run-09",
  //   userId: "test-user-09",
  //   playerLabel: "Anchor Management",
  //   runStatus: "completed",
  //   startedAt: "2026-05-18T08:37:00+10:00",
  //   finishedAt: "2026-05-18T10:04:00+10:00",
  //   visitCount: 5,
  //   bestHandName: "High Card",
  //   bestHandRank: 0,
  //   bestHandCards: ["AS", "JD", "9C", "6H", "2C"],
  //   tiebreaker: [14, 11, 9, 6, 2],
  //   leaderboardRank: 9,
  // },
  // {
  //   eventId: "test-event",
  //   eventSlug: "preview",
  //   eventName: "Preview Event",
  //   runId: "test-run-10",
  //   userId: "test-user-10",
  //   playerLabel: "Late Starter",
  //   runStatus: "active",
  //   startedAt: "2026-05-18T10:10:00+10:00",
  //   finishedAt: null,
  //   visitCount: 3,
  //   bestHandName: "No Scored Hand Yet",
  //   bestHandRank: 0,
  //   bestHandCards: [],
  //   tiebreaker: [],
  //   leaderboardRank: 10,
  // },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1d223e",
  },
  centered: {
    flex: 1,
    backgroundColor: "#1d223e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  background: {
    flex: 1,
    paddingHorizontal: 28,
  },
  boardContent: {
    bottom: 34,
    left: 34,
    position: "absolute",
    right: 34,
    top: "20%",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 8,
  },
  rankingLabel: {
    color: "#1d223e",
    fontFamily: "Stoke-Regular",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 17,
    marginBottom: 2,
  },
  headerLine: {
    height: 8,
    marginBottom: 8,
    width: "100%",
  },
  entry: {
    marginBottom: 6,
  },
  entryHeader: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 3,
  },
  rankText: {
    color: "#1d223e",
    fontFamily: "Stoke-Regular",
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 38,
    marginRight: 8,
    minWidth: 24,
    textAlign: "center",
  },
  playerName: {
    color: "#1d223e",
    flex: 1,
    fontFamily: "Stoke-Regular",
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 34,
  },
  cardsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
    marginTop: 3,
    paddingHorizontal: 32,
    width: "100%",
  },
  cardSlot: {
    width: 45,
    height: 64,
  },
  leaderboardCard: {
    borderColor: "#1d223e",
    borderRadius: 4,
    borderWidth: 1,
    height: "100%",
    width: "100%",
  },
  cardBack: {
    backgroundColor: "#625d52",
    borderColor: "#262412",
    borderRadius: 5,
    borderWidth: 2,
    height: "100%",
    width: "100%",
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 32,
    paddingRight: 32,
    paddingVertical: 3,
  },
  handNameText: {
    color: "#1d223e",
    flex: 1,
    fontFamily: "Stoke-Regular",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  metaText: {
    color: "#1d223e",
    fontFamily: "Stoke-Regular",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginLeft: 10,
  },
  entryLine: {
    height: 8,
    marginTop: 6,
    width: "100%",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: "#1d223e",
    fontFamily: "Stoke-Regular",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    color: "#1d223e",
    fontFamily: "Stoke-Regular",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  errorText: {
    color: "#ff8a80",
    fontSize: 16,
    textAlign: "center",
  },
  errorTextSmall: {
    color: "#8f1d1d",
    fontFamily: "Stoke-Regular",
    fontSize: 13,
    marginBottom: 8,
    textAlign: "center",
  },
  footer: {
    alignItems: "center",
    paddingTop: 8,
  },
  refreshButton: {
    backgroundColor: "#1d223e",
    borderColor: "#d9d2bb",
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  lockedButton: {
    backgroundColor: "#1d223e",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  refreshButtonText: {
    color: "#f2ead4",
    fontFamily: "Stoke-Regular",
    fontWeight: "700",
  },
});
