"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AuthFlow } from "@/components/AuthFlow";

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#F2F2F7] dark:bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#1C1C1E] rounded-3xl border border-black/10 dark:border-white/10 overflow-hidden">
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
      </div>
    </main>
  );
}
