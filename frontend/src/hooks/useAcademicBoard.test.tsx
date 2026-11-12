import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { academicBoardKey, useAcademicBoard } from "./useAcademicBoard";
import type { AcademicAssignment } from "../components/TaskDetailSheet";

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
});
