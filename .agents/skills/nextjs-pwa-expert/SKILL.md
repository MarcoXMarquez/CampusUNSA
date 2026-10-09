---
name: nextjs-pwa-expert
description: Frontend architecture and Progressive Web App (PWA) expert for Next.js 14 App Router, React 18, TypeScript, and Tailwind CSS in CampusUNSA. Enforces strict type safety, offline-first caching, and component testing with Vitest.
---

# Next.js 14 PWA Engineering Standard — CampusUNSA

## 1. Overview and Mission

The `nextjs-pwa-expert` skill provides comprehensive architectural guidelines for developing the CampusUNSA Progressive Web Application (PWA) using Next.js 14 (App Router), React 18, TypeScript, and Tailwind CSS.

## 2. Inviolable Constraints

1. **Zero Emojis:** Strictly prohibited in UI templates, icons, buttons, titles, alt texts, and test files. Use vector SVG icons (e.g., Lucide React or Heroicons) instead of emoji characters.
2. **Strict TypeScript (No `any`):** The use of `any` is forbidden. Define explicit interfaces, types, and generic parameters.
3. **English in Code Artifacts:** All component names, state variables, props, hooks, comments, and tests must be written in standard English.
4. **App Router Boundary Discipline:** Server Components are the default. Use `'use client'` strictly for components with state, effects, or user interactions.

## 3. Architecture & Folder Structure

```
frontend/src/
├── app/
│   ├── layout.tsx         # Root layout with fonts, metadata, and service worker registration
│   ├── page.tsx           # Institutional landing and login redirect
│   ├── page.test.tsx      # Landing page Vitest tests
│   └── globals.css        # Tailwind directives and CSS variables
├── components/
│   ├── ui/                # Base reusable UI components (buttons, cards, inputs)
│   └── auth/              # Google OAuth login and institutional session guards
├── lib/
│   ├── api.ts             # Typed fetch wrappers communicating with FastAPI (port 9000/8000)
│   └── sw.ts              # Service worker lifecycle and cache synchronization
└── types/
    └── index.ts           # Shared TypeScript interfaces (User, Profile, AuthState)
```

## 4. Offline-First PWA Strategy

CampusUNSA operates in university campus areas with intermittent connectivity:
* **Service Worker Strategy:** Cache static assets, course schedules, and last known user profile data.
* **Network-First with Cache Fallback:** For dynamic API requests (`/api/v1/auth/me`), try network first; on failure, serve cached profile if available.
* **Manifest Configuration:** `manifest.json` configured with institutional UNSA branding, theme colors, and icons.

## 5. Component Design Patterns

### 5.1 Server Component Pattern (Default)
```tsx
import React from 'react';

interface CampusCardProps {
  title: string;
  location: string;
}

export function CampusCard({ title, location }: CampusCardProps) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
      <p className="text-sm text-neutral-600">{location}</p>
    </div>
  );
}
```

### 5.2 Client Component Pattern (Interactive)
```tsx
'use client';

import React, { useState } from 'react';

interface AuthButtonProps {
  onLogin: () => void;
  isLoading?: boolean;
}

export function AuthButton({ onLogin, isLoading = false }: AuthButtonProps) {
  return (
    <button
      type="button"
      onClick={onLogin}
      disabled={isLoading}
      className="inline-flex items-center justify-center rounded-md bg-unsa-primary px-4 py-2 font-medium text-white transition hover:bg-unsa-dark disabled:opacity-50"
    >
      {isLoading ? 'Authenticating...' : 'Sign In with UNSA Account'}
    </button>
  );
}
```

## 6. Frontend Quality & Test Commands

```bash
# Run unit component tests (Vitest)
docker compose exec frontend npm run test

# Run TypeScript static type check
docker compose exec frontend npx tsc --noEmit
```
