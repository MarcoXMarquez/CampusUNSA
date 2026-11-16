"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { onlineManager } from "@tanstack/react-query";
import { Page } from "konsta/react";
import { WhatsappLogo } from "@phosphor-icons/react";
import Script from "next/script";
import { HoyView } from "@/components/views/HoyView";
import { TareasSyncView } from "@/components/views/TareasSyncView";
import { HorarioView } from "@/components/views/HorarioView";
import { AjustesView } from "@/components/views/AjustesView";
import { LoginModal } from "@/components/sheets/LoginModal";
import { NewTaskSheet } from "@/components/sheets/NewTaskSheet";
import { WhatsAppSheet } from "@/components/sheets/WhatsAppSheet";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { useAcademicBoard, type AcademicCourse } from "@/hooks/useAcademicBoard";
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
import { taskSyncMessages as syncMessages } from "@/lib/messages/task-board-messages";
import {
  ApiRequestError,
  authenticateWithGoogleToken,
  clearSyncedAssignments,
  clearSyncedCourses,
  exchangeClassroomCode,
  fetchBackendHealth,
  fetchCourseScheduleBlocks,
  fetchCurrentUser,
  fetchCurriculumCatalog,
  fetchIntegrationStatuses,
  getGoogleClientId,
  linkExternalCourseSource,
  saveCourseSchedule,
  subscribeMoodleIcal,
  type BackendHealthStatus,
  type CourseCatalogItem,
  type CourseScheduleBlock,
  type CourseScheduleBlockInput,
  type UserProfile,
} from "@/lib/api-client";

export function MainNavigation(): React.JSX.Element {
  return (
    <QueryProvider>
      <NavigationContent />
    </QueryProvider>
  );
}

function NavigationContent(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<
    "tareas" | "horario" | "hugo" | "ajustes"
  >("tareas");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [loginModalOpened, setLoginModalOpened] = useState<boolean>(false);
  const [hugoSheetOpened, setHugoSheetOpened] = useState<boolean>(false);
  const [newTaskModalOpened, setNewTaskModalOpened] = useState<boolean>(false);
  const [newTaskInitialCourse, setNewTaskInitialCourse] =
    useState<AcademicCourse | null>(null);
  const [backendHealth, setBackendHealth] = useState<BackendHealthStatus | null>(null);
  const [catalogCourses, setCatalogCourses] = useState<CourseCatalogItem[]>([]);

  // Sync statuses
  const [classroomConnected, setClassroomConnected] = useState<boolean>(false);
  const [classroomSyncStatus, setClassroomSyncStatus] = useState<string>("NOT_CONNECTED");
  const [moodleIcalConnected, setMoodleIcalConnected] = useState<boolean>(false);
  const [moodleIcalSyncStatus, setMoodleIcalSyncStatus] = useState<string>("NOT_CONNECTED");

  const clientId = getGoogleClientId();
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  const applySessionSnapshot = useCallback((snapshot: OfflineSessionSnapshot) => {
    if (snapshot.user) {
      setUser(snapshot.user);
    }
    setClassroomConnected(snapshot.classroomConnected);
    setClassroomSyncStatus(snapshot.classroomSyncStatus);
    setMoodleIcalConnected(snapshot.moodleIcalConnected);
    setMoodleIcalSyncStatus(snapshot.moodleIcalSyncStatus);
  }, []);

  const hydrateSession = useCallback(async (authToken: string) => {
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
  }, [applySessionSnapshot]);

  // Initialize stored token, user profile, integration statuses and backend health
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
    createAssignment,
    creatingAssignment,
    refresh,
  } = useAcademicBoard(token);

  const handleOpenNewTask = useCallback((course?: AcademicCourse) => {
    setNewTaskInitialCourse(course ?? null);
    setNewTaskModalOpened(true);
  }, []);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Sync browser online/offline state, background reconnection, and Service Worker
  useEffect(() => {
    const initialOnline =
      typeof navigator !== "undefined" ? navigator.onLine : true;
    setIsOnline(initialOnline);
    onlineManager.setOnline(initialOnline);

    const triggerReconnectSync = () => {
      const currentToken = tokenRef.current;
      if (currentToken) {
        void hydrateSession(currentToken);
        void refreshRef.current();
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
    if (!token) {
      setLoginModalOpened(true);
      return;
    }
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
            void writeSessionSnapshot(token, {
              user,
              classroomConnected: true,
              classroomSyncStatus: "CONNECTED",
              moodleIcalConnected,
              moodleIcalSyncStatus,
            });
            await fetchAcademicData();
          } catch {
            // keep disconnected state when code exchange fails
          }
        }
      },
    });

    client.requestCode();
  }, [
    clientId,
    token,
    user,
    moodleIcalConnected,
    moodleIcalSyncStatus,
    fetchAcademicData,
  ]);

  // Moodle iCal Subscribe
  const handleSubscribeMoodleIcal = async (calendarUrl: string): Promise<void> => {
    if (!token) {
      throw new Error("Inicia sesión para suscribir tu calendario Moodle");
    }
    await subscribeMoodleIcal(token, calendarUrl);
    setMoodleIcalConnected(true);
    setMoodleIcalSyncStatus("CONNECTED");
    void writeSessionSnapshot(token, {
      user,
      classroomConnected,
      classroomSyncStatus,
      moodleIcalConnected: true,
      moodleIcalSyncStatus: "CONNECTED",
    });
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

  const handleSaveCourseSchedule = useCallback(
    async (
      courseCode: string,
      payload: {
        theory_group: string | null;
        lab_group: string | null;
        blocks: CourseScheduleBlockInput[];
      }
    ): Promise<void> => {
      if (!token) {
        throw new Error("Inicia sesión para guardar el horario");
      }
      const updated = await saveCourseSchedule(token, courseCode, payload);
      setCourses(
        courses.map((item) =>
          item.course_code === courseCode ? { ...item, ...updated } : item
        )
      );
      await fetchAcademicData();
    },
    [token, courses, setCourses, fetchAcademicData]
  );

  const handleLoadGroupSchedule = useCallback(
    async (
      courseCode: string,
      theoryGroup: string | null,
      labGroup: string | null
    ): Promise<CourseScheduleBlock[]> => {
      if (!token) {
        return [];
      }
      return fetchCourseScheduleBlocks(token, courseCode, theoryGroup, labGroup);
    },
    [token]
  );

  const handleLoadCatalog = useCallback(
    async (query?: string): Promise<CourseCatalogItem[]> => {
      if (!token) {
        return [];
      }
      const loaded = await fetchCurriculumCatalog(token, query);
      if (!query) {
        setCatalogCourses(loaded);
      }
      return loaded;
    },
    [token]
  );

  const handleLinkPendingSource = useCallback(
    async (
      sourceId: string,
      payload: {
        course_code: string;
        component_type: "TEORIA" | "LABORATORIO" | "UNICO";
        group_code: string | null;
      }
    ): Promise<void> => {
      if (!token) {
        throw new Error("Inicia sesión para vincular cursos");
      }
      await linkExternalCourseSource(token, sourceId, payload);
      await fetchAcademicData();
    },
    [token, fetchAcademicData]
  );

  const handleLogout = () => {
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
  };

  const allSourcesSynced = classroomConnected && moodleIcalConnected;
  const useDarkBottomBar =
    activeTab === "tareas" || activeTab === "hugo" || activeTab === "horario";

  return (
    <Page
      className={
        useDarkBottomBar
          ? "bg-black text-white min-h-dvh w-full"
          : "bg-[#F2F2F7] dark:bg-black min-h-dvh w-full"
      }
    >
      <Script src="https://accounts.google.com/gsi/client" strategy="lazyOnload" />

      {/* Main Tab Content */}
      <main className="w-full min-h-dvh">
        {activeTab === "tareas" &&
          (!allSourcesSynced ? (
            <TareasSyncView
              classroomConnected={classroomConnected}
              moodleIcalConnected={moodleIcalConnected}
              onLinkClassroom={handleLinkClassroom}
              onSubscribeMoodleIcal={handleSubscribeMoodleIcal}
            />
          ) : (
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
              onOpenSchedule={() => setActiveTab("horario")}
              onReconnectMoodle={() => setActiveTab("ajustes")}
              onCompletionChange={setCompletion}
              completionPending={completionPending}
              completionError={completionError}
            />
          ))}

        {activeTab === "horario" && (
          <HorarioView
            courses={courses}
            assignments={assignments}
            catalogCourses={catalogCourses}
            loading={loading}
            syncing={syncing}
            isOnline={isOnline}
            moodleSessionExpired={moodleSessionExpired}
            syncError={syncError}
            onRefresh={fetchAcademicData}
            onReconnectMoodle={() => setActiveTab("ajustes")}
            onOpenNewTask={handleOpenNewTask}
            onSaveSchedule={handleSaveCourseSchedule}
            onLoadCatalog={handleLoadCatalog}
            onLoadGroupSchedule={handleLoadGroupSchedule}
            onLinkPendingSource={handleLinkPendingSource}
          />
        )}

        {activeTab === "hugo" && (
          <section className="w-full min-h-dvh bg-black text-white px-5 pt-6 pb-28">
            <div className="w-full max-w-md mx-auto space-y-5">
              <header className="pt-1">
                <h1 className="text-3xl font-extrabold tracking-tight text-white">
                  {syncMessages.hugoTitle}
                </h1>
              </header>
              <div className="rounded-2xl bg-[#121214] border border-neutral-800/80 p-5 space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <WhatsappLogo size={22} weight="regular" aria-hidden="true" />
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    {syncMessages.hugoDescription}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setHugoSheetOpened(true)}
                  className="w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-[#8B0000] hover:bg-[#A51C30] active:scale-[0.98] transition flex items-center justify-center text-xs font-semibold text-white cursor-pointer"
                >
                  {syncMessages.hugoActionButton}
                </button>
              </div>
            </div>
            <WhatsAppSheet
              opened={hugoSheetOpened}
              onClose={() => setHugoSheetOpened(false)}
              token={token}
              isOnline={isOnline}
            />
          </section>
        )}

        {activeTab === "ajustes" && (
          <div className="w-full max-w-lg mx-auto">
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
          </div>
        )}
      </main>

      {/* Stitch 5-Item Bottom Navigation Bar */}
      <footer
        className={`fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-xl pt-2 pb-4 px-4 safe-areas ${
          useDarkBottomBar
            ? "bg-[#0c0c0f]/95 border-neutral-800/80"
            : "bg-white/90 dark:bg-[#0c0c0f]/95 border-black/10 dark:border-neutral-800/80"
        }`}
      >
        <nav
          aria-label="Navegación principal"
          className="w-full max-w-md mx-auto grid grid-cols-5 items-center"
        >
          {/* Tab 1: Tareas */}
          <button
            type="button"
            aria-label={syncMessages.nav.tareas}
            aria-current={activeTab === "tareas" ? "page" : undefined}
            onClick={() => setActiveTab("tareas")}
            className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer transition ${
              activeTab === "tareas"
                ? useDarkBottomBar
                  ? "text-[#ff3b5c]"
                  : "text-[#ba131a] dark:text-[#ff3b5c]"
                : useDarkBottomBar
                  ? "text-neutral-400 hover:text-neutral-200"
                  : "text-black/50 dark:text-neutral-400 hover:text-black dark:hover:text-neutral-200"
            }`}
          >
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.9"
              />
            </svg>
            <span
              className={`text-[10px] mt-1 tracking-tight ${
                activeTab === "tareas" ? "font-semibold" : "font-medium"
              }`}
            >
              {syncMessages.nav.tareas}
            </span>
          </button>

          {/* Tab 2: Horario */}
          <button
            type="button"
            aria-label={syncMessages.nav.horario}
            aria-current={activeTab === "horario" ? "page" : undefined}
            onClick={() => setActiveTab("horario")}
            className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer transition ${
              activeTab === "horario"
                ? useDarkBottomBar
                  ? "text-[#ff3b5c]"
                  : "text-[#ba131a] dark:text-[#ff3b5c]"
                : useDarkBottomBar
                  ? "text-neutral-400 hover:text-neutral-200"
                  : "text-black/50 dark:text-neutral-400 hover:text-black dark:hover:text-neutral-200"
            }`}
          >
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <rect height="18" rx="3" strokeWidth="1.8" width="18" x="3" y="4" />
              <line strokeLinecap="round" strokeWidth="1.8" x1="16" x2="16" y1="2" y2="6" />
              <line strokeLinecap="round" strokeWidth="1.8" x1="8" x2="8" y1="2" y2="6" />
              <line strokeWidth="1.8" x1="3" x2="21" y1="10" y2="10" />
            </svg>
            <span
              className={`text-[10px] mt-1 tracking-tight ${
                activeTab === "horario" ? "font-semibold" : "font-medium"
              }`}
            >
              {syncMessages.nav.horario}
            </span>
          </button>

          {/* Center Action Button: + */}
          <div className="flex justify-center">
            <button
              type="button"
              aria-label={syncMessages.nav.newTaskAria}
              onClick={() => handleOpenNewTask()}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-[#8B0000] hover:bg-[#A51C30] text-white shadow-2xl active:scale-95 transition -mt-6 border-2 border-white/80 ring-1 ring-neutral-700/60 cursor-pointer"
            >
              <svg
                aria-hidden="true"
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 4v16m8-8H4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.4"
                />
              </svg>
            </button>
          </div>

          {/* Tab 4: Hugo */}
          <button
            type="button"
            aria-label={syncMessages.nav.hugo}
            aria-current={activeTab === "hugo" ? "page" : undefined}
            onClick={() => setActiveTab("hugo")}
            className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer transition ${
              activeTab === "hugo"
                ? useDarkBottomBar
                  ? "text-[#ff3b5c]"
                  : "text-[#ba131a] dark:text-[#ff3b5c]"
                : useDarkBottomBar
                  ? "text-neutral-400 hover:text-neutral-200"
                  : "text-black/50 dark:text-neutral-400 hover:text-black dark:hover:text-neutral-200"
            }`}
          >
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <rect height="12" rx="3" strokeWidth="1.8" width="16" x="4" y="8" />
              <path
                d="M12 4v4m-3 0h6"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
              <circle cx="9" cy="13" r="1.2" fill="currentColor" />
              <circle cx="15" cy="13" r="1.2" fill="currentColor" />
              <path
                d="M9.5 16.5c1 .6 4 .6 5 0"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
              />
            </svg>
            <span
              className={`text-[10px] mt-1 tracking-tight ${
                activeTab === "hugo" ? "font-semibold" : "font-medium"
              }`}
            >
              {syncMessages.nav.hugo}
            </span>
          </button>

          {/* Tab 5: Ajustes */}
          <button
            type="button"
            aria-label={syncMessages.nav.ajustes}
            aria-current={activeTab === "ajustes" ? "page" : undefined}
            onClick={() => setActiveTab("ajustes")}
            className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer transition ${
              activeTab === "ajustes"
                ? useDarkBottomBar
                  ? "text-[#ff3b5c]"
                  : "text-[#ba131a] dark:text-[#ff3b5c]"
                : useDarkBottomBar
                  ? "text-neutral-400 hover:text-neutral-200"
                  : "text-black/50 dark:text-neutral-400 hover:text-black dark:hover:text-neutral-200"
            }`}
          >
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
              <path
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
            <span
              className={`text-[10px] mt-1 tracking-tight ${
                activeTab === "ajustes" ? "font-semibold" : "font-medium"
              }`}
            >
              {syncMessages.nav.ajustes}
            </span>
          </button>
        </nav>
      </footer>

      {/* New Task Creation Sheet */}
      <NewTaskSheet
        opened={newTaskModalOpened}
        courses={courses}
        initialCourse={newTaskInitialCourse}
        allSourcesSynced={allSourcesSynced}
        isOnline={isOnline}
        submitting={creatingAssignment}
        onClose={() => {
          setNewTaskModalOpened(false);
          setNewTaskInitialCourse(null);
        }}
        onSubmit={createAssignment}
      />

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
