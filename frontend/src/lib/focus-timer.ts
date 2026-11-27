export const MIN_FOCUS_MINUTES = 5;
export const MAX_FOCUS_MINUTES = 120;
export const FOCUS_SESSION_STORAGE_KEY = "campusunsa-focus-session-v1";

export interface FocusSession {
  minutes: number;
  remainingMs: number;
  endsAt: number | null;
}

export function newFocusSession(minutes: number): FocusSession {
  return { minutes, remainingMs: minutes * 60_000, endsAt: null };
}

export function countdown(session: FocusSession, now: number): number {
  return session.endsAt === null
    ? session.remainingMs
    : Math.min(session.remainingMs, Math.max(0, session.endsAt - now));
}

export function parseFocusSession(value: string | null): FocusSession | null {
  if (!value) return null;
  try {
    const entry = JSON.parse(value) as Partial<FocusSession> | null;
    if (
      !entry || typeof entry.minutes !== "number" || !Number.isInteger(entry.minutes)
      || entry.minutes < MIN_FOCUS_MINUTES || entry.minutes > MAX_FOCUS_MINUTES
      || typeof entry.remainingMs !== "number" || !Number.isFinite(entry.remainingMs)
      || entry.remainingMs < 0 || entry.remainingMs > entry.minutes * 60_000
      || (entry.endsAt !== null && (typeof entry.endsAt !== "number" || !Number.isFinite(entry.endsAt)))
    ) return null;
    return { minutes: entry.minutes, remainingMs: entry.remainingMs, endsAt: entry.endsAt };
  } catch {
    return null;
  }
}
