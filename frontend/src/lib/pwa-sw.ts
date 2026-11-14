export const SW_URL = "/sw.js";
export const SW_SYNC_TAG = "campusunsa-academic-sync";
export const SW_SYNC_MESSAGE_TYPE = "CAMPUSUNSA_BACKGROUND_SYNC";

interface SyncManagerLike {
  register: (tag: string) => Promise<void>;
}

interface SyncCapableRegistration extends ServiceWorkerRegistration {
  sync?: SyncManagerLike;
}

export interface RegisterServiceWorkerOptions {
  onSyncRequested?: () => void;
}

export async function registerServiceWorker(
  options: RegisterServiceWorkerOptions = {}
): Promise<() => void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return () => undefined;
  }

  const handleMessage = (event: MessageEvent): void => {
    const payload = event.data as { type?: string } | null | undefined;
    if (payload?.type === SW_SYNC_MESSAGE_TYPE) {
      options.onSyncRequested?.();
    }
  };

  navigator.serviceWorker.addEventListener("message", handleMessage);

  try {
    await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch {
    // Graceful degradation when SW registration fails in restricted contexts
  }

  return () => {
    navigator.serviceWorker.removeEventListener("message", handleMessage);
  };
}

export async function requestBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = (await navigator.serviceWorker.ready) as SyncCapableRegistration;
    if (registration.sync) {
      await registration.sync.register(SW_SYNC_TAG);
      return;
    }
    registration.active?.postMessage({ type: "TRIGGER_SYNC" });
  } catch {
    // Ignore unsupported SyncManager errors
  }
}

export async function clearSwApiCache(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const controller = navigator.serviceWorker.controller;
    if (controller) {
      controller.postMessage({ type: "CLEAR_API_CACHE" });
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: "CLEAR_API_CACHE" });
  } catch {
    // Ignore when no active service worker exists
  }
}
