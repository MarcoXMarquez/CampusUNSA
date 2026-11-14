import type { components } from "../types/api";

export type UserResponse = components["schemas"]["UserResponse"];
export type TokenResponse = components["schemas"]["TokenResponse"];
export type ClassroomStatusResponse = components["schemas"]["ClassroomStatusResponse"];
export type ClassroomConsentResponse = components["schemas"]["ClassroomConsentResponse"];
export type MoodleIcalStatusResponse = components["schemas"]["MoodleIcalStatusResponse"];
export type MoodleIcalSubscribeResponse = components["schemas"]["MoodleIcalSubscribeResponse"];

export interface UserProfile extends Omit<UserResponse, "full_name"> {
  full_name?: string | null;
  is_active?: boolean;
  profile?: {
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

export interface IntegrationStatuses {
  classroomConnected: boolean;
  classroomSyncStatus: string;
  moodleSubscribed: boolean;
  moodleSyncStatus: string;
}

export interface BackendHealthStatus {
  reachable: boolean;
  healthy: boolean;
  database: string;
  redis: string;
}

interface DeleteResponse {
  deleted_count?: number;
  origin?: string;
  message?: string;
}

interface HealthApiPayload {
  status?: string;
  services?: {
    database?: string;
    redis?: string;
  };
}

interface ApiErrorPayload {
  detail?: string | { message?: string };
}

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api/v1";
}

export function getGoogleClientId(): string {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    "680574461584-5vjt8ge9ah4rr1eapphoenit5imvk6m8.apps.googleusercontent.com"
  );
}

export function getUserDisplayName(user: UserProfile | null | undefined): string {
  return (
    user?.full_name?.trim() ||
    user?.profile?.full_name?.trim() ||
    "Estudiante UNSA"
  );
}

function buildHeaders(
  token?: string | null,
  withJsonBody = false
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (withJsonBody) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function parseErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const data = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  if (!data?.detail) {
    return fallback;
  }
  if (typeof data.detail === "string") {
    return data.detail;
  }
  return data.detail.message || fallback;
}

export async function fetchCurrentUser(token: string): Promise<UserProfile | null> {
  const res = await fetch(`${getApiBaseUrl()}/auth/me`, {
    headers: buildHeaders(token),
  });
  if (res.status === 401) {
    throw new ApiRequestError("Unauthorized session", 401);
  }
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as UserProfile;
}

export async function fetchIntegrationStatuses(
  token: string
): Promise<IntegrationStatuses> {
  const headers = buildHeaders(token);
  const [classroomRes, moodleRes] = await Promise.all([
    fetch(`${getApiBaseUrl()}/auth/google/classroom/status`, { headers }).catch(
      () => null
    ),
    fetch(`${getApiBaseUrl()}/dutic/ical/status`, { headers }).catch(() => null),
  ]);

  const classroomData = classroomRes?.ok
    ? ((await classroomRes.json().catch(() => null)) as Partial<ClassroomStatusResponse> | null)
    : null;
  const moodleData = moodleRes?.ok
    ? ((await moodleRes.json().catch(() => null)) as Partial<MoodleIcalStatusResponse> | null)
    : null;

  return {
    classroomConnected: Boolean(classroomData?.connected),
    classroomSyncStatus: classroomData?.sync_status ?? "NOT_CONNECTED",
    moodleSubscribed: Boolean(moodleData?.connected),
    moodleSyncStatus: moodleData?.sync_status ?? "NOT_CONNECTED",
  };
}

export async function fetchBackendHealth(): Promise<BackendHealthStatus> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/health`);
    const data = (await res.json().catch(() => ({}))) as HealthApiPayload;
    return {
      reachable: true,
      healthy: res.ok && data.status === "healthy",
      database: data.services?.database ?? "unknown",
      redis: data.services?.redis ?? "unknown",
    };
  } catch {
    return {
      reachable: false,
      healthy: false,
      database: "unreachable",
      redis: "unreachable",
    };
  }
}

export async function authenticateWithGoogleToken(
  credential: string
): Promise<TokenResponse> {
  const res = await fetch(`${getApiBaseUrl()}/auth/google`, {
    method: "POST",
    headers: buildHeaders(null, true),
    body: JSON.stringify({ token: credential }),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "Error al autenticar con Google"),
      res.status
    );
  }
  return (await res.json()) as TokenResponse;
}

export async function exchangeClassroomCode(
  token: string,
  code: string,
  redirectUri = "postmessage"
): Promise<ClassroomConsentResponse> {
  const res = await fetch(`${getApiBaseUrl()}/auth/google/classroom/callback`, {
    method: "POST",
    headers: buildHeaders(token, true),
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "No se pudo vincular Google Classroom"),
      res.status
    );
  }
  return (await res.json()) as ClassroomConsentResponse;
}

export async function subscribeMoodleIcal(
  token: string,
  calendarUrl: string
): Promise<MoodleIcalSubscribeResponse> {
  const res = await fetch(`${getApiBaseUrl()}/dutic/ical/subscribe`, {
    method: "POST",
    headers: buildHeaders(token, true),
    body: JSON.stringify({ calendar_url: calendarUrl }),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "No se pudo suscribir el calendario Moodle"),
      res.status
    );
  }
  return (await res.json()) as MoodleIcalSubscribeResponse;
}

export async function clearSyncedAssignments(token: string): Promise<number> {
  const res = await fetch(`${getApiBaseUrl()}/classroom/assignments`, {
    method: "DELETE",
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "No se pudieron borrar las tareas sincronizadas"),
      res.status
    );
  }
  const data = (await res.json().catch(() => ({}))) as DeleteResponse;
  return data.deleted_count ?? 0;
}

export async function clearSyncedCourses(token: string): Promise<number> {
  const res = await fetch(`${getApiBaseUrl()}/classroom/courses`, {
    method: "DELETE",
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "No se pudieron borrar los cursos sincronizados"),
      res.status
    );
  }
  const data = (await res.json().catch(() => ({}))) as DeleteResponse;
  return data.deleted_count ?? 0;
}

export async function verifyWhatsAppPairingCode(
  code: string,
  token?: string | null
): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/whatsapp/pair`, {
    method: "POST",
    headers: buildHeaders(token, true),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "Código inválido o expirado"),
      res.status
    );
  }
}
