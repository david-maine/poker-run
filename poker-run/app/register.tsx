import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { loadRegistrationState, registerVesselName } from "./lib/game";

export default function RegisterScreen() {
  const [eventName, setEventName] = useState<string | null>(null);
  const [vesselName, setVesselName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const registrationState = await loadRegistrationState();

      if (!registrationState.event) {
        router.replace("/(tabs)");
        return;
      }

      if (registrationState.isRegistered) {
        router.replace("/(tabs)");
        return;
      }

      setEventName(registrationState.event.name);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to load registration."));
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await registerVesselName(vesselName);
      router.replace("/(tabs)");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to register your vessel."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.message}>Preparing registration...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Before You Start</Text>
        <Text style={styles.title}>Register Your Vessel</Text>
        <Text style={styles.subtitle}>
          {eventName
            ? `Enter the vessel name you want shown for ${eventName}.`
            : "Enter the vessel name you want shown on the leaderboard."}
        </Text>

        <Text style={styles.label}>Vessel Name</Text>
        <TextInput
          autoCapitalize="words"
          autoCorrect={false}
          editable={!submitting}
          maxLength={40}
          onChangeText={setVesselName}
          placeholder="Sea Breeze"
          placeholderTextColor="#7f8c96"
          style={styles.input}
          value={vesselName}
        />

        <Text style={styles.helperText}>
          This name is locked after you save it for this event.
        </Text>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          disabled={submitting}
          onPress={() => {
            void submit();
          }}
          style={[styles.button, submitting ? styles.buttonDisabled : null]}
        >
          <Text style={styles.buttonText}>
            {submitting ? "Saving..." : "Save Vessel Name"}
          </Text>
        </Pressable>
      </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#25292e",
    paddingHorizontal: 20,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#25292e",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#2f353d",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "#454b54",
  },
  eyebrow: {
    color: "#9ad0f5",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 8,
  },
  subtitle: {
    color: "#c7d1d8",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  label: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1f252b",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4b5661",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#ffffff",
    fontSize: 16,
  },
  helperText: {
    color: "#9fb0ba",
    fontSize: 13,
    marginTop: 10,
  },
  errorText: {
    color: "#ff8a80",
    fontSize: 14,
    marginTop: 12,
  },
  button: {
    marginTop: 18,
    backgroundColor: "#1b5e20",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  message: {
    marginTop: 12,
    color: "#ffffff",
    fontSize: 16,
    textAlign: "center",
  },
});
