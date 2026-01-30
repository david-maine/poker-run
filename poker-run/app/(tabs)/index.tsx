import { Text, View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useEffect, useState } from "react";
import * as Location from "expo-location";
import MapView, { Marker, Circle } from "react-native-maps";

export default function Index() {
  type Waypoint = { id: string; name: string; latitude: number; longitude: number };

  const WAYPOINTS: Waypoint[] = [
    { id: "wp1", name: "Waypoint 1", latitude: -30.642985625822085, longitude: 153.0032434784168 },
    { id: "wp2", name: "Waypoint 2", latitude: -30.641767199198757, longitude: 153.0018180994699 },
    { id: "wp3", name: "Waypoint 3", latitude: -30.642097320327387, longitude: 153.00372674625527 },
    { id: "wp4", name: "Waypoint 4", latitude: -30.642386750602427, longitude: 153.0031659559446 },
    { id: "wp5", name: "Waypoint 5", latitude: -30.642193290390235, longitude: 153.00241699750464 },
  ];

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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

  // haversine distance in meters
  const getDistanceMeters = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371000; // metres
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Permission to access location was denied");
        return;
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 0,
        },
        (loc) => {
          if (!mounted) return;
          setLocation(loc);

          // check proximity to waypoints
          WAYPOINTS.forEach((w, idx) => {
            if (!visited[w.id]) {
              const dist = getDistanceMeters(
                loc.coords.latitude,
                loc.coords.longitude,
                w.latitude,
                w.longitude
              );
              if (dist <= 20) {
                setVisited((prev) => ({ ...prev, [w.id]: true }));
                // track visit order and assign one unique card per waypoint on first visit
                setWaypointCards((prev) => {
                  if (prev[w.id]) return prev; // already has a card, skip
                  const assigned = Object.values(prev).filter(Boolean) as string[];
                  const deck = generateDeck().filter((c) => !assigned.includes(c));
                  if (deck.length === 0) return prev;
                  const pick = deck[Math.floor(Math.random() * deck.length)];
                  console.log(`Dealt ${pick} for ${w.id} (${w.name}) — ${dist.toFixed(1)} m`);
                  return { ...prev, [w.id]: pick };
                });
                setVisitOrder((prev) => {
                  if (prev.includes(w.id)) return prev; // already in order
                  return [...prev, w.id];
                });
                console.log(`Reached ${w.name} (${w.id}) — ${dist.toFixed(1)} m`);
              }
            }
          });
        }
      );

      return () => {
        mounted = false;
        subscription.remove();
      };
    })();
  }, [visited]);

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
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.00922,
          longitudeDelta: 0.00421,
        }}
        showsUserLocation={true}
        followsUserLocation={true}
      >
        {WAYPOINTS.map((w) => (
          <Circle
            key={`circle-${w.id}`}
            center={{ latitude: w.latitude, longitude: w.longitude }}
            radius={20}
            fillColor={visited[w.id] ? "rgba(34,139,34,0.18)" : "rgba(220,20,60,0.12)"}
            strokeColor={visited[w.id] ? "rgba(34,139,34,0.7)" : "rgba(220,20,60,0.7)"}
            strokeWidth={2}
          />
        ))}

        {WAYPOINTS.map((w) => (
          <Marker
            key={w.id}
            coordinate={{ latitude: w.latitude, longitude: w.longitude }}
            title={w.name}
            pinColor={visited[w.id] ? "green" : "red"}
          />
        ))}
      </MapView>

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
        <View style={styles.cardsRow}>
          {visitOrder.map((wpId, i) => {
            const card = waypointCards[wpId];
            return (
              <View key={wpId} style={styles.cardSlot}>
                {card ? (
                  <Text style={styles.cardText}>{card}</Text>
                ) : (
                  <View style={styles.cardBack} />
                )}
              </View>
            );
          })}
          {Array.from({ length: WAYPOINTS.length - visitOrder.length }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.cardSlot}>
              <View style={styles.cardBack} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// generate a standard 52-card deck as shorthand strings like "AS", "10H", "QD"
function generateDeck(): string[] {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck: string[] = [];
  for (const r of ranks) {
    for (const s of suits) {
      deck.push(`${r}${s}`);
    }
  }
  return deck;
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

