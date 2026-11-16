"use client";

import React from "react";
import { Preloader } from "konsta/react";
import {
  WhatsappLogo,
  PaperPlaneTilt,
  Copy,
  Check,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import type { MessagingChannel, OtpGenerateResponse } from "@/lib/api-client";
import { MESSAGING_MESSAGES } from "@/lib/messages/messaging-messages";

function formatMinutes(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export interface OtpVerificationFormProps {
  activeChannel: MessagingChannel;
  phase: "idle" | "generating" | "verifying" | "unlinking" | "error";
  activeOtp: OtpGenerateResponse | null;
  timeLeft: number;
  resendCooldown: number;
  isOnline: boolean;
  copied: boolean;
  identifierInput: string;
  manualCode: string;
  identifierInputRef: React.RefObject<HTMLInputElement>;
  onCopyCode: () => void;
  onRegenerate: () => void;
  onIdentifierChange: (val: string) => void;
  onManualCodeChange: (val: string) => void;
  onManualVerify: (e: React.FormEvent) => void;
}

/**
 * Unlinked channel pairing UI showing 6-digit OTP boxes, countdown, deep link, and manual verify form.
 */
export function OtpVerificationForm({
  activeChannel,
  phase,
  activeOtp,
  timeLeft,
  resendCooldown,
  isOnline,
  copied,
  identifierInput,
  manualCode,
  identifierInputRef,
  onCopyCode,
  onRegenerate,
  onIdentifierChange,
  onManualCodeChange,
  onManualVerify,
}: OtpVerificationFormProps): React.JSX.Element {
  const otpDigits = (activeOtp?.otp_code ?? "------")
    .padEnd(6, "-")
    .slice(0, 6)
    .split("");

  const resolvedDeepLink =
    activeOtp?.deep_link_url ||
    (activeOtp?.otp_code
      ? activeChannel === "whatsapp"
        ? `https://wa.me/51954123456?text=${activeOtp.otp_code}`
        : `https://t.me/CampusUNSABot?start=${activeOtp.otp_code}`
      : null);

  return (
    <>
      {activeChannel === "whatsapp" ? (
        <WhatsappLogo
          size={34}
          weight="regular"
          className="mx-auto mb-2 text-brand-action"
          aria-hidden="true"
        />
      ) : (
        <PaperPlaneTilt
          size={34}
          weight="regular"
          className="mx-auto mb-2 text-brand-action"
          aria-hidden="true"
        />
      )}

      <p className="text-ios-footnote text-ink-secondary mb-4 leading-relaxed">
        {MESSAGING_MESSAGES.channelInstructions[activeChannel]}
      </p>

      {phase === "generating" ? (
        <div className="flex items-center justify-center gap-2 py-6 text-ios-subhead text-ink-secondary">
          <Preloader size="w-5 h-5" />
          <span>{MESSAGING_MESSAGES.loadingCode}</span>
        </div>
      ) : (
        <>
          <p className="text-ios-caption-1 uppercase tracking-wider font-semibold text-ink-muted mb-2">
            {MESSAGING_MESSAGES.otpSectionLabel}
          </p>
          <div className="flex justify-center gap-2 mb-3">
            {otpDigits.map((digit, idx) => (
              <div
                key={idx}
                className="w-11 h-14 flex items-center justify-center text-ios-title-2 font-mono font-semibold rounded-xl border border-control bg-surface-card text-ink-primary"
              >
                {digit}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3 mb-4">
            <p
              className={`text-ios-footnote font-medium ${
                timeLeft === 0 ? "text-status-urgent" : "text-ink-secondary"
              }`}
            >
              {timeLeft === 0
                ? MESSAGING_MESSAGES.expiredNotice
                : `${MESSAGING_MESSAGES.expiresPrefix} ${formatMinutes(timeLeft)}`}
            </p>
            {activeOtp?.otp_code && (
              <button
                type="button"
                onClick={onCopyCode}
                className="min-h-[44px] px-2.5 text-ios-footnote font-medium text-brand-action inline-flex items-center gap-1 hover:underline"
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

          {resolvedDeepLink && (
            <a
              href={resolvedDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[44px] mb-3 px-4 py-2.5 rounded-xl bg-brand-cta hover:bg-brand-cta-hover text-white text-ios-subhead font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.99] transition"
            >
              <span>{MESSAGING_MESSAGES.deepLinkLabel[activeChannel]}</span>
              <ArrowSquareOut size={17} weight="regular" aria-hidden="true" />
            </a>
          )}

          <div className="mb-3">
            <button
              type="button"
              disabled={resendCooldown > 0 || !isOnline}
              onClick={onRegenerate}
              className={`min-h-[44px] px-3 text-ios-footnote font-medium transition-colors ${
                resendCooldown > 0 || !isOnline
                  ? "text-ink-disabled cursor-not-allowed"
                  : "text-brand-action hover:underline"
              }`}
            >
              {resendCooldown > 0
                ? `${MESSAGING_MESSAGES.resendCooldownPrefix} ${resendCooldown} s`
                : MESSAGING_MESSAGES.regenerateButton}
            </button>
          </div>

          <div className="border-t border-subtle pt-4 mt-1">
            <p className="text-ios-caption-1 uppercase tracking-wider font-semibold text-ink-muted mb-3 text-left">
              {MESSAGING_MESSAGES.manualSectionTitle}
            </p>
            <form onSubmit={onManualVerify} className="space-y-3 text-left">
              <div>
                <label
                  htmlFor="otp-channel-identifier"
                  className="block text-ios-caption-1 font-medium text-ink-secondary mb-1"
                >
                  {MESSAGING_MESSAGES.identifierLabel[activeChannel]}
                </label>
                <input
                  id="otp-channel-identifier"
                  ref={identifierInputRef}
                  type="text"
                  value={identifierInput}
                  onChange={(e) => onIdentifierChange(e.target.value)}
                  placeholder={MESSAGING_MESSAGES.identifierPlaceholder[activeChannel]}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-control bg-surface-card text-ios-subhead text-ink-primary placeholder:text-ink-muted"
                />
              </div>

              <div>
                <label
                  htmlFor="otp-manual-code"
                  className="block text-ios-caption-1 font-medium text-ink-secondary mb-1"
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
                    onManualCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="w-full min-h-[44px] px-3 rounded-xl border border-control bg-surface-card text-ios-body font-mono tracking-widest text-ink-primary"
                />
              </div>

              <button
                type="submit"
                disabled={
                  phase === "verifying" ||
                  manualCode.length !== 6 ||
                  !identifierInput.trim()
                }
                className="w-full min-h-[44px] rounded-xl bg-ink-primary text-canvas text-ios-subhead font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
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
  );
}
