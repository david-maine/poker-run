import { supabase } from "./supabase";
import { Waypoint } from "../types";

type GameEventRow = {
  id: string;
  slug: string;
  name: string;
};

type WaypointRow = {
  id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  sort_order: number;
};

type RunRow = {
  id: string;
  status: "active" | "completed" | "abandoned";
  visit_count: number;
  best_hand_name: string;
  best_hand_cards: string[];
};

type VisitRow = {
  id: string;
  waypoint_id: string;
  assigned_card: string;
  accepted_at: string;
  distance_meters: number | null;
};

type ClaimWaypointResponse = {
  run: {
    id: string;
    status: "active" | "completed" | "abandoned";
    visitCount: number;
    bestHandName: string;
    bestHandCards: string[];
  };
  visits: {
    id: string;
    waypointId: string;
    assignedCard: string;
    acceptedAt: string;
    distanceMeters: number | null;
  }[];
};

export type GameEvent = {
  id: string;
  slug: string;
  name: string;
};

export type RunSnapshot = {
  runId: string | null;
  runStatus: "active" | "completed" | "abandoned" | null;
  visitCount: number;
  bestHandName: string;
  bestHandCards: string[];
  visitOrder: string[];
  visited: Record<string, boolean>;
  waypointCards: Record<string, string | null>;
};

export type GameBootstrap = {
  event: GameEvent;
  waypoints: Waypoint[];
  snapshot: RunSnapshot;
};

type LeaderboardEntryRow = {
  event_id: string;
  event_slug: string;
  event_name: string;
  run_id: string;
  user_id: string;
  player_label: string;
  run_status: "active" | "completed" | "abandoned";
  started_at: string;
  finished_at: string | null;
  visit_count: number;
  best_hand_name: string;
  best_hand_rank: number;
  best_hand_cards: string[];
  tiebreaker: number[];
  leaderboard_rank: number;
};

export type LeaderboardEntry = {
  eventId: string;
  eventSlug: string;
  eventName: string;
  runId: string;
  userId: string;
  playerLabel: string;
  runStatus: "active" | "completed" | "abandoned";
  startedAt: string;
  finishedAt: string | null;
  visitCount: number;
  bestHandName: string;
  bestHandRank: number;
  bestHandCards: string[];
  tiebreaker: number[];
  leaderboardRank: number;
};

export type LeaderboardSnapshot = {
  event: GameEvent | null;
  entries: LeaderboardEntry[];
  currentUserId: string | null;
};

type ClaimWaypointInput = {
  eventId: string;
  waypointId: string;
  claimedLat: number;
  claimedLng: number;
  gpsAccuracyMeters: number | null;
};

const configuredEventSlug = process.env.EXPO_PUBLIC_EVENT_SLUG;

export async function loadGameBootstrap(): Promise<GameBootstrap | null> {
  const event = await fetchActiveEvent();

  if (!event) {
    return null;
  }

  const waypoints = await fetchWaypoints(event.id);
  const snapshot = await loadRunSnapshot(event.id, waypoints);

  return {
    event,
    waypoints,
    snapshot,
  };
}

export async function refreshRunSnapshot(eventId: string, waypoints: Waypoint[]) {
  return loadRunSnapshot(eventId, waypoints);
}

export async function loadLeaderboardSnapshot(): Promise<LeaderboardSnapshot> {
  const event = await fetchActiveEvent();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!event) {
    return {
      event: null,
      entries: [],
      currentUserId: user?.id ?? null,
    };
  }

  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select(
      "event_id, event_slug, event_name, run_id, user_id, player_label, run_status, started_at, finished_at, visit_count, best_hand_name, best_hand_rank, best_hand_cards, tiebreaker, leaderboard_rank"
    )
    .eq("event_id", event.id)
    .order("leaderboard_rank", { ascending: true });

  if (error) {
    throw error;
  }

  return {
    event,
    entries: ((data as LeaderboardEntryRow[] | null) ?? []).map((entry) => ({
      eventId: entry.event_id,
      eventSlug: entry.event_slug,
      eventName: entry.event_name,
      runId: entry.run_id,
      userId: entry.user_id,
      playerLabel: entry.player_label,
      runStatus: entry.run_status,
      startedAt: entry.started_at,
      finishedAt: entry.finished_at,
      visitCount: entry.visit_count,
      bestHandName: entry.best_hand_name,
      bestHandRank: entry.best_hand_rank,
      bestHandCards: entry.best_hand_cards,
      tiebreaker: entry.tiebreaker,
      leaderboardRank: entry.leaderboard_rank,
    })),
    currentUserId: user?.id ?? null,
  };
}

export async function claimWaypoint(input: ClaimWaypointInput, waypoints: Waypoint[]) {
  const { data, error } = await supabase.functions.invoke("claim-waypoint", {
    body: {
      eventId: input.eventId,
      waypointId: input.waypointId,
      claimedLat: input.claimedLat,
      claimedLng: input.claimedLng,
      gpsAccuracyMeters: input.gpsAccuracyMeters,
      metadata: {
        source: "mobile-app",
      },
    },
  });

  if (error) {
    throw error;
  }

  const response = data as ClaimWaypointResponse;
  return hydrateSnapshotFromVisits(
    waypoints,
    response.visits.map((visit) => ({
      id: visit.id,
      waypoint_id: visit.waypointId,
      assigned_card: visit.assignedCard,
      accepted_at: visit.acceptedAt,
      distance_meters: visit.distanceMeters,
    })),
    {
      id: response.run.id,
      status: response.run.status,
      visit_count: response.run.visitCount,
      best_hand_name: response.run.bestHandName,
      best_hand_cards: response.run.bestHandCards,
    }
  );
}

async function fetchActiveEvent(): Promise<GameEvent | null> {
  let query = supabase.from("events").select("id, slug, name").eq("status", "active");

  if (configuredEventSlug) {
    query = query.eq("slug", configuredEventSlug);
  }

  const { data, error } = await query.order("starts_at", { ascending: true }).limit(1);

  if (error) {
    throw error;
  }

  const row = ((data as GameEventRow[] | null) ?? [])[0];
  return row
    ? {
        id: row.id,
        slug: row.slug,
        name: row.name,
      }
    : null;
}

async function fetchWaypoints(eventId: string): Promise<Waypoint[]> {
  const { data, error } = await supabase
    .from("waypoints")
    .select("id, code, name, latitude, longitude, radius_meters, sort_order")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data as WaypointRow[] | null) ?? []).map((waypoint) => ({
    id: waypoint.id,
    code: waypoint.code,
    name: waypoint.name,
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    radiusMeters: waypoint.radius_meters,
    sortOrder: waypoint.sort_order,
  }));
}

async function loadRunSnapshot(eventId: string, waypoints: Waypoint[]): Promise<RunSnapshot> {
  const { data: runData, error: runError } = await supabase
    .from("runs")
    .select("id, status, visit_count, best_hand_name, best_hand_cards")
    .eq("event_id", eventId)
    .limit(1)
    .maybeSingle();

  if (runError) {
    throw runError;
  }

  const run = runData as RunRow | null;

  if (!run) {
    return createEmptyRunSnapshot(waypoints);
  }

  const { data: visitsData, error: visitsError } = await supabase
    .from("visits")
    .select("id, waypoint_id, assigned_card, accepted_at, distance_meters")
    .eq("run_id", run.id)
    .order("accepted_at", { ascending: true });

  if (visitsError) {
    throw visitsError;
  }

  return hydrateSnapshotFromVisits(waypoints, (visitsData as VisitRow[] | null) ?? [], run);
}

function hydrateSnapshotFromVisits(
  waypoints: Waypoint[],
  visits: VisitRow[],
  run?: RunRow | null
): RunSnapshot {
  const visited = createVisitedMap(waypoints);
  const waypointCards = createWaypointCardMap(waypoints);

  for (const visit of visits) {
    visited[visit.waypoint_id] = true;
    waypointCards[visit.waypoint_id] = visit.assigned_card;
  }

  return {
    runId: run?.id ?? null,
    runStatus: run?.status ?? null,
    visitCount: run?.visit_count ?? visits.length,
    bestHandName: run?.best_hand_name ?? "Unranked",
    bestHandCards: run?.best_hand_cards ?? [],
    visitOrder: visits.map((visit) => visit.waypoint_id),
    visited,
    waypointCards,
  };
}

function createEmptyRunSnapshot(waypoints: Waypoint[]): RunSnapshot {
  return {
    runId: null,
    runStatus: null,
    visitCount: 0,
    bestHandName: "Unranked",
    bestHandCards: [],
    visitOrder: [],
    visited: createVisitedMap(waypoints),
    waypointCards: createWaypointCardMap(waypoints),
  };
}

function createVisitedMap(waypoints: Waypoint[]) {
  const visited: Record<string, boolean> = {};

  for (const waypoint of waypoints) {
    visited[waypoint.id] = false;
  }

  return visited;
}

function createWaypointCardMap(waypoints: Waypoint[]) {
  const waypointCards: Record<string, string | null> = {};

  for (const waypoint of waypoints) {
    waypointCards[waypoint.id] = null;
  }

  return waypointCards;
}
