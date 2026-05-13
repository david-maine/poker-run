import { Platform } from "react-native";

export function addConnectivityListener(listener: (isUsable: boolean) => void) {
  if (Platform.OS === "web") {
    return addWebConnectivityListener(listener);
  }

  // Avoid touching @react-native-community/netinfo in stale dev clients where RNCNetInfo is null.
  // Native sync still runs from app startup, location updates, manual refresh, and retry results.
  return () => {};
}

export async function fetchIsUsableConnection() {
  if (Platform.OS === "web") {
    return typeof navigator === "undefined" ? true : navigator.onLine;
  }

  return true;
}

function addWebConnectivityListener(listener: (isUsable: boolean) => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleOnline = () => listener(true);
  const handleOffline = () => listener(false);

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}
