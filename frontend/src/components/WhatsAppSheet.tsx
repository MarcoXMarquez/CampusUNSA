"use client";

import React, { useState, useEffect, useRef } from "react";
import { Sheet, Preloader } from "konsta/react";
import { WhatsappLogo, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { verifyWhatsAppPairingCode } from "../lib/api-client";

interface WhatsAppSheetProps {
  opened: boolean;
  onClose: () => void;
  token?: string | null;
  expiresInSeconds?: number;
}

const DEFAULT_OTP_TTL_SECONDS = 300;

export function WhatsAppSheet({
  opened,
  onClose,
  token,
  expiresInSeconds = DEFAULT_OTP_TTL_SECONDS,
}: WhatsAppSheetProps): React.JSX.Element {
  const [otpCode, setOtpCode] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState<number>(expiresInSeconds);
  const [resendCooldown, setResendCooldown] = useState<number>(30);
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // TTL countdown timer derived from server expiry
  useEffect(() => {
    if (!opened) return;
    setTimeLeft(expiresInSeconds);
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [opened, expiresInSeconds]);

  // Resend cooldown timer
  useEffect(() => {
    if (!opened || resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [opened, resendCooldown]);

  // Auto-focus input when opened
  useEffect(() => {
    if (opened) {
      setTimeout(() => inputRef.current?.focus(), 150);
    } else {
      setOtpCode("");
      setStatus("idle");
      setErrorMessage(null);
    }
  }, [opened]);

  const handleVerify = async (codeToVerify: string) => {
    if (codeToVerify.length !== 6) return;
    setStatus("verifying");
    setErrorMessage(null);

    try {
      await verifyWhatsAppPairingCode(codeToVerify, token);
      setStatus("success");
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: unknown) {
      setStatus("error");
      const msg =
        err instanceof Error ? err.message : "Error al vincular con WhatsApp";
      setErrorMessage(msg);
    }
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtpCode(val);
    if (val.length === 6) {
      void handleVerify(val);
    }
  };

  const handleResend = () => {
    if (resendCooldown > 0) return;
    setTimeLeft(expiresInSeconds);
    setResendCooldown(30);
    setOtpCode("");
    setStatus("idle");
    setErrorMessage(null);
  };

  const formatMinutes = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <Sheet
      opened={opened}
      onBackdropClick={onClose}
      className="rounded-t-2xl pb-safe"
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
          Cancelar
        </button>
        <span className="text-[17px] font-semibold text-black dark:text-white">
          Asistente de WhatsApp
        </span>
        <div className="w-16" />
      </div>

      <div className="px-6 py-6 text-center">
        {/* Monochrome Icon without Colored Box */}
        <WhatsappLogo
          size={36}
          weight="regular"
          className="mx-auto mb-3 text-primary dark:text-primary-dark"
          aria-hidden="true"
        />

        <p className="text-[15px] text-black/60 dark:text-white/60 mb-6 leading-relaxed">
          Ingresa el código OTP de 6 dígitos para recibir notificaciones automáticas de entregas directamente en tu chat.
        </p>

        {/* Hidden Actual Input */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={otpCode}
          onChange={handleOtpChange}
          className="sr-only"
          aria-label="Código OTP de 6 dígitos"
        />

        {/* 6 Digit Squares */}
        <div
          onClick={() => inputRef.current?.focus()}
          className="flex justify-center gap-2 mb-4 cursor-pointer"
        >
          {[0, 1, 2, 3, 4, 5].map((idx) => {
            const digit = otpCode[idx] || "";
            const isFocused = otpCode.length === idx;
            return (
              <div
                key={idx}
                className={`w-11 h-14 flex items-center justify-center text-2xl font-mono font-semibold rounded-xl border bg-white dark:bg-[#1C1C1E] transition-colors ${
                  status === "error"
                    ? "border-urgent dark:border-urgent-dark text-urgent dark:text-urgent-dark"
                    : isFocused
                    ? "border-primary dark:border-primary-dark ring-2 ring-primary/20 dark:ring-primary-dark/20 text-black dark:text-white"
                    : "border-black/15 dark:border-white/15 text-black dark:text-white"
                }`}
              >
                {digit}
              </div>
            );
          })}
        </div>

        {/* Status Indicators */}
        {status === "verifying" && (
          <div className="flex items-center justify-center gap-2 text-sm text-black/60 dark:text-white/60 mb-4">
            <Preloader size="w-4 h-4" />
            <span>Verificando código...</span>
          </div>
        )}

        {status === "error" && errorMessage && (
          <div className="flex items-center justify-center gap-1.5 text-sm text-urgent dark:text-urgent-dark font-medium mb-4">
            <WarningCircle size={16} weight="regular" />
            <span>{errorMessage}</span>
          </div>
        )}

        {status === "success" && (
          <div className="flex items-center justify-center gap-1.5 text-sm text-primary dark:text-primary-dark font-medium mb-4">
            <CheckCircle size={16} weight="regular" />
            <span>Asistente vinculado correctamente</span>
          </div>
        )}

        {/* Single Expiration Text Footnote */}
        <p className="text-[13px] text-black/60 dark:text-white/60 mb-6">
          El código expira en {formatMinutes(timeLeft)}
        </p>

        {/* Bot Direct Action */}
        <div className="p-3 rounded-xl bg-black/5 dark:bg-white/10 mb-6 text-left">
          <p className="text-[13px] text-black/60 dark:text-white/60">
            Bot Oficial CampusUNSA:
          </p>
          <a
            href="https://wa.me/51954123456"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[15px] font-semibold text-primary dark:text-primary-dark hover:underline"
          >
            +51 954 123 456
          </a>
        </div>

        {/* Resend Action */}
        <button
          type="button"
          disabled={resendCooldown > 0}
          onClick={handleResend}
          className={`min-h-[44px] text-[15px] font-medium transition-colors ${
            resendCooldown > 0
              ? "text-black/30 dark:text-white/30 cursor-not-allowed"
              : "text-primary dark:text-primary-dark hover:underline"
          }`}
        >
          {resendCooldown > 0
            ? `Reenviar en ${resendCooldown} s`
            : "Reenviar código OTP"}
        </button>
      </div>
    </Sheet>
  );
}
