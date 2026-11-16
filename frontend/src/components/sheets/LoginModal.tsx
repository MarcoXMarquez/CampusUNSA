"use client";

import React from "react";
import { AuthFlow, type AuthFlowUser } from "@/components/AuthFlow";

interface LoginModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: AuthFlowUser) => void;
}

/**
 * Full-screen institutional onboarding and sign-in modal overlay.
 */
export function LoginModal({
  opened,
  onClose,
  onSuccess,
}: LoginModalProps): React.JSX.Element | null {
  if (!opened) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Inicio de sesión institucional"
      className="fixed inset-0 z-[60] bg-canvas overflow-y-auto"
    >
      <AuthFlow
        initialStep="welcome"
        initialMode="signin"
        onSuccess={(token, user) => {
          onSuccess(token, user);
          onClose();
        }}
        onCancel={onClose}
      />
    </div>
  );
}
