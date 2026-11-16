import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { academicBoardKey, useAcademicBoard } from "./useAcademicBoard";
import type { AcademicAssignment } from "@/components/sheets/TaskDetailSheet";

const token = `header.${btoa(JSON.stringify({ sub: "student-1" }))}.signature`;
const assignment: AcademicAssignment = {
  id: "task-1", title: "Sprint report", course_id: "course-1",
  classroom_assignment_id: "external-1", origin: "classroom", state: "PUBLISHED",
  created_at: "2026-11-01T00:00:00Z", is_completed: false,
};
const board = { courses: [], assignments: [assignment], moodleSessionExpired: false };
const response = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function mockFetch(patch: () => Promise<Response> = async () => response({ ...assignment, is_completed: true })) {
  let completed = false;
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      const result = await patch();
      if (result.ok) completed = true;
      return result;
    }
    if (String(input).endsWith("/assignments")) return response([{ ...assignment, is_completed: completed }]);
    if (String(input).endsWith("/status")) return response({ sync_status: "SYNCED" });
    return response([]);
  });
}

describe("academic board query and completion mutations", () => {
  beforeEach(() => { localStorage.clear(); onlineManager.setOnline(true); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("applies completion optimistically, persists with PATCH and invalidates the query", async () => {
    let resolvePatch: (value: Response) => void = () => {};
    const fetchMock = mockFetch(() => new Promise(resolve => { resolvePatch = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const { queryClient, wrapper } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAcademicBoard(token), { wrapper });
    await waitFor(() => expect(result.current.assignments.length).toBe(1));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/courses/enrolled"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${token}` }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/courses/assignments"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${token}` }) }),
    );
    act(() => result.current.setCompletion(assignment.id, true));
    await waitFor(() => expect(result.current.assignments[0].is_completed).toBe(true));
    expect(result.current.completionPending).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/assignments/${assignment.id}/completion`), expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ is_completed: true }),
      headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
    }));
    act(() => resolvePatch(response({ ...assignment, is_completed: true })));
    await waitFor(() => expect(result.current.completionPending).toBe(false));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: academicBoardKey(token) });
    expect(result.current.assignments[0].is_completed).toBe(true);
  });

  it("rolls back the optimistic change and reports a failed save", async () => {
    vi.stubGlobal("fetch", mockFetch(async () => response({}, 500)));
    const { wrapper } = setup();
    const { result } = renderHook(() => useAcademicBoard(token), { wrapper });
    await waitFor(() => expect(result.current.assignments.length).toBe(1));
    act(() => result.current.setCompletion(assignment.id, true));
    await waitFor(() => expect(result.current.completionError).toBeTruthy());
    expect(result.current.assignments[0].is_completed).toBe(false);
  });

  it("preserves cached tasks when a refetch fails", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = setup();
    const { result } = renderHook(() => useAcademicBoard(token), { wrapper });
    await waitFor(() => expect(result.current.assignments.length).toBe(1));
    fetchMock.mockRejectedValue(new TypeError("Network unavailable"));
    await act(async () => { await result.current.refresh(); });
    await waitFor(() => expect(result.current.syncError).toBeTruthy());
    expect(result.current.assignments[0].id).toBe(assignment.id);
    expect(JSON.parse(localStorage.getItem("campusunsa_board:student-1") ?? "{}").assignments).toHaveLength(1);
  });

  it("hydrates the matching student's cached board while offline", () => {
    localStorage.setItem("campusunsa_board:student-1", JSON.stringify(board));
    onlineManager.setOnline(false);
    vi.stubGlobal("fetch", vi.fn());
    const { wrapper } = setup();
    const { result } = renderHook(() => useAcademicBoard(token), { wrapper });
    expect(result.current.assignments[0].id).toBe(assignment.id);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not load another student's cache or make anonymous requests even on refresh", async () => {
    localStorage.setItem("campusunsa_board:student-1", JSON.stringify(board));
    vi.stubGlobal("fetch", vi.fn());
    const { wrapper } = setup();
    const { result } = renderHook(() => useAcademicBoard(null), { wrapper });
    expect(result.current.assignments).toEqual([]);
    await act(async () => { await result.current.refresh(); });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates a manual assignment, appends to board cache, and writes snapshot", async () => {
    const created: AcademicAssignment = {
      id: "manual-1",
      course_id: "enr-1",
      source_id: null,
      course_code: "1705275",
      classroom_assignment_id: "manual:uuid-1",
      title: "Informe de laboratorio 04",
      description: "Subir ZIP",
      due_date: "2026-11-20T23:59:00-05:00",
      state: "PUBLISHED",
      is_completed: false,
      priority: "ALTA",
      component_type: "LABORATORIO",
      origin: "manual",
      created_at: "2026-11-16T01:00:00Z",
    };

    let storedAssignments: AcademicAssignment[] = [assignment];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST" && String(input).endsWith("/courses/assignments")) {
        storedAssignments = [assignment, created];
        return response(created, 201);
      }
      if (String(input).endsWith("/courses/assignments")) return response(storedAssignments);
      if (String(input).endsWith("/status")) return response({ sync_status: "SYNCED" });
      return response([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { queryClient, wrapper } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAcademicBoard(token), { wrapper });
    await waitFor(() => expect(result.current.assignments).toHaveLength(1));

    await act(async () => {
      await result.current.createAssignment({
        title: "Informe de laboratorio 04",
        course_code: "1705275",
        component_type: "LABORATORIO",
        due_date: "2026-11-20T23:59:00-05:00",
        priority: "ALTA",
        notes: "Subir ZIP",
      });
    });

    await waitFor(() => expect(result.current.assignments).toHaveLength(2));
    expect(result.current.assignments[1].id).toBe("manual-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: academicBoardKey(token) });
    expect(JSON.parse(localStorage.getItem("campusunsa_board:student-1") ?? "{}").assignments).toHaveLength(2);
  });
});
