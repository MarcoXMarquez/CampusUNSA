import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api-client";
import { regulationsMessages as m } from "@/lib/messages/regulations-messages";
import { RegulationsView } from "./RegulationsView";

const common = { isOnline: true, token: "test-token", staff: false, onBack: vi.fn(), onSignIn: vi.fn() };
afterEach(() => { vi.restoreAllMocks(); });

function ask() {
  fireEvent.change(screen.getByLabelText(m.question), { target: { value: "What is the enrollment rule?" } });
  fireEvent.click(screen.getByRole("button", { name: m.search }));
}

describe("RegulationsView", () => {
  it("shows the indexed extract and an exact official citation", async () => {
    vi.spyOn(api, "queryRegulations").mockResolvedValue({
      status: "answered", answer: "Official extract.", offer_ticket: false,
      citation: { title: "Regulation", article: "42", resolution: "0127-2020", page: 9,
        source_url: "https://transparencia.unsa.edu.pe/example.pdf" },
    });
    const { rerender } = render(<RegulationsView {...common} />);
    ask();
    expect(screen.getByRole("status", { name: m.loading })).toBeInTheDocument();
    expect(await screen.findByText("Official extract.")).toBeInTheDocument();
    expect(screen.getByText(m.citation("42", "0127-2020", 9))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: m.officialSource })).toHaveAttribute(
      "href", "https://transparencia.unsa.edu.pe/example.pdf#page=9",
    );
    rerender(<RegulationsView {...common} isOnline={false} />);
    expect(screen.getByText(m.offline)).toBeInTheDocument();
    expect(screen.getByText("Official extract.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.search })).toBeDisabled();
  });

  it("offers the existing ticket flow when no evidence is available", async () => {
    vi.spyOn(api, "queryRegulations").mockResolvedValue({ status: "not_found", offer_ticket: true });
    const onEscalate = vi.fn();
    render(<RegulationsView {...common} onEscalate={onEscalate} />);
    expect(screen.getByText(m.empty)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: m.library })).toBeNull();
    ask();
    expect(await screen.findByText(m.notFound)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: m.ticket }));
    expect(onEscalate).toHaveBeenCalledOnce();
  });

  it("prompts for sign-in when the institutional session expires", async () => {
    vi.spyOn(api, "queryRegulations").mockRejectedValue(new api.ApiRequestError("Expired", 401));
    const onSignIn = vi.fn();
    render(<RegulationsView {...common} onSignIn={onSignIn} />);
    ask();
    expect(await screen.findByRole("alert")).toHaveTextContent(m.expired);
    fireEvent.click(screen.getByRole("button", { name: m.signIn }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("exposes publication controls and an empty collection to staff", async () => {
    vi.spyOn(api, "listRegulations").mockResolvedValue([]);
    render(<RegulationsView {...common} staff />);
    fireEvent.click(screen.getByRole("button", { name: m.library }));
    expect(screen.getByLabelText(m.pdf)).toHaveAttribute("accept", "application/pdf,.pdf");
    expect(await screen.findByText(m.listEmpty)).toBeInTheDocument();
  });
});
