"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AcademicAssignment } from "../components/TaskDetailSheet";
import { getApiBaseUrl } from "../lib/api-client";
import { taskBoardMessages } from "../lib/task-board-messages";

export interface AcademicCourse {
  id: string;
  classroom_course_id: string;
  name: string;
  section?: string | null;
  alternate_link?: string | null;
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

function cacheKey(token: string | null): string | null {
  if (!token || typeof window === "undefined") return null;
  try {
    const payload: unknown = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload === "object" && payload !== null && "sub" in payload && typeof payload.sub === "string") {
      return `campusunsa_board:${payload.sub}`;
    }
  } catch { /* Invalid sessions never share a persisted cache. */ }
  return null;
}

function readCache(token: string | null): AcademicBoardData | undefined {
  const key = cacheKey(token);
  if (!key) return undefined;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (typeof value === "object" && value !== null && "courses" in value &&
        "assignments" in value && Array.isArray(value.courses) && Array.isArray(value.assignments)) {
      return value as AcademicBoardData;
    }
  } catch { /* A damaged or unavailable cache must not prevent a network load. */ }
  return undefined;
}

function writeCache(token: string | null, data: AcademicBoardData): void {
  const key = cacheKey(token);
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch { /* Storage quota and browser privacy settings do not invalidate server saves. */ }
}

async function loadBoard(token: string, signal: AbortSignal): Promise<AcademicBoardData> {
  const apiUrl = getApiBaseUrl();
  const headers = { Authorization: `Bearer ${token}` };
  // Both list endpoints include every LMS origin; avoid fetching duplicate Moodle records.
  const [coursesResponse, assignmentsResponse, statusResponse] = await Promise.all([
    fetch(`${apiUrl}/classroom/courses`, { headers, signal }),
    fetch(`${apiUrl}/classroom/assignments`, { headers, signal }),
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
    setCompletion, setAssignments, setCourses, refresh: query.refetch,
  };
}
