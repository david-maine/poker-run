import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import MapDisplay from "../../components/MapDisplay";
import CardRow from "../components/CardRow";
import useLocation from "../hooks/useLocation";
import {
  claimWaypoint,
  GameEvent,
  isAlreadyClaimedError,
  isRetryableClaimError,
  loadGameBootstrap,
  refreshRunSnapshot,
  RunSnapshot,
} from "../lib/game";
import { getDistanceMeters } from "../lib/utils";
import {
  createPendingWaypointClaim,
  getPendingWaypointClaims,
  PendingWaypointClaim,
  removePendingWaypointClaim,
  updatePendingWaypointClaim,
  upsertPendingWaypointClaim,
} from "../lib/waypointQueue";
import { Waypoint } from "../types";

type SyncOptions = {
  force?: boolean;
  silent?: boolean;
};

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
  const [pendingClaims, setPendingClaims] = useState<PendingWaypointClaim[]>([]);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [isRefreshingRun, setIsRefreshingRun] = useState(false);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  const inFlightClaimIdsRef = useRef(new Set<string>());
  const claimCooldownUntilRef = useRef(new Map<string, number>());
  const eventIdRef = useRef<string | null>(null);
  const pendingClaimsRef = useRef<PendingWaypointClaim[]>([]);
  const serverSnapshotRef = useRef<RunSnapshot | null>(null);
  const syncCooldownUntilRef = useRef(0);
  const isSyncingPendingRef = useRef(false);

  const pendingWaypointIds = createPendingWaypointMap(pendingClaims, event?.id ?? eventIdRef.current);
  const pendingClaimCount = Object.keys(pendingWaypointIds).length;

  useEffect(() => {
    void bootstrapScreen();
    // `bootstrapScreen` is a useEffectEvent callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (hasUsableConnection(state)) {
        void syncPendingClaims({ silent: true });
      }
    });

    void NetInfo.fetch().then((state) => {
      if (hasUsableConnection(state)) {
        void syncPendingClaims({ silent: true });
      }
    });

    return unsubscribe;
    // `syncPendingClaims` is a useEffectEvent callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, waypoints]);

  useEffect(() => {
    if (!location || !event || pendingClaimsRef.current.length === 0) {
      return;
    }

    void syncPendingClaims({ silent: true });
    // `syncPendingClaims` is a useEffectEvent callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, location, waypoints]);

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

  async function bootstrapScreen() {
    const queuedClaims = await getPendingWaypointClaims();
    setPendingClaimsAndApply(queuedClaims);
    await loadGame(true);
  }

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
        eventIdRef.current = null;
        applyRunSnapshot(
          {
            runId: null,
            runStatus: null,
            visitCount: 0,
            bestHandName: "Unranked",
            bestHandCards: [],
            visitOrder: [],
            visited: {},
            waypointCards: {},
          },
          null
        );
        setStatusText("No active event is available yet.");
        return;
      }

      eventIdRef.current = bootstrap.event.id;
      setEvent(bootstrap.event);
      setWaypoints(bootstrap.waypoints);
      applyRunSnapshot(bootstrap.snapshot, bootstrap.event.id);
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

    try {
      const pendingClaim = createPendingWaypointClaim({
        eventId: event.id,
        waypointId: waypoint.id,
        claimedLat: location.coords.latitude,
        claimedLng: location.coords.longitude,
        gpsAccuracyMeters: location.coords.accuracy ?? null,
      });
      const storedClaim = await upsertPendingWaypointClaim(pendingClaim);
      const queuedClaims = await getPendingWaypointClaims();
      setPendingClaimsAndApply(queuedClaims);
      claimCooldownUntilRef.current.delete(waypoint.id);

      setStatusText(
        storedClaim.clientClaimId === pendingClaim.clientClaimId
          ? `Collected ${waypoint.name}. Syncing when online...`
          : `${waypoint.name} is already waiting to sync.`
      );

      void syncPendingClaims({ silent: false });
    } catch (error) {
      const message = getErrorMessage(error, `Unable to queue ${waypoint.name}.`);
      setScreenError(message);
      setStatusText(null);
      claimCooldownUntilRef.current.set(waypoint.id, Date.now() + 5000);
    } finally {
      inFlightClaimIdsRef.current.delete(waypoint.id);
    }
  }

  async function syncPendingClaims(options: SyncOptions = {}) {
    if (!event || waypoints.length === 0 || isSyncingPendingRef.current) {
      return 0;
    }

    const queuedClaims = await getPendingWaypointClaims();
    setPendingClaimsAndApply(queuedClaims);

    const eventClaims = queuedClaims.filter((claim) => claim.eventId === event.id);
    if (eventClaims.length === 0) {
      return 0;
    }

    if (!options.force && syncCooldownUntilRef.current > Date.now()) {
      return 0;
    }

    const networkState = await NetInfo.fetch();
    if (!hasUsableConnection(networkState)) {
      syncCooldownUntilRef.current = Date.now() + 5000;
      if (!options.silent) {
        setStatusText(formatPendingStatus(eventClaims.length));
      }
      return 0;
    }

    isSyncingPendingRef.current = true;
    setIsSyncingPending(true);

    let syncedCount = 0;
    let lastError: string | null = null;

    try {
      for (const pendingClaim of eventClaims) {
        try {
          const snapshot = await claimWaypoint(pendingClaim, waypoints);
          syncedCount += 1;
          await removePendingWaypointClaim(pendingClaim.clientClaimId);
          const refreshedQueue = await getPendingWaypointClaims();
          setPendingClaimsAndApply(refreshedQueue, snapshot, event.id);
        } catch (error) {
          const message = getErrorMessage(error, "Unable to sync waypoint claim.");

          if (isAlreadyClaimedError(error)) {
            syncedCount += 1;
            await removePendingWaypointClaim(pendingClaim.clientClaimId);
            const snapshot = await refreshRunSnapshot(event.id, waypoints);
            const refreshedQueue = await getPendingWaypointClaims();
            setPendingClaimsAndApply(refreshedQueue, snapshot, event.id);
            continue;
          }

          if (isRetryableClaimError(error)) {
            await updatePendingWaypointClaim(pendingClaim.clientClaimId, {
              attemptCount: pendingClaim.attemptCount + 1,
              lastError: message,
            });
            lastError = message;
            syncCooldownUntilRef.current = Date.now() + 5000;
            break;
          }

          await removePendingWaypointClaim(pendingClaim.clientClaimId);
          claimCooldownUntilRef.current.set(pendingClaim.waypointId, Date.now() + 5000);
          lastError = message;
          setScreenError(message);

          try {
            const snapshot = await refreshRunSnapshot(event.id, waypoints);
            const refreshedQueue = await getPendingWaypointClaims();
            setPendingClaimsAndApply(refreshedQueue, snapshot, event.id);
          } catch {
            const refreshedQueue = await getPendingWaypointClaims();
            setPendingClaimsAndApply(refreshedQueue);
          }
        }
      }
    } finally {
      const refreshedQueue = await getPendingWaypointClaims();
      setPendingClaimsAndApply(refreshedQueue);
      isSyncingPendingRef.current = false;
      setIsSyncingPending(false);
    }

    const remainingCount = pendingClaimsRef.current.filter((claim) => claim.eventId === event.id).length;

    if (syncedCount > 0) {
      setStatusText(
        remainingCount > 0
          ? `Synced ${syncedCount} pending waypoint claim${syncedCount === 1 ? "" : "s"}. ${remainingCount} still waiting.`
          : `Synced ${syncedCount} pending waypoint claim${syncedCount === 1 ? "" : "s"}.`
      );
    } else if (lastError && !options.silent) {
      setStatusText(formatPendingStatus(remainingCount));
    }

    return syncedCount;
  }

  async function refreshCurrentRun() {
    if (!event || waypoints.length === 0) {
      return;
    }

    setIsRefreshingRun(true);
    setScreenError(null);

    try {
      const syncedCount = await syncPendingClaims({ force: true, silent: true });
      const snapshot = await refreshRunSnapshot(event.id, waypoints);
      applyRunSnapshot(snapshot, event.id);

      const remainingCount = pendingClaimsRef.current.filter((claim) => claim.eventId === event.id).length;
      if (remainingCount > 0) {
        setStatusText(formatPendingStatus(remainingCount));
      } else if (syncedCount > 0) {
        setStatusText(`Synced ${syncedCount} pending waypoint claim${syncedCount === 1 ? "" : "s"}.`);
      } else {
        setStatusText(`Synced ${snapshot.visitCount} waypoint claims.`);
      }
    } catch (error) {
      setScreenError(getErrorMessage(error, "Unable to refresh your run."));
    } finally {
      setIsRefreshingRun(false);
    }
  }

  function setPendingClaimsAndApply(
    claims: PendingWaypointClaim[],
    snapshot = serverSnapshotRef.current,
    eventId = eventIdRef.current
  ) {
    pendingClaimsRef.current = claims;
    setPendingClaims(claims);

    if (snapshot) {
      applyRunSnapshot(snapshot, eventId, claims);
    }
  }

  function applyRunSnapshot(
    snapshot: RunSnapshot,
    eventId = eventIdRef.current,
    claims = pendingClaimsRef.current
  ) {
    serverSnapshotRef.current = snapshot;
    eventIdRef.current = eventId;

    const optimisticSnapshot = applyPendingClaimsToSnapshot(snapshot, claims, eventId);
    setVisited(optimisticSnapshot.visited);
    setVisitOrder(optimisticSnapshot.visitOrder);
    setWaypointCards(optimisticSnapshot.waypointCards);
    setBestHandName(optimisticSnapshot.bestHandName);
    setBestHandCards(optimisticSnapshot.bestHandCards);
    setRunStatus(optimisticSnapshot.runStatus);
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
            {pendingClaimCount > 0 ? ` | Pending sync: ${pendingClaimCount}` : ""}
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
              {isRefreshingRun || isSyncingPending ? "Syncing..." : "Refresh Progress"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.cardsArea}>
        <CardRow
          visitOrder={visitOrder}
          waypointCards={waypointCards}
          pendingWaypointIds={pendingWaypointIds}
          total={waypoints.length}
        />
      </View>
    </View>
  );
}

function applyPendingClaimsToSnapshot(
  snapshot: RunSnapshot,
  pendingClaims: PendingWaypointClaim[],
  eventId: string | null
): RunSnapshot {
  if (!eventId) {
    return snapshot;
  }

  const visited = { ...snapshot.visited };
  const waypointCards = { ...snapshot.waypointCards };
  const visitOrder = [...snapshot.visitOrder];

  for (const claim of pendingClaims.filter((pendingClaim) => pendingClaim.eventId === eventId)) {
    if (!visited[claim.waypointId]) {
      visited[claim.waypointId] = true;
      waypointCards[claim.waypointId] = null;
      visitOrder.push(claim.waypointId);
    }
  }

  return {
    ...snapshot,
    visited,
    waypointCards,
    visitOrder,
  };
}

function createPendingWaypointMap(pendingClaims: PendingWaypointClaim[], eventId: string | null) {
  return pendingClaims.reduce<Record<string, boolean>>((pendingMap, claim) => {
    if (claim.eventId === eventId) {
      pendingMap[claim.waypointId] = true;
    }
    return pendingMap;
  }, {});
}

function hasUsableConnection(state: NetInfoState) {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

function formatPendingStatus(count: number) {
  return `${count} waypoint claim${count === 1 ? "" : "s"} waiting for internet.`;
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
