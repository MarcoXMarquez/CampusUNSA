"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Navbar, BlockTitle, List, ListItem, Segmented, SegmentedButton, Dialog, DialogButton } from "konsta/react";
import { Gear, QrCode, FileText, ArrowClockwise, CheckCircle } from "@phosphor-icons/react";
import { format, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AcademicAssignment, TaskDetailSheet } from "./TaskDetailSheet";
import type { AcademicCourse } from "../hooks/useAcademicBoard";
import { groupTasksByUrgency, TaskGroup } from "../lib/task-urgency";
import { taskBoardMessages as messages } from "../lib/task-board-messages";

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
  onCompletionChange?: (id: string, completed: boolean) => void;
  completionPending?: boolean;
  completionError?: string | null;
}

const groupOrder: TaskGroup[] = ["overdue", "urgent", "soon", "later", "undated", "completed"];
const indicatorClasses: Record<TaskGroup, string> = {
  urgent: "bg-urgent dark:bg-urgent-dark",
  soon: "bg-deadline-soon dark:bg-deadline-soon-dark",
  later: "bg-deadline-later dark:bg-deadline-later-dark",
  overdue: "bg-black/60 dark:bg-white/60",
  undated: "bg-black/60 dark:bg-white/60",
  completed: "bg-black/60 dark:bg-white/60",
};

const TaskRow = memo(function TaskRow({ task, courseName, group, onOpen }: {
  task: AcademicAssignment; courseName: string; group: TaskGroup; onOpen: (id: string) => void;
}): React.JSX.Element {
  const due = task.due_date ? parseISO(task.due_date) : null;
  const dateLabel = due && isValid(due) ? format(due, "d MMM, HH:mm", { locale: es }) : messages.groups.undated;
  const source = task.origin === "moodle" || task.origin === "dutic" ? "Moodle" : "Classroom";
  return (
    <ListItem
      link chevron strongTitle
      linkComponent="button"
      linkProps={{ type: "button", onClick: () => onOpen(task.id), "aria-label": `${task.title} · ${courseName}` }}
      contentClassName="min-h-[88px] w-full text-left"
      innerClassName="min-w-0"
      titleWrapClassName="min-w-0"
      title={<span className={`line-clamp-2 whitespace-normal break-words text-[17px] font-semibold ${task.is_completed ? "text-black/60 dark:text-white/60" : "text-black dark:text-white"}`}>{task.title}</span>}
      subtitle={<span className="block truncate text-[15px] text-black/60 dark:text-white/60">{courseName} · {source}</span>}
      text={
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pb-1">
          <span data-urgency={group} aria-label={messages.urgencyLabels[group]}
            className="inline-flex items-center gap-1.5 rounded-full bg-black/5 dark:bg-white/10 px-2 py-1 text-[13px] text-black dark:text-white">
            {group === "completed" ? <CheckCircle size={14} weight="regular" aria-hidden="true" /> :
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${indicatorClasses[group]}`} />}
            {group === "completed" ? messages.completed : messages.groups[group]}
          </span>
          <span className="text-[13px] text-black/60 dark:text-white/60">{dateLabel}</span>
        </div>
      }
    />
  );
});

export function HoyView({
  assignments, courses, loading, syncing, isOnline, moodleSessionExpired, syncError,
  onRefresh, onOpenSettings, onReconnectMoodle, onCompletionChange,
  completionPending = false, completionError = null,
}: HoyViewProps): React.JSX.Element {
  const [filter, setFilter] = useState<"all" | "moodle" | "classroom">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quickAccess, setQuickAccess] = useState<"qr" | "syllabi" | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const courseMap = useMemo(() => new Map(courses.map(course => [course.id, course.name])), [courses]);
  const visible = useMemo(() => assignments.filter(task => filter === "all" ||
    (filter === "moodle" ? task.origin === "moodle" || task.origin === "dutic" : task.origin === "classroom")), [assignments, filter]);
  const groups = useMemo(() => groupTasksByUrgency(visible, now), [visible, now]);
  const pending = visible.filter(task => !task.is_completed).length;
  const selected = assignments.find(task => task.id === selectedId);
  const onOpen = useCallback((id: string) => setSelectedId(id), []);

  return (
    <div className="pb-24">
      <Navbar title={messages.title} large subtitle={loading ? messages.updating : `${pending} ${pending === 1 ? "entrega pendiente" : "entregas pendientes"}`}
        right={<button type="button" aria-label="Ajustes" onClick={onOpenSettings} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-primary dark:text-primary-dark"><Gear size={22} weight="regular" /></button>}
      />
      <div className="px-4 pt-2">
        {!isOnline && <p role="status" className="mb-3 rounded-xl bg-white dark:bg-ios-dark-surface p-3 text-[15px] text-black/60 dark:text-white/60">{messages.offline}</p>}
        {moodleSessionExpired && <button type="button" aria-label="Reconectar Moodle" onClick={onReconnectMoodle} className="mb-3 min-h-[44px] w-full rounded-xl bg-white dark:bg-ios-dark-surface p-3 text-left text-[15px] text-primary dark:text-primary-dark">{messages.expired}</button>}
        {syncError && <div role="alert" className="mb-3 rounded-xl bg-white dark:bg-ios-dark-surface p-3 text-[15px] text-black dark:text-white">
          <p>{messages.syncError}</p><button type="button" onClick={onRefresh} className="min-h-[44px] text-primary dark:text-primary-dark">{messages.retry}</button>
        </div>}
        <Segmented strong rounded className="mb-4">
          {([ ["all", "Todos"], ["moodle", "Moodle"], ["classroom", "Classroom"] ] as const).map(([value, label]) => (
            <SegmentedButton key={value} strong rounded active={filter === value} onClick={() => setFilter(value)} className="min-h-[44px]">{label}</SegmentedButton>
          ))}
        </Segmented>
      </div>

      {loading && assignments.length === 0 ? (
        <div role="status" aria-label={messages.loading} className="mx-4 animate-pulse space-y-3">
          {[0, 1, 2].map(index => <div key={index} className="rounded-xl bg-white dark:bg-ios-dark-surface p-4 space-y-3"><div className="h-4 w-3/4 rounded bg-black/10 dark:bg-white/10" /><div className="h-3 w-1/2 rounded bg-black/10 dark:bg-white/10" /></div>)}
        </div>
      ) : visible.length === 0 ? (
        <p className="px-6 py-20 text-center text-[17px] text-black/60 dark:text-white/60">{messages.empty}</p>
      ) : groupOrder.map(group => groups[group].length > 0 && (
        <section key={group} aria-label={messages.groups[group]}>
          <BlockTitle className="text-[22px] font-semibold">{messages.groups[group]}</BlockTitle>
          <List strong inset className="my-0">
            {groups[group].map(task => <TaskRow key={task.id} task={task} group={group} courseName={courseMap.get(task.course_id) ?? "UNSA"} onOpen={onOpen} />)}
          </List>
        </section>
      ))}

      <BlockTitle>Accesos UNSA</BlockTitle>
      <List strong inset className="my-0">
        <ListItem link chevron title="Carnet QR" subtitle="Identificación universitaria digital" media={<QrCode size={22} weight="regular" />} onClick={() => setQuickAccess("qr")} />
        <ListItem link chevron title="Sílabos" subtitle="Repositorio académico institucional" media={<FileText size={22} weight="regular" />} onClick={() => setQuickAccess("syllabi")} />
      </List>
      <div className="px-4 pt-6 text-center">
        <button type="button" onClick={onRefresh} disabled={syncing || !isOnline} className="inline-flex min-h-[44px] items-center gap-2 text-[13px] text-black/60 dark:text-white/60 disabled:opacity-60">
          <ArrowClockwise size={16} weight="regular" className={syncing ? "animate-spin" : ""} />
          {syncing ? messages.refreshing : messages.refresh}
        </button>
      </div>
      <TaskDetailSheet assignment={selected ? { ...selected, courseName: courseMap.get(selected.course_id) ?? "UNSA" } : null}
        opened={Boolean(selected)} onClose={() => setSelectedId(null)} onCompletionChange={onCompletionChange}
        completionPending={completionPending} completionError={completionError} isOnline={isOnline}
      />
      <Dialog opened={quickAccess !== null} onBackdropClick={() => setQuickAccess(null)}
        title={quickAccess === "qr" ? "Carnet Digital UNSA" : "Sílabos Institucionales"}
        buttons={<DialogButton onClick={() => setQuickAccess(null)}>Cerrar</DialogButton>}>
        {quickAccess === "qr" ? <div className="py-4 text-center"><QrCode size={96} weight="regular" className="mx-auto mb-3" /><p>Universidad Nacional de San Agustín</p><p>Ingeniería de Sistemas · Arequipa</p></div> :
          <p className="py-2 text-[15px]">Accede al repositorio central de sílabos académicos aprobados para el presente periodo universitario en el portal de la UNSA.</p>}
      </Dialog>
    </div>
  );
}
