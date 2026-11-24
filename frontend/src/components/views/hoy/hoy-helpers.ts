import type { AcademicAssignment } from "@/components/sheets/TaskDetailSheet";
import type { AcademicCourse } from "@/hooks/useAcademicBoard";
import { getCourseColor } from "@/lib/schedule-calculator";
import { formatAcademicTitle } from "@/lib/text-format";
import { taskBoardMessages as messages } from "@/lib/messages/task-board-messages";

export type ComponentFilter = "all" | "theory" | "lab";

export interface UndoToastState {
  id: string;
  title: string;
}

export interface ResolvedTaskMeta {
  componentType: "TEORIA" | "LABORATORIO" | "UNICO";
  componentLabel: string;
  courseLabel: string;
  dotColor: string;
}

export function resolvePriorityLabel(priority?: string | null): string | null {
  if (!priority) return null;
  const upper = priority.toUpperCase();
  if (upper === "ALTA") return messages.priorities.ALTA;
  if (upper === "MEDIA") return messages.priorities.MEDIA;
  if (upper === "BAJA") return messages.priorities.BAJA;
  return null;
}

function normalizeComponentType(
  raw?: string | null
): "TEORIA" | "LABORATORIO" | "UNICO" {
  const upper = raw?.toUpperCase();
  if (upper === "LABORATORIO") return "LABORATORIO";
  if (upper === "TEORIA") return "TEORIA";
  return "UNICO";
}

/**
 * Resolves component type, course label, and deterministic course dot color for a task item.
 */
export function resolveTaskMetadata(
  item: AcademicAssignment,
  coursesById: Map<string, AcademicCourse>,
  coursesByCode: Map<string, AcademicCourse>
): ResolvedTaskMeta {
  const course =
    (item.course_id ? coursesById.get(item.course_id) : undefined) ??
    (item.course_code ? coursesByCode.get(item.course_code) : undefined);

  const matchedSource =
    item.source_id && course?.sources
      ? course.sources.find((src) => src.source_id === item.source_id)
      : undefined;

  const componentType = normalizeComponentType(
    item.component_type ?? matchedSource?.component_type
  );
  const componentLabel =
    componentType === "LABORATORIO"
      ? messages.components.lab
      : messages.components.theory;

  const baseName =
    formatAcademicTitle(item.courseName ?? course?.name ?? item.reported_course) ||
    (!item.course_id && !item.course_code ? "Personal" : "Curso UNSA");
  const groupCode =
    item.group_code ??
    (componentType === "LABORATORIO" ? course?.lab_group : course?.theory_group) ??
    null;
  const courseLabel = groupCode ? `${baseName} ${groupCode}` : baseName;

  const colorSeed =
    course?.course_code ?? item.course_code ?? course?.id ?? item.course_id ?? "personal";

  return {
    componentType,
    componentLabel,
    courseLabel,
    dotColor: getCourseColor(colorSeed),
  };
}
