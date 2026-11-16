"use client";

import React from "react";
import { BlockTitle, List, ListItem } from "konsta/react";
import { Cpu } from "@phosphor-icons/react";
import type { BackendHealthStatus } from "@/lib/api-client";

export interface SystemDiagnosticsSectionProps {
  isOnline: boolean;
  backendHealth: BackendHealthStatus | null;
}

/**
 * Infrastructure diagnostics section showing live status of core backend dependencies.
 */
export function SystemDiagnosticsSection({
  isOnline,
  backendHealth,
}: SystemDiagnosticsSectionProps): React.JSX.Element {
  const renderServiceStatus = (
    healthy: boolean | null,
    healthyLabel: string,
    unhealthyLabel: string
  ): React.JSX.Element => {
    if (!isOnline) {
      return (
        <span className="text-ios-subhead text-status-urgent">
          Sin conexión
        </span>
      );
    }
    if (healthy === null) {
      return (
        <span className="text-ios-subhead text-ink-secondary">
          Sin verificar
        </span>
      );
    }
    return (
      <span
        className={`text-ios-subhead ${
          healthy ? "text-ink-secondary" : "text-status-urgent"
        }`}
      >
        {healthy ? healthyLabel : unhealthyLabel}
      </span>
    );
  };

  return (
    <>
      <BlockTitle>Estado de Servicios</BlockTitle>
      <List strong inset className="my-0">
        <ListItem
          title="FastAPI Core"
          subtitle="API REST /api/v1"
          after={renderServiceStatus(
            backendHealth ? backendHealth.healthy : null,
            "Operativo",
            backendHealth?.reachable ? "Degradado" : "Sin conexión"
          )}
          media={
            <Cpu size={22} weight="regular" className="text-ink-secondary" />
          }
        />
        <ListItem
          title="PostgreSQL 16"
          subtitle="Persistencia principal"
          after={renderServiceStatus(
            backendHealth ? backendHealth.database === "healthy" : null,
            "Operativo",
            "No disponible"
          )}
          media={
            <Cpu size={22} weight="regular" className="text-ink-secondary" />
          }
        />
        <ListItem
          title="Redis 7 Store"
          subtitle="Cache OTP y colas"
          after={renderServiceStatus(
            backendHealth ? backendHealth.redis === "healthy" : null,
            "Operativo",
            "No disponible"
          )}
          media={
            <Cpu size={22} weight="regular" className="text-ink-secondary" />
          }
        />
        <ListItem
          title="Evolution API"
          subtitle="Pasarela WhatsApp"
          after={renderServiceStatus(
            backendHealth ? backendHealth.reachable : null,
            "En espera",
            "Sin conexión"
          )}
          media={
            <Cpu size={22} weight="regular" className="text-ink-secondary" />
          }
        />
      </List>
    </>
  );
}
