"use client";

import React from "react";
import { BlockTitle, List, ListItem } from "konsta/react";
import { CalendarCheck, GoogleLogo, WhatsappLogo } from "@phosphor-icons/react";
import { MESSAGING_MESSAGES } from "@/lib/messages/messaging-messages";

export interface ServicesIntegrationsSectionProps {
  anyMessagingConnected: boolean;
  connectedChannelsSummary: string;
  classroomConnected: boolean;
  classroomSyncStatus: string;
  moodleIcalConnected: boolean;
  moodleIcalSyncStatus: string;
  onOpenMessagingSheet: () => void;
  onLinkClassroom: () => void;
  onOpenIcalDialog: () => void;
}

/**
 * Settings section listing omnichannel messaging, Classroom, and DUTIC Moodle integrations.
 */
export function ServicesIntegrationsSection({
  anyMessagingConnected,
  connectedChannelsSummary,
  classroomConnected,
  classroomSyncStatus,
  moodleIcalConnected,
  moodleIcalSyncStatus,
  onOpenMessagingSheet,
  onLinkClassroom,
  onOpenIcalDialog,
}: ServicesIntegrationsSectionProps): React.JSX.Element {
  return (
    <>
      <BlockTitle>Servicios y Notificaciones</BlockTitle>
      <List strong inset className="my-0">
        <ListItem
          link
          chevron
          title={MESSAGING_MESSAGES.settingsRowTitle}
          subtitle={
            connectedChannelsSummary
              ? `Conectado: ${connectedChannelsSummary}`
              : MESSAGING_MESSAGES.settingsRowSubtitleDefault
          }
          after={
            <span className="inline-flex items-center gap-1.5 text-ios-subhead text-ink-secondary">
              {anyMessagingConnected && (
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full bg-status-success"
                />
              )}
              {anyMessagingConnected
                ? MESSAGING_MESSAGES.settingsRowActionConnected
                : MESSAGING_MESSAGES.settingsRowActionLink}
            </span>
          }
          media={
            <WhatsappLogo
              size={22}
              weight="regular"
              className="text-brand-action"
            />
          }
          onClick={onOpenMessagingSheet}
        />
        <ListItem
          link
          chevron
          title="Sincronizacion Google Classroom"
          subtitle={
            classroomConnected
              ? `Sincronización activa (${classroomSyncStatus})`
              : "Vincular Google Classroom (1 Clic)"
          }
          after={
            <span className="inline-flex items-center gap-1.5 text-ios-subhead text-ink-secondary">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  classroomConnected ? "bg-brand-action" : "bg-control"
                }`}
              />
              {classroomConnected ? "Conectado" : "No Vinculado"}
            </span>
          }
          media={
            <GoogleLogo
              size={22}
              weight="regular"
              className="text-ink-secondary"
            />
          }
          onClick={onLinkClassroom}
        />
        <ListItem
          link
          chevron
          title="Sincronizacion DUTIC Moodle"
          subtitle={
            moodleIcalConnected
              ? `Calendario iCal activo (${moodleIcalSyncStatus})`
              : "Suscripcion de Calendario iCal Moodle (DUTIC)"
          }
          after={
            <span className="inline-flex items-center gap-1.5 text-ios-subhead text-ink-secondary">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  moodleIcalConnected ? "bg-brand-action" : "bg-control"
                }`}
              />
              {moodleIcalConnected ? "Suscrito" : "Configurar"}
            </span>
          }
          media={
            <CalendarCheck
              size={22}
              weight="regular"
              className="text-ink-secondary"
            />
          }
          onClick={onOpenIcalDialog}
        />
      </List>
    </>
  );
}
