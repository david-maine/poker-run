import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import LoadingScreen from "../src/components/LoadingScreen";
import {
  AdminDashboard,
  AdminEvent,
  AdminWaypoint,
  getAdminSession,
  loadAdminDashboard,
  saveAdminEvent,
  saveAdminWaypoint,
  setCurrentAdminEvent,
  signInAdmin,
  signOutAdmin,
} from "../src/lib/admin";

type FeatherName = keyof typeof Feather.glyphMap;

type EventFormState = {
  id: string | null;
  name: string;
};

type WaypointFormState = {
  id: string | null;
  eventId: string;
  slotIndex: number;
  latitude: string;
  longitude: string;
  radiusMeters: string;
};

const waypointSlotIndexes = [0, 1, 2, 3, 4];

const emptyEventForm: EventFormState = {
  id: null,
  name: "",
};

export default function AdminScreen() {
  const { width } = useWindowDimensions();
  const isNarrow = width < 920;

  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<EventFormState>(emptyEventForm);
  const [waypointForm, setWaypointForm] = useState<WaypointFormState>(() =>
    createEmptyWaypointForm("")
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingWaypoint, setSavingWaypoint] = useState(false);
  const [settingCurrentEventId, setSettingCurrentEventId] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialSession() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const authState = await getAdminSession();

        if (!isMounted) {
          return;
        }

        setEmail(authState.session?.user.email ?? "");

        if (!authState.session || !authState.profile) {
          setDashboard(null);
          return;
        }

        const nextDashboard = await loadAdminDashboard();

        if (!isMounted) {
          return;
        }

        const nextSelectedId =
          nextDashboard.currentEventId ??
          nextDashboard.events.find((event) => event.status === "active")?.id ??
          nextDashboard.events[0]?.id ??
          null;

        setDashboard(nextDashboard);
        setSelectedEventId(nextSelectedId);
        setEventForm(
          nextDashboard.events.find((event) => event.id === nextSelectedId)
            ? eventToForm(nextDashboard.events.find((event) => event.id === nextSelectedId)!)
            : emptyEventForm
        );
        setWaypointForm(createEmptyWaypointForm(nextSelectedId ?? ""));
      } catch (error) {
        if (isMounted) {
          setErrorMessage(getErrorMessage(error, "Unable to load admin session."));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadInitialSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedEvent = useMemo(
    () => dashboard?.events.find((event) => event.id === selectedEventId) ?? null,
    [dashboard, selectedEventId]
  );

  const selectedWaypoints = useMemo(() => {
    if (!dashboard || !selectedEvent) {
      return [];
    }

    return dashboard.waypoints
      .filter((waypoint) => waypoint.eventId === selectedEvent.id)
      .sort((first, second) => first.sortOrder - second.sortOrder);
  }, [dashboard, selectedEvent]);

  const selectedWaypointSlots = useMemo(
    () =>
      waypointSlotIndexes.map((slotIndex) => ({
        slotIndex,
        waypoint:
          selectedWaypoints.find((waypoint) => waypoint.sortOrder === slotIndex) ?? null,
      })),
    [selectedWaypoints]
  );

  async function refreshDashboard(showSpinner: boolean, preferredEventId?: string) {
    if (showSpinner) {
      setLoading(true);
    }

    setErrorMessage(null);

    try {
      const nextDashboard = await loadAdminDashboard();
      const nextSelectedId =
        preferredEventId ??
        selectedEventId ??
        nextDashboard.currentEventId ??
        nextDashboard.events.find((event) => event.status === "active")?.id ??
        nextDashboard.events[0]?.id ??
        null;

      setDashboard(nextDashboard);
      setSelectedEventId(nextSelectedId);

      const nextSelectedEvent =
        nextDashboard.events.find((event) => event.id === nextSelectedId) ?? null;
      setEventForm(nextSelectedEvent ? eventToForm(nextSelectedEvent) : emptyEventForm);
      setWaypointForm(createEmptyWaypointForm(nextSelectedId ?? ""));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to load admin dashboard."));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    setSigningIn(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const authState = await signInAdmin(email, password);

      if (!authState.profile) {
        setDashboard(null);
        setErrorMessage("This account is signed in, but it is not an event admin.");
        return;
      }

      setPassword("");
      await refreshDashboard(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to sign in."));
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    setErrorMessage(null);
    setMessage(null);

    try {
      await signOutAdmin();
      setDashboard(null);
      setSelectedEventId(null);
      setPassword("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to sign out."));
    }
  }

  async function handleSaveEvent() {
    setSavingEvent(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const saved = await saveAdminEvent({
        id: eventForm.id,
        name: eventForm.name,
      });

      setMessage(`Saved ${saved.name}.`);
      await refreshDashboard(false, saved.id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to save event."));
    } finally {
      setSavingEvent(false);
    }
  }

  async function handleSaveWaypoint() {
    if (!selectedEvent) {
      return;
    }

    setSavingWaypoint(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const saved = await saveAdminWaypoint({
        id: waypointForm.id,
        eventId: selectedEvent.id,
        slotIndex: waypointForm.slotIndex,
        latitude: parseNumber(waypointForm.latitude, "Latitude"),
        longitude: parseNumber(waypointForm.longitude, "Longitude"),
        radiusMeters: parseInteger(waypointForm.radiusMeters, "Radius"),
      });

      setMessage(`Saved waypoint ${saved.sortOrder + 1}.`);
      await refreshDashboard(false, selectedEvent.id);
      setWaypointForm(waypointToForm(saved));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to save waypoint."));
    } finally {
      setSavingWaypoint(false);
    }
  }

  async function handleSetCurrentEvent(event: AdminEvent) {
    setSettingCurrentEventId(event.id);
    setErrorMessage(null);
    setMessage(null);

    try {
      await setCurrentAdminEvent(event.id);
      setMessage(`Current event set to ${event.name}.`);
      await refreshDashboard(false, event.id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to set the current event."));
    } finally {
      setSettingCurrentEventId(null);
    }
  }

  function selectEvent(event: AdminEvent) {
    setSelectedEventId(event.id);
    setEventForm(eventToForm(event));
    setWaypointForm(createEmptyWaypointForm(event.id));
    setMessage(null);
    setErrorMessage(null);
  }

  function startNewEvent() {
    setSelectedEventId(null);
    setEventForm(emptyEventForm);
    setWaypointForm(createEmptyWaypointForm(""));
    setMessage(null);
    setErrorMessage(null);
  }

  function selectWaypointSlot(slotIndex: number, waypoint: AdminWaypoint | null) {
    setWaypointForm(
      waypoint ? waypointToForm(waypoint) : createEmptyWaypointForm(selectedEventId ?? "", slotIndex)
    );
    setMessage(null);
    setErrorMessage(null);
  }

  if (Platform.OS !== "web") {
    return (
      <View style={styles.centered}>
        <Text style={styles.blockedTitle}>Admin is available on web</Text>
        <Text style={styles.blockedText}>Open this project in a browser and visit /admin.</Text>
      </View>
    );
  }

  if (loading) {
    return <LoadingScreen accessibilityLabel="Loading admin app" />;
  }

  if (!dashboard) {
    return (
      <View style={styles.loginShell}>
        <View style={styles.loginPanel}>
          <Text style={styles.loginTitle}>Poker Run Admin</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="admin@example.com"
            placeholderTextColor="#77808c"
            style={styles.input}
            value={email}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="#77808c"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <ActionButton
            disabled={signingIn}
            icon="log-in"
            label={signingIn ? "Signing in..." : "Sign in"}
            onPress={() => {
              void handleSignIn();
            }}
            variant="primary"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.kicker}>Poker Run Admin</Text>
          <Text style={styles.title}>Events</Text>
        </View>
        <View style={styles.topActions}>
          <ActionButton
            icon="refresh-cw"
            label="Refresh"
            onPress={() => {
              void refreshDashboard(true);
            }}
            variant="secondary"
          />
          <ActionButton
            icon="log-out"
            label="Sign out"
            onPress={() => {
              void handleSignOut();
            }}
            variant="ghost"
          />
        </View>
      </View>

      {message ? <Text style={styles.successText}>{message}</Text> : null}
      {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

      <View style={[styles.workspace, isNarrow ? styles.workspaceNarrow : null]}>
        <View style={[styles.eventRail, isNarrow ? styles.eventRailNarrow : null]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Event List</Text>
            <IconButton
              accessibilityLabel="New event"
              icon="plus"
              onPress={startNewEvent}
            />
          </View>

          <ScrollView contentContainerStyle={styles.eventList}>
            {dashboard.events.length === 0 ? (
              <Text style={styles.emptyText}>No events yet.</Text>
            ) : (
              dashboard.events.map((event) => {
                const summary = dashboard.summaries[event.id];
                const isSelected = event.id === selectedEventId;
                const isCurrent = event.id === dashboard.currentEventId;

                return (
                  <Pressable
                    key={event.id}
                    onPress={() => {
                      selectEvent(event);
                    }}
                    style={[styles.eventCard, isSelected ? styles.eventCardSelected : null]}
                  >
                    <View style={styles.eventCardTop}>
                      <Text style={styles.eventName}>{event.name}</Text>
                      {isCurrent ? (
                        <View style={styles.currentBadge}>
                          <Text style={styles.currentBadgeText}>Current</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.metricRow}>
                      <Metric label="Stops" value={summary?.waypointCount ?? 0} />
                    </View>
                    <View style={styles.eventActions}>
                      <ActionButton
                        disabled={isCurrent || settingCurrentEventId !== null}
                        icon={isCurrent ? "check-circle" : "radio"}
                        label={
                          settingCurrentEventId === event.id
                            ? "Setting..."
                            : isCurrent
                              ? "Current"
                              : "Set current"
                        }
                        onPress={() => {
                          void handleSetCurrentEvent(event);
                        }}
                        variant={isCurrent ? "ghost" : "secondary"}
                      />
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>

        <ScrollView contentContainerStyle={styles.detailScroll} style={styles.detailPane}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {eventForm.id ? "Event Details" : "New Event"}
              </Text>
              <ActionButton
                disabled={savingEvent}
                icon="save"
                label={savingEvent ? "Saving..." : "Save event"}
                onPress={() => {
                  void handleSaveEvent();
                }}
                variant="primary"
              />
            </View>

            <Field label="Name">
              <TextInput
                onChangeText={(value) => {
                  setEventForm((current) => ({ ...current, name: value }));
                }}
                placeholder="Summer Poker Run"
                placeholderTextColor="#77808c"
                style={styles.input}
                value={eventForm.name}
              />
            </Field>
          </View>

          {selectedEvent ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Waypoints</Text>
              </View>

              <View style={[styles.waypointLayout, isNarrow ? styles.waypointLayoutNarrow : null]}>
                <View style={styles.waypointList}>
                  {selectedWaypointSlots.map(({ slotIndex, waypoint }) => (
                      <Pressable
                        key={slotIndex}
                        onPress={() => {
                          selectWaypointSlot(slotIndex, waypoint);
                        }}
                        style={[
                          styles.waypointRow,
                          slotIndex === waypointForm.slotIndex ? styles.waypointRowSelected : null,
                        ]}
                      >
                        <Feather name="map-pin" size={16} color="#0f766e" />
                        <View style={styles.waypointRowText}>
                          <Text style={styles.waypointName}>
                            Waypoint {slotIndex + 1}
                          </Text>
                          <Text style={styles.waypointMeta}>
                            {waypoint
                              ? `${waypoint.latitude.toFixed(5)}, ${waypoint.longitude.toFixed(5)}`
                              : "Not set"}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                </View>

                <View style={styles.waypointForm}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.subsectionTitle}>
                      Waypoint {waypointForm.slotIndex + 1}
                    </Text>
                    <ActionButton
                      disabled={savingWaypoint}
                      icon="save"
                      label={savingWaypoint ? "Saving..." : "Save"}
                      onPress={() => {
                        void handleSaveWaypoint();
                      }}
                      variant="primary"
                    />
                  </View>

                  <View style={[styles.formGrid, isNarrow ? styles.formGridNarrow : null]}>
                    <Field label="Latitude">
                      <TextInput
                        inputMode="decimal"
                        onChangeText={(value) => {
                          setWaypointForm((current) => ({ ...current, latitude: value }));
                        }}
                        placeholder="-27.46977"
                        placeholderTextColor="#77808c"
                        style={styles.input}
                        value={waypointForm.latitude}
                      />
                    </Field>
                    <Field label="Longitude">
                      <TextInput
                        inputMode="decimal"
                        onChangeText={(value) => {
                          setWaypointForm((current) => ({ ...current, longitude: value }));
                        }}
                        placeholder="153.02512"
                        placeholderTextColor="#77808c"
                        style={styles.input}
                        value={waypointForm.longitude}
                      />
                    </Field>
                  </View>

                  <Field label="Radius meters">
                    <TextInput
                      inputMode="numeric"
                      onChangeText={(value) => {
                        setWaypointForm((current) => ({ ...current, radiusMeters: value }));
                      }}
                      placeholder="20"
                      placeholderTextColor="#77808c"
                      style={styles.input}
                      value={waypointForm.radiusMeters}
                    />
                  </Field>
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onPress,
  variant,
}: {
  disabled?: boolean;
  icon: FeatherName;
  label: string;
  onPress: () => void;
  variant: "primary" | "secondary" | "ghost";
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        variant === "primary" ? styles.actionButtonPrimary : null,
        variant === "secondary" ? styles.actionButtonSecondary : null,
        variant === "ghost" ? styles.actionButtonGhost : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Feather
        name={icon}
        size={16}
        color={variant === "primary" ? "#ffffff" : "#1f2937"}
      />
      <Text
        style={[
          styles.actionButtonText,
          variant === "primary" ? styles.actionButtonPrimaryText : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function IconButton({
  accessibilityLabel,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  icon: FeatherName;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.iconButton}
    >
      <Feather name={icon} size={18} color="#111827" />
    </Pressable>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function eventToForm(event: AdminEvent): EventFormState {
  return {
    id: event.id,
    name: event.name,
  };
}

function waypointToForm(waypoint: AdminWaypoint): WaypointFormState {
  return {
    id: waypoint.id,
    eventId: waypoint.eventId,
    slotIndex: waypoint.sortOrder,
    latitude: String(waypoint.latitude),
    longitude: String(waypoint.longitude),
    radiusMeters: String(waypoint.radiusMeters),
  };
}

function createEmptyWaypointForm(eventId: string, slotIndex = 0): WaypointFormState {
  return {
    id: null,
    eventId,
    slotIndex,
    latitude: "",
    longitude: "",
    radiusMeters: "20",
  };
}

function parseNumber(value: string, label: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`);
  }

  return parsed;
}

function parseInteger(value: string, label: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be a whole number.`);
  }

  return parsed;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: "#f4f2ee",
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 12,
  },
  topActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-end",
  },
  kicker: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    color: "#111827",
    fontSize: 34,
    fontWeight: "800",
    marginTop: 2,
  },
  workspace: {
    flex: 1,
    flexDirection: "row",
    gap: 18,
    minHeight: 0,
  },
  workspaceNarrow: {
    flexDirection: "column",
  },
  eventRail: {
    backgroundColor: "#ffffff",
    borderColor: "#ded8ce",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 340,
    minWidth: 300,
    padding: 14,
  },
  eventRailNarrow: {
    flexBasis: 280,
    minWidth: "100%",
  },
  eventList: {
    gap: 10,
    paddingTop: 12,
  },
  eventCard: {
    backgroundColor: "#faf9f7",
    borderColor: "#e6e1d8",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  eventCardSelected: {
    borderColor: "#0f766e",
    backgroundColor: "#eef8f5",
  },
  eventCardTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  eventActions: {
    alignItems: "flex-start",
    marginTop: 12,
  },
  eventName: {
    color: "#111827",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
  },
  detailPane: {
    flex: 1,
  },
  detailScroll: {
    gap: 18,
    paddingBottom: 28,
  },
  section: {
    backgroundColor: "#ffffff",
    borderColor: "#ded8ce",
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
  },
  subsectionTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "800",
  },
  formGrid: {
    flexDirection: "row",
    gap: 14,
  },
  formGridNarrow: {
    flexDirection: "column",
    gap: 0,
  },
  field: {
    flex: 1,
    marginBottom: 14,
  },
  label: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 7,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#c9c2b8",
    borderRadius: 6,
    borderWidth: 1,
    color: "#111827",
    fontSize: 15,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  metric: {
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    minWidth: 82,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  metricValue: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
  },
  metricLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  waypointLayout: {
    flexDirection: "row",
    gap: 16,
  },
  waypointLayoutNarrow: {
    flexDirection: "column",
  },
  waypointList: {
    flex: 1,
    gap: 8,
    minWidth: 280,
  },
  waypointRow: {
    alignItems: "center",
    backgroundColor: "#faf9f7",
    borderColor: "#e6e1d8",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10,
  },
  waypointRowSelected: {
    borderColor: "#0f766e",
    backgroundColor: "#eef8f5",
  },
  waypointRowText: {
    flex: 1,
    minWidth: 0,
  },
  waypointName: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
  },
  waypointMeta: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 2,
  },
  waypointForm: {
    flex: 1.1,
    minWidth: 320,
  },
  actionButton: {
    alignItems: "center",
    borderRadius: 6,
    flexDirection: "row",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  actionButtonPrimary: {
    backgroundColor: "#0f766e",
  },
  actionButtonSecondary: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
    borderWidth: 1,
  },
  actionButtonGhost: {
    backgroundColor: "#ffffff",
    borderColor: "#d1d5db",
    borderWidth: 1,
  },
  actionButtonText: {
    color: "#1f2937",
    fontSize: 14,
    fontWeight: "800",
  },
  actionButtonPrimaryText: {
    color: "#ffffff",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
    borderRadius: 6,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  disabled: {
    opacity: 0.62,
  },
  currentBadge: {
    backgroundColor: "#ccfbf1",
    borderColor: "#0f766e",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  currentBadgeText: {
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "900",
  },
  successText: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    borderRadius: 6,
    borderWidth: 1,
    color: "#166534",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    padding: 10,
  },
  errorBanner: {
    backgroundColor: "#fee2e2",
    borderColor: "#fca5a5",
    borderRadius: 6,
    borderWidth: 1,
    color: "#991b1b",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    padding: 10,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 14,
  },
  centered: {
    alignItems: "center",
    backgroundColor: "#f4f2ee",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  blockedTitle: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "800",
  },
  blockedText: {
    color: "#4b5563",
    fontSize: 15,
    marginTop: 8,
  },
  loginShell: {
    alignItems: "center",
    backgroundColor: "#f4f2ee",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  loginPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#ded8ce",
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 440,
    padding: 22,
    width: "100%",
  },
  loginTitle: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 22,
    marginTop: 4,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
  },
});
