import { Session } from "@supabase/supabase-js";

import { supabase } from "./supabase";

export type EventStatus = "draft" | "active" | "closed" | "archived";
export type ProofType = "gps" | "qr" | "code" | "staff";

type AdminProfileRow = {
  user_id: string;
  role: string;
  display_name: string | null;
};

type AdminEventRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: EventStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

type AdminWaypointRow = {
  id: string;
  event_id: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  sort_order: number;
  proof_type: ProofType;
  proof_value: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type AppSettingsRow = {
  current_event_id: string | null;
};

type AdminRunRow = {
  event_id: string;
  status: "active" | "completed" | "abandoned";
  visit_count: number;
};

export type AdminProfile = {
  userId: string;
  role: string;
  displayName: string | null;
};

export type AdminEvent = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: EventStatus;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminWaypoint = {
  id: string;
  eventId: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  sortOrder: number;
  proofType: ProofType;
  proofValue: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EventSummary = {
  eventId: string;
  waypointCount: number;
  activeWaypointCount: number;
  playerCount: number;
  activeRunCount: number;
  completedRunCount: number;
  totalVisitCount: number;
};

export type AdminDashboard = {
  session: Session;
  profile: AdminProfile;
  events: AdminEvent[];
  waypoints: AdminWaypoint[];
  currentEventId: string | null;
  summaries: Record<string, EventSummary>;
};

export type AdminEventInput = {
  id?: string | null;
  name: string;
};

export type AdminWaypointInput = {
  id?: string | null;
  eventId: string;
  slotIndex: number;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

const eventSelect =
  "id, slug, name, description, status, starts_at, ends_at, created_at, updated_at";

const waypointSelect =
  "id, event_id, code, name, latitude, longitude, radius_meters, sort_order, proof_type, proof_value, is_active, created_at, updated_at";

export async function getAdminSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session) {
    return {
      session: null,
      profile: null,
    };
  }

  return {
    session,
    profile: await fetchAdminProfile(session.user.id),
  };
}

export async function signInAdmin(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw error;
  }

  return getAdminSession();
}

export async function signOutAdmin() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function loadAdminDashboard(): Promise<AdminDashboard> {
  const authState = await getAdminSession();

  if (!authState.session) {
    throw new Error("Sign in with an admin account to manage events.");
  }

  if (!authState.profile) {
    throw new Error("This account is not an event admin.");
  }

  const [eventsResult, waypointsResult, runsResult, settingsResult] = await Promise.all([
    supabase
      .from("events")
      .select(eventSelect)
      .order("starts_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("waypoints")
      .select(waypointSelect)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("runs")
      .select("event_id, status, visit_count"),
    supabase
      .from("app_settings")
      .select("current_event_id")
      .eq("id", true)
      .maybeSingle(),
  ]);

  if (eventsResult.error) {
    throw eventsResult.error;
  }

  if (waypointsResult.error) {
    throw waypointsResult.error;
  }

  if (runsResult.error) {
    throw runsResult.error;
  }

  if (settingsResult.error) {
    throw settingsResult.error;
  }

  const events = ((eventsResult.data as AdminEventRow[] | null) ?? []).map(mapEventRow);
  const waypoints = ((waypointsResult.data as AdminWaypointRow[] | null) ?? []).map(mapWaypointRow);
  const runs = (runsResult.data as AdminRunRow[] | null) ?? [];
  const currentEventId =
    ((settingsResult.data as AppSettingsRow | null) ?? null)?.current_event_id ?? null;

  return {
    session: authState.session,
    profile: authState.profile,
    events,
    waypoints,
    currentEventId,
    summaries: buildSummaries(events, waypoints, runs),
  };
}

export async function setCurrentAdminEvent(eventId: string) {
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      {
        id: true,
        current_event_id: eventId,
      },
      {
        onConflict: "id",
      }
    )
    .select("current_event_id")
    .single();

  if (error) {
    throw error;
  }
}

export async function saveAdminEvent(input: AdminEventInput): Promise<AdminEvent> {
  const name = normalizeRequiredText(input.name, "Event name");
  const payload: {
    slug: string;
    name: string;
    description: string | null;
    status?: EventStatus;
  } = {
    slug: createSlug(name),
    name,
    description: null,
  };

  if (!input.id) {
    payload.status = "active";
  }

  const query = input.id
    ? supabase.from("events").update(payload).eq("id", input.id)
    : supabase.from("events").insert(payload);

  const { data, error } = await query.select(eventSelect).single();

  if (error) {
    throw error;
  }

  return mapEventRow(data as AdminEventRow);
}

export async function saveAdminWaypoint(input: AdminWaypointInput): Promise<AdminWaypoint> {
  if (!Number.isInteger(input.slotIndex) || input.slotIndex < 0 || input.slotIndex > 4) {
    throw new Error("Waypoint slot must be between 1 and 5.");
  }

  const slotNumber = input.slotIndex + 1;
  const payload: {
    event_id: string;
    code: string;
    name: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
    sort_order: number;
    proof_type: ProofType;
    proof_value: null;
    is_active: boolean;
  } = {
    event_id: input.eventId,
    code: `wp${slotNumber}`,
    name: `Waypoint ${slotNumber}`,
    latitude: input.latitude,
    longitude: input.longitude,
    radius_meters: input.radiusMeters,
    sort_order: input.slotIndex,
    proof_type: "gps" as ProofType,
    proof_value: null,
    is_active: true,
  };

  if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
    throw new Error("Latitude and longitude must be valid numbers.");
  }

  if (!Number.isInteger(payload.radius_meters) || payload.radius_meters <= 0) {
    throw new Error("Radius must be a positive whole number.");
  }

  const query = input.id
    ? supabase.from("waypoints").update(payload).eq("id", input.id)
    : supabase.from("waypoints").insert(payload);

  const { data, error } = await query.select(waypointSelect).single();

  if (error) {
    throw error;
  }

  return mapWaypointRow(data as AdminWaypointRow);
}

async function fetchAdminProfile(userId: string): Promise<AdminProfile | null> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id, role, display_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as AdminProfileRow | null;

  return row
    ? {
        userId: row.user_id,
        role: row.role,
        displayName: row.display_name,
      }
    : null;
}

function buildSummaries(
  events: AdminEvent[],
  waypoints: AdminWaypoint[],
  runs: AdminRunRow[]
) {
  const summaries: Record<string, EventSummary> = {};

  for (const event of events) {
    summaries[event.id] = {
      eventId: event.id,
      waypointCount: 0,
      activeWaypointCount: 0,
      playerCount: 0,
      activeRunCount: 0,
      completedRunCount: 0,
      totalVisitCount: 0,
    };
  }

  for (const waypoint of waypoints) {
    const summary = summaries[waypoint.eventId];
    if (!summary) {
      continue;
    }

    summary.waypointCount += 1;
    summary.activeWaypointCount += waypoint.isActive ? 1 : 0;
  }

  for (const run of runs) {
    const summary = summaries[run.event_id];
    if (!summary) {
      continue;
    }

    summary.playerCount += 1;
    summary.activeRunCount += run.status === "active" ? 1 : 0;
    summary.completedRunCount += run.status === "completed" ? 1 : 0;
    summary.totalVisitCount += run.visit_count;
  }

  return summaries;
}

function mapEventRow(row: AdminEventRow): AdminEvent {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWaypointRow(row: AdminWaypointRow): AdminWaypoint {
  return {
    id: row.id,
    eventId: row.event_id,
    code: row.code,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMeters: row.radius_meters,
    sortOrder: row.sort_order,
    proofType: row.proof_type,
    proofValue: row.proof_value,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeRequiredText(value: string, label: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function createSlug(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error("Event name must include at least one letter or number.");
  }

  return slug;
}
