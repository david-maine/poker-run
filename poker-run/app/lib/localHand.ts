import { drawCard, isValidCard } from "./cards";
import { getSafeStorage } from "./safeStorage";

const HAND_STORAGE_PREFIX = "poker-run:local-hand:v1:";

export type LocalHandStatus = "collecting" | "pending_submission" | "submitted";

export type LocalCardClaim = {
  waypointId: string;
  card: string;
  claimedAt: string;
  claimedLat: number;
  claimedLng: number;
  gpsAccuracyMeters: number | null;
};

export type LocalHand = {
  eventId: string;
  claims: LocalCardClaim[];
  status: LocalHandStatus;
  submittedAt: string | null;
  submissionAttemptCount: number;
  lastSubmissionError: string | null;
  lastSubmissionRetryable: boolean;
  updatedAt: string;
};

type ClaimInput = {
  eventId: string;
  waypointId: string;
  claimedLat: number;
  claimedLng: number;
  gpsAccuracyMeters: number | null;
};

export async function getLocalHand(eventId: string): Promise<LocalHand> {
  const rawValue = await getSafeStorage().getItem(getHandStorageKey(eventId));

  if (!rawValue) {
    return createEmptyHand(eventId);
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (isLocalHand(parsed) && parsed.eventId === eventId) {
      return {
        ...parsed,
        lastSubmissionRetryable: parsed.lastSubmissionRetryable ?? false,
        claims: parsed.claims.sort(compareClaims),
      };
    }
  } catch {
    // Fall through to an empty local hand.
  }

  return createEmptyHand(eventId);
}

export async function addLocalCardClaim(input: ClaimInput) {
  const hand = await getLocalHand(input.eventId);
  const existingClaim = hand.claims.find((claim) => claim.waypointId === input.waypointId);

  if (existingClaim) {
    return {
      hand,
      claim: existingClaim,
      added: false,
    };
  }

  if (hand.status === "submitted") {
    throw new Error("This hand has already been submitted.");
  }

  const now = new Date().toISOString();
  const claim: LocalCardClaim = {
    waypointId: input.waypointId,
    card: drawCard(hand.claims.map((currentClaim) => currentClaim.card)),
    claimedAt: now,
    claimedLat: input.claimedLat,
    claimedLng: input.claimedLng,
    gpsAccuracyMeters: input.gpsAccuracyMeters,
  };

  const nextHand: LocalHand = {
    ...hand,
    claims: [...hand.claims, claim].sort(compareClaims),
    status: hand.status === "pending_submission" ? "pending_submission" : "collecting",
    lastSubmissionError: null,
    lastSubmissionRetryable: false,
    updatedAt: now,
  };

  await saveLocalHand(nextHand);

  return {
    hand: nextHand,
    claim,
    added: true,
  };
}

export async function markHandPendingSubmission(hand: LocalHand, lastSubmissionError: string | null = null) {
  const nextHand: LocalHand = {
    ...hand,
    status: "pending_submission",
    lastSubmissionError,
    lastSubmissionRetryable: true,
    updatedAt: new Date().toISOString(),
  };

  await saveLocalHand(nextHand);
  return nextHand;
}

export async function markHandSubmissionFailed(hand: LocalHand, message: string, retryable: boolean) {
  const nextHand: LocalHand = {
    ...hand,
    status: "pending_submission",
    submissionAttemptCount: hand.submissionAttemptCount + 1,
    lastSubmissionError: message,
    lastSubmissionRetryable: retryable,
    updatedAt: new Date().toISOString(),
  };

  await saveLocalHand(nextHand);
  return nextHand;
}

export async function markHandSubmitted(hand: LocalHand) {
  const now = new Date().toISOString();
  const nextHand: LocalHand = {
    ...hand,
    status: "submitted",
    submittedAt: now,
    lastSubmissionError: null,
    lastSubmissionRetryable: false,
    updatedAt: now,
  };

  await saveLocalHand(nextHand);
  return nextHand;
}

export async function saveLocalHand(hand: LocalHand) {
  await getSafeStorage().setItem(getHandStorageKey(hand.eventId), JSON.stringify(hand));
}

function createEmptyHand(eventId: string): LocalHand {
  return {
    eventId,
    claims: [],
    status: "collecting",
    submittedAt: null,
    submissionAttemptCount: 0,
    lastSubmissionError: null,
    lastSubmissionRetryable: false,
    updatedAt: new Date().toISOString(),
  };
}

function getHandStorageKey(eventId: string) {
  return `${HAND_STORAGE_PREFIX}${eventId}`;
}

function compareClaims(left: LocalCardClaim, right: LocalCardClaim) {
  return left.claimedAt.localeCompare(right.claimedAt);
}

function isLocalHand(value: unknown): value is LocalHand {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LocalHand>;
  return (
    typeof candidate.eventId === "string" &&
    Array.isArray(candidate.claims) &&
    candidate.claims.every(isLocalCardClaim) &&
    (candidate.status === "collecting" ||
      candidate.status === "pending_submission" ||
      candidate.status === "submitted") &&
    (typeof candidate.submittedAt === "string" || candidate.submittedAt === null) &&
    typeof candidate.submissionAttemptCount === "number" &&
    (typeof candidate.lastSubmissionError === "string" || candidate.lastSubmissionError === null) &&
    (typeof candidate.lastSubmissionRetryable === "boolean" ||
      candidate.lastSubmissionRetryable === undefined) &&
    typeof candidate.updatedAt === "string"
  );
}

function isLocalCardClaim(value: unknown): value is LocalCardClaim {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LocalCardClaim>;
  return (
    typeof candidate.waypointId === "string" &&
    typeof candidate.card === "string" &&
    isValidCard(candidate.card) &&
    typeof candidate.claimedAt === "string" &&
    typeof candidate.claimedLat === "number" &&
    typeof candidate.claimedLng === "number" &&
    (typeof candidate.gpsAccuracyMeters === "number" || candidate.gpsAccuracyMeters === null)
  );
}
