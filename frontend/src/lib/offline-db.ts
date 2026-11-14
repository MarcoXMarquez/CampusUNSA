import type { AcademicBoardData } from "../hooks/useAcademicBoard";
import type { UserProfile } from "./api-client";

const DB_NAME = "campusunsa_offline_v1";
const DB_VERSION = 1;
const STORE_BOARDS = "academic_boards";
const STORE_SESSIONS = "session_snapshots";

const BOARD_LS_PREFIX = "campusunsa_board:";
const SESSION_LS_PREFIX = "campusunsa_session:";

export interface OfflineSessionSnapshot {
  user: UserProfile | null;
  classroomConnected: boolean;
  classroomSyncStatus: string;
  moodleIcalConnected: boolean;
  moodleIcalSyncStatus: string;
}

export function extractTokenSubject(token: string | null): string | null {
  if (!token) {
    return null;
  }
  try {
    const parts = token.split(".");
    if (parts.length < 2) {
      return "anon";
    }
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    ) as { sub?: string };
    return payload.sub || "anon";
  } catch {
    return "anon";
  }
}

function readLocalStorageJson<T>(key: string): T | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function writeLocalStorageJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or private mode failures
  }
}

function removeLocalStorageKey(key: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage access errors
  }
}

function getIndexedDbFactory(): IDBFactory | null {
  if (typeof globalThis === "undefined") {
    return null;
  }
  const maybeIdb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  return maybeIdb ?? null;
}

function openOfflineDatabase(): Promise<IDBDatabase | null> {
  const idb = getIndexedDbFactory();
  if (!idb) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = idb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_BOARDS)) {
          db.createObjectStore(STORE_BOARDS);
        }
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          db.createObjectStore(STORE_SESSIONS);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readIdbRecord<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openOfflineDatabase();
  if (!db) {
    return undefined;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => {
        const result = req.result as T | undefined;
        db.close();
        resolve(result);
      };
      req.onerror = () => {
        db.close();
        resolve(undefined);
      };
    } catch {
      db.close();
      resolve(undefined);
    }
  });
}

async function writeIdbRecord<T>(storeName: string, key: string, value: T): Promise<void> {
  const db = await openOfflineDatabase();
  if (!db) {
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

async function deleteIdbRecord(storeName: string, key: string): Promise<void> {
  const db = await openOfflineDatabase();
  if (!db) {
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export function readBoardSnapshotSync(token: string | null): AcademicBoardData | undefined {
  const sub = extractTokenSubject(token);
  if (!sub) {
    return undefined;
  }
  const parsed = readLocalStorageJson<Partial<AcademicBoardData>>(`${BOARD_LS_PREFIX}${sub}`);
  if (!parsed) {
    return undefined;
  }
  return {
    courses: Array.isArray(parsed.courses) ? parsed.courses : [],
    assignments: Array.isArray(parsed.assignments) ? parsed.assignments : [],
    moodleSessionExpired: Boolean(parsed.moodleSessionExpired),
  };
}

export async function readBoardFromIndexedDb(
  token: string | null
): Promise<AcademicBoardData | undefined> {
  const sub = extractTokenSubject(token);
  if (!sub) {
    return undefined;
  }
  const stored = await readIdbRecord<AcademicBoardData>(STORE_BOARDS, sub);
  if (!stored) {
    return undefined;
  }
  writeLocalStorageJson(`${BOARD_LS_PREFIX}${sub}`, stored);
  return stored;
}

export async function writeBoardSnapshot(
  token: string | null,
  data: AcademicBoardData
): Promise<void> {
  const sub = extractTokenSubject(token);
  if (!sub) {
    return;
  }
  writeLocalStorageJson(`${BOARD_LS_PREFIX}${sub}`, data);
  await writeIdbRecord(STORE_BOARDS, sub, data);
}

export function readSessionSnapshotSync(
  token: string | null
): OfflineSessionSnapshot | undefined {
  const sub = extractTokenSubject(token);
  if (!sub) {
    return undefined;
  }
  const parsed = readLocalStorageJson<Partial<OfflineSessionSnapshot>>(
    `${SESSION_LS_PREFIX}${sub}`
  );
  if (!parsed) {
    return undefined;
  }
  return {
    user: parsed.user ?? null,
    classroomConnected: Boolean(parsed.classroomConnected),
    classroomSyncStatus: parsed.classroomSyncStatus ?? "NOT_CONNECTED",
    moodleIcalConnected: Boolean(parsed.moodleIcalConnected),
    moodleIcalSyncStatus: parsed.moodleIcalSyncStatus ?? "NOT_CONNECTED",
  };
}

export async function readSessionFromIndexedDb(
  token: string | null
): Promise<OfflineSessionSnapshot | undefined> {
  const sub = extractTokenSubject(token);
  if (!sub) {
    return undefined;
  }
  const stored = await readIdbRecord<OfflineSessionSnapshot>(STORE_SESSIONS, sub);
  if (!stored) {
    return undefined;
  }
  writeLocalStorageJson(`${SESSION_LS_PREFIX}${sub}`, stored);
  return stored;
}

export async function writeSessionSnapshot(
  token: string | null,
  snapshot: OfflineSessionSnapshot
): Promise<void> {
  const sub = extractTokenSubject(token);
  if (!sub) {
    return;
  }
  writeLocalStorageJson(`${SESSION_LS_PREFIX}${sub}`, snapshot);
  await writeIdbRecord(STORE_SESSIONS, sub, snapshot);
}

export async function clearOfflineAccountData(token: string | null): Promise<void> {
  const sub = extractTokenSubject(token);
  if (!sub) {
    return;
  }
  removeLocalStorageKey(`${BOARD_LS_PREFIX}${sub}`);
  removeLocalStorageKey(`${SESSION_LS_PREFIX}${sub}`);
  await Promise.all([
    deleteIdbRecord(STORE_BOARDS, sub),
    deleteIdbRecord(STORE_SESSIONS, sub),
  ]);
}
