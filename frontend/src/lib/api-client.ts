import { AUTH_MESSAGES } from "./messages/auth-messages";
import { taskBoardMessages } from "./messages/task-board-messages";
import type { components, paths } from "../types/api";

export type UserResponse = components["schemas"]["UserResponse"];
export type TokenResponse = components["schemas"]["TokenResponse"];
export type ClassroomStatusResponse = components["schemas"]["ClassroomStatusResponse"];
export type ClassroomConsentResponse = components["schemas"]["ClassroomConsentResponse"];
export type MoodleIcalStatusResponse = components["schemas"]["MoodleIcalStatusResponse"];
export type MoodleIcalSubscribeResponse = components["schemas"]["MoodleIcalSubscribeResponse"];
export type CourseCatalogItem = components["schemas"]["CourseCatalogResponse"];
export type CourseScheduleBlock = components["schemas"]["CourseScheduleBlockResponse"];
export type CourseScheduleBlockInput = components["schemas"]["CourseScheduleBlockInput"];
export type CourseScheduleUpdateRequest = components["schemas"]["CourseScheduleUpdateRequest"];
export type ExternalSourceSummary = components["schemas"]["ExternalSourceSummaryResponse"];
export type ApiAcademicCourseResponse = components["schemas"]["AcademicCourseResponse"];
export type ApiAcademicAssignmentResponse = components["schemas"]["AcademicAssignmentResponse"];
export type CreateManualAssignmentPayload = components["schemas"]["CreateManualAssignmentRequest"];
export type ManualCourseLinkPayload = components["schemas"]["ManualCourseLinkRequest"];
export type MessagingChannel = components["schemas"]["OtpGenerateRequest"]["channel"];
export type OtpGenerateResponse = components["schemas"]["OtpGenerateResponse"];
export type OtpVerifyRequest = components["schemas"]["OtpVerifyRequest"];
export type OtpVerifyResponse = components["schemas"]["OtpVerifyResponse"];
export type OtpStatusResponse = components["schemas"]["OtpStatusResponse"];
export type OtpUnlinkResponse = components["schemas"]["OtpUnlinkResponse"];

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
  classroomReachable: boolean;
  moodleReachable: boolean;
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

  const classroomReachable = Boolean(classroomRes?.ok);
  const moodleReachable = Boolean(moodleRes?.ok);

  return {
    classroomConnected: Boolean(classroomData?.connected),
    classroomSyncStatus: classroomData?.sync_status ?? "NOT_CONNECTED",
    moodleSubscribed: Boolean(moodleData?.connected),
    moodleSyncStatus: moodleData?.sync_status ?? "NOT_CONNECTED",
    classroomReachable,
    moodleReachable,
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

export async function generateMessagingOtp(
  channel: MessagingChannel,
  token?: string | null
): Promise<OtpGenerateResponse> {
  const res = await fetch(`${getApiBaseUrl()}/auth/otp/generate`, {
    method: "POST",
    headers: buildHeaders(token, true),
    body: JSON.stringify({ channel }),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "No se pudo generar el código OTP"),
      res.status
    );
  }
  return (await res.json()) as OtpGenerateResponse;
}

export async function verifyMessagingOtp(
  payload: OtpVerifyRequest,
  token?: string | null
): Promise<OtpVerifyResponse> {
  const res = await fetch(`${getApiBaseUrl()}/auth/otp/verify`, {
    method: "POST",
    headers: buildHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "Código OTP inválido o expirado"),
      res.status
    );
  }
  return (await res.json()) as OtpVerifyResponse;
}

export async function fetchMessagingOtpStatus(
  token?: string | null
): Promise<OtpStatusResponse> {
  const res = await fetch(`${getApiBaseUrl()}/auth/otp/status`, {
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "No se pudo consultar el estado de mensajería"),
      res.status
    );
  }
  return (await res.json()) as OtpStatusResponse;
}

export async function unlinkMessagingChannel(
  channel: MessagingChannel,
  token?: string | null
): Promise<OtpUnlinkResponse> {
  const res = await fetch(`${getApiBaseUrl()}/auth/otp/link/${encodeURIComponent(channel)}`, {
    method: "DELETE",
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "No se pudo desvincular el canal"),
      res.status
    );
  }
  return (await res.json()) as OtpUnlinkResponse;
}

export async function fetchCurriculumCatalog(
  token: string,
  query?: string
): Promise<CourseCatalogItem[]> {
  const params = new URLSearchParams();
  if (query && query.trim()) {
    params.set("q", query.trim());
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${getApiBaseUrl()}/courses/catalog${suffix}`, {
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "No se pudo cargar el catálogo de cursos"),
      res.status
    );
  }
  return (await res.json()) as CourseCatalogItem[];
}

export async function linkExternalCourseSource(
  token: string,
  sourceId: string,
  payload: ManualCourseLinkPayload
): Promise<ExternalSourceSummary> {
  const res = await fetch(`${getApiBaseUrl()}/courses/sources/${encodeURIComponent(sourceId)}/link`, {
    method: "POST",
    headers: buildHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "No se pudo vincular el curso"),
      res.status
    );
  }
  return (await res.json()) as ExternalSourceSummary;
}

export async function fetchCourseScheduleBlocks(
  token: string,
  courseCode: string,
  theoryGroup?: string | null,
  labGroup?: string | null
): Promise<CourseScheduleBlock[]> {
  const params = new URLSearchParams();
  if (theoryGroup) {
    params.set("theory_group", theoryGroup);
  }
  if (labGroup) {
    params.set("lab_group", labGroup);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(
    `${getApiBaseUrl()}/courses/enrolled/${encodeURIComponent(courseCode)}/schedule${suffix}`,
    {
      headers: buildHeaders(token),
    }
  );
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "No se pudieron cargar los horarios del grupo"),
      res.status
    );
  }
  return (await res.json()) as CourseScheduleBlock[];
}

export async function saveCourseSchedule(
  token: string,
  courseCode: string,
  payload: CourseScheduleUpdateRequest
): Promise<ApiAcademicCourseResponse> {
  const res = await fetch(
    `${getApiBaseUrl()}/courses/enrolled/${encodeURIComponent(courseCode)}/schedule`,
    {
      method: "PUT",
      headers: buildHeaders(token, true),
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "No se pudo guardar el horario del curso"),
      res.status
    );
  }
  return (await res.json()) as ApiAcademicCourseResponse;
}

export async function createManualAssignment(
  token: string,
  payload: CreateManualAssignmentPayload
): Promise<ApiAcademicAssignmentResponse> {
  const res = await fetch(`${getApiBaseUrl()}/courses/assignments`, {
    method: "POST",
    headers: buildHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(res, "No se pudo crear la tarea"),
      res.status
    );
  }
  return (await res.json()) as ApiAcademicAssignmentResponse;
}

export async function loginWithCredentials(
  payload: components["schemas"]["EmailLoginRequest"]
): Promise<TokenResponse> {
  const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: buildHeaders(null, true),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(response, AUTH_MESSAGES.authenticationError),
      response.status
    );
  }
  return response.json();
}

export async function fetchAcademicBoard(token: string, signal: AbortSignal): Promise<{
  courses: ApiAcademicCourseResponse[];
  assignments: ApiAcademicAssignmentResponse[];
  moodleSessionExpired: boolean;
}> {
  const base = getApiBaseUrl();
  const options = { headers: buildHeaders(token), signal };
  const [coursesResponse, assignmentsResponse, statusResponse] = await Promise.all([
    fetch(`${base}/courses/enrolled`, options),
    fetch(`${base}/courses/assignments`, options),
    fetch(`${base}/dutic/ical/status`, options).catch(() => null),
  ]);
  if (!coursesResponse.ok || !assignmentsResponse.ok) {
    throw new Error(taskBoardMessages.syncError);
  }
  const courses: ApiAcademicCourseResponse[] = await coursesResponse.json();
  const assignments: ApiAcademicAssignmentResponse[] = await assignmentsResponse.json();
  if (!Array.isArray(courses) || !Array.isArray(assignments)) {
    throw new Error(taskBoardMessages.syncError);
  }
  const status: Partial<MoodleIcalStatusResponse> = statusResponse?.ok
    ? await statusResponse.json()
    : {};
  return { courses, assignments, moodleSessionExpired: status.sync_status === "NEEDS_REAUTH" };
}

export async function updateAssignmentCompletion(
  token: string,
  id: string,
  payload: components["schemas"]["AssignmentCompletionRequest"]
): Promise<ApiAcademicAssignmentResponse> {
  const response = await fetch(
    `${getApiBaseUrl()}/classroom/assignments/${encodeURIComponent(id)}/completion`,
    { method: "PATCH", headers: buildHeaders(token, true), body: JSON.stringify(payload) }
  );
  if (!response.ok) throw new Error(taskBoardMessages.completionError);
  return response.json();
}

export type SecretarialTicket = components["schemas"]["TicketResponse"];
export type SecretarialTicketDetail = components["schemas"]["TicketDetail"];
export type TicketStatus = SecretarialTicket["status"];
export type TicketNotice = components["schemas"]["TicketNotificationResponse"];
type TicketQueueFilters = NonNullable<paths["/api/v1/tickets/all"]["get"]["parameters"]["query"]>;
type TicketCreate = components["schemas"]["TicketCreate"];
type TicketTransition = components["schemas"]["TicketTransition"];
type TicketRouting = components["schemas"]["TicketRouting"];

async function requestTicket<T>(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}/tickets${path}`, {
    ...options,
    cache: "no-store",
    headers: buildHeaders(token, Boolean(options.body)),
  });
  if (!response.ok) {
    throw new ApiRequestError("Ticket request failed", response.status);
  }
  return response.status === 204 ? undefined as T : response.json();
}

export function fetchTicketQueue(
  token: string,
  queue: "mine" | "all",
  filters: TicketQueueFilters,
  signal?: AbortSignal,
): Promise<SecretarialTicket[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  return requestTicket(token, `/${queue}?${params}`, { signal });
}

export function fetchTicketRouting(token: string, signal?: AbortSignal): Promise<TicketRouting> {
  return requestTicket(token, "/routing", { signal });
}

export function fetchTicketDetail(
  token: string, id: string, signal?: AbortSignal,
): Promise<SecretarialTicketDetail> {
  return requestTicket(token, `/${encodeURIComponent(id)}`, { signal });
}

export function createSecretarialTicket(token: string, input: TicketCreate): Promise<SecretarialTicketDetail> {
  return requestTicket(token, "", { method: "POST", body: JSON.stringify(input) });
}

export function transitionTicket(
  token: string, id: string, change: TicketTransition,
): Promise<SecretarialTicketDetail> {
  return requestTicket(token, `/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(change) });
}

export function withdrawTicket(token: string, id: string): Promise<void> {
  return requestTicket(token, `/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function fetchTicketNotifications(token: string, signal?: AbortSignal): Promise<TicketNotice[]> {
  return requestTicket(token, "/notifications", { signal });
}

export function acknowledgeTicketNotice(token: string, id: string): Promise<void> {
  return requestTicket(token, `/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
}

export async function createCalendarSubscription(token: string, endsOn: string): Promise<string> {
  const payload: components["schemas"]["CalendarSubscriptionRequest"] = { ends_on: endsOn };
  const base = getApiBaseUrl().replace(/\/+$/, "");
  const response = await fetch(`${base}/courses/calendar/subscription`, {
    method: "POST", headers: buildHeaders(token, true), body: JSON.stringify(payload),
  });
  if (!response.ok) throw new ApiRequestError("Calendar subscription failed", response.status);
  const data = await response.json() as components["schemas"]["CalendarSubscriptionResponse"];
  return `${base}${data.path}`;
}

export async function revokeCalendarSubscription(token: string): Promise<void> {
  const response = await fetch(`${getApiBaseUrl().replace(/\/+$/, "")}/courses/calendar/subscription`, {
    method: "DELETE", headers: buildHeaders(token),
  });
  if (!response.ok) throw new ApiRequestError("Calendar subscription revocation failed", response.status);
}

export type LostItem = components["schemas"]["LostItemPublic"];
export type LostClaim = components["schemas"]["LostClaimPrivate"];
export type LostReportInput = paths["/api/v1/lost-found"]["post"]["requestBody"]["content"]["application/json"];
type LostClaimInput = components["schemas"]["LostClaimCreate"];
type LostClaimDecision = components["schemas"]["LostClaimReview"];

export const LOST_FOUND_PAGE_SIZE = 12;

async function requestLostFound<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}/lost-found${path}`, {
    ...options,
    cache: "no-store",
    headers: buildHeaders(token, Boolean(options.body)),
  });
  if (!response.ok) {
    throw new ApiRequestError("Lost and found request failed", response.status);
  }
  return response.json();
}

export function fetchLostItems(offset: number, signal: AbortSignal): Promise<LostItem[]> {
  return requestLostFound(`?limit=${LOST_FOUND_PAGE_SIZE}&offset=${offset}`, undefined, { signal });
}

export function fetchMyLostClaims(token: string, offset: number, signal: AbortSignal): Promise<LostClaim[]> {
  return requestLostFound(`/claims?limit=${LOST_FOUND_PAGE_SIZE}&offset=${offset}`, token, { signal });
}

export function lostItemPhotoUrl(id: string, thumbnail = false): string {
  return `${getApiBaseUrl()}/lost-found/${encodeURIComponent(id)}/photo?thumbnail=${thumbnail}`;
}

export function reportLostItem(token: string, data: LostReportInput): Promise<LostItem> {
  return requestLostFound("", token, { method: "POST", body: JSON.stringify(data) });
}

export function submitLostClaim(token: string, id: string, data: LostClaimInput): Promise<LostClaim> {
  return requestLostFound(`/${encodeURIComponent(id)}/claims`, token, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function reviewLostClaim(
  token: string, itemId: string, claimId: string, data: LostClaimDecision,
): Promise<LostClaim> {
  return requestLostFound(`/${encodeURIComponent(itemId)}/claims/${encodeURIComponent(claimId)}`, token, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function returnLostItem(token: string, id: string): Promise<LostItem> {
  return requestLostFound(`/${encodeURIComponent(id)}`, token, {
    method: "PATCH",
    body: JSON.stringify({ status: "returned" }),
  });
}
