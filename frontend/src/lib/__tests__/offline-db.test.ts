import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcademicBoardData } from "../../hooks/useAcademicBoard";
import type { UserProfile } from "../api-client";
import {
  clearOfflineAccountData,
  extractTokenSubject,
  readBoardFromIndexedDb,
  readBoardSnapshotSync,
  readSessionFromIndexedDb,
  readSessionSnapshotSync,
  writeBoardSnapshot,
  writeSessionSnapshot,
  type OfflineSessionSnapshot,
} from "../offline-db";

function makeJwt(sub: string): string {
  return `header.${btoa(JSON.stringify({ sub }))}.signature`;
}

interface MutableRequest<T> {
  result: T | undefined;
  error: DOMException | null;
  onsuccess: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

interface MutableOpenRequest extends MutableRequest<IDBDatabase> {
  onupgradeneeded: ((ev: IDBVersionChangeEvent) => void) | null;
}

interface MutableTransaction {
  oncomplete: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  objectStore: () => {
    get: (key: string) => MutableRequest<unknown>;
    put: (value: unknown, key: string) => MutableRequest<string>;
    delete: (key: string) => MutableRequest<undefined>;
  };
}

function createMemoryIndexedDb(): IDBFactory {
  const databases = new Map<string, Map<string, Map<string, unknown>>>();

  const makeRequest = <T,>(executor: () => T): MutableRequest<T> => {
    const req: MutableRequest<T> = {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
    };
    queueMicrotask(() => {
      try {
        req.result = executor();
        req.onsuccess?.(new Event("success"));
      } catch (err) {
        req.error = err as DOMException;
        req.onerror?.(new Event("error"));
      }
    });
    return req;
  };

  return {
    open(name: string) {
      const openReq: MutableOpenRequest = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };

      queueMicrotask(() => {
        const existed = databases.has(name);
        if (!existed) {
          databases.set(name, new Map());
        }
        const dbStores = databases.get(name)!;

        const db = {
          objectStoreNames: {
            contains: (storeName: string) => dbStores.has(storeName),
          },
          createObjectStore: (storeName: string) => {
            if (!dbStores.has(storeName)) {
              dbStores.set(storeName, new Map());
            }
            return {} as IDBObjectStore;
          },
          transaction: (storeName: string) => {
            const storeMap = dbStores.get(storeName) ?? new Map<string, unknown>();
            const tx: MutableTransaction = {
              oncomplete: null,
              onerror: null,
              objectStore: () => ({
                get: (key: string) => makeRequest(() => storeMap.get(key)),
                put: (value: unknown, key: string) =>
                  makeRequest(() => {
                    storeMap.set(key, value);
                    queueMicrotask(() => tx.oncomplete?.(new Event("complete")));
                    return key;
                  }),
                delete: (key: string) =>
                  makeRequest(() => {
                    storeMap.delete(key);
                    queueMicrotask(() => tx.oncomplete?.(new Event("complete")));
                    return undefined;
                  }),
              }),
            };
            return tx as unknown as IDBTransaction;
          },
          close: () => undefined,
        } as unknown as IDBDatabase;

        openReq.result = db;
        if (!existed) {
          openReq.onupgradeneeded?.(new Event("upgradeneeded") as IDBVersionChangeEvent);
        }
        openReq.onsuccess?.(new Event("success"));
      });

      return openReq as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

describe("offline-db persistence helpers", () => {
  const tokenA = makeJwt("student-a");
  const tokenB = makeJwt("student-b");

  const boardSample: AcademicBoardData = {
    courses: [
      {
        id: "c-1",
        classroom_course_id: "1705275",
        course_code: "1705275",
        name: "DESARROLLO DE SOFTWARE PARA JUEGOS",
        theory_group: "A",
        lab_group: null,
        mapping_status: "LINKED",
        sources: [],
        schedule_blocks: [],
        created_at: "2026-11-01T00:00:00Z",
      },
    ],
    assignments: [
      {
        id: "a-1",
        title: "Entrega offline",
        course_id: "c-1",
        classroom_assignment_id: "cw-1",
        courseName: "DESARROLLO DE SOFTWARE PARA JUEGOS",
        origin: "CLASSROOM",
        state: "PUBLISHED",
        due_date: "2026-11-20T23:59:00Z",
        is_completed: false,
        created_at: "2026-11-01T00:00:00Z",
      },
    ],
    moodleSessionExpired: false,
  };

  const sessionSample: OfflineSessionSnapshot = {
    user: {
      id: "student-a",
      email: "a@unsa.edu.pe",
      full_name: "Student A",
      role: "student",
      is_active: true,
    } as UserProfile,
    classroomConnected: true,
    classroomSyncStatus: "CONNECTED",
    moodleIcalConnected: true,
    moodleIcalSyncStatus: "CONNECTED",
  };

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("extracts token subjects deterministically and falls back safely", () => {
    expect(extractTokenSubject(null)).toBeNull();
    expect(extractTokenSubject(tokenA)).toBe("student-a");
    expect(extractTokenSubject("raw-non-jwt-token")).toBe("anon");
  });

  it("writes and reads synchronous board snapshots and IndexedDB mirror per student", async () => {
    vi.stubGlobal("indexedDB", createMemoryIndexedDb());

    await writeBoardSnapshot(tokenA, boardSample);

    expect(localStorage.getItem("campusunsa_board:student-a")).not.toBeNull();
    expect(localStorage.getItem("campusunsa_board:student-b")).toBeNull();

    const syncRead = readBoardSnapshotSync(tokenA);
    expect(syncRead?.courses[0]?.course_code).toBe("1705275");
    expect(syncRead?.assignments[0]?.title).toBe("Entrega offline");

    // Even if localStorage is cleared, IndexedDB retains the snapshot
    localStorage.removeItem("campusunsa_board:student-a");
    expect(readBoardSnapshotSync(tokenA)).toBeUndefined();

    const idbRead = await readBoardFromIndexedDb(tokenA);
    expect(idbRead?.courses[0]?.course_code).toBe("1705275");
    expect(await readBoardFromIndexedDb(tokenB)).toBeUndefined();
  });

  it("persists session and platform integration flags separately per student and clears cleanly", async () => {
    vi.stubGlobal("indexedDB", createMemoryIndexedDb());

    await writeSessionSnapshot(tokenA, sessionSample);
    await writeSessionSnapshot(tokenB, {
      ...sessionSample,
      classroomConnected: false,
      moodleIcalConnected: false,
    });

    const syncA = readSessionSnapshotSync(tokenA);
    expect(syncA?.classroomConnected).toBe(true);
    expect(syncA?.moodleIcalConnected).toBe(true);
    expect(syncA?.user?.email).toBe("a@unsa.edu.pe");

    const idbA = await readSessionFromIndexedDb(tokenA);
    expect(idbA?.classroomConnected).toBe(true);

    await clearOfflineAccountData(tokenA);
    expect(readSessionSnapshotSync(tokenA)).toBeUndefined();
    expect(await readSessionFromIndexedDb(tokenA)).toBeUndefined();
    // Student B remains intact
    expect(readSessionSnapshotSync(tokenB)?.classroomConnected).toBe(false);
  });

  it("degrades gracefully when indexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);

    await expect(writeBoardSnapshot(tokenA, boardSample)).resolves.toBeUndefined();
    await expect(readBoardFromIndexedDb(tokenA)).resolves.toBeUndefined();
    expect(readBoardSnapshotSync(tokenA)?.assignments.length).toBe(1);
  });
});
