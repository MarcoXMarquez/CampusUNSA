import "@testing-library/jest-dom/vitest";

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api-client";
import { SecretarialTickets } from "./SecretarialTickets";

const subject = "Pending administrative correction ".repeat(7);

function mount(onReconnect = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const props = {
    token: "session", userId: "viewer", staff: true, isOnline: true,
    onExit: vi.fn(), onReconnect,
  };
  const tree = (isOnline: boolean) => (
    <QueryClientProvider client={client}>
      <SecretarialTickets {...props} isOnline={isOnline} />
    </QueryClientProvider>
  );
  const result = render(tree(true));
  return { goOffline: () => result.rerender(tree(false)) };
}

describe("SecretarialTickets data states", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows loading and retries after an error while preserving loaded content offline", async () => {
    const queue = vi.spyOn(api, "fetchTicketQueue").mockRejectedValueOnce(new Error("Network failure"))
      .mockResolvedValueOnce([{
        id: "ticket-1",
        tracking_code: "TICK-2026-ABCD",
        student_id: "student",
        assigned_secretary_id: null,
        category: "Administration",
        subject,
        status: "OPEN",
        created_at: "2026-11-24T12:00:00Z",
        resolved_at: null,
      }]);
    const { goOffline } = mount();
    expect(screen.getByText("Cargando solicitudes…")).toBeTruthy();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo actualizar secretaría");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    const row = await screen.findByRole("button", { name: /TICK-2026-ABCD/ });
    expect(row.querySelector(".line-clamp-2")).toHaveTextContent("Pending administrative correction");
    goOffline();
    expect(screen.getByText(/Sin conexión/)).toBeVisible();
    expect(row).toBeVisible();
    expect(queue).toHaveBeenCalledTimes(2);
  });

  it("prompts the viewer to reconnect after expiration and hides staff data", async () => {
    const reconnect = vi.fn();
    vi.spyOn(api, "fetchTicketQueue").mockRejectedValue(new api.ApiRequestError("Unauthorized", 401));
    mount(reconnect);
    expect(await screen.findByRole("alert")).toHaveTextContent("Tu sesión venció");
    expect(screen.queryByRole("button", { name: "Filtrar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Volver a ingresar" }));
    expect(reconnect).toHaveBeenCalledOnce();
  });
});
