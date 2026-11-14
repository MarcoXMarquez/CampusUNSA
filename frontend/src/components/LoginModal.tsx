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
      className="rounded-t-3xl pb-safe bg-black max-h-[92vh] overflow-y-auto"
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
    </Sheet>
  );
}
