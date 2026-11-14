"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AuthFlow } from "@/components/AuthFlow";

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();

  return (
    <AuthFlow
      initialStep="welcome"
      initialMode="signin"
      onSuccess={() => {
        router.push("/");
      }}
      onCancel={() => {
        router.push("/");
      }}
    />
  );
}
