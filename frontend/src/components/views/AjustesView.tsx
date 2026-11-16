"use client";

import React, { useEffect, useState } from "react";
import {
  Navbar,
  BlockTitle,
  List,
  ListItem,
  Toggle,
  Dialog,
  DialogButton,
} from "konsta/react";
import {
  Trash,
  SignOut,
  User,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { WhatsAppSheet } from "@/components/sheets/WhatsAppSheet";
import {
  fetchMessagingOtpStatus,
  getUserDisplayName,
  type BackendHealthStatus,
  type OtpStatusResponse,
  type UserProfile,
} from "@/lib/api-client";
import { ServicesIntegrationsSection } from "./ajustes/ServicesIntegrationsSection";
import { CampusLocationsSection } from "./ajustes/CampusLocationsSection";
import { SystemDiagnosticsSection } from "./ajustes/SystemDiagnosticsSection";

interface AjustesViewProps {
  user: UserProfile | null;
  token: string | null;
  isOnline?: boolean;
  backendHealth?: BackendHealthStatus | null;
  classroomConnected: boolean;
  classroomSyncStatus: string;
  moodleIcalConnected: boolean;
  moodleIcalSyncStatus: string;
  onLinkClassroom: () => void;
  onSubscribeMoodleIcal: (url: string) => Promise<void>;
  onClearTasks: () => Promise<void>;
  onClearCourses: () => Promise<void>;
  onLogout: () => void;
  onOpenLogin: () => void;
}

/**
 * Settings view ("Ajustes") managing institutional account, platform integrations, data reset, and diagnostics.
 */
export function AjustesView({
  user,
  token,
  isOnline = true,
  backendHealth = null,
  classroomConnected,
  classroomSyncStatus,
  moodleIcalConnected,
  moodleIcalSyncStatus,
  onLinkClassroom,
  onSubscribeMoodleIcal,
  onClearTasks,
  onClearCourses,
  onLogout,
  onOpenLogin,
}: AjustesViewProps): React.JSX.Element {
  const [whatsappSheetOpened, setWhatsappSheetOpened] = useState<boolean>(false);
  const [icalDialogOpened, setIcalDialogOpened] = useState<boolean>(false);
  const [icalUrl, setIcalUrl] = useState<string>("");
  const [showSandbox, setShowSandbox] = useState<boolean>(false);
  const [cleaningTasks, setCleaningTasks] = useState<boolean>(false);
  const [cleaningCourses, setCleaningCourses] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [messagingStatus, setMessagingStatus] = useState<OtpStatusResponse | null>(
    null
  );

  useEffect(() => {
    if (!token || !isOnline) return;
    let active = true;
    void fetchMessagingOtpStatus(token)
      .then((status) => {
        if (active) setMessagingStatus(status);
      })
      .catch(() => {
        // Keep last known status when offline or unauthenticated
      });
    return () => {
      active = false;
    };
  }, [token, isOnline]);

  const anyMessagingConnected = Boolean(
    messagingStatus?.whatsapp_connected || messagingStatus?.telegram_connected
  );
  const connectedChannelsSummary = [
    messagingStatus?.whatsapp_connected ? "WhatsApp" : null,
    messagingStatus?.telegram_connected ? "Telegram" : null,
  ]
    .filter(Boolean)
    .join(" y ");

  const displayName = getUserDisplayName(user);
  const avatarInitial = displayName[0]?.toUpperCase() || "U";

  const showNotice = (message: string) => {
    setActionError(null);
    setActionMessage(message);
    setTimeout(() => setActionMessage(null), 3000);
  };

  const showError = (err: unknown, fallback: string) => {
    setActionMessage(null);
    setActionError(err instanceof Error ? err.message : fallback);
    setTimeout(() => setActionError(null), 4000);
  };

  const handleIcalSubmit = async () => {
    if (!icalUrl.trim()) return;
    try {
      await onSubscribeMoodleIcal(icalUrl.trim());
      setIcalDialogOpened(false);
      showNotice("Calendario Moodle suscrito correctamente");
    } catch (err: unknown) {
      showError(err, "No se pudo suscribir el calendario Moodle");
    }
  };

  const handleClearTasks = async () => {
    setCleaningTasks(true);
    try {
      await onClearTasks();
      showNotice("Tareas borradas correctamente");
    } catch (err: unknown) {
      showError(err, "No se pudieron borrar las tareas");
    } finally {
      setCleaningTasks(false);
    }
  };

  const handleClearCourses = async () => {
    setCleaningCourses(true);
    try {
      await onClearCourses();
      showNotice("Cursos borrados correctamente");
    } catch (err: unknown) {
      showError(err, "No se pudieron borrar los cursos");
    } finally {
      setCleaningCourses(false);
    }
  };

  return (
    <div className="pb-24">
      <Navbar title="Ajustes" large />

      {actionMessage && (
        <div
          role="status"
          className="mx-4 mt-2 mb-3 p-3 rounded-xl bg-surface-card border border-subtle text-ios-subhead text-ink-primary flex items-center gap-2"
        >
          <CheckCircle
            size={18}
            weight="regular"
            className="text-brand-action shrink-0"
          />
          <span>{actionMessage}</span>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mx-4 mt-2 mb-3 p-3 rounded-xl bg-surface-card border border-urgent-edge text-ios-subhead text-status-urgent flex items-center gap-2"
        >
          <WarningCircle size={18} weight="regular" className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <BlockTitle>Cuenta Institucional</BlockTitle>
      <List strong inset className="my-0">
        {user ? (
          <ListItem
            title={displayName}
            subtitle={user.email}
            after={
              <span className="text-ios-subhead text-ink-secondary">
                Verificado
              </span>
            }
            media={
              user.profile?.avatar_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={user.profile.avatar_url}
                  alt="Avatar"
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-brand-primary-tint text-brand-action flex items-center justify-center font-bold">
                  {avatarInitial}
                </div>
              )
            }
          />
        ) : (
          <ListItem
            link
            chevron
            title="Iniciar Sesión Institucional"
            subtitle="Acceso exclusivo con cuenta @unsa.edu.pe"
            media={
              <User size={22} weight="regular" className="text-brand-action" />
            }
            onClick={onOpenLogin}
          />
        )}
      </List>

      <ServicesIntegrationsSection
        anyMessagingConnected={anyMessagingConnected}
        connectedChannelsSummary={connectedChannelsSummary}
        classroomConnected={classroomConnected}
        classroomSyncStatus={classroomSyncStatus}
        moodleIcalConnected={moodleIcalConnected}
        moodleIcalSyncStatus={moodleIcalSyncStatus}
        onOpenMessagingSheet={() => setWhatsappSheetOpened(true)}
        onLinkClassroom={onLinkClassroom}
        onOpenIcalDialog={() => setIcalDialogOpened(true)}
      />

      <BlockTitle>Pruebas y Depuración</BlockTitle>
      <List strong inset className="my-0">
        <ListItem
          title="Modo Sandbox / Opciones Avanzadas"
          subtitle="Habilita herramientas de desarrollo local"
          after={
            <Toggle
              checked={showSandbox}
              onChange={() => setShowSandbox(!showSandbox)}
            />
          }
        />
        <ListItem
          link
          title="Borrar Tareas"
          subtitle="Limpia la base de datos de actividades sincronizadas"
          after={
            cleaningTasks ? (
              <span className="text-ios-footnote text-ink-secondary">
                Borrando...
              </span>
            ) : undefined
          }
          media={
            <Trash size={22} weight="regular" className="text-status-urgent" />
          }
          onClick={handleClearTasks}
        />
        <ListItem
          link
          title="Borrar Cursos"
          subtitle="Limpia la lista de cursos sincronizados"
          after={
            cleaningCourses ? (
              <span className="text-ios-footnote text-ink-secondary">
                Borrando...
              </span>
            ) : undefined
          }
          media={
            <Trash size={22} weight="regular" className="text-status-urgent" />
          }
          onClick={handleClearCourses}
        />
      </List>

      <CampusLocationsSection />

      <SystemDiagnosticsSection
        isOnline={isOnline}
        backendHealth={backendHealth}
      />

      {user && (
        <>
          <div className="h-4" />
          <List strong inset className="my-0">
            <ListItem
              link
              title="Cerrar Sesión"
              media={
                <SignOut
                  size={22}
                  weight="regular"
                  className="text-status-urgent"
                />
              }
              onClick={onLogout}
              className="text-status-urgent"
            />
          </List>
        </>
      )}

      <div className="pt-6 pb-4 text-center">
        <p className="text-ios-footnote text-ink-secondary">
          CampusUNSA Mobile PWA · v1.0.0
        </p>
      </div>

      <WhatsAppSheet
        opened={whatsappSheetOpened}
        onClose={() => setWhatsappSheetOpened(false)}
        token={token}
        isOnline={isOnline}
        initialStatus={messagingStatus}
        onStatusChange={setMessagingStatus}
      />

      <Dialog
        opened={icalDialogOpened}
        onBackdropClick={() => setIcalDialogOpened(false)}
        title="Suscripción iCal DUTIC"
        buttons={
          <>
            <DialogButton onClick={() => setIcalDialogOpened(false)}>
              Cancelar
            </DialogButton>
            <DialogButton strong onClick={handleIcalSubmit}>
              Guardar
            </DialogButton>
          </>
        }
      >
        <div className="py-2">
          <p className="text-ios-footnote text-ink-secondary mb-3">
            Pega tu URL de exportación de calendario de Moodle DUTIC:
          </p>
          <input
            type="url"
            placeholder="https://aulavirtual.unsa.edu.pe/..."
            value={icalUrl}
            onChange={(e) => setIcalUrl(e.target.value)}
            className="w-full px-3 py-2 text-ios-subhead rounded-lg border border-control bg-surface-card text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-action"
          />
        </div>
      </Dialog>
    </div>
  );
}
