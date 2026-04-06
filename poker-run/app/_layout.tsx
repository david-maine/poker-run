import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";

import { supabase } from "./lib/supabase";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
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

      if (isMounted) {
        setReady(true);
      }
    }

    bootstrapAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      if (isMounted) {
        setReady(true);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.message}>Connecting to game service...</Text>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Authentication failed: {errorMsg}</Text>
      </View>
    );
  }

  return (
    <Stack>
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
