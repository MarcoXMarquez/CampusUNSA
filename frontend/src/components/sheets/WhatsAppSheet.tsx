"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Sheet } from "konsta/react";
import { WarningCircle, WifiSlash } from "@phosphor-icons/react";
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
import { ChannelLinkStatus, ChannelTabs } from "./messaging/ChannelLinkStatus";
import { OtpVerificationForm } from "./messaging/OtpVerificationForm";

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

/**
 * Omnichannel messaging pairing sheet supporting WhatsApp and Telegram 6-digit OTP verification.
 */
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

  useEffect(() => {
    if (!opened || isChannelLinked || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [opened, isChannelLinked, timeLeft]);

  useEffect(() => {
    if (!opened || resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [opened, resendCooldown]);

  useEffect(() => {
    if (!opened || !token || !isOnline || isChannelLinked) return;
    const interval = setInterval(() => {
      void fetchMessagingOtpStatus(token)
        .then((fresh) => applyStatusUpdate(fresh))
        .catch(() => undefined);
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
          activeChannel === "whatsapp" ? true : Boolean(channelStatus?.whatsapp_connected),
        whatsapp_phone:
          activeChannel === "whatsapp" ? verified.identifier : channelStatus?.whatsapp_phone ?? null,
        telegram_connected:
          activeChannel === "telegram" ? true : Boolean(channelStatus?.telegram_connected),
        telegram_chat_id:
          activeChannel === "telegram" ? verified.identifier : channelStatus?.telegram_chat_id ?? null,
        pending_whatsapp_ttl:
          activeChannel === "whatsapp" ? 0 : channelStatus?.pending_whatsapp_ttl ?? 0,
        pending_telegram_ttl:
          activeChannel === "telegram" ? 0 : channelStatus?.pending_telegram_ttl ?? 0,
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
          activeChannel === "whatsapp" ? false : Boolean(channelStatus?.whatsapp_connected),
        whatsapp_phone:
          activeChannel === "whatsapp" ? null : channelStatus?.whatsapp_phone ?? null,
        telegram_connected:
          activeChannel === "telegram" ? false : Boolean(channelStatus?.telegram_connected),
        telegram_chat_id:
          activeChannel === "telegram" ? null : channelStatus?.telegram_chat_id ?? null,
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

  return (
    <Sheet
      opened={opened}
      onBackdropClick={onClose}
      className="rounded-t-2xl pb-safe !z-[60]"
    >
      <div className="w-10 h-1 bg-control rounded-full mx-auto my-3" />

      <div className="flex items-center justify-between px-4 pb-3 border-b border-subtle">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-1 text-brand-action text-ios-body font-normal"
        >
          {MESSAGING_MESSAGES.cancelButton}
        </button>
        <span className="text-ios-headline font-semibold text-ink-primary">
          {MESSAGING_MESSAGES.headerTitle}
        </span>
        <div className="w-16" />
      </div>

      {!isOnline && (
        <div
          role="status"
          className="mx-4 mt-3 px-3 py-2 rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-300 text-ios-caption-1 font-medium flex items-center justify-center gap-1.5"
        >
          <WifiSlash size={15} weight="regular" aria-hidden="true" />
          <span>{MESSAGING_MESSAGES.offlineNotice}</span>
        </div>
      )}

      <ChannelTabs
        activeChannel={activeChannel}
        channelStatus={channelStatus}
        onSelectChannel={(channel) => {
          setActiveChannel(channel);
          setErrorMessage(null);
        }}
      />

      <div className="px-6 py-4 pb-8 text-center max-h-[82vh] overflow-y-auto">
        {phase === "error" && errorMessage && (
          <div
            role="alert"
            className="mb-4 px-3 py-2.5 rounded-xl bg-surface-urgent border border-urgent-edge text-status-urgent text-ios-subhead font-medium flex items-center justify-center gap-1.5"
          >
            <WarningCircle size={17} weight="regular" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isChannelLinked ? (
          <ChannelLinkStatus
            activeChannel={activeChannel}
            linkedIdentifier={linkedIdentifier}
            unlinking={phase === "unlinking"}
            onUnlink={() => void handleUnlink()}
          />
        ) : (
          <OtpVerificationForm
            activeChannel={activeChannel}
            phase={phase}
            activeOtp={activeOtp}
            timeLeft={timeLeft}
            resendCooldown={resendCooldown}
            isOnline={isOnline}
            copied={copied}
            identifierInput={identifierInput}
            manualCode={manualCode}
            identifierInputRef={identifierInputRef}
            onCopyCode={() => void handleCopyCode()}
            onRegenerate={() => void requestNewOtp(activeChannel)}
            onIdentifierChange={setIdentifierInput}
            onManualCodeChange={setManualCode}
            onManualVerify={(e) => void handleManualVerify(e)}
          />
        )}
      </div>
    </Sheet>
  );
}
