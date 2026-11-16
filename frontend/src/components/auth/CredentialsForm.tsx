"use client";

import React from "react";
import {
  Eye,
  EyeSlash,
  EnvelopeSimple,
  LockKey,
  User as UserIcon,
} from "@phosphor-icons/react";
import { AUTH_MESSAGES } from "@/lib/messages/auth-messages";

export interface CredentialsFormProps {
  authMode: "signin" | "signup";
  fullName: string;
  email: string;
  password: string;
  rememberMe: boolean;
  showPassword: boolean;
  loading: boolean;
  onFullNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRememberMeChange: (checked: boolean) => void;
  onToggleShowPassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

/**
 * Institutional email and password credentials form supporting sign-in and sign-up modes.
 */
export function CredentialsForm({
  authMode,
  fullName,
  email,
  password,
  rememberMe,
  showPassword,
  loading,
  onFullNameChange,
  onEmailChange,
  onPasswordChange,
  onRememberMeChange,
  onToggleShowPassword,
  onSubmit,
}: CredentialsFormProps): React.JSX.Element {
  return (
    <form onSubmit={onSubmit} className="space-y-3 mt-0.5">
      {authMode === "signup" && (
        <div className="space-y-1.5 text-left">
          <label className="block text-ios-footnote font-bold text-ink-primary">
            {AUTH_MESSAGES.fullNameLabel}
          </label>
          <div className="relative flex items-center">
            <div className="absolute left-4 pointer-events-none text-brand-action">
              <UserIcon size={18} weight="bold" />
            </div>
            <input
              type="text"
              value={fullName}
              onChange={(e) => onFullNameChange(e.target.value)}
              placeholder={AUTH_MESSAGES.fullNamePlaceholder}
              className="w-full h-[46px] pl-11 pr-4 bg-surface-inset text-ink-primary placeholder:text-ink-muted text-ios-footnote rounded-[14px] border border-control focus:ring-2 focus:ring-brand-action outline-none transition-all"
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5 text-left">
        <label className="block text-ios-footnote font-bold text-ink-primary">
          {AUTH_MESSAGES.emailLabel}
        </label>
        <div className="relative flex items-center">
          <div className="absolute left-4 pointer-events-none text-brand-action">
            <EnvelopeSimple size={18} weight="bold" />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder={AUTH_MESSAGES.emailPlaceholder}
            autoComplete="email"
            className="w-full h-[46px] pl-11 pr-4 bg-surface-inset text-ink-primary placeholder:text-ink-muted text-ios-footnote rounded-[14px] border border-control focus:ring-2 focus:ring-brand-action outline-none transition-all"
          />
        </div>
      </div>

      <div className="space-y-1.5 text-left">
        <label className="block text-ios-footnote font-bold text-ink-primary">
          {AUTH_MESSAGES.passwordLabel}
        </label>
        <div className="relative flex items-center">
          <div className="absolute left-4 pointer-events-none text-brand-action">
            <LockKey size={18} weight="bold" />
          </div>
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder={AUTH_MESSAGES.passwordPlaceholder}
            autoComplete={authMode === "signup" ? "new-password" : "current-password"}
            className="w-full h-[46px] pl-11 pr-11 bg-surface-inset text-ink-primary placeholder:text-ink-muted text-ios-footnote rounded-[14px] border border-control focus:ring-2 focus:ring-brand-action outline-none transition-all"
          />
          <button
            type="button"
            onClick={onToggleShowPassword}
            aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
            className="absolute right-4 text-ink-muted hover:text-ink-primary transition-colors"
          >
            {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-ios-caption-1 pt-0.5">
        <label className="flex items-center space-x-2 text-ink-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => onRememberMeChange(e.target.checked)}
            className="w-4 h-4 rounded border-control text-brand-action focus:ring-0 focus:ring-offset-0 bg-surface-inset"
          />
          <span className="font-medium text-ink-secondary">
            {AUTH_MESSAGES.rememberMeLabel}
          </span>
        </label>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="text-brand-action font-bold hover:underline"
        >
          {AUTH_MESSAGES.forgotPasswordLink}
        </a>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="w-full h-[48px] bg-brand-cta hover:bg-brand-cta-hover active:scale-[0.99] text-white font-bold rounded-[14px] shadow-sm transition-all flex items-center justify-center text-ios-subhead cursor-pointer disabled:opacity-60"
        >
          {loading
            ? AUTH_MESSAGES.submitting
            : authMode === "signin"
            ? AUTH_MESSAGES.signInSubmit
            : AUTH_MESSAGES.signUpSubmit}
        </button>
      </div>
    </form>
  );
}
