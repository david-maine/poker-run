import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

import { supabase, supabaseAnonKey } from "./supabase";
import { Waypoint } from "../types";

type GameEventRow = {
  id: string;
  slug: string;
  name: string;
};

type AppSettingsRow = {
  current_event_id: string | null;
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
  display_name?: string | null;
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

type RegistrationRunRow = {
  id: string;
  display_name: string | null;
  visit_count: number;
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

export type RegistrationState = {
  event: GameEvent | null;
  currentUserId: string | null;
  vesselName: string | null;
  isRegistered: boolean;
  requiresRegistration: boolean;
};

export type ClaimWaypointInput = {
  clientClaimId: string;
  eventId: string;
  waypointId: string;
  claimedLat: number;
  claimedLng: number;
  gpsAccuracyMeters: number | null;
  claimedAt: string;
};

type ClaimWaypointError = Error & {
  retryable?: boolean;
  alreadyClaimed?: boolean;
};

export async function loadRegistrationState(): Promise<RegistrationState> {
  const event = await fetchActiveEvent();
  const sessionUser = await getSessionUser();
  const user = sessionUser ?? null;

  if (!event) {
    return {
      event: null,
      currentUserId: user?.id ?? null,
      vesselName: null,
      isRegistered: true,
      requiresRegistration: false,
    };
  }

  const run = await fetchRegistrationRun(event.id);
  const vesselName = normalizeVesselName(run?.display_name ?? null);
  const isRegistered = vesselName !== null;

  return {
    event,
    currentUserId: user?.id ?? null,
    vesselName,
    isRegistered,
    requiresRegistration: !isRegistered,
  };
}

export async function registerVesselName(vesselName: string): Promise<RegistrationState> {
  const trimmedName = normalizeVesselName(vesselName);

  if (!trimmedName) {
    throw new Error("Vessel name is required.");
  }

  if (trimmedName.length > 40) {
    throw new Error("Vessel name must be 40 characters or fewer.");
  }

  const event = await fetchActiveEvent();
  if (!event) {
    throw new Error("No active event is available for registration.");
  }

  const user = await getSessionUser();

  if (!user) {
    throw new Error("You are not signed in. Restart the app and try again.");
  }

  const existingRun = await fetchRegistrationRun(event.id);
  const existingName = normalizeVesselName(existingRun?.display_name ?? null);

  if (existingName) {
    if (existingName === trimmedName) {
      return {
        event,
        currentUserId: user.id,
        vesselName: existingName,
        isRegistered: true,
        requiresRegistration: false,
      };
    }

    throw new Error("A vessel name is already locked for this event.");
  }

  if ((existingRun?.visit_count ?? 0) > 0) {
    throw new Error("Vessel name cannot be added after waypoint claims have started.");
  }

  const { error } = await supabase
    .from("runs")
    .upsert(
      {
        event_id: event.id,
        user_id: user.id,
        display_name: trimmedName,
      },
      {
        onConflict: "event_id,user_id",
        ignoreDuplicates: false,
      }
    )
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return {
    event,
    currentUserId: user.id,
    vesselName: trimmedName,
    isRegistered: true,
    requiresRegistration: false,
  };
}

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
  const user = await getSessionUser();

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

async function getSessionUser() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return session?.user ?? null;
}

export async function claimWaypoint(input: ClaimWaypointInput, waypoints: Waypoint[]) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session?.access_token) {
    throw new Error("You are not signed in. Restart the app and try again.");
  }

  if (!supabaseAnonKey) {
    throw new Error("Missing Supabase anon key.");
  }

  const { data, error } = await supabase.functions.invoke("claim-waypoint", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
    },
    body: {
      eventId: input.eventId,
      waypointId: input.waypointId,
      claimedLat: input.claimedLat,
      claimedLng: input.claimedLng,
      gpsAccuracyMeters: input.gpsAccuracyMeters,
      claimedAt: input.claimedAt,
      clientClaimId: input.clientClaimId,
      metadata: {
        source: "mobile-app",
        clientClaimId: input.clientClaimId,
      },
    },
  });

  if (error) {
    throw await toReadableFunctionError(error);
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

async function toReadableFunctionError(error: unknown) {
  if (error instanceof FunctionsFetchError) {
    return createClaimWaypointError(
      "Unable to reach the claim service. Check your internet connection and try again.",
      { retryable: true }
    );
  }

  if (error instanceof FunctionsRelayError) {
    return createClaimWaypointError(
      "Supabase could not reach the claim service. Please try again shortly.",
      { retryable: true }
    );
  }

  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response | undefined;

    if (response?.status === 401) {
      return new Error("Your session was rejected by the claim service. Restart the app and try again.");
    }

    if (response) {
      try {
        const payload = (await response.clone().json()) as { error?: unknown };
        if (typeof payload.error === "string" && payload.error.length > 0) {
          return createClaimWaypointError(payload.error, {
            alreadyClaimed: payload.error.toLowerCase().includes("already claimed"),
          });
        }
      } catch {
        try {
          const text = await response.clone().text();
          if (text.trim().length > 0) {
            return createClaimWaypointError(text.trim());
          }
        } catch {
          // Fall through to the generic message below.
        }
      }
    }

    return new Error("The claim service rejected this waypoint visit.");
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Unexpected claim failure.");
}

export function isRetryableClaimError(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as ClaimWaypointError).retryable);
}

export function isAlreadyClaimedError(error: unknown) {
  return Boolean(
    error && typeof error === "object" && (error as ClaimWaypointError).alreadyClaimed
  );
}

function createClaimWaypointError(
  message: string,
  options: { retryable?: boolean; alreadyClaimed?: boolean } = {}
): ClaimWaypointError {
  const error = new Error(message) as ClaimWaypointError;
  error.retryable = options.retryable;
  error.alreadyClaimed = options.alreadyClaimed;
  return error;
}

async function fetchActiveEvent(): Promise<GameEvent | null> {
  const { data: settingsData, error: settingsError } = await supabase
    .from("app_settings")
    .select("current_event_id")
    .eq("id", true)
    .maybeSingle();

  if (settingsError) {
    throw settingsError;
  }

  const currentEventId =
    (settingsData as AppSettingsRow | null)?.current_event_id ?? null;

  if (!currentEventId) {
    return null;
  }

  const { data, error } = await supabase
    .from("events")
    .select("id, slug, name")
    .eq("id", currentEventId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as GameEventRow | null;
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

async function fetchRegistrationRun(eventId: string): Promise<RegistrationRunRow | null> {
  const { data, error } = await supabase
    .from("runs")
    .select("id, display_name, visit_count")
    .eq("event_id", eventId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as RegistrationRunRow | null) ?? null;
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

function normalizeVesselName(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
