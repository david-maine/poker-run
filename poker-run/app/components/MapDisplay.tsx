import React from "react";
import MapView, { Marker, Circle, Region } from "react-native-maps";
import { View } from "react-native";
import { Waypoint } from "../types";

type UserLocation = { latitude: number; longitude: number } | null;

type Props = {
  waypoints: Waypoint[];
  visited: Record<string, boolean>;
  userLocation: UserLocation;
};

export default function MapDisplay({ waypoints, visited, userLocation }: Props) {
  const initialRegion: Region = userLocation
    ? {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.00922,
        longitudeDelta: 0.00421,
      }
    : {
        latitude: waypoints[0]?.latitude ?? 0,
        longitude: waypoints[0]?.longitude ?? 0,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };

  return (
    <View style={{ width: "100%", height: "100%" }}>
      <MapView style={{ width: "100%", height: "100%" }} initialRegion={initialRegion} showsUserLocation={true} followsUserLocation={true}>
        {waypoints.map((w) => (
          <Circle
            key={`circle-${w.id}`}
            center={{ latitude: w.latitude, longitude: w.longitude }}
            radius={w.radiusMeters ?? 20}
            fillColor={visited[w.id] ? "rgba(34,139,34,0.18)" : "rgba(220,20,60,0.12)"}
            strokeColor={visited[w.id] ? "rgba(34,139,34,0.7)" : "rgba(220,20,60,0.7)"}
            strokeWidth={2}
          />
        ))}

        {waypoints.map((w) => (
          <Marker key={w.id} coordinate={{ latitude: w.latitude, longitude: w.longitude }} title={w.name} pinColor={visited[w.id] ? "green" : "red"} />
        ))}
      </MapView>
    </View>
  );
}
