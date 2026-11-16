"use client";

import React, { useState } from "react";
import { CaretLeft, WarningCircle } from "@phosphor-icons/react";
import { AUTH_MESSAGES, ONBOARDING_SLIDES } from "@/lib/messages/auth-messages";
import { getApiBaseUrl, getGoogleClientId } from "@/lib/api-client";
import { OnboardingCarousel } from "./auth/OnboardingCarousel";
import { CredentialsForm } from "./auth/CredentialsForm";
import { GoogleSignInButton } from "./auth/GoogleSignInButton";

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

/**
 * Full-screen institutional onboarding carousel and authentication orchestrator.
 */
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

  const apiUrl = getApiBaseUrl();
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
    const clientId = getGoogleClientId();
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

  if (currentStep === "welcome") {
    return (
      <OnboardingCarousel
        slideIndex={slideIndex}
        onSelectSlide={setSlideIndex}
        onNext={handleNextSlide}
        onSkip={() => setCurrentStep("auth")}
        onCancel={onCancel}
      />
    );
  }

  return (
    <main className="w-full min-h-dvh bg-canvas text-ink-primary flex flex-col justify-between font-sans select-none safe-areas overflow-x-hidden">
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col justify-between px-6 py-6">
        <header className="w-full flex justify-between items-center z-20 mb-2">
          <button
            type="button"
            onClick={() => {
              setSlideIndex(ONBOARDING_SLIDES.length - 1);
              setCurrentStep("welcome");
            }}
            className="flex items-center space-x-1 text-brand-action hover:opacity-80 transition-opacity font-semibold text-ios-subhead"
          >
            <CaretLeft size={20} weight="bold" />
            <span>{AUTH_MESSAGES.backButton}</span>
          </button>
          <span className="text-ios-caption-1 font-semibold tracking-wide text-ink-muted uppercase">
            {AUTH_MESSAGES.welcomeBadge}
          </span>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-ink-secondary hover:text-ink-primary transition-colors text-ios-subhead"
            >
              {AUTH_MESSAGES.cancelButton}
            </button>
          ) : (
            <span className="w-12" />
          )}
        </header>

        <section className="text-center">
          <h1 className="text-ios-title-2 font-extrabold text-ink-primary tracking-tight">
            {authMode === "signin" ? AUTH_MESSAGES.signInGreeting : AUTH_MESSAGES.signUpGreeting}
          </h1>
          <p className="text-ios-footnote text-ink-secondary font-medium mt-1">
            {authMode === "signin" ? AUTH_MESSAGES.signInSubtitle : AUTH_MESSAGES.signUpSubtitle}
          </p>
        </section>

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
          <h2 className="text-ios-headline font-black tracking-wider text-ink-primary uppercase">
            {AUTH_MESSAGES.welcomeBadge}
          </h2>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl bg-surface-urgent border border-urgent-edge px-3 py-2 text-ios-caption-1 text-status-urgent flex items-center space-x-2 my-1"
          >
            <WarningCircle size={16} weight="bold" className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <CredentialsForm
          authMode={authMode}
          fullName={fullName}
          email={email}
          password={password}
          rememberMe={rememberMe}
          showPassword={showPassword}
          loading={loading}
          onFullNameChange={setFullName}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onRememberMeChange={setRememberMe}
          onToggleShowPassword={() => setShowPassword((prev) => !prev)}
          onSubmit={handleEmailPasswordSubmit}
        />

        <GoogleSignInButton onClick={handleGoogleSignIn} />

        <footer className="text-center pt-1 pb-1">
          <p className="text-ios-caption-1 font-semibold text-ink-secondary">
            {authMode === "signin"
              ? AUTH_MESSAGES.switchToSignUpPrompt
              : AUTH_MESSAGES.switchToSignInPrompt}{" "}
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === "signin" ? "signup" : "signin");
                setErrorMessage(null);
              }}
              className="text-brand-action font-bold hover:underline cursor-pointer"
            >
              {authMode === "signin"
                ? AUTH_MESSAGES.switchToSignUpAction
                : AUTH_MESSAGES.switchToSignInAction}
            </button>
          </p>
        </footer>
      </div>
    </main>
  );
}
