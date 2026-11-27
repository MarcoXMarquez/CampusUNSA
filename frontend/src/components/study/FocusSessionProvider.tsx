"use client";

import React, { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  countdown, FOCUS_SESSION_STORAGE_KEY, newFocusSession, parseFocusSession,
  MIN_FOCUS_MINUTES, MAX_FOCUS_MINUTES, type FocusSession,
} from "@/lib/focus-timer";
import { studyMessages } from "@/lib/messages/study-messages";

interface FocusController {
  session: FocusSession;
  remaining: number;
  permission: NotificationPermission | null;
  start: () => void;
  pause: () => void;
  reset: () => void;
  setDuration: (minutes: number) => void;
  enableNotifications: () => Promise<void>;
}

export const FocusContext = createContext<FocusController | null>(null);

function storedSession(): FocusSession | null {
  try { return parseFocusSession(localStorage.getItem(FOCUS_SESSION_STORAGE_KEY)); }
  catch { return null; }
}

async function notifyCompletion(): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration?.active) {
    await registration.showNotification("CampusUNSA", {
      body: studyMessages.finished, tag: "campusunsa-focus-complete",
    });
  } else {
    new Notification("CampusUNSA", { body: studyMessages.finished, tag: "campusunsa-focus-complete" });
  }
}

export function FocusSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(() => newFocusSession(25));
  const [now, setNow] = useState(0);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const announced = useRef<number | null>(null);

  const save = useCallback((next: FocusSession) => {
    setSession(next);
    try { localStorage.setItem(FOCUS_SESSION_STORAGE_KEY, JSON.stringify(next)); }
    catch { /* Keep the session available for this page. */ }
  }, []);

  useEffect(() => {
    const stored = storedSession();
    if (stored) setSession(stored);
    setNow(Date.now());
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
    const synchronize = (event: StorageEvent) => {
      if (event.key !== FOCUS_SESSION_STORAGE_KEY) return;
      const next = parseFocusSession(event.newValue);
      if (next) {
        setNow(Date.now());
        setSession(next);
      }
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);

  useEffect(() => {
    if (session.endsAt === null) return;
    const endsAt = session.endsAt;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current < endsAt || announced.current === endsAt) return;
      announced.current = endsAt;
      const stored = storedSession();
      if (stored && stored.endsAt !== endsAt) {
        setSession(stored);
        return;
      }
      save({ ...session, endsAt: null, remainingMs: 0 });
      if (audio.current?.state === "running") {
        const tone = audio.current.createOscillator();
        tone.frequency.value = 660;
        tone.connect(audio.current.destination);
        tone.start();
        tone.stop(audio.current.currentTime + 0.35);
      }
      void notifyCompletion().catch(() => undefined);
    };
    tick();
    const interval = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [session, save]);

  const start = () => {
    if (session.endsAt !== null) return;
    if (typeof AudioContext !== "undefined") {
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume().catch(() => undefined);
      } catch { /* The timer still works when audio is unavailable. */ }
    }
    const current = Date.now();
    const remainingMs = session.remainingMs || session.minutes * 60_000;
    setNow(current);
    save({ ...session, remainingMs, endsAt: current + remainingMs });
  };

  const pause = () => {
    save({ ...session, endsAt: null, remainingMs: countdown(session, Date.now()) });
  };

  const setDuration = (minutes: number) => {
    if (session.endsAt === null && Number.isInteger(minutes)
        && minutes >= MIN_FOCUS_MINUTES && minutes <= MAX_FOCUS_MINUTES) save(newFocusSession(minutes));
  };

  const enableNotifications = async () => {
    try { setPermission(await Notification.requestPermission()); }
    catch { setPermission(typeof Notification === "undefined" ? null : Notification.permission); }
  };

  return (
    <FocusContext.Provider value={{
      session, remaining: countdown(session, now), permission, start, pause,
      reset: () => save(newFocusSession(session.minutes)),
      setDuration, enableNotifications,
    }}>
      {children}
    </FocusContext.Provider>
  );
}
