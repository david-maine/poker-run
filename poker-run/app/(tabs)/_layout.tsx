import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, Tabs } from "expo-router";

import { useEventSession } from "../../src/lib/eventSession";
import { getLocalHand, subscribeToLocalHandChanges } from "../../src/lib/localHand";

export default function TabLayout() {
  const { registrationState } = useEventSession();
  const headerTitle = registrationState.event?.name ?? "Poker Run";
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [leaderboardUnlocked, setLeaderboardUnlocked] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let unsubscribeFromLocalHandChanges: (() => void) | null = null;

    async function checkRegistration() {
      try {
        if (!isMounted) {
          return;
        }

        if (registrationState.requiresRegistration) {
          router.replace("/register");
          return;
        }

        if (!registrationState.event) {
          setLeaderboardUnlocked(false);
          setReady(true);
          return;
        }

        const eventId = registrationState.event.id;
        const localHand = await getLocalHand(eventId);

        if (!isMounted) {
          return;
        }

        setLeaderboardUnlocked(localHand.status === "submitted");

        unsubscribeFromLocalHandChanges = subscribeToLocalHandChanges((nextHand) => {
          if (nextHand.eventId === eventId) {
            setLeaderboardUnlocked(nextHand.status === "submitted");
          }
        });

        setReady(true);
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to confirm registration status."
          );
          setReady(true);
        }
      }
    }

    void checkRegistration();

    return () => {
      isMounted = false;
      unsubscribeFromLocalHandChanges?.();
    };
  }, [registrationState.event, registrationState.requiresRegistration]);

  if (!ready) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.message}>Checking registration...</Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{errorMessage}</Text>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerTitle,
        tabBarIcon: () => null,
        tabBarIconStyle: styles.hiddenTabIcon,
        tabBarItemStyle: styles.tabItem,
        tabBarLabelPosition: "beside-icon",
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarLabel: "Home" }} />
      <Tabs.Screen
        name="leaderboard"
        options={{ tabBarLabel: "Leaderboard", href: leaderboardUnlocked ? undefined : null }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#25292e",
    paddingHorizontal: 24,
  },
  message: {
    marginTop: 12,
    color: "#ffffff",
    fontSize: 16,
    textAlign: "center",
  },
  errorText: {
    color: "#ff8a80",
    fontSize: 16,
    textAlign: "center",
  },
  hiddenTabIcon: {
    display: "none",
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
});
