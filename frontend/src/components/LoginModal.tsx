"use client";

import React, { useState } from "react";
import { Sheet, List, ListItem, Button, Preloader } from "konsta/react";
import { WarningCircle, LockKey, IdentificationCard } from "@phosphor-icons/react";

interface LoginModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: any) => void;
}

export function LoginModal({
  opened,
  onClose,
  onSuccess,
}: LoginModalProps): React.JSX.Element {
  const [showManualLogin, setShowManualLogin] = useState<boolean>(false);
  const [ci, setCi] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api/v1";

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ci.trim() || !password.trim()) {
      setErrorMessage("Ingresa tu C.I. y contraseña institucional.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ci, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail?.message || data.detail || "Credenciales incorrectas");
      }

      const data = await res.json();
      localStorage.setItem("campusunsa_token", data.access_token);
      onSuccess(data.access_token, data.user);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = () => {
    // If Google Identity Services is available
    if (typeof window !== "undefined" && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setErrorMessage("Google Sign-In cargando... Por favor, reintenta en un momento.");
    }
  };

  return (
    <Sheet
      opened={opened}
      onBackdropClick={onClose}
      className="rounded-t-2xl pb-safe"
    >
      {/* Top Grabber */}
      <div className="w-10 h-1 bg-slate-300 dark:bg-zinc-600 rounded-full mx-auto my-3" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 border-b border-black/10 dark:border-white/10">
        <button
          type="button"
          onClick={() => {
            if (showManualLogin) {
              setShowManualLogin(false);
            } else {
              onClose();
            }
          }}
          className="text-primary dark:text-primary-dark text-[17px] font-normal"
        >
          {showManualLogin ? "Atrás" : "Cancelar"}
        </button>
        <span className="text-[17px] font-semibold text-black dark:text-white">
          {showManualLogin ? "Credenciales UNSA" : "CampusUNSA"}
        </span>
        <div className="w-16" />
      </div>

      <div className="px-6 py-8 text-center max-w-sm mx-auto">
        {!showManualLogin ? (
          <>
            {/* App Branding */}
            <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center mx-auto mb-4 font-bold text-2xl tracking-tighter shadow-sm">
              UNSA
            </div>
            <h1 className="text-[28px] font-bold tracking-tight text-black dark:text-white mb-1">
              CampusUNSA
            </h1>
            <p className="text-[15px] text-black/60 dark:text-white/60 mb-8">
              Hub Académico y Asistente Conversacional
            </p>

            {/* Error Message */}
            {errorMessage && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-sm text-urgent dark:text-urgent-dark flex items-center gap-2 text-left">
                <WarningCircle size={18} weight="regular" className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Official Google Sign-In Button */}
            <button
              type="button"
              onClick={handleGoogleClick}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-[#dadce0] dark:border-[#8e918f] bg-white dark:bg-[#131314] text-[#3c4043] dark:text-[#e3e3e3] font-medium text-[16px] shadow-sm active:bg-[#f8f9fa] dark:active:bg-[#1f1f20] transition-colors mb-4"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continuar con Google</span>
            </button>

            {/* Manual Credential Link */}
            <button
              type="button"
              onClick={() => {
                setShowManualLogin(true);
                setErrorMessage(null);
              }}
              className="text-[15px] font-normal text-primary dark:text-primary-dark hover:underline mb-8"
            >
              Usar C.I. y contraseña UNSA
            </button>

            {/* Footer */}
            <div>
              <span className="text-[13px] text-black/40 dark:text-white/40">
                Ayuda · Términos
              </span>
            </div>
          </>
        ) : (
          /* Manual C.I. and Password Screen */
          <form onSubmit={handleManualLogin} className="text-left">
            <p className="text-[14px] text-black/60 dark:text-white/60 mb-4 text-center">
              Ingresa con tu Código de Identificación y contraseña del portal UNSA.
            </p>

            {errorMessage && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-sm text-urgent dark:text-urgent-dark flex items-center gap-2">
                <WarningCircle size={18} weight="regular" className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-[13px] font-medium text-black/70 dark:text-white/70 mb-1">
                  Código de Identificación (C.I.)
                </label>
                <div className="flex items-center px-3 py-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-zinc-800">
                  <IdentificationCard size={20} className="text-black/40 dark:text-white/40 mr-2" />
                  <input
                    type="text"
                    required
                    placeholder="20203491"
                    value={ci}
                    onChange={(e) => setCi(e.target.value)}
                    className="w-full bg-transparent text-[16px] text-black dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-black/70 dark:text-white/70 mb-1">
                  Contraseña
                </label>
                <div className="flex items-center px-3 py-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-zinc-800">
                  <LockKey size={20} className="text-black/40 dark:text-white/40 mr-2" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-[16px] text-black dark:text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-primary dark:bg-primary-dark text-white font-semibold text-[17px] active:opacity-80 transition-opacity flex items-center justify-center gap-2"
            >
              {loading && <Preloader size="w-4 h-4" />}
              <span>{loading ? "Iniciando sesión..." : "Iniciar Sesión"}</span>
            </button>
          </form>
        )}
      </div>
    </Sheet>
  );
}
