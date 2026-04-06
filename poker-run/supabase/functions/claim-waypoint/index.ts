import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DECK = buildDeck();
const MAX_GPS_ACCURACY_METERS = 65;

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type ClaimWaypointPayload = {
  eventId?: string;
  waypointId?: string;
  claimedLat?: number;
  claimedLng?: number;
  gpsAccuracyMeters?: number | null;
  proofValue?: string | null;
  metadata?: Record<string, Json> | null;
};

type VisitRow = {
  id: string;
  run_id: string;
  waypoint_id: string;
  claimed_at: string;
  accepted_at: string;
  claimed_lat: number;
  claimed_lng: number;
  gps_accuracy_meters: number | null;
  distance_meters: number | null;
  proof_value: string | null;
  assigned_card: string;
  metadata: Record<string, Json>;
};

type RunRow = {
  id: string;
  event_id: string;
  user_id: string;
  display_name: string | null;
  status: "active" | "completed" | "abandoned";
  started_at: string;
  finished_at: string | null;
  last_claim_at: string | null;
  visit_count: number;
  best_hand_name: string;
  best_hand_rank: number;
  best_hand_cards: string[];
  tiebreaker: number[];
};

type WaypointRow = {
  id: string;
  event_id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  sort_order: number;
  proof_type: "gps" | "qr" | "code" | "staff";
  proof_value: string | null;
  is_active: boolean;
};

type EventRow = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "active" | "closed" | "archived";
  starts_at: string | null;
  ends_at: string | null;
};

type ParsedCard = {
  card: string;
  rank: number;
  suit: string;
};

type HandScore = {
  name: string;
  rank: number;
  tiebreaker: number[];
  cards: string[];
};

type PostgrestErrorLike = {
  code?: string;
  message: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const env = getSupabaseEnv();
    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header." }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return jsonResponse({ error: "Missing bearer token." }, 401);
    }

    const authClient = createClient(env.url, env.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Invalid or expired session." }, 401);
    }

    const payload = (await request.json()) as ClaimWaypointPayload;
    const validationError = validatePayload(payload);
    if (validationError) {
      return jsonResponse({ error: validationError }, 400);
    }

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const eventId = payload.eventId!;
    const waypointId = payload.waypointId!;
    const claimedLat = payload.claimedLat!;
    const claimedLng = payload.claimedLng!;
    const gpsAccuracyMeters = payload.gpsAccuracyMeters ?? null;
    const proofValue = normalizeNullableString(payload.proofValue);
    const metadata = payload.metadata ?? {};

    const event = await fetchEvent(admin, eventId);
    if (!event) {
      return jsonResponse({ error: "Event not found." }, 404);
    }

    const timingError = validateEventTiming(event);
    if (timingError) {
      return jsonResponse({ error: timingError }, 409);
    }

    const waypoint = await fetchWaypoint(admin, eventId, waypointId);
    if (!waypoint) {
      return jsonResponse({ error: "Waypoint not found for this event." }, 404);
    }

    const proofError = validateProof(waypoint, proofValue);
    if (proofError) {
      return jsonResponse({ error: proofError }, 400);
    }

    if (gpsAccuracyMeters !== null && gpsAccuracyMeters > MAX_GPS_ACCURACY_METERS) {
      return jsonResponse(
        {
          error: `GPS accuracy is too low for a claim. Move to a clearer area and try again.`,
          gpsAccuracyMeters,
          maxAllowedAccuracyMeters: MAX_GPS_ACCURACY_METERS,
        },
        422
      );
    }

    const distanceMeters = haversineMeters(
      claimedLat,
      claimedLng,
      waypoint.latitude,
      waypoint.longitude
    );

    if (distanceMeters > waypoint.radius_meters) {
      return jsonResponse(
        {
          error: "Player is outside the waypoint claim radius.",
          distanceMeters,
          radiusMeters: waypoint.radius_meters,
        },
        422
      );
    }

    const run = await upsertRun(admin, eventId, user.id);
    if (run.status !== "active") {
      return jsonResponse({ error: "This run is no longer active." }, 409);
    }

    const totalWaypoints = await countActiveWaypoints(admin, eventId);

    let insertedVisit: VisitRow | null = null;
    let allVisits: VisitRow[] = [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const visits = await fetchVisits(admin, run.id);

      if (visits.some((visit) => visit.waypoint_id === waypoint.id)) {
        return jsonResponse(
          {
            error: "Waypoint already claimed for this run.",
            run,
            visits,
          },
          409
        );
      }

      const availableCards = DECK.filter(
        (card) => !visits.some((visit) => visit.assigned_card === card)
      );

      if (availableCards.length === 0) {
        return jsonResponse({ error: "No cards remain for this run." }, 409);
      }

      const assignedCard = pickRandom(availableCards);
      const { data, error } = await admin
        .from("visits")
        .insert({
          run_id: run.id,
          waypoint_id: waypoint.id,
          claimed_lat: claimedLat,
          claimed_lng: claimedLng,
          gps_accuracy_meters: gpsAccuracyMeters,
          distance_meters: Number(distanceMeters.toFixed(2)),
          proof_value: proofValue,
          assigned_card: assignedCard,
          metadata,
        })
        .select("*")
        .single();

      if (!error && data) {
        insertedVisit = data;
        allVisits = [...visits, data];
        break;
      }

      if (isUniqueViolation(error, "visits_run_id_waypoint_id_key")) {
        return jsonResponse({ error: "Waypoint already claimed for this run." }, 409);
      }

      if (isUniqueViolation(error, "visits_run_id_assigned_card_key")) {
        continue;
      }

      throw error;
    }

    if (!insertedVisit) {
      return jsonResponse({ error: "Failed to assign a unique card. Please retry." }, 409);
    }

    allVisits = allVisits.length > 0 ? allVisits : await fetchVisits(admin, run.id);
    const assignedCards = allVisits.map((visit) => visit.assigned_card);
    const bestHand = evaluateBestHand(assignedCards);
    const visitCount = allVisits.length;
    const runComplete = totalWaypoints > 0 && visitCount >= totalWaypoints;

    const { data: updatedRunData, error: updateRunError } = await admin
      .from("runs")
      .update({
        last_claim_at: insertedVisit.accepted_at,
        visit_count: visitCount,
        status: runComplete ? "completed" : "active",
        finished_at: runComplete ? insertedVisit.accepted_at : null,
        best_hand_name: bestHand.name,
        best_hand_rank: bestHand.rank,
        best_hand_cards: bestHand.cards,
        tiebreaker: bestHand.tiebreaker,
      })
      .eq("id", run.id)
      .select("*")
      .single();

    const updatedRun = updatedRunData as RunRow | null;

    if (updateRunError || !updatedRun) {
      throw updateRunError ?? new Error("Run update failed.");
    }

    const { data: leaderboardEntry, error: leaderboardError } = await admin
      .from("leaderboard_entries")
      .select("*")
      .eq("run_id", updatedRun.id)
      .maybeSingle();

    if (leaderboardError) {
      throw leaderboardError;
    }

    return jsonResponse({
      event: {
        id: event.id,
        slug: event.slug,
        name: event.name,
      },
      waypoint: {
        id: waypoint.id,
        code: waypoint.code,
        name: waypoint.name,
        sortOrder: waypoint.sort_order,
        radiusMeters: waypoint.radius_meters,
      },
      claim: {
        visitId: insertedVisit.id,
        assignedCard: insertedVisit.assigned_card,
        acceptedAt: insertedVisit.accepted_at,
        distanceMeters: insertedVisit.distance_meters,
      },
      run: {
        id: updatedRun.id,
        eventId: updatedRun.event_id,
        userId: updatedRun.user_id,
        status: updatedRun.status,
        startedAt: updatedRun.started_at,
        finishedAt: updatedRun.finished_at,
        visitCount: updatedRun.visit_count,
        bestHandName: updatedRun.best_hand_name,
        bestHandRank: updatedRun.best_hand_rank,
        bestHandCards: updatedRun.best_hand_cards,
        tiebreaker: updatedRun.tiebreaker,
      },
      visits: allVisits
        .sort((left, right) => left.accepted_at.localeCompare(right.accepted_at))
        .map((visit) => ({
          id: visit.id,
          waypointId: visit.waypoint_id,
          assignedCard: visit.assigned_card,
          acceptedAt: visit.accepted_at,
          distanceMeters: visit.distance_meters,
        })),
      leaderboardEntry,
    });
  } catch (error) {
    console.error("claim-waypoint failed", error);

    const message =
      error instanceof Error ? error.message : "Unexpected error while claiming waypoint.";

    return jsonResponse({ error: message }, 500);
  }
});

function getSupabaseEnv() {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in function environment."
    );
  }

  return { url, anonKey, serviceRoleKey };
}

function validatePayload(payload: ClaimWaypointPayload) {
  if (!payload || typeof payload !== "object") {
    return "Request body must be a JSON object.";
  }

  if (!payload.eventId) {
    return "eventId is required.";
  }

  if (!payload.waypointId) {
    return "waypointId is required.";
  }

  if (typeof payload.claimedLat !== "number" || Number.isNaN(payload.claimedLat)) {
    return "claimedLat must be a number.";
  }

  if (typeof payload.claimedLng !== "number" || Number.isNaN(payload.claimedLng)) {
    return "claimedLng must be a number.";
  }

  if (
    payload.gpsAccuracyMeters !== undefined &&
    payload.gpsAccuracyMeters !== null &&
    (typeof payload.gpsAccuracyMeters !== "number" || Number.isNaN(payload.gpsAccuracyMeters))
  ) {
    return "gpsAccuracyMeters must be a number when provided.";
  }

  if (
    payload.metadata !== undefined &&
    payload.metadata !== null &&
    (typeof payload.metadata !== "object" || Array.isArray(payload.metadata))
  ) {
    return "metadata must be an object when provided.";
  }

  return null;
}

async function fetchEvent(client: ReturnType<typeof createClient>, eventId: string) {
  const { data, error } = await client
    .from("events")
    .select("id, slug, name, status, starts_at, ends_at")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as EventRow | null) ?? null;
}

async function fetchWaypoint(
  client: ReturnType<typeof createClient>,
  eventId: string,
  waypointId: string
) {
  const { data, error } = await client
    .from("waypoints")
    .select(
      "id, event_id, code, name, latitude, longitude, radius_meters, sort_order, proof_type, proof_value, is_active"
    )
    .eq("id", waypointId)
    .eq("event_id", eventId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as WaypointRow | null) ?? null;
}

async function upsertRun(
  client: ReturnType<typeof createClient>,
  eventId: string,
  userId: string
) {
  const { data, error } = await client
    .from("runs")
    .upsert(
      {
        event_id: eventId,
        user_id: userId,
      },
      {
        onConflict: "event_id,user_id",
        ignoreDuplicates: false,
      }
    )
    .select("*")
    .single();

  const run = data as RunRow | null;

  if (error || !run) {
    throw error ?? new Error("Failed to create or fetch run.");
  }

  return run;
}

async function countActiveWaypoints(client: ReturnType<typeof createClient>, eventId: string) {
  const { count, error } = await client
    .from("waypoints")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function fetchVisits(client: ReturnType<typeof createClient>, runId: string) {
  const { data, error } = await client
    .from("visits")
    .select("*")
    .eq("run_id", runId)
    .order("accepted_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as VisitRow[];
}

function validateEventTiming(event: EventRow) {
  if (event.status !== "active") {
    return "This event is not currently accepting waypoint claims.";
  }

  const now = Date.now();
  if (event.starts_at && Date.parse(event.starts_at) > now) {
    return "This event has not started yet.";
  }

  if (event.ends_at && Date.parse(event.ends_at) < now) {
    return "This event has already ended.";
  }

  return null;
}

function validateProof(waypoint: WaypointRow, proofValue: string | null) {
  if (waypoint.proof_type === "gps") {
    return null;
  }

  if (!proofValue) {
    return "This waypoint requires a proof value.";
  }

  if (!waypoint.proof_value) {
    return null;
  }

  if (waypoint.proof_type === "code") {
    return waypoint.proof_value.toLowerCase() === proofValue.toLowerCase()
      ? null
      : "Invalid waypoint code.";
  }

  return waypoint.proof_value === proofValue ? null : "Invalid waypoint proof value.";
}

function normalizeNullableString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isUniqueViolation(error: PostgrestErrorLike | null, constraint: string) {
  return error?.code === "23505" && error.message.includes(constraint);
}

function buildDeck() {
  const suits = ["S", "H", "D", "C"];
  const ranks = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
  const cards: string[] = [];

  for (const rank of ranks) {
    for (const suit of suits) {
      cards.push(`${rank}${suit}`);
    }
  }

  return cards;
}

function pickRandom<T>(values: T[]) {
  const index = crypto.getRandomValues(new Uint32Array(1))[0] % values.length;
  return values[index];
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function evaluateBestHand(cards: string[]): HandScore {
  if (cards.length === 0) {
    return {
      name: "Unranked",
      rank: 0,
      tiebreaker: [],
      cards: [],
    };
  }

  if (cards.length < 5) {
    return evaluatePartialHand(cards);
  }

  const combinations = chooseFive(cards);
  let best: HandScore | null = null;

  for (const combo of combinations) {
    const score = evaluateFiveCardHand(combo);

    if (!best || compareScores(score, best) > 0) {
      best = score;
    }
  }

  return best!;
}

function evaluatePartialHand(cards: string[]): HandScore {
  const parsed = cards.map(parseCard).sort((left, right) => right.rank - left.rank);
  const rankGroups = getRankGroups(parsed);
  const counts = rankGroups.map((group) => group.length).sort((left, right) => right - left);

  if (counts[0] === 4) {
    const quad = rankGroups.find((group) => group.length === 4)!;
    const kicker = rankGroups.find((group) => group.length === 1)?.[0];
    return {
      name: "Four of a Kind",
      rank: 8,
      tiebreaker: [quad[0].rank, kicker?.rank ?? 0],
      cards: sortCards(parsed).map((card) => card.card),
    };
  }

  if (counts[0] === 3) {
    const trips = rankGroups.find((group) => group.length === 3)!;
    const kickers = rankGroups
      .filter((group) => group.length === 1)
      .flat()
      .sort((left, right) => right.rank - left.rank)
      .map((card) => card.rank);

    return {
      name: "Three of a Kind",
      rank: 4,
      tiebreaker: [trips[0].rank, ...kickers],
      cards: sortCards(parsed).map((card) => card.card),
    };
  }

  const pairs = rankGroups
    .filter((group) => group.length === 2)
    .sort((left, right) => right[0].rank - left[0].rank);

  if (pairs.length >= 2) {
    const kicker = rankGroups.find((group) => group.length === 1)?.[0];
    return {
      name: "Two Pair",
      rank: 3,
      tiebreaker: [pairs[0][0].rank, pairs[1][0].rank, kicker?.rank ?? 0],
      cards: sortCards(parsed).map((card) => card.card),
    };
  }

  if (pairs.length === 1) {
    const kickers = rankGroups
      .filter((group) => group.length === 1)
      .flat()
      .sort((left, right) => right.rank - left.rank)
      .map((card) => card.rank);

    return {
      name: "Pair",
      rank: 2,
      tiebreaker: [pairs[0][0].rank, ...kickers],
      cards: sortCards(parsed).map((card) => card.card),
    };
  }

  return {
    name: "High Card",
    rank: 1,
    tiebreaker: parsed.map((card) => card.rank),
    cards: sortCards(parsed).map((card) => card.card),
  };
}

function evaluateFiveCardHand(cards: string[]): HandScore {
  const parsed = cards.map(parseCard);
  const sortedCards = sortCards(parsed);
  const rankGroups = getRankGroups(parsed);
  const isFlush = new Set(parsed.map((card) => card.suit)).size === 1;
  const straightHigh = getStraightHigh(parsed);

  if (isFlush && straightHigh === 14) {
    const royalRanks = new Set(sortedCards.map((card) => card.rank));
    if ([14, 13, 12, 11, 10].every((rank) => royalRanks.has(rank))) {
      return {
        name: "Royal Flush",
        rank: 10,
        tiebreaker: [14],
        cards: sortedCards.map((card) => card.card),
      };
    }
  }

  if (isFlush && straightHigh) {
    return {
      name: "Straight Flush",
      rank: 9,
      tiebreaker: [straightHigh],
      cards: sortStraightCards(parsed, straightHigh).map((card) => card.card),
    };
  }

  const fourGroup = rankGroups.find((group) => group.length === 4);
  if (fourGroup) {
    const kicker = rankGroups.find((group) => group.length === 1)![0];
    return {
      name: "Four of a Kind",
      rank: 8,
      tiebreaker: [fourGroup[0].rank, kicker.rank],
      cards: [...fourGroup, kicker].map((card) => card.card),
    };
  }

  const threeGroup = rankGroups.find((group) => group.length === 3);
  const pairGroup = rankGroups.find((group) => group.length === 2);
  if (threeGroup && pairGroup) {
    return {
      name: "Full House",
      rank: 7,
      tiebreaker: [threeGroup[0].rank, pairGroup[0].rank],
      cards: [...threeGroup, ...pairGroup].map((card) => card.card),
    };
  }

  if (isFlush) {
    return {
      name: "Flush",
      rank: 6,
      tiebreaker: sortedCards.map((card) => card.rank),
      cards: sortedCards.map((card) => card.card),
    };
  }

  if (straightHigh) {
    return {
      name: "Straight",
      rank: 5,
      tiebreaker: [straightHigh],
      cards: sortStraightCards(parsed, straightHigh).map((card) => card.card),
    };
  }

  if (threeGroup) {
    const kickers = rankGroups
      .filter((group) => group.length === 1)
      .flat()
      .sort((left, right) => right.rank - left.rank);

    return {
      name: "Three of a Kind",
      rank: 4,
      tiebreaker: [threeGroup[0].rank, ...kickers.map((card) => card.rank)],
      cards: [...threeGroup, ...kickers].map((card) => card.card),
    };
  }

  const pairGroups = rankGroups
    .filter((group) => group.length === 2)
    .sort((left, right) => right[0].rank - left[0].rank);

  if (pairGroups.length === 2) {
    const kicker = rankGroups.find((group) => group.length === 1)![0];
    return {
      name: "Two Pair",
      rank: 3,
      tiebreaker: [pairGroups[0][0].rank, pairGroups[1][0].rank, kicker.rank],
      cards: [...pairGroups[0], ...pairGroups[1], kicker].map((card) => card.card),
    };
  }

  if (pairGroups.length === 1) {
    const kickers = rankGroups
      .filter((group) => group.length === 1)
      .flat()
      .sort((left, right) => right.rank - left.rank);

    return {
      name: "Pair",
      rank: 2,
      tiebreaker: [pairGroups[0][0].rank, ...kickers.map((card) => card.rank)],
      cards: [...pairGroups[0], ...kickers].map((card) => card.card),
    };
  }

  return {
    name: "High Card",
    rank: 1,
    tiebreaker: sortedCards.map((card) => card.rank),
    cards: sortedCards.map((card) => card.card),
  };
}

function compareScores(left: HandScore, right: HandScore) {
  if (left.rank !== right.rank) {
    return left.rank > right.rank ? 1 : -1;
  }

  const length = Math.max(left.tiebreaker.length, right.tiebreaker.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left.tiebreaker[index] ?? 0;
    const rightValue = right.tiebreaker[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue > rightValue ? 1 : -1;
    }
  }

  return 0;
}

function chooseFive(cards: string[]) {
  const combinations: string[][] = [];

  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            combinations.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          }
        }
      }
    }
  }

  return combinations;
}

function parseCard(card: string): ParsedCard {
  const match = card.match(/^(10|[2-9JQKA])([SHDC])$/);
  if (!match) {
    throw new Error(`Invalid card format: ${card}`);
  }

  return {
    card,
    rank: rankValue(match[1]),
    suit: match[2],
  };
}

function rankValue(rank: string) {
  switch (rank) {
    case "A":
      return 14;
    case "K":
      return 13;
    case "Q":
      return 12;
    case "J":
      return 11;
    default:
      return Number(rank);
  }
}

function getRankGroups(cards: ParsedCard[]) {
  const grouped = new Map<number, ParsedCard[]>();

  for (const card of cards) {
    const existing = grouped.get(card.rank) ?? [];
    existing.push(card);
    grouped.set(card.rank, existing);
  }

  return [...grouped.values()].sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }

    return right[0].rank - left[0].rank;
  });
}

function getStraightHigh(cards: ParsedCard[]) {
  const uniqueRanks = [...new Set(cards.map((card) => card.rank))].sort((left, right) => right - left);

  if (uniqueRanks.length !== 5) {
    return null;
  }

  const regularStraight = uniqueRanks.every((rank, index) =>
    index === 0 ? true : uniqueRanks[index - 1] - rank === 1
  );

  if (regularStraight) {
    return uniqueRanks[0];
  }

  const wheel = [14, 5, 4, 3, 2];
  return wheel.every((rank, index) => uniqueRanks[index] === rank) ? 5 : null;
}

function sortCards(cards: ParsedCard[]) {
  return [...cards].sort((left, right) => {
    if (right.rank !== left.rank) {
      return right.rank - left.rank;
    }

    return right.suit.localeCompare(left.suit);
  });
}

function sortStraightCards(cards: ParsedCard[], straightHigh: number) {
  if (straightHigh === 5) {
    const wheelOrder = new Map([
      [5, 5],
      [4, 4],
      [3, 3],
      [2, 2],
      [14, 1],
    ]);

    return [...cards].sort(
      (left, right) => (wheelOrder.get(right.rank) ?? 0) - (wheelOrder.get(left.rank) ?? 0)
    );
  }

  return sortCards(cards);
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
