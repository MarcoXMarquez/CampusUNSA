import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppSheet } from "./WhatsAppSheet";
import { ApiRequestError } from "@/lib/api-client";

const mockFetchMessagingOtpStatus = vi.fn();
const mockGenerateMessagingOtp = vi.fn();
const mockVerifyMessagingOtp = vi.fn();
const mockUnlinkMessagingChannel = vi.fn();

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    fetchMessagingOtpStatus: (...args: unknown[]) =>
      mockFetchMessagingOtpStatus(...args),
    generateMessagingOtp: (...args: unknown[]) =>
      mockGenerateMessagingOtp(...args),
    verifyMessagingOtp: (...args: unknown[]) =>
      mockVerifyMessagingOtp(...args),
    unlinkMessagingChannel: (...args: unknown[]) =>
      mockUnlinkMessagingChannel(...args),
  };
});

describe("WhatsAppSheet omnichannel OTP linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchMessagingOtpStatus.mockResolvedValue({
      whatsapp_connected: false,
      whatsapp_phone: null,
      telegram_connected: false,
      telegram_chat_id: null,
      pending_whatsapp_ttl: 0,
      pending_telegram_ttl: 0,
    });
    mockGenerateMessagingOtp.mockResolvedValue({
      channel: "whatsapp",
      otp_code: "482910",
      expires_in_seconds: 300,
      expires_at: "2026-11-15T19:00:00Z",
      deep_link_url: "https://wa.me/51954123456?text=482910",
      status: "PENDING",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("generates a 5-minute WhatsApp OTP on open and exposes wa.me deep link and 44px controls", async () => {
    render(
      <WhatsAppSheet opened={true} onClose={vi.fn()} token="jwt-student-1" />
    );

    await waitFor(() => {
      expect(mockGenerateMessagingOtp).toHaveBeenCalledWith(
        "whatsapp",
        "jwt-student-1"
      );
    });

    expect(await screen.findByText("4")).toBeTruthy();
    expect(screen.getByText(/El código expira en 5:00/i)).toBeTruthy();

    const deepLink = screen.getByRole("link", {
      name: /Enviar código por WhatsApp/i,
    });
    expect(deepLink.getAttribute("href")).toBe(
      "https://wa.me/51954123456?text=482910"
    );

    const telegramTab = screen.getByRole("tab", { name: /Telegram/i });
    expect(telegramTab.className).toContain("min-h-[44px]");
  });

  it("switches to Telegram channel tab and generates a Telegram deep link OTP", async () => {
    mockGenerateMessagingOtp
      .mockResolvedValueOnce({
        channel: "whatsapp",
        otp_code: "482910",
        expires_in_seconds: 300,
        expires_at: "2026-11-15T19:00:00Z",
        deep_link_url: "https://wa.me/51954123456?text=482910",
        status: "PENDING",
      })
      .mockResolvedValueOnce({
        channel: "telegram",
        otp_code: "739104",
        expires_in_seconds: 280,
        expires_at: "2026-11-15T19:00:00Z",
        deep_link_url: "https://t.me/CampusUNSABot?start=739104",
        status: "PENDING",
      });

    render(
      <WhatsAppSheet opened={true} onClose={vi.fn()} token="jwt-student-1" />
    );

    await waitFor(() => {
      expect(mockGenerateMessagingOtp).toHaveBeenCalledWith(
        "whatsapp",
        "jwt-student-1"
      );
    });

    fireEvent.click(screen.getByRole("tab", { name: /Telegram/i }));

    await waitFor(() => {
      expect(mockGenerateMessagingOtp).toHaveBeenCalledWith(
        "telegram",
        "jwt-student-1"
      );
    });

    const deepLink = await screen.findByRole("link", {
      name: /Abrir bot en Telegram/i,
    });
    expect(deepLink.getAttribute("href")).toBe(
      "https://t.me/CampusUNSABot?start=739104"
    );
    expect(screen.getByText(/El código expira en 4:40/i)).toBeTruthy();
  });

  it("renders linked channel state with masked identifier and allows unlinking", async () => {
    const onStatusChange = vi.fn();
    mockFetchMessagingOtpStatus.mockResolvedValue({
      whatsapp_connected: true,
      whatsapp_phone: "+51951222333",
      telegram_connected: false,
      telegram_chat_id: null,
      pending_whatsapp_ttl: 0,
      pending_telegram_ttl: 0,
    });
    mockUnlinkMessagingChannel.mockResolvedValue({
      channel: "whatsapp",
      linked: false,
      message: "whatsapp channel unlinked",
    });

    render(
      <WhatsAppSheet
        opened={true}
        onClose={vi.fn()}
        token="jwt-student-1"
        onStatusChange={onStatusChange}
      />
    );

    expect(await screen.findByText(/WhatsApp vinculado/i)).toBeTruthy();
    expect(screen.getByText(/\+\*\*.*333/i)).toBeTruthy();
    expect(mockGenerateMessagingOtp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Desvincular canal/i }));

    await waitFor(() => {
      expect(mockUnlinkMessagingChannel).toHaveBeenCalledWith(
        "whatsapp",
        "jwt-student-1"
      );
    });
    expect(onStatusChange).toHaveBeenCalled();
  });

  it("validates manual numeric OTP verification attributes and submits binding", async () => {
    mockVerifyMessagingOtp.mockResolvedValue({
      channel: "whatsapp",
      identifier: "+51951222333",
      linked: true,
      message: "Messaging channel linked successfully.",
    });

    render(
      <WhatsAppSheet opened={true} onClose={vi.fn()} token="jwt-student-1" />
    );

    await screen.findByText(/El código expira en 5:00/i);

    const identifierInput = screen.getByLabelText(/Número de WhatsApp/i);
    const otpInput = screen.getByLabelText(/Código OTP de 6 dígitos/i);

    expect(otpInput.getAttribute("inputMode")).toBe("numeric");
    expect(otpInput.getAttribute("autoComplete")).toBe("one-time-code");
    expect(otpInput.getAttribute("maxLength")).toBe("6");

    fireEvent.change(identifierInput, { target: { value: "+51951222333" } });
    fireEvent.change(otpInput, { target: { value: "482910" } });
    fireEvent.click(
      screen.getByRole("button", { name: /Verificar y vincular/i })
    );

    await waitFor(() => {
      expect(mockVerifyMessagingOtp).toHaveBeenCalledWith(
        {
          channel: "whatsapp",
          code: "482910",
          identifier: "+51951222333",
        },
        "jwt-student-1"
      );
    });

    expect(await screen.findByText(/WhatsApp vinculado/i)).toBeTruthy();
  });

  it("displays accessible error alerts and non-blocking offline notice", async () => {
    mockGenerateMessagingOtp.mockRejectedValueOnce(
      new ApiRequestError("Too many OTP requests. Please wait before generating another code.", 429)
    );

    render(
      <WhatsAppSheet
        opened={true}
        onClose={vi.fn()}
        token="jwt-student-1"
        isOnline={false}
      />
    );

    expect(
      await screen.findByText(/Sin conexión · mostrando último estado/i)
    ).toBeTruthy();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Too many OTP requests/i);
  });

  it("enforces resend cooldown and regenerates OTP cleanly after countdown", async () => {
    vi.useFakeTimers();

    render(
      <WhatsAppSheet opened={true} onClose={vi.fn()} token="jwt-student-1" />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockGenerateMessagingOtp).toHaveBeenCalledTimes(1);

    const resendBtn = screen.getByRole("button", {
      name: /Nuevo código en/i,
    }) as HTMLButtonElement;
    expect(resendBtn.disabled).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    const activeResendBtn = screen.getByRole("button", {
      name: /Generar nuevo código/i,
    }) as HTMLButtonElement;
    expect(activeResendBtn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(activeResendBtn);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGenerateMessagingOtp).toHaveBeenCalledTimes(2);
  });
});
