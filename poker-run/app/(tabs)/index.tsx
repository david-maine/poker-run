import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import MapDisplay from "../../components/MapDisplay";
import CardRow from "../components/CardRow";
import useLocation from "../hooks/useLocation";
import { evaluateBestHand } from "../lib/cards";
import { addConnectivityListener, fetchIsUsableConnection } from "../lib/connectivity";
import {
  GameEvent,
  isAlreadySubmittedError,
  isRetryableHandSubmissionError,
  loadGameBootstrap,
  submitCompletedHand,
} from "../lib/game";
import {
  addLocalCardClaim,
  getLocalHand,
  LocalHand,
  markHandPendingSubmission,
  markHandSubmissionFailed,
  markHandSubmitted,
} from "../lib/localHand";
import { getDistanceMeters } from "../lib/utils";
import { Waypoint } from "../types";

type SubmitOptions = {
  force?: boolean;
  silent?: boolean;
};

export default function Index() {
  const { location, errorMsg } = useLocation();

  const [event, setEvent] = useState<GameEvent | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [hand, setHand] = useState<LocalHand | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [isRefreshingEvent, setIsRefreshingEvent] = useState(false);
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
  }, []);

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

  const bestHand = useMemo(
    () => evaluateBestHand((hand?.claims ?? []).map((claim) => claim.card)),
    [hand]
  );

  const isHandComplete = waypoints.length > 0 && visitOrder.length >= waypoints.length;
  const isPendingSubmission = hand?.status === "pending_submission";
  const isSubmitted = hand?.status === "submitted";

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
    } else {
      setIsRefreshingEvent(true);
    }

    setScreenError(null);

    try {
      const bootstrap = await loadGameBootstrap();

      if (!bootstrap) {
        setEvent(null);
        setWaypoints([]);
        setHand(null);
        setStatusText("No active event is available yet.");
        return;
      }

      const localHand = await getLocalHand(bootstrap.event.id);
      setEvent(bootstrap.event);
      setWaypoints(bootstrap.waypoints);
      setHand(localHand);
      setStatusText(`Loaded ${bootstrap.event.name}.`);
    } catch (error) {
      setScreenError(getErrorMessage(error, "Unable to load the event."));
      setStatusText(null);
    } finally {
      setIsLoadingGame(false);
      setIsRefreshingEvent(false);
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

      const completed = waypoints.length > 0 && result.hand.claims.length >= waypoints.length;
      setStatusText(
        result.added
          ? completed
            ? `Collected ${waypoint.name}: ${result.claim.card}. Hand complete.`
            : `Collected ${waypoint.name}: ${result.claim.card}.`
          : `${waypoint.name} was already collected.`
      );
    } catch (error) {
      const message = getErrorMessage(error, `Unable to collect ${waypoint.name}.`);
      setScreenError(message);
      setStatusText(null);
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
      if (!options.silent) {
        setStatusText("Hand already submitted.");
      }
      return;
    }

    if (currentWaypoints.length === 0 || currentHand.claims.length < currentWaypoints.length) {
      if (!options.silent) {
        setStatusText("Collect all waypoint cards before submitting.");
      }
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
      if (!options.silent) {
        setStatusText("Hand is ready to submit and waiting for internet.");
      }
      return;
    }

    isSubmittingHandRef.current = true;
    setIsSubmittingHand(true);

    try {
      await submitCompletedHand(currentEvent.id, queuedHand.claims);
      const submittedHand = await markHandSubmitted(queuedHand);
      setHand(submittedHand);
      handRef.current = submittedHand;
      setStatusText("Hand submitted to the leaderboard.");
    } catch (error) {
      if (isAlreadySubmittedError(error)) {
        const submittedHand = await markHandSubmitted(queuedHand);
        setHand(submittedHand);
        handRef.current = submittedHand;
        setStatusText("Hand already submitted to the leaderboard.");
        return;
      }

      const message = getErrorMessage(error, "Unable to submit your hand.");
      const retryable = isRetryableHandSubmissionError(error);
      const failedHand = await markHandSubmissionFailed(queuedHand, message, retryable);
      submitCooldownUntilRef.current = retryable ? Date.now() + 5000 : 0;
      setHand(failedHand);
      handRef.current = failedHand;

      if (!options.silent) {
        setStatusText(
          retryable
            ? "Submission failed. The app will retry when the connection is back."
            : "Submission was rejected. You can retry from the button."
        );
      }

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
      return "Submitting...";
    }

    if (isSubmitted) {
      return "Hand Submitted";
    }

    if (isPendingSubmission) {
      return "Retry Submit";
    }

    return "Submit Hand";
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
      <View style={styles.container}>
        <Text style={styles.loadingText}>
          {isLoadingGame ? "Loading event..." : "Getting location..."}
        </Text>
      </View>
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
      </View>

      <View style={styles.locationInfo}>
        <View style={styles.infoBlock}>
          <Text style={styles.eventText}>{event.name}</Text>
          <Text style={styles.infoText}>
            Lat: {location.coords.latitude.toFixed(6)} | Lon: {location.coords.longitude.toFixed(6)}
          </Text>
          <Text style={styles.infoText}>
            Hand: {bestHand.name}
            {bestHand.cards.length > 0 ? ` (${bestHand.cards.join(" ")})` : ""}
          </Text>
          <Text style={styles.infoText}>
            Run: {isSubmitted ? "submitted" : isHandComplete ? "complete" : "collecting"} | Waypoints:{" "}
            {visitOrder.length}/{waypoints.length}
            {isPendingSubmission ? " | Pending submit" : ""}
          </Text>
          {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
          {hand.lastSubmissionError ? (
            <Text style={styles.errorTextSmall}>{hand.lastSubmissionError}</Text>
          ) : screenError ? (
            <Text style={styles.errorTextSmall}>{screenError}</Text>
          ) : null}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => {
                void loadGame(false);
              }}
              style={styles.refreshButton}
            >
              <Text style={styles.refreshButtonText}>
                {isRefreshingEvent ? "Refreshing..." : "Refresh Event"}
              </Text>
            </Pressable>
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
              <Text style={styles.refreshButtonText}>{getSubmitButtonLabel()}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.cardsArea}>
        <CardRow
          visitOrder={visitOrder}
          waypointCards={waypointCards}
          total={waypoints.length}
        />
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
    backgroundColor: "#25292e",
    justifyContent: "center",
    alignItems: "center",
  },
  map: {
    width: "100%",
    height: "62%",
  },
  locationInfo: {
    width: "100%",
    height: "20%",
    backgroundColor: "#333333",
    justifyContent: "center",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#444444",
    paddingVertical: 8,
  },
  infoBlock: {
    width: "100%",
    paddingHorizontal: 12,
  },
  cardsArea: {
    width: "100%",
    height: "18%",
    backgroundColor: "#222",
    justifyContent: "center",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#111",
  },
  eventText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  infoText: {
    color: "#ffffff",
    fontSize: 14,
  },
  statusText: {
    color: "#a5d6a7",
    fontSize: 13,
    marginTop: 4,
  },
  actionRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  refreshButton: {
    alignSelf: "flex-start",
    backgroundColor: "#1b5e20",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  submitButton: {
    alignSelf: "flex-start",
    backgroundColor: "#0f766e",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  refreshButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  loadingText: {
    color: "#999999",
    fontSize: 16,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  errorTextSmall: {
    color: "#ff8a80",
    fontSize: 13,
    marginTop: 4,
  },
});
