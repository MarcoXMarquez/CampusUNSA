import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSwApiCache,
  registerServiceWorker,
  requestBackgroundSync,
  SW_SYNC_MESSAGE_TYPE,
} from "./pwa-sw";

describe("pwa-sw controller", () => {
  let messageHandlers: Array<(event: MessageEvent) => void>;
  let postMessageMock: ReturnType<typeof vi.fn>;
  let registerSyncMock: ReturnType<typeof vi.fn>;
  let registerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    messageHandlers = [];
    postMessageMock = vi.fn();
    registerSyncMock = vi.fn().mockResolvedValue(undefined);
    const activeWorker = { postMessage: postMessageMock };
    const registration = {
      scope: "/",
      active: activeWorker,
      sync: { register: registerSyncMock },
    };
    registerMock = vi.fn().mockResolvedValue(registration);

    vi.stubGlobal("navigator", {
      onLine: true,
      serviceWorker: {
        register: registerMock,
        controller: activeWorker,
        ready: Promise.resolve(registration),
        addEventListener: (type: string, cb: (event: MessageEvent) => void) => {
          if (type === "message") {
            messageHandlers.push(cb);
          }
        },
        removeEventListener: (type: string, cb: (event: MessageEvent) => void) => {
          if (type === "message") {
            messageHandlers = messageHandlers.filter((item) => item !== cb);
          }
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers /sw.js and invokes callback on background sync message", async () => {
    const onSyncRequested = vi.fn();
    const cleanup = await registerServiceWorker({ onSyncRequested });

    expect(registerMock).toHaveBeenCalledWith("/sw.js", { scope: "/" });

    messageHandlers.forEach((handler) =>
      handler({ data: { type: SW_SYNC_MESSAGE_TYPE } } as MessageEvent)
    );
    expect(onSyncRequested).toHaveBeenCalledTimes(1);

    cleanup();
    expect(messageHandlers.length).toBe(0);
  });

  it("triggers background sync and clears API cache via service worker messaging", async () => {
    await requestBackgroundSync();
    expect(registerSyncMock).toHaveBeenCalledWith("campusunsa-academic-sync");

    await clearSwApiCache();
    expect(postMessageMock).toHaveBeenCalledWith({ type: "CLEAR_API_CACHE" });
  });

  it("returns no-op cleanup cleanly when serviceWorker is unsupported", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const cleanup = await registerServiceWorker({ onSyncRequested: vi.fn() });
    expect(() => cleanup()).not.toThrow();
    await expect(requestBackgroundSync()).resolves.toBeUndefined();
    await expect(clearSwApiCache()).resolves.toBeUndefined();
  });
});
