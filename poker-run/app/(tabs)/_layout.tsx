import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, Tabs } from "expo-router";

import LoadingScreen from "../../src/components/LoadingScreen";
import { useEventSession } from "../../src/lib/eventSession";

export default function TabLayout() {
  const { registrationState } = useEventSession();
  const headerTitle = registrationState.event?.name ?? "Poker Run";
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

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
          setReady(true);
          return;
        }

        if (!isMounted) {
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
  }, [registrationState.event, registrationState.requiresRegistration]);

  if (!ready) {
    return <LoadingScreen accessibilityLabel="Checking registration" />;
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
      <Tabs.Screen
        name="index"
        options={{
          headerShown: false,
          tabBarStyle: styles.hiddenTabBar,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          headerShown: false,
          tabBarLabel: "Leaderboard",
          tabBarStyle: styles.hiddenTabBar,
        }}
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
  errorText: {
    color: "#ff8a80",
    fontSize: 16,
    textAlign: "center",
  },
  hiddenTabIcon: {
    display: "none",
  },
  hiddenTabBar: {
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
