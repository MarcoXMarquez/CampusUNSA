"use client";

import React, { useState, useEffect, useRef } from "react";
import { Sheet, Button, Preloader } from "konsta/react";
import { WhatsappLogo, ArrowClockwise, CheckCircle, WarningCircle } from "@phosphor-icons/react";

interface WhatsAppSheetProps {
  opened: boolean;
  onClose: () => void;
  token?: string | null;
}

export function WhatsAppSheet({
  opened,
  onClose,
  token,
}: WhatsAppSheetProps): React.JSX.Element {
  const [otpCode, setOtpCode] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState<number>(300); // 300 seconds (5 min) TTL
  const [resendCooldown, setResendCooldown] = useState<number>(30);
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api/v1";

  // TTL countdown timer
  useEffect(() => {
    if (!opened) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [opened]);

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
      const res = await fetch(`${apiUrl}/whatsapp/pair`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code: codeToVerify }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail?.message || "Código inválido o expirado");
      }

      setStatus("success");
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: unknown) {
      setStatus("error");
      const msg = err instanceof Error ? err.message : "Error al vincular con WhatsApp";
      setErrorMessage(msg);
    }
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtpCode(val);
    if (val.length === 6) {
      handleVerify(val);
    }
  };

  const handleResend = () => {
    if (resendCooldown > 0) return;
    setTimeLeft(300);
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
      <div className="w-10 h-1 bg-slate-300 dark:bg-zinc-600 rounded-full mx-auto my-3" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 border-b border-black/10 dark:border-white/10">
        <button
          type="button"
          onClick={onClose}
          className="text-primary dark:text-primary-dark text-[17px] font-normal"
        >
          Cancelar
        </button>
        <span className="text-[17px] font-semibold text-black dark:text-white">
          Asistente de WhatsApp
        </span>
        <div className="w-16" />
      </div>

      <div className="px-6 py-6 text-center">
        {/* Logo and Instructions */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mb-4">
          <WhatsappLogo size={32} weight="regular" />
        </div>

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
                className={`w-11 h-14 flex items-center justify-center text-2xl font-mono font-semibold rounded-xl border bg-white dark:bg-zinc-800 transition-colors ${
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
          <div className="flex items-center justify-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-4">
            <CheckCircle size={16} weight="regular" />
            <span>Asistente vinculado correctamente</span>
          </div>
        )}

        {/* Single Expiration Text Footnote */}
        <p className="text-[13px] text-black/40 dark:text-white/40 mb-6">
          El código expira en {formatMinutes(timeLeft)}
        </p>

        {/* Bot Direct Action */}
        <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 mb-6 text-left">
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
          className={`text-[15px] font-medium transition-colors ${
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
