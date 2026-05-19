import React from "react";
import { View } from "react-native";
import MapView, { Circle, Marker, Region } from "react-native-maps";

import { Waypoint } from "../src/types";

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
      <MapView
        followsUserLocation={true}
        initialRegion={initialRegion}
        showsUserLocation={true}
        style={{ width: "100%", height: "100%" }}
      >
        {waypoints.map((waypoint) => (
          <Circle
            center={{ latitude: waypoint.latitude, longitude: waypoint.longitude }}
            fillColor={
              visited[waypoint.id] ? "rgba(34,139,34,0.18)" : "rgba(220,20,60,0.12)"
            }
            key={`circle-${waypoint.id}`}
            radius={waypoint.radiusMeters ?? 20}
            strokeColor={
              visited[waypoint.id] ? "rgba(34,139,34,0.7)" : "rgba(220,20,60,0.7)"
            }
            strokeWidth={2}
          />
        ))}

        {waypoints.map((waypoint) => (
          <Marker
            coordinate={{ latitude: waypoint.latitude, longitude: waypoint.longitude }}
            key={waypoint.id}
            pinColor={visited[waypoint.id] ? "green" : "red"}
            title={waypoint.name}
          />
        ))}
      </MapView>
    </View>
  );
}
