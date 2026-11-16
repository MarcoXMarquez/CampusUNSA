"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Sheet, Preloader } from "konsta/react";
import {
  WhatsappLogo,
  PaperPlaneTilt,
  CheckCircle,
  WarningCircle,
  Copy,
  Check,
  LinkBreak,
  WifiSlash,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import {
  fetchMessagingOtpStatus,
  generateMessagingOtp,
  unlinkMessagingChannel,
  verifyMessagingOtp,
  type MessagingChannel,
  type OtpGenerateResponse,
  type OtpStatusResponse,
} from "@/lib/api-client";
import { MESSAGING_MESSAGES } from "@/lib/messages/messaging-messages";

interface WhatsAppSheetProps {
  opened: boolean;
  onClose: () => void;
  token?: string | null;
  isOnline?: boolean;
  expiresInSeconds?: number;
  initialStatus?: OtpStatusResponse | null;
  onStatusChange?: (status: OtpStatusResponse) => void;
}

const DEFAULT_OTP_TTL_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = 30;
const STATUS_POLL_INTERVAL_MS = 5000;

function maskIdentifier(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= 4) return trimmed;
  const tail = trimmed.slice(-3);
  const prefix = trimmed.startsWith("+") ? "+" : "";
  const maskedCount = Math.max(trimmed.length - prefix.length - 3, 3);
  return `${prefix}${"*".repeat(maskedCount)}${tail}`;
}

export function WhatsAppSheet({
  opened,
  onClose,
  token,
  isOnline = true,
  expiresInSeconds = DEFAULT_OTP_TTL_SECONDS,
  initialStatus = null,
  onStatusChange,
}: WhatsAppSheetProps): React.JSX.Element {
  const [activeChannel, setActiveChannel] = useState<MessagingChannel>("whatsapp");
  const [channelStatus, setChannelStatus] = useState<OtpStatusResponse | null>(initialStatus);
  const [generatedByChannel, setGeneratedByChannel] = useState<
    Partial<Record<MessagingChannel, OtpGenerateResponse>>
  >({});
  const [timeLeft, setTimeLeft] = useState<number>(expiresInSeconds);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [identifierInput, setIdentifierInput] = useState<string>("");
  const [manualCode, setManualCode] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [phase, setPhase] = useState<
    "idle" | "generating" | "verifying" | "unlinking" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const identifierInputRef = useRef<HTMLInputElement>(null);

  const isChannelLinked =
    activeChannel === "whatsapp"
      ? Boolean(channelStatus?.whatsapp_connected)
      : Boolean(channelStatus?.telegram_connected);

  const linkedIdentifier =
    activeChannel === "whatsapp"
      ? channelStatus?.whatsapp_phone
      : channelStatus?.telegram_chat_id;

  const activeOtp = generatedByChannel[activeChannel] ?? null;

  const applyStatusUpdate = useCallback(
    (nextStatus: OtpStatusResponse) => {
      setChannelStatus(nextStatus);
      onStatusChange?.(nextStatus);
    },
    [onStatusChange]
  );

  const requestNewOtp = useCallback(
    async (channel: MessagingChannel) => {
      if (!token) {
        setPhase("error");
        setErrorMessage(MESSAGING_MESSAGES.authRequiredError);
        return;
      }
      setPhase("generating");
      setErrorMessage(null);
      setCopied(false);
      try {
        const res = await generateMessagingOtp(channel, token);
        const ttl =
          typeof res?.expires_in_seconds === "number"
            ? res.expires_in_seconds
            : expiresInSeconds;
        const code = typeof res?.otp_code === "string" ? res.otp_code : "";
        setGeneratedByChannel((prev) => ({
          ...prev,
          [channel]: { ...res, otp_code: code, expires_in_seconds: ttl },
        }));
        setTimeLeft(ttl);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        setManualCode(code);
        setPhase("idle");
      } catch (err: unknown) {
        setPhase("error");
        setErrorMessage(
          err instanceof Error ? err.message : MESSAGING_MESSAGES.genericError
        );
      }
    },
    [token, expiresInSeconds]
  );

  // Sync status when sheet opens or channel switches, and auto-generate OTP when unlinked
  useEffect(() => {
    if (!opened) {
      setPhase("idle");
      setErrorMessage(null);
      setManualCode("");
      setIdentifierInput("");
      setCopied(false);
      return;
    }

    let cancelled = false;

    const initializeChannel = async () => {
      if (!token) {
        setPhase("error");
        setErrorMessage(MESSAGING_MESSAGES.authRequiredError);
        return;
      }

      let resolvedStatus: OtpStatusResponse | null = channelStatus;
      try {
        const fresh = await fetchMessagingOtpStatus(token);
        if (cancelled) return;
        resolvedStatus = fresh;
        applyStatusUpdate(fresh);
      } catch {
        if (cancelled) return;
      }

      const alreadyLinked =
        activeChannel === "whatsapp"
          ? Boolean(resolvedStatus?.whatsapp_connected)
          : Boolean(resolvedStatus?.telegram_connected);

      if (!alreadyLinked && !generatedByChannel[activeChannel]) {
        await requestNewOtp(activeChannel);
      } else if (!alreadyLinked && generatedByChannel[activeChannel]) {
        setTimeLeft(generatedByChannel[activeChannel]!.expires_in_seconds);
      }
    };

    void initializeChannel();

    return () => {
      cancelled = true;
    };
    // Intentionally scoped to sheet open & active channel switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, activeChannel, token]);

  // Countdown derived strictly from server TTL
  useEffect(() => {
    if (!opened || isChannelLinked || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [opened, isChannelLinked, timeLeft]);

  // Resend cooldown timer
  useEffect(() => {
    if (!opened || resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [opened, resendCooldown]);

  // Background poll while waiting for inbound webhook confirmation
  useEffect(() => {
    if (!opened || !token || !isOnline || isChannelLinked) return;
    const interval = setInterval(() => {
      void fetchMessagingOtpStatus(token)
        .then((fresh) => {
          applyStatusUpdate(fresh);
        })
        .catch(() => {
          // Ignore transient poll errors while keeping OTP visible
        });
    }, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [opened, token, isOnline, isChannelLinked, applyStatusUpdate]);

  const handleManualVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedCode = manualCode.replace(/\D/g, "").slice(0, 6);
    if (cleanedCode.length !== 6 || !identifierInput.trim()) return;

    setPhase("verifying");
    setErrorMessage(null);
    try {
      const verified = await verifyMessagingOtp(
        {
          channel: activeChannel,
          code: cleanedCode,
          identifier: identifierInput.trim(),
        },
        token
      );
      const nextStatus: OtpStatusResponse = {
        whatsapp_connected:
          activeChannel === "whatsapp"
            ? true
            : Boolean(channelStatus?.whatsapp_connected),
        whatsapp_phone:
          activeChannel === "whatsapp"
            ? verified.identifier
            : channelStatus?.whatsapp_phone ?? null,
        telegram_connected:
          activeChannel === "telegram"
            ? true
            : Boolean(channelStatus?.telegram_connected),
        telegram_chat_id:
          activeChannel === "telegram"
            ? verified.identifier
            : channelStatus?.telegram_chat_id ?? null,
        pending_whatsapp_ttl:
          activeChannel === "whatsapp"
            ? 0
            : channelStatus?.pending_whatsapp_ttl ?? 0,
        pending_telegram_ttl:
          activeChannel === "telegram"
            ? 0
            : channelStatus?.pending_telegram_ttl ?? 0,
      };
      applyStatusUpdate(nextStatus);
      setGeneratedByChannel((prev) => {
        const copy = { ...prev };
        delete copy[activeChannel];
        return copy;
      });
      setPhase("idle");
    } catch (err: unknown) {
      setPhase("error");
      setErrorMessage(
        err instanceof Error ? err.message : MESSAGING_MESSAGES.genericError
      );
    }
  };

  const handleUnlink = async () => {
    if (!token) return;
    setPhase("unlinking");
    setErrorMessage(null);
    try {
      await unlinkMessagingChannel(activeChannel, token);
      const nextStatus: OtpStatusResponse = {
        whatsapp_connected:
          activeChannel === "whatsapp"
            ? false
            : Boolean(channelStatus?.whatsapp_connected),
        whatsapp_phone:
          activeChannel === "whatsapp"
            ? null
            : channelStatus?.whatsapp_phone ?? null,
        telegram_connected:
          activeChannel === "telegram"
            ? false
            : Boolean(channelStatus?.telegram_connected),
        telegram_chat_id:
          activeChannel === "telegram"
            ? null
            : channelStatus?.telegram_chat_id ?? null,
        pending_whatsapp_ttl: channelStatus?.pending_whatsapp_ttl ?? 0,
        pending_telegram_ttl: channelStatus?.pending_telegram_ttl ?? 0,
      };
      applyStatusUpdate(nextStatus);
      setGeneratedByChannel((prev) => {
        const copy = { ...prev };
        delete copy[activeChannel];
        return copy;
      });
      setPhase("idle");
    } catch (err: unknown) {
      setPhase("error");
      setErrorMessage(
        err instanceof Error ? err.message : MESSAGING_MESSAGES.genericError
      );
    }
  };

  const handleCopyCode = async () => {
    if (!activeOtp?.otp_code) return;
    try {
      await navigator.clipboard?.writeText(activeOtp.otp_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable in non-HTTPS test contexts
    }
  };

  const formatMinutes = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const otpDigits = (activeOtp?.otp_code ?? "------").padEnd(6, "-").slice(0, 6).split("");
  const resolvedDeepLink =
    activeOtp?.deep_link_url ||
    (activeOtp?.otp_code
      ? activeChannel === "whatsapp"
        ? `https://wa.me/51954123456?text=${activeOtp.otp_code}`
        : `https://t.me/CampusUNSABot?start=${activeOtp.otp_code}`
      : null);

  return (
    <Sheet
      opened={opened}
      onBackdropClick={onClose}
      className="rounded-t-2xl pb-safe !z-[60]"
    >
      {/* Top Grabber */}
      <div className="w-10 h-1 bg-black/20 dark:bg-white/25 rounded-full mx-auto my-3" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 border-b border-black/10 dark:border-white/10">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-1 text-primary dark:text-primary-dark text-[17px] font-normal"
        >
          {MESSAGING_MESSAGES.cancelButton}
        </button>
        <span className="text-[17px] font-semibold text-black dark:text-white">
          {MESSAGING_MESSAGES.headerTitle}
        </span>
        <div className="w-16" />
      </div>

      {/* Offline Non-blocking Notice */}
      {!isOnline && (
        <div
          role="status"
          className="mx-4 mt-3 px-3 py-2 rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs font-medium flex items-center justify-center gap-1.5"
        >
          <WifiSlash size={15} weight="regular" aria-hidden="true" />
          <span>{MESSAGING_MESSAGES.offlineNotice}</span>
        </div>
      )}

      {/* Channel Switcher Tabs (WhatsApp / Telegram) */}
      <div
        role="tablist"
        aria-label={MESSAGING_MESSAGES.headerTitle}
        className="mx-6 mt-4 p-1 rounded-xl bg-black/5 dark:bg-white/10 grid grid-cols-2 gap-1"
      >
        {(["whatsapp", "telegram"] as const).map((channel) => {
          const selected = activeChannel === channel;
          const connected =
            channel === "whatsapp"
              ? channelStatus?.whatsapp_connected
              : channelStatus?.telegram_connected;
          return (
            <button
              key={channel}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setActiveChannel(channel);
                setErrorMessage(null);
              }}
              className={`min-h-[44px] rounded-lg px-3 text-[14px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                selected
                  ? "bg-white dark:bg-[#1C1C1E] text-black dark:text-white shadow-sm"
                  : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
              }`}
            >
              {channel === "whatsapp" ? (
                <WhatsappLogo size={17} weight="regular" aria-hidden="true" />
              ) : (
                <PaperPlaneTilt size={17} weight="regular" aria-hidden="true" />
              )}
              <span>{MESSAGING_MESSAGES.channelTabs[channel]}</span>
              {connected && (
                <CheckCircle
                  size={15}
                  weight="fill"
                  className="text-emerald-600 dark:text-emerald-400"
                  aria-label={MESSAGING_MESSAGES.linkedBadge}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="px-6 py-4 pb-8 text-center max-h-[82vh] overflow-y-auto">
        {/* Error Alert Banner */}
        {phase === "error" && errorMessage && (
          <div
            role="alert"
            className="mb-4 px-3 py-2.5 rounded-xl bg-urgent/10 dark:bg-urgent-dark/15 text-urgent dark:text-urgent-dark text-sm font-medium flex items-center justify-center gap-1.5"
          >
            <WarningCircle size={17} weight="regular" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isChannelLinked ? (
          <div className="py-2">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle size={28} weight="regular" aria-hidden="true" />
            </div>
            <h3 className="text-[18px] font-semibold text-black dark:text-white mb-1">
              {MESSAGING_MESSAGES.linkedTitle[activeChannel]}
            </h3>
            {linkedIdentifier && (
              <p className="text-[15px] font-mono font-medium text-black/75 dark:text-white/75 mb-2">
                {maskIdentifier(linkedIdentifier)}
              </p>
            )}
            <p className="text-[14px] text-black/60 dark:text-white/60 mb-6 leading-relaxed">
              {MESSAGING_MESSAGES.linkedSubtitle}
            </p>
            <button
              type="button"
              disabled={phase === "unlinking"}
              onClick={() => void handleUnlink()}
              className="w-full min-h-[44px] rounded-xl border border-urgent/30 dark:border-urgent-dark/40 text-urgent dark:text-urgent-dark text-[15px] font-semibold flex items-center justify-center gap-2 hover:bg-urgent/5 transition-colors disabled:opacity-50"
            >
              {phase === "unlinking" ? (
                <Preloader size="w-4 h-4" />
              ) : (
                <LinkBreak size={18} weight="regular" aria-hidden="true" />
              )}
              <span>
                {phase === "unlinking"
                  ? MESSAGING_MESSAGES.unlinkingChannel
                  : MESSAGING_MESSAGES.unlinkButton}
              </span>
            </button>
          </div>
        ) : (
          <>
            {activeChannel === "whatsapp" ? (
              <WhatsappLogo
                size={34}
                weight="regular"
                className="mx-auto mb-2 text-primary dark:text-primary-dark"
                aria-hidden="true"
              />
            ) : (
              <PaperPlaneTilt
                size={34}
                weight="regular"
                className="mx-auto mb-2 text-primary dark:text-primary-dark"
                aria-hidden="true"
              />
            )}

            <p className="text-[14px] text-black/65 dark:text-white/65 mb-4 leading-relaxed">
              {MESSAGING_MESSAGES.channelInstructions[activeChannel]}
            </p>

            {/* Generated 6-Digit OTP Display */}
            {phase === "generating" ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-black/60 dark:text-white/60">
                <Preloader size="w-5 h-5" />
                <span>{MESSAGING_MESSAGES.loadingCode}</span>
              </div>
            ) : (
              <>
                <p className="text-[12px] uppercase tracking-wider font-semibold text-black/50 dark:text-white/50 mb-2">
                  {MESSAGING_MESSAGES.otpSectionLabel}
                </p>
                <div className="flex justify-center gap-2 mb-3">
                  {otpDigits.map((digit, idx) => (
                    <div
                      key={idx}
                      className="w-11 h-14 flex items-center justify-center text-2xl font-mono font-semibold rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#1C1C1E] text-black dark:text-white"
                    >
                      {digit}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-3 mb-4">
                  <p
                    className={`text-[13px] font-medium ${
                      timeLeft === 0
                        ? "text-urgent dark:text-urgent-dark"
                        : "text-black/60 dark:text-white/60"
                    }`}
                  >
                    {timeLeft === 0
                      ? MESSAGING_MESSAGES.expiredNotice
                      : `${MESSAGING_MESSAGES.expiresPrefix} ${formatMinutes(timeLeft)}`}
                  </p>
                  {activeOtp?.otp_code && (
                    <button
                      type="button"
                      onClick={() => void handleCopyCode()}
                      className="min-h-[44px] px-2.5 text-[13px] font-medium text-primary dark:text-primary-dark inline-flex items-center gap-1 hover:underline"
                    >
                      {copied ? (
                        <Check size={14} weight="bold" aria-hidden="true" />
                      ) : (
                        <Copy size={14} weight="regular" aria-hidden="true" />
                      )}
                      <span>
                        {copied
                          ? MESSAGING_MESSAGES.copiedCodeFeedback
                          : MESSAGING_MESSAGES.copyCodeButton}
                      </span>
                    </button>
                  )}
                </div>

                {/* Primary Deep-Link CTA */}
                {resolvedDeepLink && (
                  <a
                    href={resolvedDeepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full min-h-[44px] mb-3 px-4 py-2.5 rounded-xl bg-primary dark:bg-primary-dark text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.99] transition"
                  >
                    <span>{MESSAGING_MESSAGES.deepLinkLabel[activeChannel]}</span>
                    <ArrowSquareOut size={17} weight="regular" aria-hidden="true" />
                  </a>
                )}

                {/* Resend / Regenerate Code Action */}
                <div className="mb-3">
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || !isOnline}
                    onClick={() => void requestNewOtp(activeChannel)}
                    className={`min-h-[44px] px-3 text-[14px] font-medium transition-colors ${
                      resendCooldown > 0 || !isOnline
                        ? "text-black/35 dark:text-white/35 cursor-not-allowed"
                        : "text-primary dark:text-primary-dark hover:underline"
                    }`}
                  >
                    {resendCooldown > 0
                      ? `${MESSAGING_MESSAGES.resendCooldownPrefix} ${resendCooldown} s`
                      : MESSAGING_MESSAGES.regenerateButton}
                  </button>
                </div>

                {/* Inline Manual Verification Section */}
                <div className="border-t border-black/10 dark:border-white/10 pt-4 mt-1">
                  <p className="text-[12px] uppercase tracking-wider font-semibold text-black/50 dark:text-white/50 mb-3 text-left">
                    {MESSAGING_MESSAGES.manualSectionTitle}
                  </p>
                  <form
                    onSubmit={(e) => void handleManualVerify(e)}
                    className="space-y-3 text-left"
                  >
                    <div>
                      <label
                        htmlFor="otp-channel-identifier"
                        className="block text-[12px] font-medium text-black/70 dark:text-white/70 mb-1"
                      >
                        {MESSAGING_MESSAGES.identifierLabel[activeChannel]}
                      </label>
                      <input
                        id="otp-channel-identifier"
                        ref={identifierInputRef}
                        type="text"
                        value={identifierInput}
                        onChange={(e) => setIdentifierInput(e.target.value)}
                        placeholder={
                          MESSAGING_MESSAGES.identifierPlaceholder[activeChannel]
                        }
                        className="w-full min-h-[44px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#1C1C1E] text-[15px] text-black dark:text-white"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="otp-manual-code"
                        className="block text-[12px] font-medium text-black/70 dark:text-white/70 mb-1"
                      >
                        {MESSAGING_MESSAGES.otpInputAriaLabel}
                      </label>
                      <input
                        id="otp-manual-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        aria-label={MESSAGING_MESSAGES.otpInputAriaLabel}
                        value={manualCode}
                        onChange={(e) =>
                          setManualCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        className="w-full min-h-[44px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#1C1C1E] text-[17px] font-mono tracking-widest text-black dark:text-white"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={
                        phase === "verifying" ||
                        manualCode.length !== 6 ||
                        !identifierInput.trim()
                      }
                      className="w-full min-h-[44px] rounded-xl bg-black dark:bg-white text-white dark:text-black text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {phase === "verifying" && <Preloader size="w-4 h-4" />}
                      <span>
                        {phase === "verifying"
                          ? MESSAGING_MESSAGES.verifyingCode
                          : MESSAGING_MESSAGES.manualVerifyButton}
                      </span>
                    </button>
                  </form>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
