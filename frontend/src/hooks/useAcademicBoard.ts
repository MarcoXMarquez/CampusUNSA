"use client";

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AcademicAssignment } from "@/components/sheets/TaskDetailSheet";
import {
  createManualAssignment,
  getApiBaseUrl,
  type CourseScheduleBlock,
  type CreateManualAssignmentPayload,
} from "../lib/api-client";
import {
  readBoardFromIndexedDb,
  readBoardSnapshotSync,
  writeBoardSnapshot,
} from "../lib/offline-db";
import { taskBoardMessages } from "@/lib/messages/task-board-messages";

export interface AcademicCourseSource {
  source_id: string;
  origin: string;
  external_course_id: string;
  raw_name: string;
  raw_section?: string | null;
  component_type: string;
  alternate_link?: string | null;
  mapping_status: string;
}

export interface AcademicCourse {
  id: string;
  classroom_course_id: string;
  name: string;
  section?: string | null;
  alternate_link?: string | null;
  origin?: string;
  course_code?: string | null;
  curriculum_year?: number | null;
  theory_group?: string | null;
  lab_group?: string | null;
  mapping_status?: string;
  sources?: AcademicCourseSource[];
  schedule_blocks?: CourseScheduleBlock[];
  created_at: string;
}

export interface AcademicBoardData {
  courses: AcademicCourse[];
  assignments: AcademicAssignment[];
  moodleSessionExpired: boolean;
}

interface CompletionChange {
  id: string;
  completed: boolean;
  token: string;
}

const EMPTY_BOARD: AcademicBoardData = { courses: [], assignments: [], moodleSessionExpired: false };
export const academicBoardKey = (token: string | null) => ["academic-board", token] as const;

function readCache(token: string | null): AcademicBoardData | undefined {
  return readBoardSnapshotSync(token);
}

function writeCache(token: string | null, data: AcademicBoardData): void {
  void writeBoardSnapshot(token, data);
}

async function loadBoard(token: string, signal: AbortSignal): Promise<AcademicBoardData> {
  const apiUrl = getApiBaseUrl();
  const headers = { Authorization: `Bearer ${token}` };
  // Fetch deduplicated curriculum enrollments (+ pending sources) and normalized assignments.
  const [coursesResponse, assignmentsResponse, statusResponse] = await Promise.all([
    fetch(`${apiUrl}/courses/enrolled`, { headers, signal }),
    fetch(`${apiUrl}/courses/assignments`, { headers, signal }),
    fetch(`${apiUrl}/dutic/ical/status`, { headers, signal }).catch(() => null),
  ]);
  if (!coursesResponse.ok || !assignmentsResponse.ok) throw new Error(taskBoardMessages.syncError);
  const courses: AcademicCourse[] = await coursesResponse.json();
  const assignments: AcademicAssignment[] = await assignmentsResponse.json();
  if (!Array.isArray(courses) || !Array.isArray(assignments)) throw new Error(taskBoardMessages.syncError);
  const status: { sync_status?: string } = statusResponse?.ok ? await statusResponse.json() : {};
  const data = { courses, assignments, moodleSessionExpired: status.sync_status === "NEEDS_REAUTH" };
  writeCache(token, data);
  return data;
}

export function useAcademicBoard(token: string | null) {
  const client = useQueryClient();
  const key = academicBoardKey(token);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => token ? loadBoard(token, signal) : Promise.resolve(EMPTY_BOARD),
    enabled: Boolean(token),
    initialData: () => readCache(token),
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!token || readBoardSnapshotSync(token)) {
      return;
    }
    let cancelled = false;
    void readBoardFromIndexedDb(token).then((stored) => {
      if (!cancelled && stored && !client.getQueryData(key)) {
        client.setQueryData(key, stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client, key, token]);

  const mutation = useMutation({
    mutationFn: async ({ id, completed, token: sessionToken }: CompletionChange): Promise<AcademicAssignment> => {
      const response = await fetch(`${getApiBaseUrl()}/classroom/assignments/${id}/completion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ is_completed: completed }),
      });
      if (!response.ok) throw new Error(taskBoardMessages.completionError);
      return response.json();
    },
    networkMode: "always",
    retry: false,
    onMutate: async (change) => {
      const mutationKey = academicBoardKey(change.token);
      await client.cancelQueries({ queryKey: mutationKey });
      const previous = client.getQueryData<AcademicBoardData>(mutationKey);
      client.setQueryData<AcademicBoardData>(mutationKey, (old) => old && ({
        ...old,
        assignments: old.assignments.map(task => task.id === change.id ? { ...task, is_completed: change.completed } : task),
      }));
      return { previous, mutationKey };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) client.setQueryData(context.mutationKey, context.previous);
    },
    onSuccess: (updated, change) => {
      const mutationKey = academicBoardKey(change.token);
      const data = client.setQueryData<AcademicBoardData>(mutationKey, old => old && ({
        ...old, assignments: old.assignments.map(task => task.id === updated.id ? updated : task),
      }));
      if (data) writeCache(change.token, data);
    },
    onSettled: (_data, _error, change) => client.invalidateQueries({ queryKey: academicBoardKey(change.token) }),
  });

  const { mutate } = mutation;
  const setCompletion = useCallback((id: string, completed: boolean) => {
    if (token) mutate({ id, completed, token });
  }, [mutate, token]);

  const createMutation = useMutation({
    mutationFn: ({
      payload,
      sessionToken,
    }: {
      payload: CreateManualAssignmentPayload;
      sessionToken: string;
    }) => createManualAssignment(sessionToken, payload),
    networkMode: "always",
    retry: false,
    onSuccess: (created, vars) => {
      const mutationKey = academicBoardKey(vars.sessionToken);
      const next = client.setQueryData<AcademicBoardData>(mutationKey, (old) => {
        const base = old ?? readCache(vars.sessionToken) ?? EMPTY_BOARD;
        const alreadyExists = base.assignments.some((task) => task.id === created.id);
        return {
          ...base,
          assignments: alreadyExists
            ? base.assignments.map((task) => (task.id === created.id ? created : task))
            : [...base.assignments, created],
        };
      });
      if (next) writeCache(vars.sessionToken, next);
      client.invalidateQueries({ queryKey: mutationKey });
    },
  });

  const { mutateAsync: createMutateAsync } = createMutation;
  const createAssignment = useCallback(
    async (payload: CreateManualAssignmentPayload): Promise<AcademicAssignment> => {
      if (!token) {
        throw new Error(taskBoardMessages.syncError);
      }
      return createMutateAsync({ payload, sessionToken: token });
    },
    [createMutateAsync, token]
  );

  const setAssignments = useCallback((assignments: AcademicAssignment[]): void => {
    client.setQueryData<AcademicBoardData>(key, (old) => {
      const base = old ?? readCache(token) ?? EMPTY_BOARD;
      const next = { ...base, assignments };
      writeCache(token, next);
      return next;
    });
  }, [client, key, token]);

  const setCourses = useCallback((courses: AcademicCourse[]): void => {
    client.setQueryData<AcademicBoardData>(key, (old) => {
      const base = old ?? readCache(token) ?? EMPTY_BOARD;
      const next = { ...base, courses };
      writeCache(token, next);
      return next;
    });
  }, [client, key, token]);

  return {
    ...(query.data ?? EMPTY_BOARD),
    loading: query.isPending && query.isFetching,
    syncing: query.isFetching,
    syncError: query.isError ? taskBoardMessages.syncError : null,
    completionPending: mutation.isPending && mutation.variables?.token === token,
    completionError: mutation.isError && mutation.variables?.token === token ? taskBoardMessages.completionError : null,
    creatingAssignment: createMutation.isPending && createMutation.variables?.sessionToken === token,
    setCompletion, createAssignment, setAssignments, setCourses, refresh: query.refetch,
  };
}
