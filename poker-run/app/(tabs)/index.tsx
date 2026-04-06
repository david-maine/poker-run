import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import CardRow from "../components/CardRow";
import MapDisplay from "../components/MapDisplay";
import useLocation from "../hooks/useLocation";
import {
  claimWaypoint,
  GameEvent,
  loadGameBootstrap,
  refreshRunSnapshot,
  RunSnapshot,
} from "../lib/game";
import { getDistanceMeters } from "../lib/utils";
import { Waypoint } from "../types";

export default function Index() {
  const { location, errorMsg } = useLocation();

  const [event, setEvent] = useState<GameEvent | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const [visitOrder, setVisitOrder] = useState<string[]>([]);
  const [waypointCards, setWaypointCards] = useState<Record<string, string | null>>({});
  const [bestHandName, setBestHandName] = useState("Unranked");
  const [bestHandCards, setBestHandCards] = useState<string[]>([]);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [isRefreshingRun, setIsRefreshingRun] = useState(false);

  const inFlightClaimIdsRef = useRef(new Set<string>());
  const claimCooldownUntilRef = useRef(new Map<string, number>());

  useEffect(() => {
    void loadGame(true);
    // `loadGame` is a useEffectEvent callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!location || !event || waypoints.length === 0) {
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

    void handleWaypointClaim(nextWaypoint);
    // `handleWaypointClaim` is a useEffectEvent callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, location, visited, waypoints]);

  async function loadGame(showSpinner: boolean) {
    if (showSpinner) {
      setIsLoadingGame(true);
    } else {
      setIsRefreshingRun(true);
    }

    setScreenError(null);

    try {
      const bootstrap = await loadGameBootstrap();

      if (!bootstrap) {
        setEvent(null);
        setWaypoints([]);
        applyRunSnapshot({
          runId: null,
          runStatus: null,
          visitCount: 0,
          bestHandName: "Unranked",
          bestHandCards: [],
          visitOrder: [],
          visited: {},
          waypointCards: {},
        });
        setStatusText("No active event is available yet.");
        return;
      }

      setEvent(bootstrap.event);
      setWaypoints(bootstrap.waypoints);
      applyRunSnapshot(bootstrap.snapshot);
      setStatusText(`Loaded ${bootstrap.event.name}.`);
    } catch (error) {
      setScreenError(getErrorMessage(error, "Unable to load the event."));
      setStatusText(null);
    } finally {
      setIsLoadingGame(false);
      setIsRefreshingRun(false);
    }
  }

  async function handleWaypointClaim(waypoint: Waypoint) {
    if (!event || !location || inFlightClaimIdsRef.current.has(waypoint.id)) {
      return;
    }

    inFlightClaimIdsRef.current.add(waypoint.id);
    setScreenError(null);
    setStatusText(`Claiming ${waypoint.name}...`);

    try {
      const snapshot = await claimWaypoint(
        {
          eventId: event.id,
          waypointId: waypoint.id,
          claimedLat: location.coords.latitude,
          claimedLng: location.coords.longitude,
          gpsAccuracyMeters: location.coords.accuracy ?? null,
        },
        waypoints
      );

      applyRunSnapshot(snapshot);
      setStatusText(`Collected ${waypoint.name}. Best hand: ${snapshot.bestHandName}.`);
      claimCooldownUntilRef.current.delete(waypoint.id);
    } catch (error) {
      const message = getErrorMessage(error, `Unable to claim ${waypoint.name}.`);
      setScreenError(message);
      setStatusText(null);
      claimCooldownUntilRef.current.set(waypoint.id, Date.now() + 5000);

      if (message.toLowerCase().includes("already claimed")) {
        await refreshCurrentRun();
      }
    } finally {
      inFlightClaimIdsRef.current.delete(waypoint.id);
    }
  }

  async function refreshCurrentRun() {
    if (!event || waypoints.length === 0) {
      return;
    }

    setIsRefreshingRun(true);
    setScreenError(null);

    try {
      const snapshot = await refreshRunSnapshot(event.id, waypoints);
      applyRunSnapshot(snapshot);
      setStatusText(`Synced ${snapshot.visitCount} waypoint claims.`);
    } catch (error) {
      setScreenError(getErrorMessage(error, "Unable to refresh your run."));
    } finally {
      setIsRefreshingRun(false);
    }
  }

  function applyRunSnapshot(snapshot: RunSnapshot) {
    setVisited(snapshot.visited);
    setVisitOrder(snapshot.visitOrder);
    setWaypointCards(snapshot.waypointCards);
    setBestHandName(snapshot.bestHandName);
    setBestHandCards(snapshot.bestHandCards);
    setRunStatus(snapshot.runStatus);
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

  if (!event || waypoints.length === 0) {
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
            Hand: {bestHandName}
            {bestHandCards.length > 0 ? ` (${bestHandCards.join(" ")})` : ""}
          </Text>
          <Text style={styles.infoText}>
            Run: {runStatus ?? "not started"} | Waypoints: {visitOrder.length}/{waypoints.length}
          </Text>
          {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
          {screenError ? <Text style={styles.errorTextSmall}>{screenError}</Text> : null}
          <Pressable
            onPress={() => {
              void refreshCurrentRun();
            }}
            style={styles.refreshButton}
          >
            <Text style={styles.refreshButtonText}>
              {isRefreshingRun ? "Refreshing..." : "Refresh Progress"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.cardsArea}>
        <CardRow visitOrder={visitOrder} waypointCards={waypointCards} total={waypoints.length} />
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
    height: "64%",
  },
  locationInfo: {
    width: "100%",
    height: "18%",
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
  refreshButton: {
    marginTop: 8,
    alignSelf: "center",
    backgroundColor: "#1b5e20",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
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
