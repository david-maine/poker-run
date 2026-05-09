import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, Tabs } from "expo-router";

import { loadRegistrationState } from "../lib/game";

export default function TabLayout() {
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkRegistration() {
      try {
        const registrationState = await loadRegistrationState();

        if (!isMounted) {
          return;
        }

        if (registrationState.requiresRegistration) {
          router.replace("/register");
          return;
        }

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
    };
  }, []);

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
    <Tabs>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="leaderboard" options={{ title: "Leaderboard" }} />
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
});
