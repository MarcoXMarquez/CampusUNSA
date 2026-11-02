"use client";

import React, { useEffect, useState, useCallback } from "react";

interface AcademicCourse {
  id: string;
  classroom_course_id: string;
  name: string;
  section?: string | null;
  alternate_link?: string | null;
  created_at: string;
}

interface AcademicAssignment {
  id: string;
  course_id: string;
  classroom_assignment_id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  max_points?: number | null;
  state: string;
  alternate_link?: string | null;
  origin: string;
  created_at: string;
}

export function AcademicHubCard(): React.JSX.Element {
  const [courses, setCourses] = useState<AcademicCourse[]>([]);
  const [assignments, setAssignments] = useState<AcademicAssignment[]>([]);
  const [activeTab, setActiveTab] = useState<"courses" | "assignments">("courses");
  const [syncSource, setSyncSource] = useState<"classroom" | "dutic">("classroom");
  const [classroomToken, setClassroomToken] = useState<string>("demo");
  const [classroomConnected, setClassroomConnected] = useState<boolean>(false);
  const [classroomSyncStatus, setClassroomSyncStatus] = useState<string>("NOT_CONNECTED");
  const [showSandbox, setShowSandbox] = useState<boolean>(false);
  const [moodleCalendarUrl, setMoodleCalendarUrl] = useState<string>("");
  const [moodleIcalConnected, setMoodleIcalConnected] = useState<boolean>(false);
  const [moodleIcalSyncStatus, setMoodleIcalSyncStatus] = useState<string>("NOT_CONNECTED");
  const [showLegacyDutic, setShowLegacyDutic] = useState<boolean>(false);
  const [courseFilter, setCourseFilter] = useState<"all" | "dutic" | "classroom">("all");
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "dutic" | "classroom">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [moodleSession, setMoodleSession] = useState<string>("demo");
  const [sesskey, setSesskey] = useState<string>("demo");
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [tokenPresent, setTokenPresent] = useState<boolean>(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api/v1";

  const getStoredToken = (): string | null => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("campusunsa_token");
  };

  const fetchAcademicData = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setTokenPresent(false);
      return;
    }
    setTokenPresent(true);

    try {
      // Fetch Moodle courses & assignments
      const [mCoursesRes, mAssignsRes, cCoursesRes, cAssignsRes] = await Promise.all([
        fetch(`${apiUrl}/dutic/courses`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/dutic/assignments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/classroom/courses`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
        fetch(`${apiUrl}/classroom/assignments`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
      ]);

      const allCourses: AcademicCourse[] = [];
      const allAssigns: AcademicAssignment[] = [];

      if (mCoursesRes.ok) {
        const mCourses: AcademicCourse[] = await mCoursesRes.json();
        allCourses.push(...mCourses);
      }
      if (cCoursesRes && cCoursesRes.ok) {
        const cCourses: AcademicCourse[] = await cCoursesRes.json();
        allCourses.push(...cCourses);
      }

      if (mAssignsRes.ok) {
        const mAssigns: AcademicAssignment[] = await mAssignsRes.json();
        allAssigns.push(...mAssigns);
      }
      if (cAssignsRes && cAssignsRes.ok) {
        const cAssigns: AcademicAssignment[] = await cAssignsRes.json();
        allAssigns.push(...cAssigns);
      }

      setCourses(allCourses);
      setAssignments(allAssigns);

      // Check Google Classroom connection status
      const statusRes = await fetch(`${apiUrl}/auth/google/classroom/status`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (statusRes && statusRes.ok) {
        const sData = await statusRes.json();
        setClassroomConnected(Boolean(sData.connected));
        setClassroomSyncStatus(sData.sync_status || "NOT_CONNECTED");
      }

      // Check Moodle iCal connection status
      const icalStatusRes = await fetch(`${apiUrl}/dutic/ical/status`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (icalStatusRes && icalStatusRes.ok) {
        const icalData = await icalStatusRes.json();
        setMoodleIcalConnected(Boolean(icalData.connected));
        setMoodleIcalSyncStatus(icalData.sync_status || "NOT_CONNECTED");
      }
    } catch {
      // In development, handle connection gracefully
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchAcademicData();
    const interval = setInterval(fetchAcademicData, 5000);
    return () => clearInterval(interval);
  }, [fetchAcademicData]);

  const handleExchangeClassroomCode = async (code: string) => {
    const token = getStoredToken();
    if (!token) return;

    setSyncing(true);
    setSyncStatus("Intercambiando codigo de autorizacion con Google...");

    try {
      const res = await fetch(`${apiUrl}/auth/google/classroom/callback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code, redirect_uri: "postmessage" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail?.message || `Error HTTP ${res.status}`;
        setSyncStatus(`Error de autorizacion Classroom: ${msg}`);
        return;
      }

      setClassroomConnected(true);
      setClassroomSyncStatus("CONNECTED");
      setSyncStatus("Google Classroom vinculado con exito. Sincronizando tareas...");
      await handleTriggerClassroomSync();
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      setSyncStatus(`Error de red al vincular Classroom: ${errStr}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleConnectClassroom = () => {
    if (typeof window === "undefined" || !window.google?.accounts?.oauth2) {
      setSyncStatus("SDK de Google Identity Services no disponible aun. Reintente en un momento.");
      return;
    }

    const clientId =
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      "680574461584-5vjt8ge9ah4rr1eapphoenit5imvk6m8.apps.googleusercontent.com";

    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope:
        "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly",
      ux_mode: "popup",
      callback: async (response: GoogleCodeResponse) => {
        if (response.error) {
          setSyncStatus(`Consentimiento cancelado o error de Google: ${response.error}`);
          return;
        }
        if (response.code) {
          await handleExchangeClassroomCode(response.code);
        }
      },
    });

    client.requestCode();
  };

  const handleTriggerClassroomSync = async (customToken?: string) => {
    const token = getStoredToken();
    if (!token) {
      setSyncStatus("Debes iniciar sesion con Google UNSA arriba antes de sincronizar.");
      return;
    }

    setSyncing(true);
    setSyncStatus("Conectando con motor de sincronizacion Google Classroom...");

    try {
      const payload = customToken ? { refresh_token: customToken } : {};
      const res = await fetch(`${apiUrl}/classroom/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail?.message || `Error HTTP ${res.status}`;
        if (err.detail?.code === "NEEDS_REAUTH") {
          setClassroomConnected(false);
          setClassroomSyncStatus("NEEDS_REAUTH");
          setSyncStatus("La autorizacion de Google expiro. Presiona 'Vincular Google Classroom' para renovarla.");
        } else {
          setSyncStatus(`Fallo de sincronizacion Classroom: ${msg}`);
        }
        return;
      }

      const data = await res.json();
      setSyncStatus(
        `Sincronizacion Classroom completada con exito: ${data.synced_courses_count} cursos y ${data.synced_assignments_count} tareas registradas en PostgreSQL.`
      );
      setClassroomConnected(true);
      setClassroomSyncStatus("SYNCED");
      await fetchAcademicData();
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      setSyncStatus(`Error de red: ${errStr}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleTriggerSync = async (sessionValue: string, keyValue: string) => {
    const token = getStoredToken();
    if (!token) {
      setSyncStatus("Debes iniciar sesion con Google UNSA arriba antes de sincronizar.");
      return;
    }

    setSyncing(true);
    setSyncStatus("Conectando con motor de sincronizacion DUTIC...");

    try {
      const res = await fetch(`${apiUrl}/dutic/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          moodle_session: sessionValue,
          sesskey: keyValue,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail?.message || `Error HTTP ${res.status}`;
        setSyncStatus(`Fallo de sincronizacion: ${msg}`);
        return;
      }

      const data = await res.json();
      setSyncStatus(
        `Sincronizacion completada con exito: ${data.synced_courses_count} cursos y ${data.synced_assignments_count} tareas registradas en PostgreSQL.`
      );
      await fetchAcademicData();
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      setSyncStatus(`Error de red: ${errStr}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearAssignments = async (origin?: string) => {
    const token = getStoredToken();
    if (!token) {
      setSyncStatus("Debes iniciar sesion con Google UNSA arriba antes de limpiar tareas.");
      return;
    }

    setSyncing(true);
    setSyncStatus("Eliminando tareas de la base de datos...");

    try {
      const url = origin
        ? `${apiUrl}/classroom/assignments?origin=${origin}`
        : `${apiUrl}/classroom/assignments`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail?.message || `Error HTTP ${res.status}`;
        setSyncStatus(`Error al eliminar tareas: ${msg}`);
        return;
      }

      const data = await res.json();
      setSyncStatus(`Tareas eliminadas: ${data.deleted_count} registros borrados de la base de datos.`);
      await fetchAcademicData();
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      setSyncStatus(`Error de red al limpiar tareas: ${errStr}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearCourses = async (origin?: string) => {
    const token = getStoredToken();
    if (!token) {
      setSyncStatus("Debes iniciar sesion con Google UNSA arriba antes de limpiar cursos.");
      return;
    }

    setSyncing(true);
    setSyncStatus("Eliminando cursos (y tareas asociadas) de la base de datos...");

    try {
      const url = origin
        ? `${apiUrl}/classroom/courses?origin=${origin}`
        : `${apiUrl}/classroom/courses`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail?.message || `Error HTTP ${res.status}`;
        setSyncStatus(`Error al eliminar cursos: ${msg}`);
        return;
      }

      const data = await res.json();
      setSyncStatus(`Cursos eliminados: ${data.deleted_count} registros borrados de la base de datos.`);
      await fetchAcademicData();
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      setSyncStatus(`Error de red al limpiar cursos: ${errStr}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleSubscribeMoodleIcal = async (calendarUrl: string) => {
    const token = getStoredToken();
    if (!token) {
      setSyncStatus("Debes iniciar sesion con Google UNSA arriba antes de vincular tu calendario.");
      return;
    }

    if (!calendarUrl || !calendarUrl.trim()) {
      setSyncStatus("Ingresa una URL de exportacion de calendario iCal de Moodle.");
      return;
    }

    setSyncing(true);
    setSyncStatus("Validando y suscribiendo URL de calendario iCal Moodle...");

    try {
      const res = await fetch(`${apiUrl}/dutic/ical/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ calendar_url: calendarUrl.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail?.message || `Error HTTP ${res.status}`;
        setSyncStatus(`Error al suscribir calendario: ${msg}`);
        return;
      }

      const data = await res.json();
      setMoodleIcalConnected(true);
      setMoodleIcalSyncStatus(data.sync_status || "SUBSCRIBED");
      setSyncStatus("Calendario suscrito exitosamente. Sincronizando eventos y tareas...");
      await handleSyncMoodleIcal();
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      setSyncStatus(`Error de red al suscribir calendario: ${errStr}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncMoodleIcal = async (adHocUrl?: string) => {
    const token = getStoredToken();
    if (!token) {
      setSyncStatus("Debes iniciar sesion con Google UNSA arriba antes de sincronizar.");
      return;
    }

    setSyncing(true);
    setSyncStatus("Descargando eventos de calendario iCal de Moodle...");

    try {
      const payload = adHocUrl ? { calendar_url: adHocUrl } : {};
      const res = await fetch(`${apiUrl}/dutic/ical/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail?.message || `Error HTTP ${res.status}`;
        if (err.detail?.code === "REVOKED_TOKEN") {
          setMoodleIcalConnected(false);
          setMoodleIcalSyncStatus("REVOKED");
          setSyncStatus("El token del calendario ha sido revocado en Moodle. Por favor genera un enlace nuevo.");
        } else {
          setSyncStatus(`Fallo de sincronizacion iCal: ${msg}`);
        }
        return;
      }

      const data = await res.json();
      setSyncStatus(
        `Sincronizacion iCal completada: ${data.events_parsed_count} eventos encontrados, ${data.synced_assignments_count} tareas registradas en PostgreSQL.`
      );
      setMoodleIcalConnected(true);
      setMoodleIcalSyncStatus("SYNCED");
      await fetchAcademicData();
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      setSyncStatus(`Error de red: ${errStr}`);
    } finally {
      setSyncing(false);
    }
  };

  const filteredCourses = courses.filter((course) => {
    const isMoodle = course.classroom_course_id.startsWith("moodle-");
    if (courseFilter === "dutic" && !isMoodle) return false;
    if (courseFilter === "classroom" && isMoodle) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = course.name.toLowerCase().includes(q);
      const matchSection = course.section ? course.section.toLowerCase().includes(q) : false;
      const matchId = course.classroom_course_id.toLowerCase().includes(q);
      return matchName || matchSection || matchId;
    }
    return true;
  });

  const filteredAssignments = assignments.filter((assignment) => {
    if (assignmentFilter === "dutic" && assignment.origin !== "moodle") return false;
    if (assignmentFilter === "classroom" && assignment.origin === "moodle") return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = assignment.title.toLowerCase().includes(q);
      const matchDesc = assignment.description ? assignment.description.toLowerCase().includes(q) : false;
      return matchTitle || matchDesc;
    }
    return true;
  });

  return (
    <section className="border border-slate-200 bg-white rounded-lg p-6 mb-8 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 mb-6 gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Panel de Cursos y Tareas Académicas (LMS Hub)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Inspeccion directa de cursos y tareas persistidas en PostgreSQL (DUTIC Moodle / Classroom)
          </p>
        </div>
        <div className="flex flex-wrap items-center space-x-2 gap-y-2">
          <div className="flex items-center space-x-1.5 mr-1">
            <button
              onClick={() => handleClearAssignments()}
              disabled={syncing || !tokenPresent || assignments.length === 0}
              className="text-xs px-2.5 py-1.5 rounded font-medium transition border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-40"
              title="Borra todas las tareas registradas de la base de datos"
            >
              Borrar Tareas
            </button>
            <button
              onClick={() => handleClearCourses()}
              disabled={syncing || !tokenPresent || courses.length === 0}
              className="text-xs px-2.5 py-1.5 rounded font-medium transition border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-40"
              title="Borra todos los cursos y sus tareas asociadas"
            >
              Borrar Cursos
            </button>
          </div>
          <button
            onClick={() => {
              setActiveTab("courses");
              setSearchQuery("");
            }}
            className={`text-xs px-3 py-1.5 rounded font-semibold transition ${
              activeTab === "courses"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Cursos ({courses.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("assignments");
              setSearchQuery("");
            }}
            className={`text-xs px-3 py-1.5 rounded font-semibold transition ${
              activeTab === "assignments"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Tareas y Evaluaciones ({assignments.length})
          </button>
        </div>
      </div>

      {/* Sincronizador de prueba / credenciales */}
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
        <div className="flex items-center space-x-2 mb-4 border-b border-slate-200 pb-2">
          <button
            onClick={() => setSyncSource("classroom")}
            className={`text-xs px-3 py-1.5 rounded font-semibold transition ${
              syncSource === "classroom"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            Sincronizacion Google Classroom
          </button>
          <button
            onClick={() => setSyncSource("dutic")}
            className={`text-xs px-3 py-1.5 rounded font-semibold transition ${
              syncSource === "dutic"
                ? "bg-purple-600 text-white"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            Sincronizacion DUTIC Moodle
          </button>
        </div>

        {syncSource === "classroom" ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Extraccion de Tareas Google Classroom
              </h3>
              {classroomConnected ? (
                <span className="inline-flex items-center text-[11px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                  Classroom Vinculado (Cuenta UNSA)
                </span>
              ) : classroomSyncStatus === "NEEDS_REAUTH" ? (
                <span className="inline-flex items-center text-[11px] font-semibold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full">
                  Re-autorizacion Requerida
                </span>
              ) : (
                <span className="inline-flex items-center text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-300 px-2.5 py-0.5 rounded-full">
                  No Vinculado
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600 mb-3">
              {classroomConnected
                ? "Tu cuenta institucional esta vinculada. Presiona el boton para actualizar cursos y tareas de forma 100% automatica sin ingresar ningun token."
                : "Autoriza a CampusUNSA con 1 clic para acceder a tus asignaciones de Google Classroom de forma segura y transparente:"}
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              {!classroomConnected ? (
                <button
                  onClick={handleConnectClassroom}
                  disabled={syncing || !tokenPresent}
                  className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded transition shadow-sm"
                >
                  {syncing ? "Conectando..." : "Vincular Google Classroom (1 Clic)"}
                </button>
              ) : (
                <button
                  onClick={() => handleTriggerClassroomSync()}
                  disabled={syncing || !tokenPresent}
                  className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded transition shadow-sm"
                >
                  {syncing ? "Sincronizando..." : "Sincronizar Google Classroom"}
                </button>
              )}

              <button
                onClick={fetchAcademicData}
                disabled={!tokenPresent}
                className="text-xs bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-800 font-semibold px-3 py-2 rounded transition"
              >
                Refrescar Lista
              </button>

              <button
                type="button"
                onClick={() => setShowSandbox(!showSandbox)}
                className="text-xs text-slate-500 hover:text-slate-800 underline ml-auto py-1"
              >
                {showSandbox ? "Ocultar Modo Sandbox" : "Modo Sandbox / Opciones Avanzadas"}
              </button>
            </div>

            {showSandbox && (
              <div className="p-3 bg-slate-100 border border-slate-200 rounded text-xs space-y-2 mt-2">
                <div className="font-semibold text-slate-700">Entorno de Pruebas Offline / Sandbox:</div>
                <p className="text-[11px] text-slate-600">
                  Usa esta opcion para probar la extraccion con datasets simulados si no dispones de credenciales OAuth de Google Cloud configuradas:
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    onClick={() => handleTriggerClassroomSync("demo")}
                    disabled={syncing || !tokenPresent}
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded transition"
                  >
                    Cargar Mocks Classroom (1 Clic)
                  </button>

                  <input
                    type="text"
                    value={classroomToken}
                    onChange={(e) => setClassroomToken(e.target.value)}
                    className="text-xs font-mono p-1.5 border border-slate-300 rounded bg-white flex-1 min-w-[200px]"
                    placeholder="Token manual o demo"
                  />

                  <button
                    onClick={() => handleTriggerClassroomSync(classroomToken)}
                    disabled={syncing || !tokenPresent}
                    className="text-xs bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded transition"
                  >
                    Sync con Token Manual
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Suscripcion de Calendario iCal Moodle (DUTIC)
              </h3>
              {moodleIcalConnected ? (
                <span className="inline-flex items-center text-[11px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                  Calendario iCal Vinculado
                </span>
              ) : (
                <span className="inline-flex items-center text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-300 px-2.5 py-0.5 rounded-full">
                  No Vinculado
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Conecta tu calendario de Moodle para extraer entregas y examenes automaticamente sin requerir credenciales ni cookies activas:
            </p>

            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                URL de Exportacion de Calendario iCal:
              </label>
              <input
                type="text"
                value={moodleCalendarUrl}
                onChange={(e) => setMoodleCalendarUrl(e.target.value)}
                className="w-full text-xs font-mono p-2 border border-slate-300 rounded bg-white"
                placeholder="https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?userid=...&authtoken=..."
              />
              <p className="text-[10px] text-slate-400 mt-1">
                En Moodle: Navega a Calendario &rarr; Exportar calendario &rarr; Selecciona &quot;Todos los eventos&quot; y &quot;Eventos recientes y proximos&quot; &rarr; Copiar enlace.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={() => handleSubscribeMoodleIcal(moodleCalendarUrl)}
                disabled={syncing || !tokenPresent || !moodleCalendarUrl}
                className="text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded transition shadow-sm"
              >
                {syncing ? "Procesando..." : "Vincular y Sincronizar Calendario iCal"}
              </button>

              {moodleIcalConnected && (
                <button
                  onClick={() => handleSyncMoodleIcal()}
                  disabled={syncing || !tokenPresent}
                  className="text-xs bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-semibold px-3 py-2 rounded transition"
                >
                  Sincronizar DUTIC iCal
                </button>
              )}

              <button
                onClick={() => handleSyncMoodleIcal("demo")}
                disabled={syncing || !tokenPresent}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-3 py-2 rounded transition"
              >
                Cargar Feed Demo UNSA (1 Clic)
              </button>

              <button
                onClick={fetchAcademicData}
                disabled={!tokenPresent}
                className="text-xs bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-800 font-semibold px-3 py-2 rounded transition"
              >
                Refrescar Lista
              </button>

              <button
                type="button"
                onClick={() => setShowLegacyDutic(!showLegacyDutic)}
                className="text-xs text-slate-500 hover:text-slate-800 underline ml-auto py-1"
              >
                {showLegacyDutic ? "Ocultar Metodo Cookie" : "Metodo Legacy / Cookie MoodleSession"}
              </button>
            </div>

            {showLegacyDutic && (
              <div className="p-3 bg-slate-100 border border-slate-200 rounded text-xs space-y-2 mt-3">
                <div className="font-semibold text-slate-700">Metodo Legacy con Cookie MoodleSession:</div>
                <p className="text-[11px] text-slate-600">
                  Requiere extraer la cookie MoodleSession de las herramientas de desarrollador del navegador.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Cookie MoodleSession:
                    </label>
                    <input
                      type="text"
                      value={moodleSession}
                      onChange={(e) => setMoodleSession(e.target.value)}
                      className="w-full text-xs font-mono p-1.5 border border-slate-300 rounded bg-white"
                      placeholder="demo o valor de cookie de dutic"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Clave sesskey:
                    </label>
                    <input
                      type="text"
                      value={sesskey}
                      onChange={(e) => setSesskey(e.target.value)}
                      className="w-full text-xs font-mono p-1.5 border border-slate-300 rounded bg-white"
                      placeholder="demo o M.cfg.sesskey"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => handleTriggerSync(moodleSession, sesskey)}
                    disabled={syncing || !tokenPresent}
                    className="text-xs bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded transition"
                  >
                    {syncing ? "Sincronizando..." : "Sincronizar via Cookie"}
                  </button>
                  <button
                    onClick={() => handleTriggerSync("demo", "demo")}
                    disabled={syncing || !tokenPresent}
                    className="text-xs bg-slate-600 hover:bg-slate-700 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded transition"
                  >
                    Mock Cookie Demo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!tokenPresent && (
          <p className="text-[11px] text-amber-700 mt-2 font-medium">
            Nota: Primero debes iniciar sesion con tu cuenta Google UNSA en la tarjeta superior para habilitar la sincronizacion.
          </p>
        )}

        {syncStatus && (
          <div className="mt-3 p-2.5 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded">
            {syncStatus}
          </div>
        )}
      </div>

      {/* Visualizacion de Cursos */}
      {activeTab === "courses" && (
        <div>
          {/* Barra de Filtros de Cursos */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Filtrar:</span>
              <button
                onClick={() => setCourseFilter("all")}
                className={`text-xs px-2.5 py-1 rounded font-medium transition ${
                  courseFilter === "all"
                    ? "bg-slate-800 text-white shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                Todos ({courses.length})
              </button>
              <button
                onClick={() => setCourseFilter("dutic")}
                className={`text-xs px-2.5 py-1 rounded font-medium transition ${
                  courseFilter === "dutic"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                DUTIC Moodle ({courses.filter((c) => c.classroom_course_id.startsWith("moodle-")).length})
              </button>
              <button
                onClick={() => setCourseFilter("classroom")}
                className={`text-xs px-2.5 py-1 rounded font-medium transition ${
                  courseFilter === "classroom"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                Classroom ({courses.filter((c) => !c.classroom_course_id.startsWith("moodle-")).length})
              </button>
            </div>

            <div className="flex items-center space-x-1.5">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar curso o seccion..."
                className="text-xs p-1.5 px-2.5 border border-slate-300 rounded bg-white w-full sm:w-48"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-xs text-slate-400 hover:text-slate-700 px-1 font-mono font-bold"
                  title="Limpiar busqueda"
                >
                  X
                </button>
              )}
            </div>
          </div>

          {courses.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs border border-dashed border-slate-200 rounded">
              No hay cursos sincronizados en la base de datos aun. Sincroniza desde DUTIC Moodle o Google Classroom arriba.
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs border border-dashed border-slate-200 rounded">
              Ningun curso coincide con los filtros aplicados.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredCourses.map((course) => (
                <div
                  key={course.id}
                  className="p-3 border border-slate-200 rounded-lg hover:border-blue-300 transition bg-white shadow-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        {course.classroom_course_id.startsWith("moodle-")
                          ? "DUTIC Moodle"
                          : "Google Classroom"}
                      </span>
                      <h4 className="font-semibold text-sm text-slate-900 mt-1.5">
                        {course.name}
                      </h4>
                      {course.section && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Seccion / Grupo: {course.section}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 font-mono">
                    ID: {course.classroom_course_id}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Visualizacion de Tareas */}
      {activeTab === "assignments" && (
        <div>
          {/* Barra de Filtros de Tareas */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Filtrar:</span>
              <button
                onClick={() => setAssignmentFilter("all")}
                className={`text-xs px-2.5 py-1 rounded font-medium transition ${
                  assignmentFilter === "all"
                    ? "bg-slate-800 text-white shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                Todas ({assignments.length})
              </button>
              <button
                onClick={() => setAssignmentFilter("dutic")}
                className={`text-xs px-2.5 py-1 rounded font-medium transition ${
                  assignmentFilter === "dutic"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                DUTIC Moodle ({assignments.filter((a) => a.origin === "moodle").length})
              </button>
              <button
                onClick={() => setAssignmentFilter("classroom")}
                className={`text-xs px-2.5 py-1 rounded font-medium transition ${
                  assignmentFilter === "classroom"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                Classroom ({assignments.filter((a) => a.origin !== "moodle").length})
              </button>
            </div>

            <div className="flex items-center space-x-1.5">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar tarea..."
                className="text-xs p-1.5 px-2.5 border border-slate-300 rounded bg-white w-full sm:w-48"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-xs text-slate-400 hover:text-slate-700 px-1 font-mono font-bold"
                  title="Limpiar busqueda"
                >
                  X
                </button>
              )}
            </div>
          </div>

          {assignments.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs border border-dashed border-slate-200 rounded">
              No hay tareas registradas aun. Sincroniza desde DUTIC Moodle o Google Classroom para extraer entregas pendientes.
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs border border-dashed border-slate-200 rounded">
              Ninguna tarea coincide con los filtros aplicados.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="p-3 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-blue-300 transition bg-white"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                          assignment.origin === "moodle"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {assignment.origin === "moodle" ? "DUTIC" : "Classroom"}
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded uppercase font-semibold">
                        Estado: {assignment.state}
                      </span>
                    </div>
                    <h4 className="font-semibold text-sm text-slate-900 mt-1">
                      {assignment.title}
                    </h4>
                    {assignment.due_date && (
                      <p className="text-xs text-slate-600 mt-0.5">
                        Vence: {new Date(assignment.due_date).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="text-right flex sm:flex-col items-center sm:items-end justify-between">
                    {assignment.max_points !== null && (
                      <span className="text-xs font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                        {assignment.max_points} pts
                      </span>
                    )}
                    {assignment.alternate_link && (
                      <a
                        href={assignment.alternate_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                      >
                        Ver en LMS
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
