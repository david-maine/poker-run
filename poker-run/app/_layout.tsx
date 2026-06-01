import { Stack, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import LoadingScreen from "../src/components/LoadingScreen";
import { EventSessionProvider } from "../src/lib/eventSession";
import type { RegistrationState } from "../src/lib/game";
import { loadRegistrationState } from "../src/lib/game";
import { supabase } from "../src/lib/supabase";

export default function RootLayout() {
  const segments = useSegments();
  const isAdminRoute = segments[0] === "admin";
  const [ready, setReady] = useState(false);
  const [initialRouteName, setInitialRouteName] = useState<"(tabs)" | "register" | null>(null);
  const [registrationState, setRegistrationState] = useState<RegistrationState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isAdminRoute) {
      return;
    }

    let isMounted = true;

    async function bootstrapAuth() {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        if (isMounted) {
          setErrorMsg(sessionError.message);
          setReady(true);
        }
        return;
      }

      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();

        if (error) {
          if (isMounted) {
            setErrorMsg(error.message);
            setReady(true);
          }
          return;
        }
      }

      try {
        const nextRegistrationState = await loadRegistrationState();
        if (isMounted) {
          setRegistrationState(nextRegistrationState);
          setInitialRouteName(
            nextRegistrationState.requiresRegistration ? "register" : "(tabs)"
          );
          setReady(true);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMsg(
            error instanceof Error ? error.message : "Unable to determine registration status."
          );
          setReady(true);
        }
      }
    }

    bootstrapAuth();

    return () => {
      isMounted = false;
    };
  }, [isAdminRoute]);

  if (isAdminRoute) {
    return (
      <Stack>
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack>
    );
  }

  if (!ready) {
    return <LoadingScreen accessibilityLabel="Loading app" />;
  }

  if (errorMsg || !initialRouteName || !registrationState) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {errorMsg ?? "Unable to load the app."}
        </Text>
      </View>
    );
  }

  return (
    <EventSessionProvider initialRegistrationState={registrationState}>
      <Stack initialRouteName={initialRouteName}>
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </EventSessionProvider>
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
    color: "#ff6b6b",
    fontSize: 16,
    textAlign: "center",
  },
});
