"use client";

import React, { useState } from "react";
import {
  CaretLeft,
  CaretRight,
  Eye,
  EyeSlash,
  WarningCircle,
  EnvelopeSimple,
  LockKey,
  User as UserIcon,
} from "@phosphor-icons/react";
import { AUTH_MESSAGES, ONBOARDING_SLIDES } from "@/lib/auth-messages";

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
  const [slideIndex, setSlideIndex] = useState<number>(0);
  const [authMode, setAuthMode] = useState<"signin" | "signup">(initialMode);
  const [fullName, setFullName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api/v1";

  const currentSlide = ONBOARDING_SLIDES[slideIndex] || ONBOARDING_SLIDES[0];
  const isLastSlide = slideIndex === ONBOARDING_SLIDES.length - 1;

  const handleNextSlide = () => {
    if (isLastSlide) {
      setCurrentStep("auth");
    } else {
      setSlideIndex((prev) => Math.min(prev + 1, ONBOARDING_SLIDES.length - 1));
    }
  };

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

  const handleGoogleSignIn = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/callback`;
    if (!clientId) {
      setErrorMessage("Google OAuth no esta configurado en este entorno");
      return;
    }
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=openid%20email%20profile&hd=unsa.edu.pe&prompt=select_account`;
    window.location.href = googleAuthUrl;
  };

  // --------------------------------------------------------------------------
  // SCREEN 1: ONBOARDING CAROUSEL (4 STEPS - STITCH DESIGN)
  // --------------------------------------------------------------------------
  if (currentStep === "welcome") {
    return (
      <main className="w-full min-h-screen bg-black text-white flex flex-col items-center justify-between font-sans select-none safe-areas">
        <div className="w-full max-w-[390px] min-h-screen flex flex-col justify-between relative bg-black overflow-hidden shadow-2xl">
          {/* Top Two-Tone Arc matching Stitch Prototype */}
          <div className="relative w-full">
            <div className="w-full bg-[#E5E5EA] rounded-b-[44px] pt-4 pb-20 px-6 relative flex flex-col items-center">
              {/* Top Navigation Row (Cancelar / Saltar) */}
              <div className="w-full flex justify-between items-center text-black font-semibold text-[14px]">
                {onCancel ? (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="text-neutral-700 hover:text-black py-1 px-1 transition-colors"
                  >
                    {AUTH_MESSAGES.cancelButton}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => setCurrentStep("auth")}
                  className="text-neutral-700 hover:text-black py-1 px-2 text-[13px] font-semibold transition-colors"
                >
                  {AUTH_MESSAGES.skipButton}
                </button>
              </div>
              {/* Spacer allowing illustration to overlap into the dark section */}
              <div className="h-28" />
            </div>

            {/* Mascot Showcase Card (Floating WebP Asset) */}
            <div className="absolute top-[82px] left-1/2 -translate-x-1/2 z-20">
              <div className="w-64 h-64 sm:w-72 sm:h-72 rounded-[32px] overflow-hidden shadow-2xl bg-[#0d0f17] border-[3px] border-black/10 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentSlide.imageSrc}
                  alt={currentSlide.imageAlt}
                  width={280}
                  height={280}
                  className="w-full h-full object-cover pointer-events-none"
                />
              </div>
            </div>
          </div>

          {/* Bottom Dark Section (Pagination Dots, Text, Action Button) */}
          <div className="flex-1 flex flex-col justify-between px-7 pt-36 pb-6 text-center z-10">
            {/* Interactive Pagination Dots (4 steps) */}
            <nav
              aria-label="Paginación del carrusel"
              className="flex justify-center items-center space-x-2.5 mb-6"
            >
              {ONBOARDING_SLIDES.map((slide, idx) => {
                const isActive = idx === slideIndex;
                return (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setSlideIndex(idx)}
                    aria-label={`Paso ${slide.id}`}
                    aria-current={isActive ? "step" : undefined}
                    className={`rounded-full transition-all duration-200 cursor-pointer ${
                      isActive
                        ? "w-2.5 h-2.5 bg-white ring-2 ring-white/20"
                        : "w-2 h-2 bg-neutral-600 hover:bg-neutral-400"
                    }`}
                  />
                );
              })}
            </nav>

            {/* Slide Title and Description */}
            <div className="space-y-3 px-1">
              <h1 className="text-3xl font-extrabold text-white text-center tracking-tight leading-tight mb-3">
                {currentSlide.title}
              </h1>
              <p className="text-sm font-normal text-neutral-400 text-center leading-relaxed max-w-[290px] mx-auto min-h-[4.5rem]">
                {currentSlide.description}
              </p>
            </div>

            {/* Primary Action Button */}
            <div className="mt-8 space-y-4">
              <button
                type="button"
                onClick={handleNextSlide}
                className="w-full h-[54px] bg-[#990000] hover:bg-[#800000] active:scale-[0.98] text-white rounded-2xl font-bold text-sm tracking-wider uppercase flex items-center justify-center space-x-2 transition-all duration-150 shadow-lg cursor-pointer"
              >
                <span>{isLastSlide ? AUTH_MESSAGES.welcomeStartButton : AUTH_MESSAGES.welcomeNextButton}</span>
                <CaretRight size={18} weight="bold" />
              </button>

              {/* iOS Home Indicator Bar */}
              <div className="w-32 h-1 bg-white/20 rounded-full mx-auto mt-2" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  // --------------------------------------------------------------------------
  // SCREEN 2: AUTHENTICATION CARD (STITCH REFERENCE STYLE)
  // --------------------------------------------------------------------------
  return (
    <main className="w-full min-h-screen bg-black text-white flex flex-col items-center justify-between font-sans select-none safe-areas">
      <div className="w-full max-w-[390px] min-h-screen flex flex-col justify-between relative bg-black overflow-hidden shadow-2xl p-0 sm:p-2">
        {/* iOS Navigation Header */}
        <header className="w-full px-6 pt-4 pb-2 flex justify-between items-center text-white z-20">
          <button
            type="button"
            onClick={() => {
              setSlideIndex(ONBOARDING_SLIDES.length - 1);
              setCurrentStep("welcome");
            }}
            className="flex items-center space-x-1 text-[#E5575B] hover:opacity-80 transition-opacity font-semibold text-[15px]"
          >
            <CaretLeft size={20} weight="bold" />
            <span>{AUTH_MESSAGES.backButton}</span>
          </button>
          <span className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
            {AUTH_MESSAGES.welcomeBadge}
          </span>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-neutral-400 hover:text-white transition-colors text-[14px]"
            >
              {AUTH_MESSAGES.cancelButton}
            </button>
          ) : (
            <span className="w-12" />
          )}
        </header>

        {/* Main Reference Card Container */}
        <div className="w-full flex-1 bg-[#d6d8db] dark:bg-[#1C1C1E] rounded-[38px] px-7 pt-3.5 pb-6 flex flex-col justify-between shadow-inner mt-2 mb-2 text-[#1f2429] dark:text-white">
          {/* Top Grabber */}
          <div className="w-12 h-1 bg-[#b4b7bd] dark:bg-white/20 rounded-full mx-auto mb-2" />

          {/* Card Header & Mascot Branding */}
          <section className="text-center">
            <h1 className="text-[23px] font-extrabold text-[#111315] dark:text-white tracking-tight">
              {authMode === "signin" ? AUTH_MESSAGES.signInGreeting : AUTH_MESSAGES.signUpGreeting}
            </h1>
            <p className="text-[13px] text-[#71767e] dark:text-neutral-400 font-medium mt-1">
              {authMode === "signin" ? AUTH_MESSAGES.signInSubtitle : AUTH_MESSAGES.signUpSubtitle}
            </p>
          </section>

          {/* Minimalist SVG Penguin Logo */}
          <div className="flex flex-col items-center justify-center my-1">
            <div className="w-16 h-16 flex items-center justify-center mb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/onboarding/penguin-logo-minimal.svg"
                alt="CampusUNSA Logo Minimal"
                width={64}
                height={64}
                className="w-full h-full object-contain pointer-events-none"
              />
            </div>
            <h2 className="text-[18px] font-black tracking-wider text-[#121417] dark:text-white uppercase">
              {AUTH_MESSAGES.welcomeBadge}
            </h2>
          </div>

          {/* Error Notice */}
          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600 dark:text-red-400 flex items-center space-x-2 my-1"
            >
              <WarningCircle size={16} weight="bold" className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleEmailPasswordSubmit} className="space-y-3 mt-0.5">
            {authMode === "signup" && (
              <div className="space-y-1.5 text-left">
                <label className="block text-[13px] font-bold text-[#1f2429] dark:text-neutral-200">
                  {AUTH_MESSAGES.fullNameLabel}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 pointer-events-none text-[#ba131a]">
                    <UserIcon size={18} weight="bold" />
                  </div>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={AUTH_MESSAGES.fullNamePlaceholder}
                    className="w-full h-[46px] pl-11 pr-4 bg-[#c8cbd1] dark:bg-[#2C2C2E] text-[#2c3138] dark:text-white placeholder-[#7d828a] text-[13.5px] rounded-[14px] border-none focus:ring-2 focus:ring-[#ba131a] outline-none transition-all"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5 text-left">
              <label className="block text-[13px] font-bold text-[#1f2429] dark:text-neutral-200">
                {AUTH_MESSAGES.emailLabel}
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-4 pointer-events-none text-[#ba131a]">
                  <EnvelopeSimple size={18} weight="bold" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={AUTH_MESSAGES.emailPlaceholder}
                  autoComplete="email"
                  className="w-full h-[46px] pl-11 pr-4 bg-[#c8cbd1] dark:bg-[#2C2C2E] text-[#2c3138] dark:text-white placeholder-[#7d828a] text-[13.5px] rounded-[14px] border-none focus:ring-2 focus:ring-[#ba131a] outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-left">
              <label className="block text-[13px] font-bold text-[#1f2429] dark:text-neutral-200">
                {AUTH_MESSAGES.passwordLabel}
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-4 pointer-events-none text-[#ba131a]">
                  <LockKey size={18} weight="bold" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={AUTH_MESSAGES.passwordPlaceholder}
                  autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                  className="w-full h-[46px] pl-11 pr-11 bg-[#c8cbd1] dark:bg-[#2C2C2E] text-[#2c3138] dark:text-white placeholder-[#7d828a] text-[13.5px] rounded-[14px] border-none focus:ring-2 focus:ring-[#ba131a] outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  className="absolute right-4 text-[#7d828a] hover:text-[#4a4f56] dark:hover:text-white transition-colors"
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[12px] pt-0.5">
              <label className="flex items-center space-x-2 text-[#7d828a] dark:text-neutral-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-[#a9adb5] text-[#ba131a] focus:ring-0 focus:ring-offset-0 bg-[#c0c3c9] dark:bg-[#3A3A3C]"
                />
                <span className="font-medium text-[#6e737c] dark:text-neutral-300">
                  {AUTH_MESSAGES.rememberMeLabel}
                </span>
              </label>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-[#ba131a] font-bold hover:underline"
              >
                {AUTH_MESSAGES.forgotPasswordLink}
              </a>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full h-[48px] bg-[#ba131a] hover:bg-[#9f1016] active:scale-[0.99] text-white font-bold rounded-[14px] shadow-sm transition-all flex items-center justify-center text-[15px] cursor-pointer disabled:opacity-60"
              >
                {loading
                  ? AUTH_MESSAGES.submitting
                  : authMode === "signin"
                  ? AUTH_MESSAGES.signInSubmit
                  : AUTH_MESSAGES.signUpSubmit}
              </button>
            </div>
          </form>

          {/* Social Sign-in (Google Official Identity Button) */}
          <section className="my-1.5">
            <div className="relative flex items-center justify-center mb-3">
              <div className="border-t border-[#bdc1c7] dark:border-neutral-700 w-full" />
              <span className="bg-[#d6d8db] dark:bg-[#1C1C1E] px-3 text-[11px] text-[#71767e] dark:text-neutral-400 font-medium absolute">
                {AUTH_MESSAGES.dividerText}
              </span>
            </div>

            <div className="flex justify-center items-center">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full h-[46px] rounded-[14px] bg-white dark:bg-[#2C2C2E] border border-[#DADCE0] dark:border-[#444] text-[#3C4043] dark:text-[#E3E3E3] font-medium text-[14px] flex items-center justify-center space-x-3 hover:bg-neutral-50 dark:hover:bg-[#343438] active:scale-[0.99] transition-all shadow-sm"
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
          </section>

          {/* Switch Mode Footer */}
          <footer className="text-center pt-1 pb-1">
            <p className="text-[12px] font-semibold text-[#1f2429] dark:text-neutral-300">
              {authMode === "signin"
                ? AUTH_MESSAGES.switchToSignUpPrompt
                : AUTH_MESSAGES.switchToSignInPrompt}{" "}
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "signin" ? "signup" : "signin");
                  setErrorMessage(null);
                }}
                className="text-[#ba131a] font-bold hover:underline cursor-pointer"
              >
                {authMode === "signin"
                  ? AUTH_MESSAGES.switchToSignUpAction
                  : AUTH_MESSAGES.switchToSignInAction}
              </button>
            </p>
          </footer>
        </div>

        {/* Home Indicator */}
        <div className="w-full flex justify-center pb-3 pt-1">
          <div className="w-32 h-1 bg-white/40 rounded-full" />
        </div>
      </div>
    </main>
  );
}
