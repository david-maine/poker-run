import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_STORAGE_KEY = "poker-run:pending-waypoint-claims:v1";

export type PendingWaypointClaim = {
  clientClaimId: string;
  eventId: string;
  waypointId: string;
  claimedLat: number;
  claimedLng: number;
  gpsAccuracyMeters: number | null;
  claimedAt: string;
  createdAt: string;
  attemptCount: number;
  lastError: string | null;
};

export function createPendingWaypointClaim(input: {
  eventId: string;
  waypointId: string;
  claimedLat: number;
  claimedLng: number;
  gpsAccuracyMeters: number | null;
}): PendingWaypointClaim {
  const now = new Date().toISOString();

  return {
    clientClaimId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    eventId: input.eventId,
    waypointId: input.waypointId,
    claimedLat: input.claimedLat,
    claimedLng: input.claimedLng,
    gpsAccuracyMeters: input.gpsAccuracyMeters,
    claimedAt: now,
    createdAt: now,
    attemptCount: 0,
    lastError: null,
  };
}

export async function getPendingWaypointClaims(): Promise<PendingWaypointClaim[]> {
  const rawValue = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isPendingWaypointClaim).sort(comparePendingClaims);
  } catch {
    return [];
  }
}

export async function upsertPendingWaypointClaim(claim: PendingWaypointClaim) {
  const claims = await getPendingWaypointClaims();
  const existing = claims.find(
    (pendingClaim) =>
      pendingClaim.eventId === claim.eventId && pendingClaim.waypointId === claim.waypointId
  );

  if (existing) {
    return existing;
  }

  await savePendingWaypointClaims([...claims, claim]);
  return claim;
}

export async function updatePendingWaypointClaim(
  clientClaimId: string,
  patch: Pick<PendingWaypointClaim, "attemptCount" | "lastError">
) {
  const claims = await getPendingWaypointClaims();
  await savePendingWaypointClaims(
    claims.map((claim) => (claim.clientClaimId === clientClaimId ? { ...claim, ...patch } : claim))
  );
}

export async function removePendingWaypointClaim(clientClaimId: string) {
  const claims = await getPendingWaypointClaims();
  await savePendingWaypointClaims(claims.filter((claim) => claim.clientClaimId !== clientClaimId));
}

export async function removePendingWaypointClaimForWaypoint(eventId: string, waypointId: string) {
  const claims = await getPendingWaypointClaims();
  await savePendingWaypointClaims(
    claims.filter((claim) => claim.eventId !== eventId || claim.waypointId !== waypointId)
  );
}

async function savePendingWaypointClaims(claims: PendingWaypointClaim[]) {
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(claims.sort(comparePendingClaims)));
}

function comparePendingClaims(left: PendingWaypointClaim, right: PendingWaypointClaim) {
  return left.createdAt.localeCompare(right.createdAt);
}

function isPendingWaypointClaim(value: unknown): value is PendingWaypointClaim {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PendingWaypointClaim>;
  return (
    typeof candidate.clientClaimId === "string" &&
    typeof candidate.eventId === "string" &&
    typeof candidate.waypointId === "string" &&
    typeof candidate.claimedLat === "number" &&
    typeof candidate.claimedLng === "number" &&
    (typeof candidate.gpsAccuracyMeters === "number" || candidate.gpsAccuracyMeters === null) &&
    typeof candidate.claimedAt === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.attemptCount === "number" &&
    (typeof candidate.lastError === "string" || candidate.lastError === null)
  );
}
