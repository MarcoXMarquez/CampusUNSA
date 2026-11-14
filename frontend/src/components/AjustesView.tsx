"use client";

import React, { useState } from "react";
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
  WhatsappLogo,
  GoogleLogo,
  CalendarCheck,
  Trash,
  SignOut,
  Buildings,
  Cpu,
  User,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { WhatsAppSheet } from "./WhatsAppSheet";
import {
  getUserDisplayName,
  type BackendHealthStatus,
  type UserProfile,
} from "../lib/api-client";

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

  const renderServiceStatus = (
    healthy: boolean | null,
    healthyLabel: string,
    unhealthyLabel: string
  ): React.JSX.Element => {
    if (!isOnline) {
      return (
        <span className="text-[15px] text-urgent dark:text-urgent-dark">
          Sin conexión
        </span>
      );
    }
    if (healthy === null) {
      return (
        <span className="text-[15px] text-black/60 dark:text-white/60">
          Sin verificar
        </span>
      );
    }
    return (
      <span
        className={`text-[15px] ${
          healthy
            ? "text-black/60 dark:text-white/60"
            : "text-urgent dark:text-urgent-dark"
        }`}
      >
        {healthy ? healthyLabel : unhealthyLabel}
      </span>
    );
  };

  return (
    <div className="pb-24">
      <Navbar title="Ajustes" large />

      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          role="status"
          className="mx-4 mt-2 mb-3 p-3 rounded-xl bg-white dark:bg-[#1C1C1E] border border-black/10 dark:border-white/15 text-[15px] text-black dark:text-white flex items-center gap-2"
        >
          <CheckCircle
            size={18}
            weight="regular"
            className="text-primary dark:text-primary-dark shrink-0"
          />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Action Error Banner */}
      {actionError && (
        <div
          role="alert"
          className="mx-4 mt-2 mb-3 p-3 rounded-xl bg-white dark:bg-[#1C1C1E] border border-urgent/30 dark:border-urgent-dark/30 text-[15px] text-urgent dark:text-urgent-dark flex items-center gap-2"
        >
          <WarningCircle size={18} weight="regular" className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* User Profile / Authentication Section */}
      <BlockTitle>Cuenta Institucional</BlockTitle>
      <List strong inset className="my-0">
        {user ? (
          <ListItem
            title={displayName}
            subtitle={user.email}
            after={
              <span className="text-[15px] text-black/60 dark:text-white/60">
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
                <div className="w-10 h-10 rounded-full bg-primary/10 dark:bg-primary-dark/20 text-primary dark:text-primary-dark flex items-center justify-center font-bold">
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
              <User
                size={22}
                weight="regular"
                className="text-primary dark:text-primary-dark"
              />
            }
            onClick={onOpenLogin}
          />
        )}
      </List>

      {/* Services & Integrations Section */}
      <BlockTitle>Servicios y Notificaciones</BlockTitle>
      <List strong inset className="my-0">
        <ListItem
          link
          chevron
          title="Asistente de WhatsApp"
          subtitle="Recordatorios automáticos en tu chat"
          after={
            <span className="text-[15px] text-black/60 dark:text-white/60">
              Vincular
            </span>
          }
          media={
            <WhatsappLogo
              size={22}
              weight="regular"
              className="text-primary dark:text-primary-dark"
            />
          }
          onClick={() => setWhatsappSheetOpened(true)}
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
            <span className="inline-flex items-center gap-1.5 text-[15px] text-black/60 dark:text-white/60">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  classroomConnected
                    ? "bg-primary dark:bg-primary-dark"
                    : "bg-black/30 dark:bg-white/30"
                }`}
              />
              {classroomConnected ? "Conectado" : "No Vinculado"}
            </span>
          }
          media={
            <GoogleLogo
              size={22}
              weight="regular"
              className="text-black/70 dark:text-white/70"
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
            <span className="inline-flex items-center gap-1.5 text-[15px] text-black/60 dark:text-white/60">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  moodleIcalConnected
                    ? "bg-primary dark:bg-primary-dark"
                    : "bg-black/30 dark:bg-white/30"
                }`}
              />
              {moodleIcalConnected ? "Suscrito" : "Configurar"}
            </span>
          }
          media={
            <CalendarCheck
              size={22}
              weight="regular"
              className="text-black/70 dark:text-white/70"
            />
          }
          onClick={() => setIcalDialogOpened(true)}
        />
      </List>

      {/* Testing and Data Management Section */}
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
              <span className="text-[13px] text-black/60 dark:text-white/60">
                Borrando...
              </span>
            ) : undefined
          }
          media={
            <Trash
              size={22}
              weight="regular"
              className="text-urgent dark:text-urgent-dark"
            />
          }
          onClick={handleClearTasks}
        />
        <ListItem
          link
          title="Borrar Cursos"
          subtitle="Limpia la lista de cursos sincronizados"
          after={
            cleaningCourses ? (
              <span className="text-[13px] text-black/60 dark:text-white/60">
                Borrando...
              </span>
            ) : undefined
          }
          media={
            <Trash
              size={22}
              weight="regular"
              className="text-urgent dark:text-urgent-dark"
            />
          }
          onClick={handleClearCourses}
        />
      </List>

      {/* Campus Locations Section */}
      <BlockTitle>Sedes Universitarias Conectadas</BlockTitle>
      <List strong inset className="my-0">
        <ListItem
          title="Campus Ingenierias"
          subtitle="Sistemas, Civil, Minas, Industrial"
          after={
            <span className="text-[13px] text-black/60 dark:text-white/60">
              Paucarpata
            </span>
          }
          media={
            <Buildings
              size={22}
              weight="regular"
              className="text-black/60 dark:text-white/60"
            />
          }
        />
        <ListItem
          title="Campus Biomedicas"
          subtitle="Medicina, Enfermería, Biología"
          after={
            <span className="text-[13px] text-black/60 dark:text-white/60">
              A. Carrión
            </span>
          }
          media={
            <Buildings
              size={22}
              weight="regular"
              className="text-black/60 dark:text-white/60"
            />
          }
        />
        <ListItem
          title="Campus Sociales"
          subtitle="Derecho, Economía, Administración"
          after={
            <span className="text-[13px] text-black/60 dark:text-white/60">
              Venezuela
            </span>
          }
          media={
            <Buildings
              size={22}
              weight="regular"
              className="text-black/60 dark:text-white/60"
            />
          }
        />
      </List>

      {/* Core Infrastructure Health Section */}
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
            <Cpu
              size={22}
              weight="regular"
              className="text-black/60 dark:text-white/60"
            />
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
            <Cpu
              size={22}
              weight="regular"
              className="text-black/60 dark:text-white/60"
            />
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
            <Cpu
              size={22}
              weight="regular"
              className="text-black/60 dark:text-white/60"
            />
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
            <Cpu
              size={22}
              weight="regular"
              className="text-black/60 dark:text-white/60"
            />
          }
        />
      </List>

      {/* Logout / Session Section */}
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
                  className="text-urgent dark:text-urgent-dark"
                />
              }
              onClick={onLogout}
              className="text-urgent dark:text-urgent-dark"
            />
          </List>
        </>
      )}

      {/* App Version Footnote */}
      <div className="pt-6 pb-4 text-center">
        <p className="text-[13px] text-black/60 dark:text-white/60">
          CampusUNSA Mobile PWA · v1.0.0
        </p>
      </div>

      {/* WhatsApp Pairing Sheet */}
      <WhatsAppSheet
        opened={whatsappSheetOpened}
        onClose={() => setWhatsappSheetOpened(false)}
        token={token}
      />

      {/* Moodle iCal Dialog */}
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
          <p className="text-[13px] text-black/60 dark:text-white/60 mb-3">
            Pega tu URL de exportación de calendario de Moodle DUTIC:
          </p>
          <input
            type="url"
            placeholder="https://aulavirtual.unsa.edu.pe/..."
            value={icalUrl}
            onChange={(e) => setIcalUrl(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-[#1C1C1E] text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-primary-dark"
          />
        </div>
      </Dialog>
    </div>
  );
}
