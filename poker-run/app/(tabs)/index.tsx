import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";

import MapDisplay from "../../components/MapDisplay";
import CardRow from "../../src/components/CardRow";
import LoadingScreen from "../../src/components/LoadingScreen";
import useLocation from "../../src/hooks/useLocation";
import { addConnectivityListener, fetchIsUsableConnection } from "../../src/lib/connectivity";
import { useEventSession } from "../../src/lib/eventSession";
import {
  GameEvent,
  isAlreadySubmittedError,
  isRetryableHandSubmissionError,
  loadGameBootstrapForEvent,
  submitCompletedHand,
} from "../../src/lib/game";
import {
  addLocalCardClaim,
  getLocalHand,
  LocalHand,
  markHandPendingSubmission,
  markHandSubmissionFailed,
  markHandSubmitted,
} from "../../src/lib/localHand";
import { getDistanceMeters } from "../../src/lib/utils";
import { Waypoint } from "../../src/types";

type SubmitOptions = {
  force?: boolean;
  silent?: boolean;
};

export default function Index() {
  const { location, errorMsg } = useLocation();
  const { registrationState } = useEventSession();

  const [event, setEvent] = useState<GameEvent | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [hand, setHand] = useState<LocalHand | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [isSubmittingHand, setIsSubmittingHand] = useState(false);

  const inFlightClaimIdsRef = useRef(new Set<string>());
  const claimCooldownUntilRef = useRef(new Map<string, number>());
  const handRef = useRef<LocalHand | null>(null);
  const eventRef = useRef<GameEvent | null>(null);
  const waypointsRef = useRef<Waypoint[]>([]);
  const isSubmittingHandRef = useRef(false);
  const submitCooldownUntilRef = useRef(0);

  useEffect(() => {
    void loadGame(true);
    // App-session event changes only when the root session state is updated locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationState.event]);

  useEffect(() => {
    handRef.current = hand;
  }, [hand]);

  useEffect(() => {
    eventRef.current = event;
  }, [event]);

  useEffect(() => {
    waypointsRef.current = waypoints;
  }, [waypoints]);

  useEffect(() => {
    const unsubscribe = addConnectivityListener((isUsable) => {
      if (isUsable) {
        void retryPendingSubmission({ silent: true });
      }
    });

    void fetchIsUsableConnection().then((isUsable) => {
      if (isUsable) {
        void retryPendingSubmission({ silent: true });
      }
    });

    return unsubscribe;
    // `retryPendingSubmission` reads current refs and intentionally stays stable for this listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void retryPendingSubmission({ silent: true });
    // `retryPendingSubmission` reads current refs and is gated by submission cooldowns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, hand]);

  const visitOrder = useMemo(
    () => hand?.claims.map((claim) => claim.waypointId) ?? [],
    [hand]
  );

  const visited = useMemo(() => {
    const nextVisited: Record<string, boolean> = {};
    for (const waypoint of waypoints) {
      nextVisited[waypoint.id] = false;
    }

    for (const waypointId of visitOrder) {
      nextVisited[waypointId] = true;
    }

    return nextVisited;
  }, [visitOrder, waypoints]);

  const waypointCards = useMemo(() => {
    const nextCards: Record<string, string | null> = {};
    for (const waypoint of waypoints) {
      nextCards[waypoint.id] = null;
    }

    for (const claim of hand?.claims ?? []) {
      nextCards[claim.waypointId] = claim.card;
    }

    return nextCards;
  }, [hand, waypoints]);

  const isHandComplete = waypoints.length > 0 && visitOrder.length >= waypoints.length;
  const isPendingSubmission = hand?.status === "pending_submission";
  const isSubmitted = hand?.status === "submitted";

  useEffect(() => {
    if (isSubmitted) {
      router.navigate("/(tabs)/leaderboard");
    }
  }, [isSubmitted]);

  useEffect(() => {
    if (!location || !event || !hand || waypoints.length === 0 || isSubmitted) {
      return;
    }

    if (inFlightClaimIdsRef.current.size > 0) {
      return;
    }

    const nextWaypoint = waypoints.find((waypoint) => {
      if (visited[waypoint.id]) {
        return false;
      }

      if (inFlightClaimIdsRef.current.has(waypoint.id)) {
        return false;
      }

      const cooldownUntil = claimCooldownUntilRef.current.get(waypoint.id) ?? 0;
      if (cooldownUntil > Date.now()) {
        return false;
      }

      const distanceMeters = getDistanceMeters(
        location.coords.latitude,
        location.coords.longitude,
        waypoint.latitude,
        waypoint.longitude
      );

      return distanceMeters <= (waypoint.radiusMeters ?? 20);
    });

    if (!nextWaypoint) {
      return;
    }

    void handleWaypointCollection(nextWaypoint);
    // `handleWaypointCollection` uses current refs/state and is guarded by in-flight waypoint ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, hand, isSubmitted, location, visited, waypoints]);

  async function loadGame(showSpinner: boolean) {
    if (showSpinner) {
      setIsLoadingGame(true);
    }

    setScreenError(null);

    try {
      const sessionEvent = registrationState.event;

      if (!sessionEvent) {
        setEvent(null);
        setWaypoints([]);
        setHand(null);
        return;
      }

      const bootstrap = await loadGameBootstrapForEvent(sessionEvent);

      const localHand = await getLocalHand(bootstrap.event.id);
      setEvent(bootstrap.event);
      setWaypoints(bootstrap.waypoints);
      setHand(localHand);
    } catch (error) {
      setScreenError(getErrorMessage(error, "Unable to load the event."));
    } finally {
      setIsLoadingGame(false);
    }
  }

  async function handleWaypointCollection(waypoint: Waypoint) {
    if (!event || !location || inFlightClaimIdsRef.current.has(waypoint.id)) {
      return;
    }

    inFlightClaimIdsRef.current.add(waypoint.id);
    setScreenError(null);

    try {
      const result = await addLocalCardClaim({
        eventId: event.id,
        waypointId: waypoint.id,
        claimedLat: location.coords.latitude,
        claimedLng: location.coords.longitude,
        gpsAccuracyMeters: location.coords.accuracy ?? null,
      });

      setHand(result.hand);
      claimCooldownUntilRef.current.delete(waypoint.id);
    } catch (error) {
      const message = getErrorMessage(error, `Unable to collect ${waypoint.name}.`);
      setScreenError(message);
      claimCooldownUntilRef.current.set(waypoint.id, Date.now() + 5000);
    } finally {
      inFlightClaimIdsRef.current.delete(waypoint.id);
    }
  }

  async function retryPendingSubmission(options: SubmitOptions = {}) {
    const currentHand = handRef.current;
    if (
      !currentHand ||
      currentHand.status !== "pending_submission" ||
      (!currentHand.lastSubmissionRetryable && currentHand.lastSubmissionError && !options.force) ||
      (!options.force && submitCooldownUntilRef.current > Date.now())
    ) {
      return;
    }

    await submitHand(options);
  }

  async function submitHand(options: SubmitOptions = {}) {
    const currentEvent = eventRef.current;
    const currentHand = handRef.current;
    const currentWaypoints = waypointsRef.current;

    if (!currentEvent || !currentHand || isSubmittingHandRef.current) {
      return;
    }

    if (currentHand.status === "submitted") {
      return;
    }

    if (currentWaypoints.length === 0 || currentHand.claims.length < currentWaypoints.length) {
      return;
    }

    setScreenError(null);
    let queuedHand = currentHand;

    if (queuedHand.status !== "pending_submission") {
      queuedHand = await markHandPendingSubmission(queuedHand);
      setHand(queuedHand);
      handRef.current = queuedHand;
    }

    const isUsableConnection = await fetchIsUsableConnection();
    if (!isUsableConnection) {
      submitCooldownUntilRef.current = Date.now() + 5000;
      return;
    }

    isSubmittingHandRef.current = true;
    setIsSubmittingHand(true);

    try {
      await submitCompletedHand(currentEvent.id, queuedHand.claims);
      const submittedHand = await markHandSubmitted(queuedHand);
      setHand(submittedHand);
      handRef.current = submittedHand;
      if (!options.silent) {
        router.navigate("/(tabs)/leaderboard");
      }
    } catch (error) {
      if (isAlreadySubmittedError(error)) {
        const submittedHand = await markHandSubmitted(queuedHand);
        setHand(submittedHand);
        handRef.current = submittedHand;
        if (!options.silent) {
          router.navigate("/(tabs)/leaderboard");
        }
        return;
      }

      const message = getErrorMessage(error, "Unable to submit your hand.");
      const retryable = isRetryableHandSubmissionError(error);
      const failedHand = await markHandSubmissionFailed(queuedHand, message, retryable);
      submitCooldownUntilRef.current = retryable ? Date.now() + 5000 : 0;
      setHand(failedHand);
      handRef.current = failedHand;

      if (!retryable) {
        setScreenError(message);
      }
    } finally {
      isSubmittingHandRef.current = false;
      setIsSubmittingHand(false);
    }
  }

  function getSubmitButtonLabel() {
    if (isSubmittingHand) {
      return "PLAYING...";
    }

    if (isSubmitted) {
      return "PLAYED";
    }

    if (isPendingSubmission) {
      return "RETRY";
    }

    return "PLAY";
  }

  if (errorMsg) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    );
  }

  if (isLoadingGame || !location) {
    return (
      <LoadingScreen
        accessibilityLabel={isLoadingGame ? "Loading event" : "Getting location"}
      />
    );
  }

  if (!event || waypoints.length === 0 || !hand) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          {screenError ?? "No active event is configured in Supabase yet."}
        </Text>
        <Pressable
          onPress={() => {
            void loadGame(false);
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
      <View style={styles.map}>
        <MapDisplay
          waypoints={waypoints}
          visited={visited}
          userLocation={{
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          }}
        />

        <ImageBackground
          source={require("../../assets/images/map-background.png")}
          style={styles.bottomPanel}
          resizeMode="cover"
        >
          <Text style={styles.handTitle}>YOUR HAND</Text>

          <View style={styles.cardsArea}>
            <CardRow
              visitOrder={visitOrder}
              waypointCards={waypointCards}
              total={waypoints.length}
            />
          </View>

          <Pressable
            disabled={!isHandComplete || isSubmitted || isSubmittingHand}
            onPress={() => {
              void submitHand({ force: true });
            }}
            style={[
              styles.submitButton,
              !isHandComplete || isSubmitted || isSubmittingHand ? styles.buttonDisabled : null,
            ]}
          >
            <ImageBackground
              source={require("../../assets/images/map-PLAY.png")}
              style={styles.submitButtonImage}
              resizeMode="contain"
            >
              <Text style={styles.submitButtonText}>{getSubmitButtonLabel()}</Text>
            </ImageBackground>
          </Pressable>
        </ImageBackground>
      </View>



      {/* <View style={styles.controlsArea}> */}

      {/* </View> */}
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
    backgroundColor: "#25292e",
    justifyContent: "center",
    alignItems: "center",
  },
  map: {
    width: "100%",
    flex: 1,
    position: "relative",
  },
  controlsArea: {
    width: "100%",
    backgroundColor: "#25292e",
    justifyContent: "center",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#3f444c",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bottomPanel: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 48,
    aspectRatio: 4679 / 2788,
    paddingBottom: 14,
    paddingHorizontal: 20,
    paddingTop: 14,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
    elevation: 2,
  },
  handTitle: {
    color: "#202540",
    fontFamily: "Stoke-Regular",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 28,
    marginBottom: 12,
    textAlign: "center",
  },
  cardsArea: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 0,
  },
  refreshButton: {
    alignSelf: "flex-start",
    backgroundColor: "#1b5e20",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  submitButton: {
    width: "62%",
  },
  submitButtonImage: {
    alignItems: "center",
    aspectRatio: 2422 / 533,
    justifyContent: "center",
    width: "100%",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  refreshButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  submitButtonText: {
    color: "#f2ead4",
    fontFamily: "Stoke-Regular",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  errorText: {
    color: "#ff8a80",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
