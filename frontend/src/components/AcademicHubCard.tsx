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
    } catch {
      // In development, handle connection gracefully
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchAcademicData();
    const interval = setInterval(fetchAcademicData, 5000);
    return () => clearInterval(interval);
  }, [fetchAcademicData]);

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
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab("courses")}
            className={`text-xs px-3 py-1.5 rounded font-semibold transition ${
              activeTab === "courses"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Cursos ({courses.length})
          </button>
          <button
            onClick={() => setActiveTab("assignments")}
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
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
          Sincronizacion DUTIC Moodle
        </h3>
        <p className="text-xs text-slate-600 mb-3">
          Puedes probar la extraccion directamente con 1 clic en modo demostracion UNSA o ingresar tus credenciales reales:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Cookie MoodleSession:
            </label>
            <input
              type="text"
              value={moodleSession}
              onChange={(e) => setMoodleSession(e.target.value)}
              className="w-full text-xs font-mono p-2 border border-slate-300 rounded bg-white"
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
              className="w-full text-xs font-mono p-2 border border-slate-300 rounded bg-white"
              placeholder="demo o M.cfg.sesskey"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleTriggerSync(moodleSession, sesskey)}
            disabled={syncing || !tokenPresent}
            className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded transition"
          >
            {syncing ? "Sincronizando..." : "Sincronizar DUTIC"}
          </button>

          <button
            onClick={() => handleTriggerSync("demo", "demo")}
            disabled={syncing || !tokenPresent}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded transition"
          >
            Cargar Cursos de Demostracion UNSA (1 Clic)
          </button>

          <button
            onClick={fetchAcademicData}
            disabled={!tokenPresent}
            className="text-xs bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-800 font-semibold px-3 py-2 rounded transition"
          >
            Refrescar Lista
          </button>
        </div>

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
          {courses.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs border border-dashed border-slate-200 rounded">
              No hay cursos sincronizados en la base de datos aun. Haz clic en &#34;Cargar Cursos de Demostracion UNSA&#34; o sincroniza arriba.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {courses.map((course) => (
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
          {assignments.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs border border-dashed border-slate-200 rounded">
              No hay tareas registradas aun. Sincroniza cursos para extraer las entregas pendientes.
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((assignment) => (
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
