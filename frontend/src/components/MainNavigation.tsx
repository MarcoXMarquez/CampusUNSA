"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Page, Tabbar, TabbarLink } from "konsta/react";
import { CalendarCheck, Calendar, Gear } from "@phosphor-icons/react";
import Script from "next/script";
import { HoyView } from "./HoyView";
import { CalendarioView } from "./CalendarioView";
import { AjustesView } from "./AjustesView";
import { LoginModal } from "./LoginModal";
import { AcademicAssignment } from "./TaskDetailSheet";

interface AcademicCourse {
  id: string;
  classroom_course_id: string;
  name: string;
  section?: string | null;
  alternate_link?: string | null;
  created_at: string;
}

interface GoogleAuthProfile {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  profile?: {
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

export function MainNavigation(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<"hoy" | "calendario" | "ajustes">("hoy");
  const [courses, setCourses] = useState<AcademicCourse[]>([]);
  const [assignments, setAssignments] = useState<AcademicAssignment[]>([]);
  const [user, setUser] = useState<GoogleAuthProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [moodleSessionExpired, setMoodleSessionExpired] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loginModalOpened, setLoginModalOpened] = useState<boolean>(false);

  // Sync statuses
  const [classroomConnected, setClassroomConnected] = useState<boolean>(false);
  const [classroomSyncStatus, setClassroomSyncStatus] = useState<string>("NOT_CONNECTED");
  const [moodleIcalConnected, setMoodleIcalConnected] = useState<boolean>(false);
  const [moodleIcalSyncStatus, setMoodleIcalSyncStatus] = useState<string>("NOT_CONNECTED");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api/v1";
  const clientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    "680574461584-5vjt8ge9ah4rr1eapphoenit5imvk6m8.apps.googleusercontent.com";

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

  const fetchUserProfile = useCallback(
    async (authToken: string) => {
      try {
        const res = await fetch(`${apiUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      } catch {
        // offline fallback
      }
    },
    [apiUrl]
  );

  // Initialize stored token and user
  useEffect(() => {
    const savedToken = localStorage.getItem("campusunsa_token");
    if (savedToken) {
      setToken(savedToken);
      fetchUserProfile(savedToken);
    }
  }, [fetchUserProfile]);

  const fetchAcademicData = useCallback(async () => {
    setSyncError(null);
    setSyncing(true);

    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [mCoursesRes, mAssignsRes, cCoursesRes, cAssignsRes] = await Promise.all([
        fetch(`${apiUrl}/dutic/courses`, { headers }).catch(() => null),
        fetch(`${apiUrl}/dutic/assignments`, { headers }).catch(() => null),
        fetch(`${apiUrl}/classroom/courses`, { headers }).catch(() => null),
        fetch(`${apiUrl}/classroom/assignments`, { headers }).catch(() => null),
      ]);

      let allCourses: AcademicCourse[] = [];
      let allAssigns: AcademicAssignment[] = [];

      if (mCoursesRes && mCoursesRes.ok) {
        const mCourses = await mCoursesRes.json();
        allCourses = [...allCourses, ...mCourses];
        setMoodleSessionExpired(false);
      } else if (mCoursesRes && mCoursesRes.status === 401) {
        setMoodleSessionExpired(true);
      }

      if (mAssignsRes && mAssignsRes.ok) {
        const mAssigns = await mAssignsRes.json();
        allAssigns = [...allAssigns, ...mAssigns];
      }

      if (cCoursesRes && cCoursesRes.ok) {
        const cCourses = await cCoursesRes.json();
        allCourses = [...allCourses, ...cCourses];
        setClassroomConnected(true);
      }

      if (cAssignsRes && cAssignsRes.ok) {
        const cAssigns = await cAssignsRes.json();
        allAssigns = [...allAssigns, ...cAssigns];
      }

      // De-duplicate courses by ID
      const uniqueCourses = Array.from(
        new Map(allCourses.map((c) => [c.id || c.classroom_course_id, c])).values()
      );
      setCourses(uniqueCourses);

      // De-duplicate assignments by ID
      const uniqueAssigns = Array.from(
        new Map(allAssigns.map((a) => [a.id || a.classroom_assignment_id, a])).values()
      );
      setAssignments(uniqueAssigns);

      // Save offline cache in localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("campusunsa_offline_courses", JSON.stringify(uniqueCourses));
        localStorage.setItem("campusunsa_offline_tasks", JSON.stringify(uniqueAssigns));
      }
    } catch (err: unknown) {
      setSyncError("No se pudieron actualizar los datos del servidor.");
      // Read from offline cache
      if (typeof window !== "undefined") {
        const cachedCourses = localStorage.getItem("campusunsa_offline_courses");
        const cachedTasks = localStorage.getItem("campusunsa_offline_tasks");
        if (cachedCourses) setCourses(JSON.parse(cachedCourses));
        if (cachedTasks) setAssignments(JSON.parse(cachedTasks));
      }
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [apiUrl, token]);

  useEffect(() => {
    fetchAcademicData();
  }, [fetchAcademicData]);

  // Handle Google OAuth callback
  const handleGoogleSuccess = useCallback(
    async (credential: string) => {
      try {
        const res = await fetch(`${apiUrl}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: credential }),
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setToken(data.access_token);
          localStorage.setItem("campusunsa_token", data.access_token);
          setLoginModalOpened(false);
          fetchAcademicData();
        }
      } catch {
        // error handling handled in modal
      }
    },
    [apiUrl, fetchAcademicData]
  );

  // Setup Google Identity Services
  useEffect(() => {
    if (typeof window !== "undefined" && window.google?.accounts?.id) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp: any) => {
          if (resp.credential) {
            handleGoogleSuccess(resp.credential);
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
        if (resp.code) {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (token) headers["Authorization"] = `Bearer ${token}`;

          try {
            await fetch(`${apiUrl}/classroom/auth/token`, {
              method: "POST",
              headers,
              body: JSON.stringify({ code: resp.code }),
            });
            setClassroomConnected(true);
            fetchAcademicData();
          } catch {
            // failed to exchange token
          }
        }
      },
    });

    client.requestCode();
  }, [clientId, apiUrl, token, fetchAcademicData]);

  // Moodle iCal Subscribe
  const handleSubscribeMoodleIcal = async (calendarUrl: string) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${apiUrl}/dutic/ical/subscribe`, {
      method: "POST",
      headers,
      body: JSON.stringify({ calendar_url: calendarUrl }),
    });

    if (res.ok) {
      setMoodleIcalConnected(true);
      fetchAcademicData();
    }
  };

  // Clear Tasks
  const handleClearTasks = async () => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    await Promise.all([
      fetch(`${apiUrl}/dutic/tasks/clear`, { method: "POST", headers }).catch(() => null),
      fetch(`${apiUrl}/classroom/tasks/clear`, { method: "POST", headers }).catch(() => null),
    ]);

    setAssignments([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem("campusunsa_offline_tasks");
    }
  };

  // Clear Courses
  const handleClearCourses = async () => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    await Promise.all([
      fetch(`${apiUrl}/dutic/courses/clear`, { method: "POST", headers }).catch(() => null),
      fetch(`${apiUrl}/classroom/courses/clear`, { method: "POST", headers }).catch(() => null),
    ]);

    setCourses([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem("campusunsa_offline_courses");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("campusunsa_token");
    setUser(null);
    setToken(null);
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
          />
        )}

        {activeTab === "calendario" && (
          <CalendarioView
            assignments={assignments}
            courses={courses}
          />
        )}

        {activeTab === "ajustes" && (
          <AjustesView
            user={user}
            token={token}
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
          icon={<CalendarCheck size={24} weight={activeTab === "hoy" ? "fill" : "regular"} className={activeTab === "hoy" ? "text-primary dark:text-primary-dark" : "text-black/40 dark:text-white/40"} />}
          label={<span className={activeTab === "hoy" ? "text-primary dark:text-primary-dark font-medium" : "text-black/40 dark:text-white/40"}>Hoy</span>}
        />
        <TabbarLink
          active={activeTab === "calendario"}
          onClick={() => setActiveTab("calendario")}
          icon={<Calendar size={24} weight={activeTab === "calendario" ? "fill" : "regular"} className={activeTab === "calendario" ? "text-primary dark:text-primary-dark" : "text-black/40 dark:text-white/40"} />}
          label={<span className={activeTab === "calendario" ? "text-primary dark:text-primary-dark font-medium" : "text-black/40 dark:text-white/40"}>Calendario</span>}
        />
        <TabbarLink
          active={activeTab === "ajustes"}
          onClick={() => setActiveTab("ajustes")}
          icon={<Gear size={24} weight={activeTab === "ajustes" ? "fill" : "regular"} className={activeTab === "ajustes" ? "text-primary dark:text-primary-dark" : "text-black/40 dark:text-white/40"} />}
          label={<span className={activeTab === "ajustes" ? "text-primary dark:text-primary-dark font-medium" : "text-black/40 dark:text-white/40"}>Ajustes</span>}
        />
      </Tabbar>

      {/* Login Sheet Modal */}
      <LoginModal
        opened={loginModalOpened}
        onClose={() => setLoginModalOpened(false)}
        onSuccess={(authToken, authUser) => {
          setToken(authToken);
          setUser(authUser);
          fetchAcademicData();
        }}
      />
    </Page>
  );
}
