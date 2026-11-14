"use client";

import React, { useState, useMemo } from "react";
import { Navbar, BlockTitle, List, ListItem } from "konsta/react";
import { format, parseISO, compareAsc } from "date-fns";
import { es } from "date-fns/locale";
import { AcademicAssignment, TaskDetailSheet } from "./TaskDetailSheet";

interface AcademicCourse {
  id: string;
  classroom_course_id: string;
  name: string;
}

interface CalendarioViewProps {
  assignments: AcademicAssignment[];
  courses: AcademicCourse[];
  onCompletionChange?: (id: string, completed: boolean) => void;
  completionPending?: boolean;
  completionError?: string | null;
  isOnline?: boolean;
}

export function CalendarioView({
  assignments,
  courses,
  onCompletionChange,
  completionPending,
  completionError,
  isOnline,
}: CalendarioViewProps): React.JSX.Element {
  const [selectedTask, setSelectedTask] = useState<AcademicAssignment | null>(null);

  const courseMap = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((c) => {
      map.set(c.id, c.name);
      if (c.classroom_course_id) map.set(c.classroom_course_id, c.name);
    });
    return map;
  }, [courses]);

  // Sort assignments by due date ascending
  const sortedAssignments = useMemo(() => {
    return [...assignments].sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      try {
        return compareAsc(parseISO(a.due_date), parseISO(b.due_date));
      } catch {
        return 0;
      }
    });
  }, [assignments]);

  // Group by date string (e.g. "Lunes 18 de Noviembre")
  const groupedByDate = useMemo(() => {
    const map = new Map<string, AcademicAssignment[]>();
    sortedAssignments.forEach((item) => {
      const enriched = {
        ...item,
        courseName: courseMap.get(item.course_id) || "UNSA",
      };
      let key = "Sin fecha asignada";
      if (item.due_date) {
        try {
          const d = parseISO(item.due_date);
          key = format(d, "EEEE d 'de' MMMM", { locale: es });
        } catch {
          key = "Otras fechas";
        }
      }
      const existing = map.get(key) || [];
      existing.push(enriched);
      map.set(key, existing);
    });
    return Array.from(map.entries());
  }, [sortedAssignments, courseMap]);

  return (
    <div className="pb-24">
      <Navbar
        title="Calendario"
        large
        subtitle={`${assignments.length} entregas programadas`}
      />

      {groupedByDate.length === 0 ? (
        <div className="py-24 text-center px-6">
          <p className="text-[17px] text-black/40 dark:text-white/40 font-normal">
            No hay actividades en el calendario.
          </p>
        </div>
      ) : (
        groupedByDate.map(([dateTitle, tasks]) => (
          <div key={dateTitle}>
            <BlockTitle className="capitalize">{dateTitle}</BlockTitle>
            <List strong inset className="my-0">
              {tasks.map((task) => {
                const isDutic = task.origin === "dutic" || task.origin === "moodle";
                let timeStr = "";
                if (task.due_date) {
                  try {
                    timeStr = format(parseISO(task.due_date), "HH:mm");
                  } catch {
                    timeStr = "";
                  }
                }

                return (
                  <ListItem
                    key={task.id}
                    link
                    chevron
                    strongTitle
                    title={task.title}
                    subtitle={task.courseName}
                    after={timeStr ? <span className="text-[15px] text-black/50 dark:text-white/50">{timeStr}</span> : undefined}
                    media={
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isDutic
                            ? "bg-urgent dark:bg-urgent-dark"
                            : "bg-primary dark:bg-primary-dark"
                        }`}
                      />
                    }
                    onClick={() => setSelectedTask(task)}
                  />
                );
              })}
            </List>
          </div>
        ))
      )}

      <TaskDetailSheet
        assignment={selectedTask ? { ...selectedTask, ...assignments.find(task => task.id === selectedTask.id) } : null}
        opened={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onCompletionChange={onCompletionChange}
        completionPending={completionPending}
        completionError={completionError}
        isOnline={isOnline}
      />
    </div>
  );
}
