import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

import { evaluateBestHand } from "./cards";
import { LocalCardClaim } from "./localHand";
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

type RegistrationRunRow = {
  id: string;
  display_name: string | null;
  visit_count: number;
  status: "active" | "completed" | "abandoned";
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

type SubmitHandResponse = {
  run: {
    id: string;
    status: "active" | "completed" | "abandoned";
    visitCount: number;
    bestHandName: string;
    bestHandRank: number;
    bestHandCards: string[];
    tiebreaker: number[];
    finishedAt: string | null;
  };
};

type HandSubmissionError = Error & {
  retryable?: boolean;
  alreadySubmitted?: boolean;
};

export type GameEvent = {
  id: string;
  slug: string;
  name: string;
};

export type GameBootstrap = {
  event: GameEvent;
  waypoints: Waypoint[];
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

export async function loadRegistrationState(): Promise<RegistrationState> {
  const event = await fetchActiveEvent();
  const user = (await getSessionUser()) ?? null;

  if (!event) {
    return {
      event: null,
      currentUserId: user?.id ?? null,
      vesselName: null,
      isRegistered: true,
      requiresRegistration: false,
    };
  }

  const run = user ? await fetchRegistrationRun(event.id, user.id) : null;
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

export async function registerVesselNameForEvent(
  event: GameEvent,
  vesselName: string
): Promise<RegistrationState> {
  const trimmedName = normalizeVesselName(vesselName);

  if (!trimmedName) {
    throw new Error("Vessel name is required.");
  }

  if (trimmedName.length > 40) {
    throw new Error("Vessel name must be 40 characters or fewer.");
  }

  const user = await getSessionUser();

  if (!user) {
    throw new Error("You are not signed in. Restart the app and try again.");
  }

  const existingRun = await fetchRegistrationRun(event.id, user.id);
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

  if ((existingRun?.visit_count ?? 0) > 0 || existingRun?.status === "completed") {
    throw new Error("Vessel name cannot be added after a hand has been submitted.");
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

export async function loadGameBootstrapForEvent(event: GameEvent): Promise<GameBootstrap> {
  return {
    event,
    waypoints: await fetchWaypoints(event.id),
  };
}

export async function submitCompletedHand(eventId: string, claims: LocalCardClaim[]) {
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

  const score = evaluateBestHand(claims.map((claim) => claim.card));
  const { data, error } = await supabase.functions.invoke("submit-hand", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
    },
    body: {
      eventId,
      claims: claims.map((claim) => ({
        waypointId: claim.waypointId,
        card: claim.card,
        claimedAt: claim.claimedAt,
        claimedLat: claim.claimedLat,
        claimedLng: claim.claimedLng,
        gpsAccuracyMeters: claim.gpsAccuracyMeters,
      })),
      clientScore: {
        name: score.name,
        rank: score.rank,
        cards: score.cards,
        tiebreaker: score.tiebreaker,
      },
    },
  });

  if (error) {
    throw await toReadableSubmissionError(error);
  }

  return data as SubmitHandResponse;
}

export async function loadLeaderboardSnapshotForEvent(
  event: GameEvent | null
): Promise<LeaderboardSnapshot> {
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

export function isRetryableHandSubmissionError(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as HandSubmissionError).retryable);
}

export function isAlreadySubmittedError(error: unknown) {
  return Boolean(
    error && typeof error === "object" && (error as HandSubmissionError).alreadySubmitted
  );
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

async function toReadableSubmissionError(error: unknown) {
  if (error instanceof FunctionsFetchError) {
    return createHandSubmissionError(
      "Unable to reach the hand submission service. Check your internet connection and try again.",
      { retryable: true }
    );
  }

  if (error instanceof FunctionsRelayError) {
    return createHandSubmissionError(
      "Supabase could not reach the hand submission service. Please try again shortly.",
      { retryable: true }
    );
  }

  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response | undefined;

    if (response?.status === 401) {
      return new Error("Your session was rejected by the submission service. Restart the app and try again.");
    }

    if (response) {
      try {
        const payload = (await response.clone().json()) as { error?: unknown };
        if (typeof payload.error === "string" && payload.error.length > 0) {
          return createHandSubmissionError(payload.error, {
            alreadySubmitted: payload.error.toLowerCase().includes("already submitted"),
            retryable: response.status >= 500,
          });
        }
      } catch {
        try {
          const text = await response.clone().text();
          if (text.trim().length > 0) {
            return createHandSubmissionError(text.trim(), {
              retryable: response.status >= 500,
            });
          }
        } catch {
          // Fall through to the generic message below.
        }
      }
    }

    return createHandSubmissionError("The submission service rejected this hand.", {
      retryable: response ? response.status >= 500 : false,
    });
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Unexpected hand submission failure.");
}

function createHandSubmissionError(
  message: string,
  options: { retryable?: boolean; alreadySubmitted?: boolean } = {}
): HandSubmissionError {
  const error = new Error(message) as HandSubmissionError;
  error.retryable = options.retryable;
  error.alreadySubmitted = options.alreadySubmitted;
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

async function fetchRegistrationRun(
  eventId: string,
  userId: string
): Promise<RegistrationRunRow | null> {
  const { data, error } = await supabase
    .from("runs")
    .select("id, display_name, visit_count, status")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as RegistrationRunRow | null) ?? null;
}

function normalizeVesselName(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
