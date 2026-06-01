import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ImageBackground, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import LoadingScreen from "../src/components/LoadingScreen";
import { useEventSession } from "../src/lib/eventSession";
import { registerVesselNameForEvent } from "../src/lib/game";

export default function RegisterScreen() {
  const { registrationState, setRegistrationState } = useEventSession();
  const [vesselName, setVesselName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const event = registrationState.event;

  useEffect(() => {
    if (!event || registrationState.isRegistered) {
      router.replace("/(tabs)");
    }
  }, [event, registrationState.isRegistered]);

  async function submit() {
    if (!event) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const nextRegistrationState = await registerVesselNameForEvent(event, vesselName);
      setRegistrationState(nextRegistrationState);
      router.replace("/(tabs)");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to register your vessel."));
    } finally {
      setSubmitting(false);
    }
  }

  if (!event || registrationState.isRegistered) {
    return <LoadingScreen accessibilityLabel="Loading registration" />;
  }

  return (
    <View style={styles.backgroundContainer}>
    {/* <SafeAreaView style={styles.backgroundContainer} edges={["top"]}> */}
    <ImageBackground
      source={require("../assets/images/landingpage.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={-100}
        style={styles.keyboardAvoidingContainer}
      >
        <View style={styles.container}>
          <ImageBackground
            source={require("../assets/images/landing-icon.png")}
            style={styles.card}
            imageStyle={styles.cardBackgroundIcon}
            resizeMode="stretch"
          >
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              editable={!submitting}
              maxLength={40}
              onChangeText={setVesselName}
              placeholder="Name your vessel"
              placeholderTextColor="#7f8c96"
              style={styles.input}
              value={vesselName}
            />

            {/* {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null} */}

            <Pressable
              accessibilityLabel={submitting ? "Saving vessel name" : "Set sail"}
              accessibilityRole="button"
              disabled={submitting}
              onPress={() => {
                void submit();
              }}
              style={[styles.button, submitting ? styles.buttonDisabled : null]}
            >
              <ImageBackground
                source={require("../assets/images/landing-Set-Sail.png")}
                style={styles.buttonImage}
                imageStyle={styles.buttonImageAsset}
                resizeMode="contain"
              >
                <Text style={styles.buttonText}>
                  {submitting ? "Saving..." : "SET SAIL"}
                </Text>
              </ImageBackground>
            </Pressable>
          </ImageBackground>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
    {/* </SafeAreaView> */}
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
  backgroundContainer: {
    flex: 1,
    backgroundColor: "#25292e",
  },
  background: {
    flex: 1,
    backgroundColor: "#25292e",
  },
  keyboardAvoidingContainer: {
    flex: 1,
    width: "100%",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 58,
    paddingBottom: 120,
  },
  card: {
    width: "100%",
    borderRadius: 18,
    paddingHorizontal: 0,
    paddingVertical: 20,
    overflow: "hidden",
  },
  cardBackgroundIcon: {
    opacity: 1,
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
    borderRadius: 0,
    borderWidth: 3,
    borderColor: "#202542",
    marginHorizontal: 26,
    marginVertical: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    color: "#202542",
    textAlign: "center",
    fontSize: 16,
    fontFamily: "Stoke-Regular",
  },
  helperText: {
    color: "#9fb0ba",
    fontSize: 13,
    marginTop: 10,
    fontFamily: "Stoke-Regular",
  },
  errorText: {
    color: "#ff8a80",
    fontSize: 14,
    marginTop: 12,
  },
  button: {
    marginTop: 0,
    paddingHorizontal: 20,
    width: "100%",
    aspectRatio: 3142 / 685,
    borderRadius: 0,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonImage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonImageAsset: {
    borderRadius: 0,
  },
  buttonText: {
    color: "#D1CCB9",
    fontSize: 24,
    fontWeight: "800",
    fontFamily: "Stoke-Regular",
  },
  message: {
    marginTop: 12,
    color: "#ffffff",
    fontSize: 16,
    textAlign: "center",
  },
});
