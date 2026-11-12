"use client";

import React, { useState } from "react";
import {
  CaretLeft,
  GraduationCap,
  CheckCircle,
  Clock,
  WifiSlash,
  Eye,
  EyeSlash,
  WarningCircle,
  EnvelopeSimple,
  LockKey,
  User as UserIcon,
} from "@phosphor-icons/react";
import { AUTH_MESSAGES } from "@/lib/auth-messages";

export interface AuthFlowUser {
  id?: string;
  email: string;
  role: string;
  is_active?: boolean;
  full_name?: string | null;
}

export interface AuthFlowProps {
  initialStep?: "welcome" | "auth";
  initialMode?: "signin" | "signup";
  onSuccess: (token: string, user: AuthFlowUser) => void;
  onCancel?: () => void;
}

export function AuthFlow({
  initialStep = "welcome",
  initialMode = "signin",
  onSuccess,
  onCancel,
}: AuthFlowProps): React.JSX.Element {
  const [currentStep, setCurrentStep] = useState<"welcome" | "auth">(initialStep);
  const [authMode, setAuthMode] = useState<"signin" | "signup">(initialMode);
  const [fullName, setFullName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api/v1";

  const handleEmailPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage(AUTH_MESSAGES.missingFieldsError);
      return;
    }

    if (!cleanEmail.endsWith("@unsa.edu.pe")) {
      setErrorMessage(AUTH_MESSAGES.invalidDomainError);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword,
          full_name: authMode === "signup" ? fullName.trim() || undefined : undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        let message = "Error de autenticacion";
        if (errorData.detail) {
          if (typeof errorData.detail === "string") {
            message = errorData.detail;
          } else if (errorData.detail.message) {
            message = errorData.detail.message;
          }
        }
        throw new Error(message);
      }

      const data = await res.json();
      if (typeof window !== "undefined") {
        localStorage.setItem("campusunsa_token", data.access_token);
      }
      onSuccess(data.access_token, data.user);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error al iniciar sesion");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = () => {
    if (typeof window !== "undefined" && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setErrorMessage("Google Sign-In cargando... Por favor, reintenta en un momento.");
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto px-4 py-6 flex flex-col justify-between min-h-[520px]">
      {currentStep === "welcome" ? (
        <div className="flex flex-col flex-1 justify-between">
          <div>
            {/* Top Emblem */}
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary dark:bg-primary-dark text-white flex items-center justify-center shadow-sm">
                <GraduationCap size={36} weight="regular" />
              </div>
            </div>

            {/* Badge */}
            <div className="flex justify-center mb-2">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-primary dark:text-primary-dark px-3 py-1 rounded-full bg-primary/10 dark:bg-primary-dark/15">
                {AUTH_MESSAGES.welcomeBadge}
              </span>
            </div>

            {/* Title & Subtitle */}
            <h1 className="text-[26px] font-bold text-center text-black dark:text-white leading-tight mb-2">
              {AUTH_MESSAGES.welcomeTitle}
            </h1>
            <p className="text-[15px] text-center text-black/60 dark:text-white/60 mb-6 leading-relaxed">
              {AUTH_MESSAGES.welcomeSubtitle}
            </p>

            {/* Inset Feature Summary */}
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#1C1C1E] p-4 space-y-3.5 mb-6">
              <div className="flex items-start gap-3">
                <CheckCircle size={22} weight="regular" className="text-primary dark:text-primary-dark shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[15px] font-semibold text-black dark:text-white leading-snug">
                    {AUTH_MESSAGES.welcomeFeature1Title}
                  </h4>
                  <p className="text-[13px] text-black/60 dark:text-white/60">
                    {AUTH_MESSAGES.welcomeFeature1Desc}
                  </p>
                </div>
              </div>

              <div className="border-t border-black/5 dark:border-white/5 pt-3 flex items-start gap-3">
                <Clock size={22} weight="regular" className="text-primary dark:text-primary-dark shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[15px] font-semibold text-black dark:text-white leading-snug">
                    {AUTH_MESSAGES.welcomeFeature2Title}
                  </h4>
                  <p className="text-[13px] text-black/60 dark:text-white/60">
                    {AUTH_MESSAGES.welcomeFeature2Desc}
                  </p>
                </div>
              </div>

              <div className="border-t border-black/5 dark:border-white/5 pt-3 flex items-start gap-3">
                <WifiSlash size={22} weight="regular" className="text-primary dark:text-primary-dark shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[15px] font-semibold text-black dark:text-white leading-snug">
                    {AUTH_MESSAGES.welcomeFeature3Title}
                  </h4>
                  <p className="text-[13px] text-black/60 dark:text-white/60">
                    {AUTH_MESSAGES.welcomeFeature3Desc}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setCurrentStep("auth");
              }}
              className="w-full py-3.5 px-4 rounded-xl bg-primary dark:bg-primary-dark text-white font-semibold text-[17px] active:opacity-85 transition-opacity text-center"
            >
              {AUTH_MESSAGES.welcomeNextButton}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="w-full py-2.5 px-4 text-center text-[15px] text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors"
              >
                {AUTH_MESSAGES.cancelButton}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 justify-between">
          <div>
            {/* Header / Back Action */}
            <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10 mb-4">
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setCurrentStep("welcome");
                }}
                className="flex items-center gap-1 text-primary dark:text-primary-dark text-[16px] font-medium"
              >
                <CaretLeft size={20} weight="regular" />
                <span>{AUTH_MESSAGES.backButton}</span>
              </button>
              <span className="text-[16px] font-semibold text-black dark:text-white">
                CampusUNSA
              </span>
              <div className="w-14" />
            </div>

            {/* Headline */}
            <h2 className="text-[24px] font-bold text-black dark:text-white tracking-tight mb-1">
              {authMode === "signin" ? AUTH_MESSAGES.signInTitle : AUTH_MESSAGES.signUpTitle}
            </h2>
            <p className="text-[14px] text-black/60 dark:text-white/60 mb-5">
              {authMode === "signin" ? AUTH_MESSAGES.signInSubtitle : AUTH_MESSAGES.signUpSubtitle}
            </p>

            {/* Error Message */}
            {errorMessage && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-sm text-urgent dark:text-urgent-dark flex items-center gap-2">
                <WarningCircle size={18} weight="regular" className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleEmailPasswordSubmit} className="space-y-3.5 mb-5">
              {authMode === "signup" && (
                <div>
                  <label className="block text-[13px] font-medium text-black/70 dark:text-white/70 mb-1">
                    {AUTH_MESSAGES.fullNameLabel}
                  </label>
                  <div className="flex items-center px-3.5 py-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#1C1C1E]">
                    <UserIcon size={20} weight="regular" className="text-black/40 dark:text-white/40 mr-2.5 shrink-0" />
                    <input
                      type="text"
                      placeholder={AUTH_MESSAGES.fullNamePlaceholder}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-transparent text-[16px] text-black dark:text-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[13px] font-medium text-black/70 dark:text-white/70 mb-1">
                  {AUTH_MESSAGES.emailLabel}
                </label>
                <div className="flex items-center px-3.5 py-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#1C1C1E]">
                  <EnvelopeSimple size={20} weight="regular" className="text-black/40 dark:text-white/40 mr-2.5 shrink-0" />
                  <input
                    type="email"
                    required
                    placeholder={AUTH_MESSAGES.emailPlaceholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent text-[16px] text-black dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-black/70 dark:text-white/70 mb-1">
                  {AUTH_MESSAGES.passwordLabel}
                </label>
                <div className="flex items-center px-3.5 py-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#1C1C1E]">
                  <LockKey size={20} weight="regular" className="text-black/40 dark:text-white/40 mr-2.5 shrink-0" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder={AUTH_MESSAGES.passwordPlaceholder}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-[16px] text-black dark:text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white ml-2 shrink-0"
                    aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                  >
                    {showPassword ? (
                      <EyeSlash size={20} weight="regular" />
                    ) : (
                      <Eye size={20} weight="regular" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-primary dark:bg-primary-dark text-white font-semibold text-[17px] active:opacity-85 transition-opacity flex items-center justify-center gap-2"
              >
                <span>
                  {loading
                    ? AUTH_MESSAGES.submitting
                    : authMode === "signin"
                    ? AUTH_MESSAGES.signInSubmit
                    : AUTH_MESSAGES.signUpSubmit}
                </span>
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-4 flex items-center justify-center">
              <div className="border-t border-black/10 dark:border-white/10 w-full" />
              <span className="bg-[#F2F2F7] dark:bg-black px-3 text-[13px] text-black/40 dark:text-white/40 absolute">
                {AUTH_MESSAGES.dividerText}
              </span>
            </div>

            {/* Google Button */}
            <button
              type="button"
              onClick={handleGoogleClick}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-[#dadce0] dark:border-[#8e918f] bg-white dark:bg-[#131314] text-[#3c4043] dark:text-[#e3e3e3] font-medium text-[16px] shadow-sm active:bg-[#f8f9fa] dark:active:bg-[#1f1f20] transition-colors mb-4"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{AUTH_MESSAGES.googleButton}</span>
            </button>
          </div>

          {/* Switch Mode Footer */}
          <div className="text-center pt-2">
            <span className="text-[14px] text-black/60 dark:text-white/60">
              {authMode === "signin"
                ? `${AUTH_MESSAGES.switchToSignUpPrompt} `
                : `${AUTH_MESSAGES.switchToSignInPrompt} `}
            </span>
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setAuthMode(authMode === "signin" ? "signup" : "signin");
              }}
              className="text-[14px] font-semibold text-primary dark:text-primary-dark hover:underline"
            >
              {authMode === "signin"
                ? AUTH_MESSAGES.switchToSignUpAction
                : AUTH_MESSAGES.switchToSignInAction}
            </button>
            <p className="text-[12px] text-black/40 dark:text-white/40 mt-3">
              {AUTH_MESSAGES.securityNotice}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
