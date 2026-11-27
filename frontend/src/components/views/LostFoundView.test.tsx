import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api-client";
import { lostFoundMessages as m } from "@/lib/messages/lost-found-messages";
import { LostFoundView } from "./LostFoundView";

const item: api.LostItem = {
  id: "demo-item",
  title: "Mochila azul",
  description: "Mochila encontrada cerca de la biblioteca.",
  location: "Biblioteca de Ingenierías",
  campus: "engineering",
  found_on: "2026-11-25",
  status: "open",
};

const claim: api.LostClaim = {
  id: "demo-claim",
  item_id: item.id,
  item_title: item.title,
  item_status: "open",
  is_reporter: true,
  proof: "Tiene una etiqueta de tela en el interior.",
  status: "pending",
  pickup: null,
};

afterEach(() => { vi.restoreAllMocks(); });

describe("LostFoundView", () => {
  it("shows row skeletons, renders the public photo link, and preserves rows while offline", async () => {
    vi.spyOn(api, "fetchLostItems").mockResolvedValue([item]);
    const props = { token: null, onBack: vi.fn(), onSignIn: vi.fn() };
    const { rerender } = render(<LostFoundView {...props} isOnline />);
    expect(screen.getByRole("status", { name: m.loading })).toBeInTheDocument();
    await screen.findByRole("heading", { name: item.title });
    expect(screen.getByRole("link", { name: new RegExp(m.fullPhoto) })).toHaveAttribute(
      "href", expect.stringContaining("/lost-found/demo-item/photo?thumbnail=false"),
    );
    await act(async () => { rerender(<LostFoundView {...props} isOnline={false} />); });
    expect(screen.getByText(m.offline)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.claim })).toBeDisabled();
    expect(screen.getByRole("heading", { name: item.title })).toBeInTheDocument();
  });

  it("offers a retry after a sync error and shows the empty state", async () => {
    const catalog = vi.spyOn(api, "fetchLostItems").mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValue([]);
    render(<LostFoundView token={null} isOnline onBack={vi.fn()} onSignIn={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(m.syncError);
    fireEvent.click(screen.getByRole("button", { name: m.retry }));
    expect(await screen.findByText(m.emptyCatalog)).toBeInTheDocument();
    expect(catalog).toHaveBeenCalledTimes(2);
  });

  it("allows a private review and prompts for sign-in when the session expires", async () => {
    vi.spyOn(api, "fetchLostItems").mockResolvedValue([item]);
    const loadClaims = vi.spyOn(api, "fetchMyLostClaims")
      .mockResolvedValueOnce([claim])
      .mockRejectedValue(new api.ApiRequestError("Expired", 401));
    const approve = vi.spyOn(api, "reviewLostClaim").mockResolvedValue({
      ...claim, status: "approved", item_status: "reserved", pickup: "Encuentro en biblioteca a las 14:00.",
    });
    const onSignIn = vi.fn();
    render(<LostFoundView token="session-token" isOnline onBack={vi.fn()} onSignIn={onSignIn} />);
    await screen.findByRole("heading", { name: item.title });
    expect(screen.queryByText(claim.proof)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: m.claims }));
    expect(await screen.findByText(claim.proof)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: m.approve }));
    const pickup = screen.getByRole("textbox", { name: new RegExp(m.pickup) });
    expect(pickup).toHaveFocus();
    fireEvent.change(pickup, { target: { value: "Encuentro en biblioteca a las 14:00." } });
    fireEvent.click(screen.getByRole("button", { name: m.approve }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith("session-token", item.id, claim.id, {
      decision: "approved", pickup: "Encuentro en biblioteca a las 14:00.",
    }));
    expect(await screen.findByText(m.sessionExpired)).toBeInTheDocument();
    expect(screen.queryByText(claim.proof)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: m.signIn }));
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(loadClaims).toHaveBeenCalledTimes(2);
  });

  it("offers institutional sign-in to guests and requests the rear camera for signed-in reports", async () => {
    vi.spyOn(api, "fetchLostItems").mockResolvedValue([]);
    const onSignIn = vi.fn();
    const { rerender } = render(<LostFoundView token={null} isOnline onBack={vi.fn()} onSignIn={onSignIn} />);
    fireEvent.click(screen.getByRole("button", { name: m.report }));
    fireEvent.click(screen.getByRole("button", { name: m.signIn }));
    expect(onSignIn).toHaveBeenCalledOnce();
    rerender(<LostFoundView token="session-token" isOnline onBack={vi.fn()} onSignIn={onSignIn} />);
    expect(screen.getByLabelText(new RegExp(m.photo))).toHaveAttribute("capture", "environment");
    expect(screen.getByRole("button", { name: m.publish })).toBeDisabled();
  });
});
