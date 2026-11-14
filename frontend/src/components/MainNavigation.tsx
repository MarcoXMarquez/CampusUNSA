"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Page, Tabbar, TabbarLink } from "konsta/react";
import { CalendarCheck, Calendar, Gear } from "@phosphor-icons/react";
import Script from "next/script";
import { HoyView } from "./HoyView";
import { CalendarioView } from "./CalendarioView";
import { AjustesView } from "./AjustesView";
import { LoginModal } from "./LoginModal";
import { QueryProvider } from "./QueryProvider";
import { useAcademicBoard } from "../hooks/useAcademicBoard";
import {
  ApiRequestError,
  authenticateWithGoogleToken,
  clearSyncedAssignments,
  clearSyncedCourses,
  exchangeClassroomCode,
  fetchBackendHealth,
  fetchCurrentUser,
  fetchIntegrationStatuses,
  getGoogleClientId,
  subscribeMoodleIcal,
  type BackendHealthStatus,
  type UserProfile,
} from "../lib/api-client";

export function MainNavigation(): React.JSX.Element {
  return (
    <QueryProvider>
      <NavigationContent />
    </QueryProvider>
  );
}

function NavigationContent(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<"hoy" | "calendario" | "ajustes">("hoy");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [loginModalOpened, setLoginModalOpened] = useState<boolean>(false);
  const [backendHealth, setBackendHealth] = useState<BackendHealthStatus | null>(null);

  // Sync statuses
  const [classroomConnected, setClassroomConnected] = useState<boolean>(false);
  const [classroomSyncStatus, setClassroomSyncStatus] = useState<string>("NOT_CONNECTED");
  const [moodleIcalConnected, setMoodleIcalConnected] = useState<boolean>(false);
  const [moodleIcalSyncStatus, setMoodleIcalSyncStatus] = useState<string>("NOT_CONNECTED");

  const clientId = getGoogleClientId();

  // Check online status
  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const hydrateSession = useCallback(async (authToken: string) => {
    try {
      const [profile, statuses] = await Promise.all([
        fetchCurrentUser(authToken),
        fetchIntegrationStatuses(authToken),
      ]);
      if (profile) {
        setUser(profile);
      }
      setClassroomConnected(statuses.classroomConnected);
      setClassroomSyncStatus(statuses.classroomSyncStatus);
      setMoodleIcalConnected(statuses.moodleSubscribed);
      setMoodleIcalSyncStatus(statuses.moodleSyncStatus);
    } catch (err: unknown) {
      if (err instanceof ApiRequestError && err.status === 401) {
        localStorage.removeItem("campusunsa_token");
        setToken(null);
        setUser(null);
      }
    }
  }, []);

  // Initialize stored token, user profile, integration statuses and backend health
  useEffect(() => {
    const savedToken = localStorage.getItem("campusunsa_token");
    if (savedToken) {
      setToken(savedToken);
      void hydrateSession(savedToken);
    }
    void fetchBackendHealth().then(setBackendHealth);
  }, [hydrateSession]);

  const {
    courses,
    assignments,
    loading,
    syncing,
    syncError,
    moodleSessionExpired,
    setCourses,
    setAssignments,
    setCompletion,
    completionPending,
    completionError,
    refresh,
  } = useAcademicBoard(token);
  const fetchAcademicData = useCallback(async () => {
    await refresh();
  }, [refresh]);

  // Handle Google OAuth callback
  const handleGoogleSuccess = useCallback(
    async (credential: string) => {
      try {
        const data = await authenticateWithGoogleToken(credential);
        setUser(data.user);
        setToken(data.access_token);
        localStorage.setItem("campusunsa_token", data.access_token);
        setLoginModalOpened(false);
        await hydrateSession(data.access_token);
        await fetchAcademicData();
      } catch {
        // error handling handled in modal
      }
    },
    [hydrateSession, fetchAcademicData]
  );

  // Setup Google Identity Services
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

  // Classroom One-Click Consent Link
  const handleLinkClassroom = useCallback(() => {
    if (typeof window === "undefined" || !window.google?.accounts?.oauth2) {
      alert("Servicio de Google cargando... Por favor, reintenta en un momento.");
      return;
    }

    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope:
        "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly",
      ux_mode: "popup",
      callback: async (resp: GoogleCodeResponse) => {
        if (resp.code && token) {
          try {
            await exchangeClassroomCode(token, resp.code, "postmessage");
            setClassroomConnected(true);
            setClassroomSyncStatus("CONNECTED");
            await fetchAcademicData();
          } catch {
            // keep disconnected state when code exchange fails
          }
        }
      },
    });

    client.requestCode();
  }, [clientId, token, fetchAcademicData]);

  // Moodle iCal Subscribe
  const handleSubscribeMoodleIcal = async (calendarUrl: string): Promise<void> => {
    if (!token) {
      throw new Error("Inicia sesión para suscribir tu calendario Moodle");
    }
    await subscribeMoodleIcal(token, calendarUrl);
    setMoodleIcalConnected(true);
    setMoodleIcalSyncStatus("CONNECTED");
    await fetchAcademicData();
  };

  // Clear Tasks
  const handleClearTasks = async (): Promise<void> => {
    if (!token) {
      throw new Error("Inicia sesión para borrar tareas sincronizadas");
    }
    await clearSyncedAssignments(token);
    setAssignments([]);
  };

  // Clear Courses
  const handleClearCourses = async (): Promise<void> => {
    if (!token) {
      throw new Error("Inicia sesión para borrar cursos sincronizados");
    }
    await clearSyncedCourses(token);
    setCourses([]);
    setAssignments([]);
  };

  const handleLogout = () => {
    localStorage.removeItem("campusunsa_token");
    setUser(null);
    setToken(null);
    setClassroomConnected(false);
    setClassroomSyncStatus("NOT_CONNECTED");
    setMoodleIcalConnected(false);
    setMoodleIcalSyncStatus("NOT_CONNECTED");
  };

  return (
    <Page className="bg-[#F2F2F7] dark:bg-black min-h-screen">
      <Script src="https://accounts.google.com/gsi/client" strategy="lazyOnload" />

      {/* Main Tab Content */}
      <main className="w-full max-w-lg mx-auto">
        {activeTab === "hoy" && (
          <HoyView
            assignments={assignments}
            courses={courses}
            loading={loading}
            syncing={syncing}
            isOnline={isOnline}
            moodleSessionExpired={moodleSessionExpired}
            syncError={syncError}
            onRefresh={fetchAcademicData}
            onOpenSettings={() => setActiveTab("ajustes")}
            onReconnectMoodle={() => setActiveTab("ajustes")}
            onCompletionChange={setCompletion}
            completionPending={completionPending}
            completionError={completionError}
          />
        )}

        {activeTab === "calendario" && (
          <CalendarioView
            assignments={assignments}
            courses={courses}
            onCompletionChange={setCompletion}
            completionPending={completionPending}
            completionError={completionError}
            isOnline={isOnline}
          />
        )}

        {activeTab === "ajustes" && (
          <AjustesView
            user={user}
            token={token}
            isOnline={isOnline}
            backendHealth={backendHealth}
            classroomConnected={classroomConnected}
            classroomSyncStatus={classroomSyncStatus}
            moodleIcalConnected={moodleIcalConnected}
            moodleIcalSyncStatus={moodleIcalSyncStatus}
            onLinkClassroom={handleLinkClassroom}
            onSubscribeMoodleIcal={handleSubscribeMoodleIcal}
            onClearTasks={handleClearTasks}
            onClearCourses={handleClearCourses}
            onLogout={handleLogout}
            onOpenLogin={() => setLoginModalOpened(true)}
          />
        )}
      </main>

      {/* iOS Translucent Tabbar */}
      <Tabbar
        labels
        icons
        className="left-0 bottom-0 fixed z-40 bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-md border-t border-black/10 dark:border-white/10"
      >
        <TabbarLink
          active={activeTab === "hoy"}
          onClick={() => setActiveTab("hoy")}
          icon={
            <CalendarCheck
              size={24}
              weight={activeTab === "hoy" ? "fill" : "regular"}
              className={
                activeTab === "hoy"
                  ? "text-primary dark:text-primary-dark"
                  : "text-black/40 dark:text-white/40"
              }
            />
          }
          label={
            <span
              className={
                activeTab === "hoy"
                  ? "text-primary dark:text-primary-dark font-medium"
                  : "text-black/40 dark:text-white/40"
              }
            >
              Hoy
            </span>
          }
        />
        <TabbarLink
          active={activeTab === "calendario"}
          onClick={() => setActiveTab("calendario")}
          icon={
            <Calendar
              size={24}
              weight={activeTab === "calendario" ? "fill" : "regular"}
              className={
                activeTab === "calendario"
                  ? "text-primary dark:text-primary-dark"
                  : "text-black/40 dark:text-white/40"
              }
            />
          }
          label={
            <span
              className={
                activeTab === "calendario"
                  ? "text-primary dark:text-primary-dark font-medium"
                  : "text-black/40 dark:text-white/40"
              }
            >
              Calendario
            </span>
          }
        />
        <TabbarLink
          active={activeTab === "ajustes"}
          onClick={() => setActiveTab("ajustes")}
          icon={
            <Gear
              size={24}
              weight={activeTab === "ajustes" ? "fill" : "regular"}
              className={
                activeTab === "ajustes"
                  ? "text-primary dark:text-primary-dark"
                  : "text-black/40 dark:text-white/40"
              }
            />
          }
          label={
            <span
              className={
                activeTab === "ajustes"
                  ? "text-primary dark:text-primary-dark font-medium"
                  : "text-black/40 dark:text-white/40"
              }
            >
              Ajustes
            </span>
          }
        />
      </Tabbar>

      {/* Login Sheet Modal */}
      <LoginModal
        opened={loginModalOpened}
        onClose={() => setLoginModalOpened(false)}
        onSuccess={(authToken, authUser) => {
          setToken(authToken);
          setUser({
            id: authUser.id ?? null,
            email: authUser.email,
            role: authUser.role,
            full_name: authUser.full_name ?? null,
            is_active: authUser.is_active ?? true,
          });
          void hydrateSession(authToken);
          void fetchAcademicData();
        }}
      />
    </Page>
  );
}
