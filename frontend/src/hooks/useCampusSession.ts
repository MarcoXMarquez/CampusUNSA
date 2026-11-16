"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onlineManager } from "@tanstack/react-query";
import {
  clearOfflineAccountData,
  readSessionFromIndexedDb,
  readSessionSnapshotSync,
  writeSessionSnapshot,
  type OfflineSessionSnapshot,
} from "@/lib/offline-db";
import {
  clearSwApiCache,
  registerServiceWorker,
  requestBackgroundSync,
} from "@/lib/pwa-sw";
import {
  ApiRequestError,
  authenticateWithGoogleToken,
  fetchBackendHealth,
  fetchCurrentUser,
  fetchIntegrationStatuses,
  getGoogleClientId,
  type BackendHealthStatus,
  type UserProfile,
} from "@/lib/api-client";

export interface UseCampusSessionOptions {
  onReconnectSync?: () => void;
  onRequireLogin?: () => void;
  onLoginModalClose?: () => void;
}

/**
 * Manages authenticated student session, offline snapshot hydration,
 * integration statuses, network connectivity, and Google Identity initialization.
 */
export function useCampusSession(options: UseCampusSessionOptions = {}) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [backendHealth, setBackendHealth] = useState<BackendHealthStatus | null>(null);
  const [classroomConnected, setClassroomConnected] = useState<boolean>(false);
  const [classroomSyncStatus, setClassroomSyncStatus] = useState<string>("NOT_CONNECTED");
  const [moodleIcalConnected, setMoodleIcalConnected] = useState<boolean>(false);
  const [moodleIcalSyncStatus, setMoodleIcalSyncStatus] = useState<string>("NOT_CONNECTED");

  const clientId = getGoogleClientId();
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;
  const reconnectSyncRef = useRef(options.onReconnectSync);
  reconnectSyncRef.current = options.onReconnectSync;
  const loginCloseRef = useRef(options.onLoginModalClose);
  loginCloseRef.current = options.onLoginModalClose;

  const applySessionSnapshot = useCallback((snapshot: OfflineSessionSnapshot) => {
    if (snapshot.user) {
      setUser(snapshot.user);
    }
    setClassroomConnected(snapshot.classroomConnected);
    setClassroomSyncStatus(snapshot.classroomSyncStatus);
    setMoodleIcalConnected(snapshot.moodleIcalConnected);
    setMoodleIcalSyncStatus(snapshot.moodleIcalSyncStatus);
  }, []);

  const hydrateSession = useCallback(
    async (authToken: string) => {
      const cachedSnapshot =
        readSessionSnapshotSync(authToken) ??
        (await readSessionFromIndexedDb(authToken));
      if (cachedSnapshot) {
        applySessionSnapshot(cachedSnapshot);
      }

      try {
        const [profile, statuses] = await Promise.all([
          fetchCurrentUser(authToken),
          fetchIntegrationStatuses(authToken),
        ]);

        const nextSnapshot: OfflineSessionSnapshot = {
          user: profile ?? cachedSnapshot?.user ?? null,
          classroomConnected: statuses.classroomReachable
            ? statuses.classroomConnected
            : cachedSnapshot?.classroomConnected ?? false,
          classroomSyncStatus: statuses.classroomReachable
            ? statuses.classroomSyncStatus
            : cachedSnapshot?.classroomSyncStatus ?? "NOT_CONNECTED",
          moodleIcalConnected: statuses.moodleReachable
            ? statuses.moodleSubscribed
            : cachedSnapshot?.moodleIcalConnected ?? false,
          moodleIcalSyncStatus: statuses.moodleReachable
            ? statuses.moodleSyncStatus
            : cachedSnapshot?.moodleIcalSyncStatus ?? "NOT_CONNECTED",
        };

        applySessionSnapshot(nextSnapshot);
        if (profile || statuses.classroomReachable || statuses.moodleReachable) {
          await writeSessionSnapshot(authToken, nextSnapshot);
        }
      } catch (err: unknown) {
        if (err instanceof ApiRequestError && err.status === 401) {
          localStorage.removeItem("campusunsa_token");
          void clearOfflineAccountData(authToken);
          void clearSwApiCache();
          setToken(null);
          setUser(null);
          setClassroomConnected(false);
          setClassroomSyncStatus("NOT_CONNECTED");
          setMoodleIcalConnected(false);
          setMoodleIcalSyncStatus("NOT_CONNECTED");
        }
      }
    },
    [applySessionSnapshot]
  );

  useEffect(() => {
    const savedToken = localStorage.getItem("campusunsa_token");
    if (savedToken) {
      setToken(savedToken);
      const syncSnapshot = readSessionSnapshotSync(savedToken);
      if (syncSnapshot) {
        applySessionSnapshot(syncSnapshot);
      }
      void hydrateSession(savedToken);
    }
    void fetchBackendHealth().then(setBackendHealth);
  }, [applySessionSnapshot, hydrateSession]);

  useEffect(() => {
    const initialOnline =
      typeof navigator !== "undefined" ? navigator.onLine : true;
    setIsOnline(initialOnline);
    onlineManager.setOnline(initialOnline);

    const triggerReconnectSync = () => {
      const currentToken = tokenRef.current;
      if (currentToken) {
        void hydrateSession(currentToken);
        reconnectSyncRef.current?.();
      }
      void fetchBackendHealth().then(setBackendHealth);
    };

    const handleOnline = () => {
      setIsOnline(true);
      onlineManager.setOnline(true);
      triggerReconnectSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      onlineManager.setOnline(false);
      void requestBackgroundSync();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    let cleanupSw: () => void = () => undefined;
    let disposed = false;
    void registerServiceWorker({ onSyncRequested: triggerReconnectSync }).then(
      (cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          cleanupSw = cleanup;
        }
      }
    );

    return () => {
      disposed = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      cleanupSw();
    };
  }, [hydrateSession]);

  const handleGoogleSuccess = useCallback(
    async (credential: string) => {
      try {
        const data = await authenticateWithGoogleToken(credential);
        setUser(data.user);
        setToken(data.access_token);
        localStorage.setItem("campusunsa_token", data.access_token);
        loginCloseRef.current?.();
        await hydrateSession(data.access_token);
        reconnectSyncRef.current?.();
      } catch {
        // Error display handled by LoginModal
      }
    },
    [hydrateSession]
  );

  useEffect(() => {
    if (typeof window !== "undefined" && window.google?.accounts?.id) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp: { credential?: string }) => {
          if (resp.credential) {
            void handleGoogleSuccess(resp.credential);
          }
        },
      });
    }
  }, [clientId, handleGoogleSuccess]);

  const handleLogout = useCallback(() => {
    const previousToken = token;
    localStorage.removeItem("campusunsa_token");
    void clearOfflineAccountData(previousToken);
    void clearSwApiCache();
    setUser(null);
    setToken(null);
    setClassroomConnected(false);
    setClassroomSyncStatus("NOT_CONNECTED");
    setMoodleIcalConnected(false);
    setMoodleIcalSyncStatus("NOT_CONNECTED");
  }, [token]);

  return {
    user,
    setUser,
    token,
    setToken,
    clientId,
    isOnline,
    backendHealth,
    classroomConnected,
    setClassroomConnected,
    classroomSyncStatus,
    setClassroomSyncStatus,
    moodleIcalConnected,
    setMoodleIcalConnected,
    moodleIcalSyncStatus,
    setMoodleIcalSyncStatus,
    hydrateSession,
    handleLogout,
  };
}
