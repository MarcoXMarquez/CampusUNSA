"use client";

import React from "react";
import { AUTH_MESSAGES } from "@/lib/messages/auth-messages";

export interface GoogleSignInButtonProps {
  onClick: () => void;
}

/**
 * Official Google Identity sign-in section restricted to @unsa.edu.pe institutional accounts.
 */
export function GoogleSignInButton({ onClick }: GoogleSignInButtonProps): React.JSX.Element {
  return (
    <section className="my-1.5">
      <div className="relative flex items-center justify-center mb-3">
        <div className="border-t border-subtle w-full" />
        <span className="bg-canvas px-3 text-ios-caption-2 text-ink-muted font-medium absolute">
          {AUTH_MESSAGES.dividerText}
        </span>
      </div>

      <div className="flex justify-center items-center">
        <button
          type="button"
          onClick={onClick}
          className="w-full h-[46px] rounded-[14px] bg-surface-card border border-control text-ink-primary font-medium text-ios-subhead flex items-center justify-center space-x-3 hover:bg-surface-elevated active:scale-[0.99] transition-all shadow-sm"
        >
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4" // ui-gate-ignore: Google Identity brand logo
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853" // ui-gate-ignore: Google Identity brand logo
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05" // ui-gate-ignore: Google Identity brand logo
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335" // ui-gate-ignore: Google Identity brand logo
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{AUTH_MESSAGES.googleButton}</span>
        </button>
      </div>
    </section>
  );
}
