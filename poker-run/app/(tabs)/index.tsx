import { Text, View, StyleSheet, Pressable } from "react-native";
import { useEffect, useState } from "react";
import MapDisplay from "../components/MapDisplay";
import CardRow from "../components/CardRow";
import useLocation from "../hooks/useLocation";
import { getDistanceMeters, generateDeck } from "../lib/utils";
import { Waypoint } from "../types";

export default function Index() {
  const WAYPOINTS: Waypoint[] = [
    { id: "wp1", name: "Waypoint 1", latitude: -30.642985625822085, longitude: 153.0032434784168 },
    { id: "wp2", name: "Waypoint 2", latitude: -30.641767199198757, longitude: 153.0018180994699 },
    { id: "wp3", name: "Waypoint 3", latitude: -30.642097320327387, longitude: 153.00372674625527 },
    { id: "wp4", name: "Waypoint 4", latitude: -30.642386750602427, longitude: 153.0031659559446 },
    { id: "wp5", name: "Waypoint 5", latitude: -30.642193290390235, longitude: 153.00241699750464 },
  ];

  const { location, errorMsg } = useLocation();

  const [visited, setVisited] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    WAYPOINTS.forEach((w) => (initial[w.id] = false));
    return initial;
  });
  const [visitOrder, setVisitOrder] = useState<string[]>([]);
  const [waypointCards, setWaypointCards] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {};
    WAYPOINTS.forEach((w) => (initial[w.id] = null));
    return initial;
  });

  useEffect(() => {
    if (!location) return;

    WAYPOINTS.forEach((w) => {
      if (!visited[w.id]) {
        const dist = getDistanceMeters(location.coords.latitude, location.coords.longitude, w.latitude, w.longitude);
        if (dist <= 20) {
          setVisited((prev) => ({ ...prev, [w.id]: true }));
          setWaypointCards((prev) => {
            if (prev[w.id]) return prev;
            const assigned = Object.values(prev).filter(Boolean) as string[];
            const deck = generateDeck().filter((c) => !assigned.includes(c));
            if (deck.length === 0) return prev;
            const pick = deck[Math.floor(Math.random() * deck.length)];
            console.log(`Dealt ${pick} for ${w.id} (${w.name}) — ${dist.toFixed(1)} m`);
            return { ...prev, [w.id]: pick };
          });
          setVisitOrder((prev) => (prev.includes(w.id) ? prev : [...prev, w.id]));
          console.log(`Reached ${w.name} (${w.id}) — ${dist.toFixed(1)} m`);
        }
      }
    });
    // only run when location updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const resetVisited = () => {
    const reset: Record<string, boolean> = {};
    WAYPOINTS.forEach((w) => (reset[w.id] = false));
    setVisited(reset);
    setVisitOrder([]);
    const resetCards: Record<string, string | null> = {};
    WAYPOINTS.forEach((w) => (resetCards[w.id] = null));
    setWaypointCards(resetCards);
  };

  if (errorMsg) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Getting location...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.map}>
      <MapDisplay waypoints={WAYPOINTS} visited={visited} userLocation={location ? { latitude: location.coords.latitude, longitude: location.coords.longitude } : null} />
      </View>

      <View style={styles.locationInfo}>
        <View style={{ width: "100%", paddingHorizontal: 12 }}>
          <Text style={styles.infoText}>
            Lat: {location.coords.latitude.toFixed(6)} — Lon: {location.coords.longitude.toFixed(6)}
          </Text>
          <Pressable onPress={resetVisited} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>Reset Waypoints</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.cardsArea}>
        <CardRow visitOrder={visitOrder} waypointCards={waypointCards} total={WAYPOINTS.length} />
      </View>
    </View>
  );
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
    height: "70%",
  },
  locationInfo: {
    width: "100%",
    height: "10%",
    backgroundColor: "#333333",
    justifyContent: "center",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#444444",
    paddingVertical: 8,
  },
  cardsArea: {
    width: "100%",
    height: "20%",
    backgroundColor: "#222",
    justifyContent: "center",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#111",
  },
  cardsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    paddingHorizontal: 12,
  },
  cardSlot: {
    width: 56,
    height: 80,
    borderRadius: 8,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  cardBack: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#444",
  },
  cardText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  infoText: {
    color: "#fff",
    fontSize: 14,
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  resetButton: {
    marginTop: 8,
    alignSelf: "center",
    backgroundColor: "#1b5e20",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resetButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  loadingText: {
    color: "#999",
    fontSize: 16,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 16,
  },
});

