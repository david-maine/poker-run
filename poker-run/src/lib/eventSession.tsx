import { createContext, useContext, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

import type { RegistrationState } from "./game";

type EventSessionContextValue = {
  registrationState: RegistrationState;
  setRegistrationState: (registrationState: RegistrationState) => void;
};

const EventSessionContext = createContext<EventSessionContextValue | null>(null);

export function EventSessionProvider({
  children,
  initialRegistrationState,
}: PropsWithChildren<{ initialRegistrationState: RegistrationState }>) {
  const [registrationState, setRegistrationState] = useState(initialRegistrationState);

  const value = useMemo(
    () => ({
      registrationState,
      setRegistrationState,
    }),
    [registrationState]
  );

  return (
    <EventSessionContext.Provider value={value}>{children}</EventSessionContext.Provider>
  );
}

export function useEventSession() {
  const context = useContext(EventSessionContext);

  if (!context) {
    throw new Error("useEventSession must be used inside EventSessionProvider.");
  }

  return context;
}
