"use client";

import React from "react";
import { Sheet } from "konsta/react";
import { AuthFlow, type AuthFlowUser } from "./AuthFlow";

interface LoginModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: AuthFlowUser) => void;
}

export function LoginModal({
  opened,
  onClose,
  onSuccess,
}: LoginModalProps): React.JSX.Element {
  return (
    <Sheet
      opened={opened}
      onBackdropClick={onClose}
      className="rounded-t-3xl pb-safe bg-[#F2F2F7] dark:bg-black max-h-[92vh] overflow-y-auto"
    >
      {/* Top Grabber */}
      <div className="w-10 h-1 bg-black/20 dark:bg-white/25 rounded-full mx-auto my-3" />

      <AuthFlow
        initialStep="welcome"
        initialMode="signin"
        onSuccess={(token, user) => {
          onSuccess(token, user);
          onClose();
        }}
        onCancel={onClose}
      />
    </Sheet>
  );
}
