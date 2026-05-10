import { StyleSheet, Text, View } from "react-native";

import { Waypoint } from "../types";

type UserLocation = { latitude: number; longitude: number } | null;

type Props = {
  waypoints: Waypoint[];
  visited: Record<string, boolean>;
  userLocation: UserLocation;
};

export default function MapDisplay({ waypoints, visited, userLocation }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <Text style={styles.title}>Map preview unavailable on web</Text>
        <Text style={styles.meta}>
          {userLocation
            ? `Current position ${userLocation.latitude.toFixed(5)}, ${userLocation.longitude.toFixed(5)}`
            : "Waiting for location"}
        </Text>
        <View style={styles.list}>
          {waypoints.map((waypoint) => (
            <View key={waypoint.id} style={styles.row}>
              <View
                style={[
                  styles.dot,
                  visited[waypoint.id] ? styles.dotVisited : styles.dotOpen,
                ]}
              />
              <Text style={styles.rowText}>
                {waypoint.name} | {waypoint.latitude.toFixed(5)},{" "}
                {waypoint.longitude.toFixed(5)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#20262d",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  panel: {
    backgroundColor: "#2f353d",
    borderColor: "#454b54",
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 520,
    padding: 16,
    width: "100%",
  },
  title: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  meta: {
    color: "#c7d1d8",
    fontSize: 13,
    marginTop: 6,
  },
  list: {
    gap: 8,
    marginTop: 14,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    borderRadius: 999,
    height: 9,
    width: 9,
  },
  dotOpen: {
    backgroundColor: "#ff8a80",
  },
  dotVisited: {
    backgroundColor: "#81c784",
  },
  rowText: {
    color: "#ffffff",
    flex: 1,
    fontSize: 13,
  },
});
