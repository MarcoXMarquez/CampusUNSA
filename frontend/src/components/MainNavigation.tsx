"use client";

import React, { useCallback, useRef, useState } from "react";
import { Page } from "konsta/react";
import { useQueryClient } from "@tanstack/react-query";
import Script from "next/script";
import { HoyView } from "@/components/views/HoyView";
import { TareasSyncView } from "@/components/views/TareasSyncView";
import { HorarioView } from "@/components/views/HorarioView";
import { AjustesView } from "@/components/views/AjustesView";
import { SecretarialTickets, SecretarialTicketsEntry, useTicketNotices } from "@/components/views/SecretarialTickets";
import { HugoAssistantView } from "@/components/views/HugoAssistantView";
import { BottomTabBar, type AppTab } from "@/components/navigation/BottomTabBar";
import { LoginModal } from "@/components/sheets/LoginModal";
import { NewTaskSheet } from "@/components/sheets/NewTaskSheet";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { secretarialTicketMessages as ticketMessages } from "@/lib/messages/secretarial-ticket-messages";
import { useAcademicBoard, type AcademicCourse } from "@/hooks/useAcademicBoard";
import { useCampusSession } from "@/hooks/useCampusSession";
import { writeSessionSnapshot } from "@/lib/offline-db";
import {
  clearSyncedAssignments,
  clearSyncedCourses,
  exchangeClassroomCode,
  fetchCourseScheduleBlocks,
  fetchCurriculumCatalog,
  linkExternalCourseSource,
  saveCourseSchedule,
  subscribeMoodleIcal,
  type CourseCatalogItem,
  type CourseScheduleBlock,
  type CourseScheduleBlockInput,
} from "@/lib/api-client";

export function MainNavigation(): React.JSX.Element {
  return (
    <QueryProvider>
      <NavigationContent />
    </QueryProvider>
  );
}

function NavigationContent(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<AppTab>("tareas");
  const [loginModalOpened, setLoginModalOpened] = useState<boolean>(false);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [hugoSheetOpened, setHugoSheetOpened] = useState<boolean>(false);
  const [newTaskModalOpened, setNewTaskModalOpened] = useState<boolean>(false);
  const [newTaskInitialCourse, setNewTaskInitialCourse] =
    useState<AcademicCourse | null>(null);
  const [catalogCourses, setCatalogCourses] = useState<CourseCatalogItem[]>([]);

  const refreshRef = useRef<() => Promise<unknown>>(async () => undefined);

  const session = useCampusSession({
    onReconnectSync: () => {
      void refreshRef.current();
    },
    onLoginModalClose: () => setLoginModalOpened(false),
  });

  const {
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
  } = session;

  const secretarialViewer = token && user?.id && ["student", "secretary", "admin"].includes(user.role)
    ? { token, userId: user.id, staff: user.role !== "student", isOnline }
    : null;
  const ticketNotices = useTicketNotices(secretarialViewer, true);
  const newestNotice = ticketNotices.error ? undefined : ticketNotices.data?.[0];
  const queryClient = useQueryClient();

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

  refreshRef.current = refresh;

  const handleOpenNewTask = useCallback((course?: AcademicCourse) => {
    setNewTaskInitialCourse(course ?? null);
    setNewTaskModalOpened(true);
  }, []);

  const fetchAcademicData = useCallback(async () => {
    await refresh();
  }, [refresh]);

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
            // Keep disconnected state when code exchange fails
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
    setClassroomConnected,
    setClassroomSyncStatus,
    fetchAcademicData,
  ]);

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

  const handleClearTasks = async (): Promise<void> => {
    if (!token) {
      throw new Error("Inicia sesión para borrar tareas sincronizadas");
    }
    await clearSyncedAssignments(token);
    setAssignments([]);
  };

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
      if (!token) return [];
      return fetchCourseScheduleBlocks(token, courseCode, theoryGroup, labGroup);
    },
    [token]
  );

  const handleLoadCatalog = useCallback(
    async (query?: string): Promise<CourseCatalogItem[]> => {
      if (!token) return [];
      const loaded = await fetchCurriculumCatalog(token, query);
      if (!query) setCatalogCourses(loaded);
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

  const allSourcesSynced = classroomConnected && moodleIcalConnected;

  return (
    <Page className="bg-canvas text-ink-primary min-h-dvh w-full">
      <Script src="https://accounts.google.com/gsi/client" strategy="lazyOnload" />

      <main className="w-full min-h-dvh">
        {newestNotice && secretarialViewer && !secretarialViewer.staff && !(activeTab === "hugo" && ticketsOpen) && (
          <div className="mx-auto max-w-2xl px-5 pt-4">
            <div className="rounded-xl border border-subtle bg-surface-card px-3" role="status">
              <button type="button" className="interactive-surface min-h-11 w-full text-left text-ios-footnote font-semibold text-brand-action"
                onClick={() => {
                  setTicketsOpen(true);
                  setActiveTab("hugo");
                }}>
                {ticketMessages.noticeLabel(newestNotice.tracking_code)}
              </button>
            </div>
          </div>
        )}
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
            token={token}
            onSignIn={() => setLoginModalOpened(true)}
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

        {activeTab === "hugo" && (ticketsOpen && secretarialViewer ? (
          <SecretarialTickets
            key={`${secretarialViewer.userId}:${secretarialViewer.staff}`}
            {...secretarialViewer}
            onExit={() => setTicketsOpen(false)}
            onReconnect={() => setLoginModalOpened(true)}
          />
        ) : (
          <HugoAssistantView
            supportEntry={secretarialViewer && (
              <SecretarialTicketsEntry {...secretarialViewer} onOpen={() => setTicketsOpen(true)} />
            )}
            token={token}
            isOnline={isOnline}
            sheetOpened={hugoSheetOpened}
            onOpenSheet={() => setHugoSheetOpened(true)}
            onCloseSheet={() => setHugoSheetOpened(false)}
          />
        ))}

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
              onLogout={() => {
                queryClient.removeQueries({ queryKey: ["secretarial"] });
                setTicketsOpen(false);
                handleLogout();
              }}
              onOpenLogin={() => setLoginModalOpened(true)}
            />
          </div>
        )}
      </main>

      <BottomTabBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenNewTask={() => handleOpenNewTask()}
      />

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
