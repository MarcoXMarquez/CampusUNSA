"use client";

import React, { useEffect, useState, useCallback } from "react";
import Script from "next/script";

interface GoogleAuthProfile {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  profile?: {
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

interface GoogleAuthResponse {
  access_token: string;
  token_type: string;
  user: GoogleAuthProfile;
}

interface ApiErrorDetail {
  code: string;
  message: string;
}

interface ApiErrorResponse {
  detail?: ApiErrorDetail | string;
}

interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
}

export function GoogleAuthCard(): React.JSX.Element {
  const [user, setUser] = useState<GoogleAuthProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState<boolean>(false);

  const clientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    "680574461584-5vjt8ge9ah4rr1eapphoenit5imvk6m8.apps.googleusercontent.com";
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api/v1";

  const handleCredentialResponse = useCallback(
    async (response: GoogleCredentialResponse) => {
      if (!response.credential) {
        setErrorMessage("No credential received from Google.");
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const res = await fetch(`${apiUrl}/auth/google`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: response.credential }),
        });

        if (!res.ok) {
          const errData: ApiErrorResponse = await res.json().catch(() => ({}));
          let msg = `Authentication failed (Status ${res.status})`;
          if (errData.detail) {
            if (typeof errData.detail === "string") {
              msg = errData.detail;
            } else if (errData.detail.message) {
              msg = `[${errData.detail.code}] ${errData.detail.message}`;
            }
          }
          setErrorMessage(msg);
          setUser(null);
          setToken(null);
          return;
        }

        const data: GoogleAuthResponse = await res.json();
        setUser(data.user);
        setToken(data.access_token);
        if (typeof window !== "undefined") {
          localStorage.setItem("campusunsa_token", data.access_token);
        }
      } catch (err: unknown) {
        const errStr = err instanceof Error ? err.message : String(err);
        setErrorMessage(`Network error connecting to CampusUNSA API: ${errStr}`);
      } finally {
        setLoading(false);
      }
    },
    [apiUrl]
  );

  const renderGoogleButton = useCallback(() => {
    const google = (window as unknown as { google?: { accounts?: { id?: { initialize: (config: unknown) => void; renderButton: (el: HTMLElement | null, config: unknown) => void } } } }).google;
    if (google?.accounts?.id && !user) {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
      });

      const buttonContainer = document.getElementById("google-signin-btn-container");
      if (buttonContainer) {
        google.accounts.id.renderButton(buttonContainer, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 280,
        });
      }
    }
  }, [clientId, handleCredentialResponse, user]);

  useEffect(() => {
    if (scriptLoaded) {
      renderGoogleButton();
    }
  }, [scriptLoaded, renderGoogleButton]);

  const handleLogout = (): void => {
    setUser(null);
    setToken(null);
    setErrorMessage(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("campusunsa_token");
    }
    setTimeout(() => {
      renderGoogleButton();
    }, 100);
  };

  return (
    <section className="border border-blue-200 bg-white rounded-lg p-6 mb-8 shadow-sm">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Autenticacion Institucional UNSA (Google OAuth)
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Acceso unificado restringido a correos con dominio @unsa.edu.pe
          </p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
            user
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {user ? "Sesion Activa" : "No Autenticado"}
        </span>
      </div>

      {errorMessage && (
        <div className="border border-red-300 bg-red-50 text-red-700 text-xs p-3 rounded mb-4">
          <p className="font-bold">Error de Autenticacion:</p>
          <p className="mt-0.5">{errorMessage}</p>
        </div>
      )}

      {loading && (
        <div className="text-xs text-blue-700 py-2">
          Verificando credenciales con Google y aprovisionando perfil...
        </div>
      )}

      {!user ? (
        <div className="flex flex-col items-center sm:items-start space-y-3 pt-2">
          <p className="text-xs text-slate-500">
            Inicia sesion para verificar la integracion en vivo en localhost:
          </p>
          <div id="google-signin-btn-container" className="min-h-[44px]"></div>
          <p className="text-[11px] text-slate-400">
            Client ID: {clientId.slice(0, 24)}...
          </p>
        </div>
      ) : (
        <div className="border-t border-slate-100 pt-4 mt-2">
          <div className="flex items-center space-x-3 mb-3">
            {user.profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.profile.avatar_url}
                alt={user.email}
                className="w-10 h-10 rounded-full border border-slate-200"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-sm">
                {user.email.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-slate-900">
                {user.profile?.full_name || user.email}
              </p>
              <p className="text-xs text-slate-600">{user.email}</p>
              <div className="flex space-x-2 mt-1">
                <span className="text-[11px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">
                  Rol: {user.role}
                </span>
                <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                  ID: {user.id.slice(0, 8)}...
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-2.5 rounded border border-slate-200 text-xs font-mono text-slate-700 break-all mb-3">
            <span className="font-bold text-slate-900">Bearer JWT: </span>
            {token ? `${token.slice(0, 48)}...` : ""}
          </div>

          <button
            onClick={handleLogout}
            className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-1.5 rounded transition"
          >
            Cerrar Sesion
          </button>
        </div>
      )}
    </section>
  );
}
