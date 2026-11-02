"use client";

import React, { useState, useMemo } from "react";
import {
  Navbar,
  BlockTitle,
  List,
  ListItem,
  Segmented,
  SegmentedButton,
  Button,
  Dialog,
  DialogButton,
} from "konsta/react";
import {
  Gear,
  QrCode,
  FileText,
  ArrowClockwise,
  WarningCircle,
  WifiSlash,
} from "@phosphor-icons/react";
import {
  isToday,
  isTomorrow,
  isThisWeek,
  format,
  parseISO,
  differenceInHours,
} from "date-fns";
import { es } from "date-fns/locale";
import { AcademicAssignment, TaskDetailSheet } from "./TaskDetailSheet";

interface AcademicCourse {
  id: string;
  classroom_course_id: string;
  name: string;
  section?: string | null;
  alternate_link?: string | null;
  created_at: string;
}

interface HoyViewProps {
  assignments: AcademicAssignment[];
  courses: AcademicCourse[];
  loading: boolean;
  syncing: boolean;
  isOnline: boolean;
  moodleSessionExpired: boolean;
  syncError: string | null;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onReconnectMoodle: () => void;
}

export function HoyView({
  assignments,
  courses,
  loading,
  syncing,
  isOnline,
  moodleSessionExpired,
  syncError,
  onRefresh,
  onOpenSettings,
  onReconnectMoodle,
}: HoyViewProps): React.JSX.Element {
  const [filter, setFilter] = useState<"all" | "dutic" | "classroom">("all");
  const [selectedTask, setSelectedTask] = useState<AcademicAssignment | null>(null);
  const [qrDialogOpened, setQrDialogOpened] = useState<boolean>(false);
  const [silabosDialogOpened, setSilabosDialogOpened] = useState<boolean>(false);

  // Map courses for easy lookup
  const courseMap = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((c) => {
      map.set(c.id, c.name);
      if (c.classroom_course_id) {
        map.set(c.classroom_course_id, c.name);
      }
    });
    return map;
  }, [courses]);

  // Filter assignments by source
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      if (filter === "dutic") return a.origin === "dutic" || a.origin === "moodle";
      if (filter === "classroom") return a.origin === "classroom";
      return true;
    });
  }, [assignments, filter]);

  // Group assignments into: Hoy, Mañana, Esta semana, Más adelante
  const groups = useMemo(() => {
    const hoy: AcademicAssignment[] = [];
    const manana: AcademicAssignment[] = [];
    const estaSemana: AcademicAssignment[] = [];
    const masAdelante: AcademicAssignment[] = [];

    filteredAssignments.forEach((item) => {
      const enriched: AcademicAssignment = {
        ...item,
        courseName: courseMap.get(item.course_id) || "UNSA",
      };

      if (!item.due_date) {
        masAdelante.push(enriched);
        return;
      }

      try {
        const d = parseISO(item.due_date);
        if (isToday(d)) {
          hoy.push(enriched);
        } else if (isTomorrow(d)) {
          manana.push(enriched);
        } else if (isThisWeek(d, { weekStartsOn: 1 })) {
          estaSemana.push(enriched);
        } else {
          masAdelante.push(enriched);
        }
      } catch {
        masAdelante.push(enriched);
      }
    });

    return { hoy, manana, estaSemana, masAdelante };
  }, [filteredAssignments, courseMap]);

  // Format relative deadline and check if urgent (< 24h)
  const formatDeadline = (dueDateStr?: string | null): { text: string; isUrgent: boolean } => {
    if (!dueDateStr) return { text: "Sin fecha", isUrgent: false };
    try {
      const d = parseISO(dueDateStr);
      const hoursRemaining = differenceInHours(d, new Date());
      const isUrgent = hoursRemaining >= 0 && hoursRemaining < 24;

      if (isToday(d)) {
        return { text: format(d, "HH:mm"), isUrgent };
      }
      if (isTomorrow(d)) {
        return { text: "Mañana", isUrgent };
      }
      if (isThisWeek(d, { weekStartsOn: 1 })) {
        return { text: format(d, "EEE", { locale: es }), isUrgent };
      }
      return { text: format(d, "d MMM", { locale: es }), isUrgent: false };
    } catch {
      return { text: dueDateStr, isUrgent: false };
    }
  };

  const totalCount = filteredAssignments.length;
  const subtitleText = totalCount === 1 ? "1 entrega pendiente" : `${totalCount} entregas pendientes`;

  return (
    <div className="pb-24">
      {/* iOS Large Navbar */}
      <Navbar
        title="Hoy"
        large
        subtitle={loading ? "Actualizando entregas..." : subtitleText}
        right={
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 text-primary dark:text-primary-dark active:opacity-60 transition-opacity"
            aria-label="Ajustes"
          >
            <Gear size={22} weight="regular" />
          </button>
        }
      />

      <div className="px-4 pt-2">
        {/* State Banner: Offline */}
        {!isOnline && (
          <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-center gap-2.5 text-[14px] text-amber-800 dark:text-amber-200">
            <WifiSlash size={18} weight="regular" className="shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="font-medium">Sin conexión · mostrando datos guardados</span>
          </div>
        )}

        {/* State Banner: Moodle Session Expired */}
        {moodleSessionExpired && (
          <div
            onClick={onReconnectMoodle}
            className="mb-3 px-3.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-center justify-between text-[14px] text-red-800 dark:text-red-200 cursor-pointer active:opacity-70 transition-opacity"
          >
            <div className="flex items-center gap-2.5">
              <WarningCircle size={18} weight="regular" className="shrink-0 text-red-600 dark:text-red-400" />
              <span className="font-medium">Sesión de Moodle vencida · Reconectar</span>
            </div>
            <span className="text-xs font-semibold text-primary dark:text-primary-dark">Reconectar</span>
          </div>
        )}

        {/* State Banner: Sync Error */}
        {syncError && (
          <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-center justify-between text-[14px] text-red-800 dark:text-red-200">
            <div className="flex items-center gap-2.5">
              <WarningCircle size={18} weight="regular" className="shrink-0 text-red-600 dark:text-red-400" />
              <span className="font-medium">Error de sincronización</span>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="text-xs font-semibold text-primary dark:text-primary-dark hover:underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Segmented Filter: Todos | Moodle | Classroom */}
        <div className="mb-4">
          <Segmented strong rounded>
            <SegmentedButton
              strong
              rounded
              active={filter === "all"}
              onClick={() => setFilter("all")}
            >
              Todos
            </SegmentedButton>
            <SegmentedButton
              strong
              rounded
              active={filter === "dutic"}
              onClick={() => setFilter("dutic")}
            >
              Moodle
            </SegmentedButton>
            <SegmentedButton
              strong
              rounded
              active={filter === "classroom"}
              onClick={() => setFilter("classroom")}
            >
              Classroom
            </SegmentedButton>
          </Segmented>
        </div>
      </div>

      {/* Skeletons on Initial Loading */}
      {loading && assignments.length === 0 ? (
        <div className="px-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-20 bg-slate-200 dark:bg-zinc-800 rounded ml-4" />
            <div className="rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 p-4 space-y-4">
              <div className="h-4 w-3/4 bg-slate-200 dark:bg-zinc-800 rounded" />
              <div className="h-3 w-1/2 bg-slate-200 dark:bg-zinc-800 rounded" />
            </div>
            <div className="rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 p-4 space-y-4">
              <div className="h-4 w-2/3 bg-slate-200 dark:bg-zinc-800 rounded" />
              <div className="h-3 w-1/3 bg-slate-200 dark:bg-zinc-800 rounded" />
            </div>
          </div>
        </div>
      ) : totalCount === 0 ? (
        /* Empty State */
        <div className="py-20 text-center px-6">
          <p className="text-[17px] text-black/40 dark:text-white/40 font-normal">
            Nada pendiente. Disfruta tu día.
          </p>
        </div>
      ) : (
        /* Grouped Inset Lists by Date */
        <>
          {groups.hoy.length > 0 && (
            <>
              <BlockTitle>Hoy</BlockTitle>
              <List strong inset className="my-0">
                {groups.hoy.map((task) => renderTaskItem(task))}
              </List>
            </>
          )}

          {groups.manana.length > 0 && (
            <>
              <BlockTitle>Mañana</BlockTitle>
              <List strong inset className="my-0">
                {groups.manana.map((task) => renderTaskItem(task))}
              </List>
            </>
          )}

          {groups.estaSemana.length > 0 && (
            <>
              <BlockTitle>Esta semana</BlockTitle>
              <List strong inset className="my-0">
                {groups.estaSemana.map((task) => renderTaskItem(task))}
              </List>
            </>
          )}

          {groups.masAdelante.length > 0 && (
            <>
              <BlockTitle>Más adelante</BlockTitle>
              <List strong inset className="my-0">
                {groups.masAdelante.map((task) => renderTaskItem(task))}
              </List>
            </>
          )}
        </>
      )}

      {/* Institutional Quick Access: Accesos UNSA */}
      <BlockTitle>Accesos UNSA</BlockTitle>
      <List strong inset className="my-0">
        <ListItem
          link
          chevron
          title="Carnet QR"
          subtitle="Identificación universitaria digital"
          media={<QrCode size={22} weight="regular" className="text-black/70 dark:text-white/70" />}
          onClick={() => setQrDialogOpened(true)}
        />
        <ListItem
          link
          chevron
          title="Sílabos"
          subtitle="Repositorio académico institucional"
          media={<FileText size={22} weight="regular" className="text-black/70 dark:text-white/70" />}
          onClick={() => setSilabosDialogOpened(true)}
        />
      </List>

      {/* Footnote & Refresh */}
      <div className="pt-8 pb-4 text-center">
        <button
          type="button"
          onClick={onRefresh}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 text-[13px] text-black/50 dark:text-white/50 hover:text-black/80 dark:hover:text-white/80 active:opacity-60 transition-colors"
        >
          <ArrowClockwise
            size={14}
            weight="regular"
            className={syncing ? "animate-spin text-primary dark:text-primary-dark" : ""}
          />
          <span>{syncing ? "Sincronizando..." : "Actualizado recientemente · Toca para sincronizar"}</span>
        </button>
      </div>

      {/* Task Detail Sheet */}
      <TaskDetailSheet
        assignment={selectedTask}
        opened={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />

      {/* Carnet QR Dialog */}
      <Dialog
        opened={qrDialogOpened}
        onBackdropClick={() => setQrDialogOpened(false)}
        title="Carnet Digital UNSA"
        buttons={
          <DialogButton onClick={() => setQrDialogOpened(false)}>
            Cerrar
          </DialogButton>
        }
      >
        <div className="text-center py-4">
          <div className="w-36 h-36 mx-auto bg-slate-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center border border-black/10 dark:border-white/10 mb-3">
            <QrCode size={96} weight="regular" className="text-slate-800 dark:text-slate-200" />
          </div>
          <p className="text-[15px] font-semibold text-black dark:text-white">
            Universidad Nacional de San Agustín
          </p>
          <p className="text-[13px] text-black/60 dark:text-white/60 mt-0.5">
            Ingeniería de Sistemas · Arequipa
          </p>
        </div>
      </Dialog>

      {/* Sílabos Dialog */}
      <Dialog
        opened={silabosDialogOpened}
        onBackdropClick={() => setSilabosDialogOpened(false)}
        title="Sílabos Institucionales"
        buttons={
          <DialogButton onClick={() => setSilabosDialogOpened(false)}>
            Cerrar
          </DialogButton>
        }
      >
        <p className="text-[15px] text-black/70 dark:text-white/70 leading-relaxed py-2">
          Accede al repositorio central de sílabos académicos aprobados para el presente periodo universitario en el portal de la UNSA.
        </p>
      </Dialog>
    </div>
  );

  function renderTaskItem(task: AcademicAssignment): React.JSX.Element {
    const isDutic = task.origin === "dutic" || task.origin === "moodle";
    const { text: deadlineText, isUrgent } = formatDeadline(task.due_date);

    return (
      <ListItem
        key={task.id}
        link
        chevron
        strongTitle
        title={task.title}
        subtitle={`${task.courseName || "UNSA"} · ${isDutic ? "Moodle" : "Classroom"}`}
        after={
          <span
            className={`text-[15px] font-medium ${
              isUrgent
                ? "text-urgent dark:text-urgent-dark font-semibold"
                : "text-black/50 dark:text-white/50"
            }`}
          >
            {deadlineText}
          </span>
        }
        media={
          <span
            className={`w-2 h-2 rounded-full ${
              isDutic ? "bg-red-500" : "bg-emerald-500"
            }`}
          />
        }
        onClick={() => setSelectedTask(task)}
      />
    );
  }
}
