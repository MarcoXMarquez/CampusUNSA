"use client";

import React from "react";
import { App } from "konsta/react";

export default function KonstaProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <App theme="ios" safeAreas>
      {children}
    </App>
  );
}
