import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack, useSegments } from "expo-router";

import { loadRegistrationState } from "./lib/game";
import { supabase } from "./lib/supabase";

export default function RootLayout() {
  const segments = useSegments();
  const isAdminRoute = segments[0] === "admin";
  const [ready, setReady] = useState(false);
  const [initialRouteName, setInitialRouteName] = useState<"(tabs)" | "register" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isAdminRoute) {
      return;
    }

    let isMounted = true;

    async function resolveInitialRoute() {
      const registrationState = await loadRegistrationState();

      if (isMounted) {
        setInitialRouteName(
          registrationState.requiresRegistration ? "register" : "(tabs)"
        );
      }
    }

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
        await resolveInitialRoute();
        if (isMounted) {
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void (async () => {
        try {
          await resolveInitialRoute();
        } catch (error) {
          if (isMounted) {
            setErrorMsg(
              error instanceof Error ? error.message : "Unable to determine registration status."
            );
          }
        }
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
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
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.message}>Connecting to game service...</Text>
      </View>
    );
  }

  if (errorMsg || !initialRouteName) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {errorMsg ?? "Unable to load the app."}
        </Text>
      </View>
    );
  }

  return (
    <Stack initialRouteName={initialRouteName}>
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
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
    color: "#ff6b6b",
    fontSize: 16,
    textAlign: "center",
  },
});
